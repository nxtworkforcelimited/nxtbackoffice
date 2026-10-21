-- Task imports, staff-only scheduling, revision-bound approvals and isolated discussions.
begin;
create table public.work_reviewers(tenant_id uuid not null,user_id uuid not null,primary key(tenant_id,user_id),foreign key(tenant_id,user_id) references public.memberships(tenant_id,user_id) on delete cascade);
create table public.work_settings(tenant_id uuid primary key references public.tenants(id),approval_mode text not null default 'all' check(approval_mode in ('all','any')));
create table public.work_flow(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),kind text not null check(kind in ('tasks','projects')),record_id uuid not null,
 internal_due date,scheduled_start date,depends_on uuid,revision integer not null default 1,approved_revision integer not null default 0,
 stage text not null default 'not_started' check(stage in ('not_started','in_progress','under_review','changes_requested','approved','complete')),
 share_on_approval boolean not null default false,source_name text not null default '',source_excerpt text not null default '' check(length(source_excerpt)<=10000),
 created_by uuid default auth.uid(),updated_at timestamptz not null default now(),unique(tenant_id,id),unique(tenant_id,kind,record_id),foreign key(tenant_id,depends_on) references public.work_flow(tenant_id,id),check(internal_due is null or scheduled_start is null or internal_due>=scheduled_start)
);
create table public.work_votes(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,flow_id uuid not null,revision integer not null,reviewer_id uuid not null,decision text not null check(decision in ('approved','changes_requested')),note text not null default '' check(length(note)<=3000),created_at timestamptz not null default now(),unique(flow_id,revision,reviewer_id),foreign key(tenant_id,flow_id) references public.work_flow(tenant_id,id) on delete cascade,foreign key(tenant_id,reviewer_id) references public.memberships(tenant_id,user_id));
create table public.work_comments(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,kind text not null check(kind in ('tasks','projects')),record_id uuid not null,scope text not null check(scope in ('internal','external')),author_id uuid not null default auth.uid(),body text not null check(length(trim(body)) between 1 and 5000),created_at timestamptz not null default now(),foreign key(tenant_id,author_id) references public.memberships(tenant_id,user_id));
create table public.task_imports(id uuid primary key,tenant_id uuid not null references public.tenants(id),created_by uuid not null default auth.uid(),fingerprint text not null,source_name text not null,task_ids uuid[] not null default '{}',created_at timestamptz not null default now(),unique(tenant_id,created_by,fingerprint));
create index work_flow_parent on public.work_flow(tenant_id,kind,record_id);
create index work_flow_schedule on public.work_flow(tenant_id,internal_due);
create index work_comments_parent on public.work_comments(tenant_id,kind,record_id,scope,created_at);
create index work_votes_parent on public.work_votes(tenant_id,flow_id,revision);
alter table public.work_reviewers enable row level security;alter table public.work_settings enable row level security;alter table public.work_flow enable row level security;alter table public.work_votes enable row level security;alter table public.work_comments enable row level security;alter table public.task_imports enable row level security;
create function public.is_work_reviewer(t uuid) returns boolean language sql stable security definer set search_path='' as $$select public.is_staff(t) and exists(select 1 from public.work_reviewers where tenant_id=t and user_id=auth.uid());$$;
revoke all on function public.is_work_reviewer(uuid) from public,anon;grant execute on function public.is_work_reviewer(uuid) to authenticated;
create policy reviewers_read on public.work_reviewers for select to authenticated using(public.is_staff(tenant_id));
create policy reviewers_manage on public.work_reviewers for all to authenticated using(public.workspace_role_for(tenant_id)='owner') with check(public.workspace_role_for(tenant_id)='owner' and exists(select 1 from public.memberships where tenant_id=work_reviewers.tenant_id and user_id=work_reviewers.user_id and role<>'client'));
create policy work_settings_read on public.work_settings for select to authenticated using(public.is_staff(tenant_id));
create policy work_settings_manage on public.work_settings for all to authenticated using(public.workspace_role_for(tenant_id)='owner') with check(public.workspace_role_for(tenant_id)='owner');
create policy flow_read on public.work_flow for select to authenticated using(public.is_staff(tenant_id));
create policy votes_read on public.work_votes for select to authenticated using(public.is_staff(tenant_id));
create policy imports_read on public.task_imports for select to authenticated using(public.is_staff(tenant_id) and (created_by=auth.uid() or public.is_work_reviewer(tenant_id)));
revoke all on public.work_reviewers,public.work_settings,public.work_flow,public.work_votes,public.work_comments,public.task_imports from public,anon,authenticated;
grant select on public.work_reviewers,public.work_settings,public.work_flow,public.work_votes,public.work_comments,public.task_imports to authenticated;
grant insert,update,delete on public.work_reviewers,public.work_settings to authenticated;
grant insert on public.work_comments to authenticated;
insert into public.work_reviewers(tenant_id,user_id) select m.tenant_id,m.user_id from public.memberships m join auth.users u on u.id=m.user_id where m.role<>'client' and lower(u.email) in ('nyasha@nxt-workforce.com','michael@nxt-workforce.com') and exists(select 1 from public.memberships o join auth.users a on a.id=o.user_id where o.tenant_id=m.tenant_id and o.role='owner' and lower(a.email)='nyasha@nxt-workforce.com');
insert into public.work_settings(tenant_id) select distinct tenant_id from public.work_reviewers;
-- Existing dates are retained, never fabricated. Existing records need a fresh review before a new release.
insert into public.work_flow(tenant_id,kind,record_id,internal_due,stage) select tenant_id,'tasks',id,due_date,case when status='in_progress' then 'in_progress' when status='done' then 'complete' else 'not_started' end from public.tasks;
insert into public.work_flow(tenant_id,kind,record_id,internal_due,stage) select tenant_id,'projects',id,due_date,case when status='active' then 'in_progress' when status='completed' then 'complete' when status='review' then 'under_review' else 'not_started' end from public.projects;
alter table public.tasks drop constraint tasks_status_check;
alter table public.tasks add constraint tasks_status_check check(status in ('todo','in_progress','under_review','changes_requested','approved','done'));
alter table public.projects drop constraint projects_status_check;
alter table public.projects add constraint projects_status_check check(status in ('planned','active','review','changes_requested','approved','completed'));
create function nxt_private.work_parent(t uuid,k text,r uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare p jsonb;begin
 if k not in ('tasks','projects') then raise exception 'Invalid work type';end if;
 execute format('select to_jsonb(x) from public.%I x where tenant_id=$1 and id=$2 and archived_at is null',k) into p using t,r;return p;
end;$$;
create function public.work_external_access(t uuid,k text,r uuid) returns boolean language plpgsql stable security definer set search_path='' as $$declare p jsonb;begin
 p:=nxt_private.work_parent(t,k,r);return p is not null and (public.is_work_reviewer(t) or ((p->>'client_visible')::boolean and public.can_read_client(t,(p->>'client_id')::uuid)));
end;$$;
revoke all on function nxt_private.work_parent(uuid,text,uuid),public.work_external_access(uuid,text,uuid) from public,anon;revoke all on function nxt_private.work_parent(uuid,text,uuid) from authenticated;grant execute on function public.work_external_access(uuid,text,uuid) to authenticated;
create policy comment_read on public.work_comments for select to authenticated using((scope='internal' and public.is_staff(tenant_id)) or (scope='external' and public.work_external_access(tenant_id,kind,record_id)));
create policy comment_create on public.work_comments for insert to authenticated with check(author_id=auth.uid() and ((scope='internal' and public.is_staff(tenant_id)) or (scope='external' and public.work_external_access(tenant_id,kind,record_id))));
-- The client mailbox is reserved for Nyasha/Michael, not every delivery-capability holder.
alter policy message_read on public.portal_messages using(public.is_work_reviewer(tenant_id) or public.can_read_client(tenant_id,client_id));
alter policy message_send on public.portal_messages with check(author_id=auth.uid() and (public.is_work_reviewer(tenant_id) or public.can_read_client(tenant_id,client_id)));
create function nxt_private.notify_reviewers(t uuid,subject_line text,message_text text) returns void language plpgsql security definer set search_path='' as $$begin
 insert into public.notification_outbox(tenant_id,recipient,subject,body) select t,u.email,left(subject_line,200),message_text from public.work_reviewers w join public.memberships m on m.tenant_id=w.tenant_id and m.user_id=w.user_id join auth.users u on u.id=w.user_id where w.tenant_id=t and m.role<>'client' and u.email is not null;
end;$$;
revoke all on function nxt_private.notify_reviewers(uuid,text,text) from public,anon,authenticated;
-- Core triggers invalidate approval when the reviewed content changes. Direct APIs cannot release unapproved work.
create function public.work_core_guard() returns trigger language plpgsql security definer set search_path='' as $$declare f public.work_flow;changed boolean;begin
 if tg_op='INSERT' then
  if new.client_visible or new.status not in ('todo','planned','in_progress','active') then raise exception 'Create internal work first, then submit it for review';end if;return new;
 end if;
 if new.id<>old.id or new.tenant_id<>old.tenant_id then raise exception 'Work identity cannot change';end if;
 select * into f from public.work_flow where tenant_id=new.tenant_id and kind=tg_table_name and record_id=new.id for update;
 changed:=(to_jsonb(new)-'status'-'client_visible'-'updated_at') is distinct from (to_jsonb(old)-'status'-'client_visible'-'updated_at');
 if changed then
  update public.work_flow set revision=revision+1,approved_revision=0,stage='in_progress',updated_at=now() where id=f.id;
  new.client_visible:=false;new.status:=case when tg_table_name='tasks' then 'in_progress' else 'active' end;
 elsif (new.client_visible and not old.client_visible) or new.status in ('approved','done','completed') and new.status is distinct from old.status then
  if f.id is null or f.approved_revision<>f.revision or f.stage not in ('approved','complete') then raise exception 'Review approval is required before release or completion';end if;
 elsif new.status in ('under_review','review') and new.status is distinct from old.status then
  if f.stage<>'under_review' then raise exception 'Use Submit for review in the Task Builder';end if;
 end if;return new;
end;$$;
create function public.work_core_after() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' then insert into public.work_flow(tenant_id,kind,record_id) values(new.tenant_id,tg_table_name,new.id) on conflict do nothing;
 elsif new.status in ('todo','planned','in_progress','active') and old.status is distinct from new.status then update public.work_flow set stage=case when new.status in ('todo','planned') then 'not_started' else 'in_progress' end,approved_revision=0,updated_at=now() where tenant_id=new.tenant_id and kind=tg_table_name and record_id=new.id;end if;return new;
end;$$;
create trigger zz_work_guard before insert or update on public.tasks for each row execute function public.work_core_guard();
create trigger zz_work_guard before insert or update on public.projects for each row execute function public.work_core_guard();
create trigger zz_work_after after insert or update on public.tasks for each row execute function public.work_core_after();
create trigger zz_work_after after insert or update on public.projects for each row execute function public.work_core_after();
revoke all on function public.work_core_guard(),public.work_core_after() from public,anon,authenticated;
create function public.save_work(t uuid,k text,v jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid:=nullif(v->>'id','')::uuid;ci uuid:=nullif(v->>'client_id','')::uuid;pid uuid:=nullif(v->>'project_id','')::uuid;assigned uuid:=nullif(v->>'assignee_id','')::uuid;internal_date date:=(v->>'internal_due')::date;client_date date:=nullif(v->>'client_due','')::date;start_date date:=(v->>'scheduled_start')::date;dep uuid:=nullif(v->>'depends_on','')::uuid;f public.work_flow;p jsonb;oldp jsonb;begin
 if auth.uid() is null or not public.is_staff(t) or k not in ('tasks','projects') then raise exception 'Staff access required';end if;
 if not (public.is_work_reviewer(t) or public.has_capability(t,case when k='tasks' then 'task_admin' else 'delivery' end)) then raise exception 'Task or project manager required';end if;
 if length(trim(coalesce(v->>'title',''))) not between 1 and 160 or length(coalesce(v->>'description',''))>5000 then raise exception 'Check title and description';end if;
 if internal_date is null or start_date is null or internal_date<start_date or (ci is not null and client_date is null) or (client_date is not null and internal_date>client_date) then raise exception 'Choose a start, internal deadline and (for client work) a later or equal client deadline';end if;
 if ci is not null and not exists(select 1 from public.clients where tenant_id=t and id=ci and archived_at is null) then raise exception 'Choose an active client';end if;
 if k='tasks' and assigned is not null and not exists(select 1 from public.staff_directory where tenant_id=t and user_id=assigned) then raise exception 'Choose a provisioned team member';end if;
 if pid is not null and not exists(select 1 from public.projects where tenant_id=t and id=pid and client_id is not distinct from ci and archived_at is null) then raise exception 'Project and task must have the same client';end if;
 if rid is not null then oldp:=nxt_private.work_parent(t,k,rid);if oldp is null then raise exception 'Work unavailable';end if;end if;
 if rid is null then
  if k='tasks' then insert into public.tasks(tenant_id,title,description,client_id,due_date,project_id,assignee_id) values(t,trim(v->>'title'),coalesce(v->>'description',''),ci,client_date,pid,assigned) returning id into rid;
  else insert into public.projects(tenant_id,title,description,client_id,due_date) values(t,trim(v->>'title'),coalesce(v->>'description',''),ci,client_date) returning id into rid;end if;
 else
  if k='tasks' then update public.tasks set title=trim(v->>'title'),description=coalesce(v->>'description',''),client_id=ci,due_date=client_date,project_id=pid,assignee_id=assigned where tenant_id=t and id=rid;
  else update public.projects set title=trim(v->>'title'),description=coalesce(v->>'description',''),client_id=ci,due_date=client_date where tenant_id=t and id=rid;end if;
 end if;
 select * into f from public.work_flow where tenant_id=t and kind=k and record_id=rid for update;
 if dep is not null then
  if dep=f.id or not exists(select 1 from public.work_flow where tenant_id=t and id=dep and internal_due<start_date) then raise exception 'Dependency must finish before this work starts';end if;
  if exists(with recursive chain as(select id,depends_on from public.work_flow where tenant_id=t and id=dep union select w.id,w.depends_on from public.work_flow w join chain c on w.id=c.depends_on where w.tenant_id=t)select 1 from chain where id=f.id) then raise exception 'Dependency cycle detected';end if;
 end if;
 if (f.internal_due,f.scheduled_start,f.depends_on,f.share_on_approval) is distinct from (internal_date,start_date,dep,coalesce((v->>'share_on_approval')::boolean,false)) then
  update public.work_flow set revision=revision+1,approved_revision=0,stage='in_progress' where id=f.id;
  execute format('update public.%I set client_visible=false,status=$1 where tenant_id=$2 and id=$3',k) using case when k='tasks' then 'in_progress' else 'active' end,t,rid;
 end if;
 update public.work_flow set internal_due=internal_date,scheduled_start=start_date,depends_on=dep,share_on_approval=coalesce((v->>'share_on_approval')::boolean,false),source_name=left(coalesce(v->>'source_name',source_name),200),source_excerpt=left(coalesce(v->>'source_excerpt',source_excerpt),10000),updated_at=now() where id=f.id;
 return jsonb_build_object('id',rid,'flow_id',f.id);
end;$$;
create function public.review_work(t uuid,fid uuid,a text,note text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.work_flow;p jsonb;required_count int;approved_count int;mode text;newstate text;recipient text;begin
 if auth.uid() is null or not public.is_staff(t) then raise exception 'Staff access required';end if;
 select * into f from public.work_flow where tenant_id=t and id=fid for update;if not found then raise exception 'Work unavailable';end if;
 p:=nxt_private.work_parent(t,f.kind,f.record_id);if p is null then raise exception 'Work unavailable';end if;
 if length(note)>3000 then raise exception 'Review note too long';end if;
 if a='start' then
  if f.stage='complete' then raise exception 'Completed work must be revised by its manager';end if;
  update public.work_flow set stage='in_progress',approved_revision=0,revision=revision+1,updated_at=now() where id=fid;
  execute format('update public.%I set status=$1,client_visible=false where tenant_id=$2 and id=$3',f.kind) using case when f.kind='tasks' then 'in_progress' else 'active' end,t,f.record_id;
 elsif a='submit' then
  if f.stage not in ('not_started','in_progress','changes_requested') then raise exception 'This work is already in review or approved';end if;
  if f.internal_due is null or f.scheduled_start is null or (p->>'client_id' is not null and p->>'due_date' is null) then raise exception 'Set both required deadlines before review';end if;
  if f.depends_on is not null and not exists(select 1 from public.work_flow where tenant_id=t and id=f.depends_on and stage in ('approved','complete')) then raise exception 'The dependency is not approved or complete';end if;
  if not exists(select 1 from public.work_reviewers where tenant_id=t) then raise exception 'The owner must configure reviewers';end if;
  update public.work_flow set stage='under_review',revision=revision+1,approved_revision=0,updated_at=now() where id=fid;
  execute format('update public.%I set status=$1,client_visible=false where tenant_id=$2 and id=$3',f.kind) using case when f.kind='tasks' then 'under_review' else 'review' end,t,f.record_id;
  perform nxt_private.notify_reviewers(t,'Under review: '||(p->>'title'),'Work needs internal review. Open Task Builder: https://nxt-business-os.vercel.app/app/work?workspace='||t||'&item='||f.record_id);
 elsif a in ('approve','changes') then
  if not public.is_work_reviewer(t) or f.stage<>'under_review' then raise exception 'Only designated reviewers can review submitted work';end if;
  insert into public.work_votes(tenant_id,flow_id,revision,reviewer_id,decision,note) values(t,fid,f.revision,auth.uid(),case when a='approve' then 'approved' else 'changes_requested' end,note) on conflict(flow_id,revision,reviewer_id) do update set decision=excluded.decision,note=excluded.note,created_at=now();
  if a='changes' then
   if trim(note)='' then raise exception 'Explain the changes required';end if;
   update public.work_flow set stage='changes_requested',approved_revision=0,updated_at=now() where id=fid;
   execute format('update public.%I set status=$1,client_visible=false where tenant_id=$2 and id=$3',f.kind) using 'changes_requested',t,f.record_id;
  else
   select coalesce(approval_mode,'all') into mode from public.work_settings where tenant_id=t;
   select count(*) into required_count from public.work_reviewers where tenant_id=t;
   select count(*) into approved_count from public.work_votes v join public.work_reviewers r on r.tenant_id=v.tenant_id and r.user_id=v.reviewer_id where v.flow_id=fid and v.revision=f.revision and v.decision='approved';
   if approved_count>=case when mode='any' then 1 else required_count end then
    update public.work_flow set stage='approved',approved_revision=revision,updated_at=now() where id=fid;
    execute format('update public.%I set status=$1,client_visible=$2 where tenant_id=$3 and id=$4',f.kind) using 'approved',f.share_on_approval and p->>'client_id' is not null,t,f.record_id;
    if f.share_on_approval and p->>'client_id' is not null then
     select email into recipient from public.clients where tenant_id=t and id=(p->>'client_id')::uuid and approval_email_enabled;
     if recipient is not null and position('@' in recipient)>1 then insert into public.notification_outbox(tenant_id,recipient,subject,body) values(t,recipient,'Approved work: '||(p->>'title'),'New approved work is ready in your NXT client portal.');end if;
    end if;
   end if;
  end if;
 elsif a='complete' then
  if not public.is_work_reviewer(t) or f.stage<>'approved' or f.approved_revision<>f.revision then raise exception 'Only a reviewer can complete approved work';end if;
  update public.work_flow set stage='complete',updated_at=now() where id=fid;
  execute format('update public.%I set status=$1 where tenant_id=$2 and id=$3',f.kind) using case when f.kind='tasks' then 'done' else 'completed' end,t,f.record_id;
 else raise exception 'Unknown workflow action';end if;
 return (select to_jsonb(w) from public.work_flow w where id=fid);
end;$$;
create function public.commit_task_import(t uuid,request_id uuid,source_label text,entries jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare fingerprint text:=md5(entries::text);oldrow public.task_imports;e jsonb;created jsonb;ids uuid[]:='{}';flowids uuid[]:='{}';depindex int;index_no int:=0;begin
 if auth.uid() is null or not (public.has_capability(t,'task_admin') or public.is_work_reviewer(t)) then raise exception 'Task manager required';end if;
 if request_id is null or jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries) not between 1 and 100 then raise exception 'Import between 1 and 100 reviewed tasks';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text||auth.uid()::text||fingerprint,0));
 select * into oldrow from public.task_imports where tenant_id=t and created_by=auth.uid() and (id=request_id or task_imports.fingerprint=commit_task_import.fingerprint) limit 1;
 if found then if oldrow.fingerprint<>fingerprint then raise exception 'Import request already used';end if;return jsonb_build_object('ids',oldrow.task_ids,'duplicate',true);end if;
 for e in select value from jsonb_array_elements(entries) loop
  index_no:=index_no+1;depindex:=nullif(e->>'dependency_index','')::int;
  if depindex is not null and (depindex<1 or depindex>=index_no) then raise exception 'Dependency must refer to an earlier imported row';end if;
  if exists(select 1 from public.tasks where tenant_id=t and archived_at is null and lower(trim(title))=lower(trim(e->>'title')) and client_id is not distinct from nullif(e->>'client_id','')::uuid and due_date is not distinct from nullif(e->>'client_due','')::date) then raise exception 'Possible duplicate task: %. Remove it from the preview or change its title/date',e->>'title';end if;
  created:=public.save_work(t,'tasks',(e-'dependency_index')||jsonb_build_object('source_name',left(source_label,200),'share_on_approval',false,'depends_on',case when depindex is null then null else flowids[depindex] end));
  ids:=array_append(ids,(created->>'id')::uuid);flowids:=array_append(flowids,(created->>'flow_id')::uuid);
 end loop;
 insert into public.task_imports(id,tenant_id,created_by,fingerprint,source_name,task_ids) values(request_id,t,auth.uid(),fingerprint,left(source_label,200),ids);
 return jsonb_build_object('ids',ids,'duplicate',false);
end;$$;
create function public.notify_work_chat() returns trigger language plpgsql security definer set search_path='' as $$declare label text;ci uuid;recipient text;begin
 if tg_table_name='work_comments' then
  if nxt_private.work_parent(new.tenant_id,new.kind,new.record_id) is null then raise exception 'Work unavailable';end if;
  if new.scope='internal' then return new;end if;
  ci:=(nxt_private.work_parent(new.tenant_id,new.kind,new.record_id)->>'client_id')::uuid;label:='New task conversation';
 else ci:=new.client_id;label:='New client message';end if;
 if exists(select 1 from public.memberships where tenant_id=new.tenant_id and user_id=new.author_id and role='client') then
  perform nxt_private.notify_reviewers(new.tenant_id,label,'A client has sent a message. Open Messages / Task Builder to reply.');
 else
  for recipient in select distinct u.email from public.memberships m join auth.users u on u.id=m.user_id where m.tenant_id=new.tenant_id and m.role='client' and m.client_id=ci and u.email is not null loop
   insert into public.notification_outbox(tenant_id,recipient,subject,body) values(new.tenant_id,recipient,'A reply from NXT Workforce','Your team has replied in your secure client portal.');
  end loop;
 end if;return new;
end;$$;
create trigger work_chat_notice after insert on public.work_comments for each row execute function public.notify_work_chat();
create trigger portal_chat_notice after insert on public.portal_messages for each row execute function public.notify_work_chat();
-- Adding/removing/changing attachments invalidates approval, including changes through legacy APIs.
create function public.invalidate_work_file_review() returns trigger language plpgsql security definer set search_path='' as $$declare t uuid:=coalesce(new.tenant_id,old.tenant_id);rid uuid:=coalesce(new.task_id,new.project_id,old.task_id,old.project_id);k text:=case when coalesce(new.task_id,old.task_id) is not null then 'tasks' else 'projects' end;begin
 update public.work_flow set revision=revision+1,approved_revision=0,stage='in_progress',updated_at=now() where tenant_id=t and kind=k and record_id=rid;
 execute format('update public.%I set client_visible=false,status=$1 where tenant_id=$2 and id=$3',k) using case when k='tasks' then 'in_progress' else 'active' end,t,rid;
 return coalesce(new,old);
end;$$;
create trigger work_file_invalidates after insert or update or delete on public.work_files for each row execute function public.invalidate_work_file_review();
revoke all on function public.save_work(uuid,text,jsonb),public.review_work(uuid,uuid,text,text),public.commit_task_import(uuid,uuid,text,jsonb),public.notify_work_chat(),public.invalidate_work_file_review() from public,anon;
revoke all on function public.notify_work_chat(),public.invalidate_work_file_review() from authenticated;
grant execute on function public.save_work(uuid,text,jsonb),public.review_work(uuid,uuid,text,text),public.commit_task_import(uuid,uuid,text,jsonb) to authenticated;
create trigger work_vote_audit after insert or update on public.work_votes for each row execute function public.record_audit();
create trigger work_comment_audit after insert on public.work_comments for each row execute function public.record_audit();
commit;
