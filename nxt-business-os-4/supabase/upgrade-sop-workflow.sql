begin;
create table public.sop_templates(version integer primary key,steps jsonb not null);
revoke all on public.sop_templates from public,anon,authenticated;
grant select on public.sop_templates to authenticated;
alter table public.sop_templates enable row level security;
create policy sop_template_read on public.sop_templates for select to authenticated using(true);
insert into public.sop_templates values(1,'[{"key":"intake","title":"Record and qualify the potential client","owner":"nyasha","reviewer":"michael","support":["bridget"],"backup":"michael","after":[],"days":1,"check":"CRM details, lead source, contact needs, next action and follow-up date recorded."},{"key":"research","title":"Prepare pre-meeting research and presentation pack","owner":"tatenda","reviewer":"michael","support":["nyasha"],"backup":"michael","after":["intake"],"days":2,"check":"Website, social presence, competitors, relevant case studies and discovery questions reviewed."},{"key":"discovery","title":"Hold discovery and record meeting decisions","owner":"nyasha","reviewer":"michael","support":["bridget","tatenda"],"backup":"michael","after":["research"],"days":3,"check":"Objectives, budget, timing, decision-maker, requirements and next actions recorded in meeting notes."},{"key":"scope","title":"Confirm scope, capacity, estimates and delivery milestones","owner":"michael","reviewer":"nyasha","support":["adrian","tatenda"],"backup":"nyasha","after":["discovery"],"days":4,"check":"Deliverables, exclusions, client inputs, risks, specialist estimates and internal/client deadlines agreed."},{"key":"quote","title":"Prepare costing, quotation and payment terms","owner":"kristian","reviewer":"nyasha","support":["michael"],"backup":"nyasha","after":["scope"],"days":5,"check":"Costs, price, payment terms and approved quote reference recorded. No unapproved price promised."},{"key":"proposal","title":"Present approved proposal and record client acceptance","owner":"nyasha","reviewer":"michael","support":["tatenda"],"backup":"michael","after":["quote"],"days":6,"check":"Approved proposal sent or presented; written client acceptance and agreed scope attached."},{"key":"sla","title":"Prepare and record the signed SLA or service agreement","owner":"bridget","reviewer":"nyasha","support":["michael","kristian"],"backup":"michael","after":["proposal"],"days":7,"check":"Signed agreement covers scope, responsibilities, milestones, revisions, support and payment terms."},{"key":"payment","title":"Issue invoice and verify agreed start-payment conditions","owner":"kristian","reviewer":"nyasha","support":["bridget"],"backup":"nyasha","after":["sla"],"days":8,"check":"Authorised invoice and verified payment evidence recorded, or written approval of alternative start terms."},{"key":"onboarding","title":"Complete onboarding and organise client assets","owner":"bridget","reviewer":"michael","support":["nyasha"],"backup":"michael","after":["sla"],"days":8,"check":"Client contacts, required assets and authorised access collected; folders organised Client / Project / Deliverable."},{"key":"prototype","title":"Prepare prototype and obtain agreed delivery brief","owner":"michael","reviewer":"nyasha","support":["adrian","tatenda"],"backup":"nyasha","after":["payment","onboarding"],"days":10,"check":"Start conditions confirmed; prototype or solution outline reviewed and client sign-off recorded."},{"key":"copy","title":"Write and review project copy and messaging","owner":"tatenda","reviewer":"michael","support":["nyasha"],"backup":"michael","after":["prototype"],"days":12,"check":"Copy matches the approved brief, is proofread and has required client approval."},{"key":"frontend","title":"Build the frontend from approved prototype and copy","owner":"nyasha","reviewer":"michael","support":["adrian"],"backup":"adrian","after":["copy"],"days":16,"check":"Responsive frontend, forms and user journeys implemented; version-controlled changes and test evidence attached.","service":"web"},{"key":"backend","title":"Build backend and backoffice functionality","owner":"adrian","reviewer":"michael","support":["nyasha"],"backup":"nyasha","after":["prototype"],"days":16,"check":"Backend, backoffice, integrations, permissions and validation implemented with test evidence.","service":"web"},{"key":"marketing","title":"Prepare marketing deliverables and publishing plan","owner":"tatenda","reviewer":"michael","support":["nyasha"],"backup":"michael","after":["copy"],"days":16,"check":"Agreed marketing assets, channels, calendar and measurement plan prepared for approval.","service":"marketing"},{"key":"qa","title":"Coordinate independent quality review and client testing","owner":"michael","reviewer":"nyasha","support":["adrian","tatenda"],"backup":"adrian","after":["copy","frontend","backend","marketing"],"days":18,"check":"Functional, mobile, content and integration checks passed; client feedback resolved and acceptance evidence recorded."},{"key":"release","title":"Approve release and coordinate deployment or publication","owner":"nyasha","reviewer":"michael","support":["adrian"],"backup":"michael","after":["qa"],"days":19,"check":"Business approval recorded; independent quality review passed; backup and release/smoke-test records attached."},{"key":"handover","title":"Complete client handover and acceptance","owner":"nyasha","reviewer":"michael","support":["bridget","adrian"],"backup":"michael","after":["release"],"days":20,"check":"Approved deliverables, documentation and training handed over; client acceptance and support arrangements recorded."},{"key":"finance-close","title":"Complete final billing and payment records","owner":"kristian","reviewer":"nyasha","support":["bridget"],"backup":"nyasha","after":["handover"],"days":21,"check":"Final invoice, verified payments and receipts recorded; any outstanding balance has an agreed follow-up."},{"key":"close","title":"Close project records and archive delivery evidence","owner":"michael","reviewer":"nyasha","support":["bridget"],"backup":"nyasha","after":["finance-close"],"days":22,"check":"All deliverables, files, task outcomes and approvals recorded; remaining support obligations assigned."},{"key":"aftercare","title":"Follow up with the client and route support or new work","owner":"nyasha","reviewer":"michael","support":["tatenda"],"backup":"michael","after":["close"],"days":27,"check":"Client follow-up recorded; support issues logged as tickets with owners; new opportunities returned to discovery."}]'::jsonb);
create table public.sop_runs(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 client_id uuid not null,deal_id uuid not null,project_id uuid not null,request_id uuid not null,
 template_version integer not null references public.sop_templates(version),service text not null check(service in ('web','marketing','general')),
 brief text not null check(length(brief) between 10 and 5000),roles jsonb not null,
 created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,request_id),unique(tenant_id,client_id),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 foreign key(tenant_id,deal_id) references public.deals(tenant_id,id),foreign key(tenant_id,project_id) references public.projects(tenant_id,id));
create table public.sop_tasks(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,run_id uuid not null,key text not null,
 title text not null,description text not null,owner_id uuid not null,reviewer_id uuid not null,backup_id uuid not null,support_ids uuid[] not null default '{}',
 dependencies text[] not null default '{}',status text not null default 'Not Started' check(status in ('Not Started','In Progress','Waiting on Client','Under Review','Blocked','Completed')),
 priority text not null default 'P1' check(priority in ('P0','P1','P2','P3')),due date not null,client_due date,
 checks jsonb not null,notes text not null default '' check(length(notes)<=15000),evidence text not null default '' check(length(evidence)<=15000),
 next_action text not null default '' check(length(next_action)<=2000),follow_up date,blocker text not null default '' check(length(blocker)<=2000),
 approval_evidence text not null default '' check(length(approval_evidence)<=5000),approved_by uuid,approved_at timestamptz,
 date_change_reason text not null default '',version integer not null default 1,updated_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,run_id,key),foreign key(tenant_id,run_id) references public.sop_runs(tenant_id,id),
 foreign key(tenant_id,owner_id) references public.staff_directory(tenant_id,user_id),foreign key(tenant_id,reviewer_id) references public.staff_directory(tenant_id,user_id),foreign key(tenant_id,backup_id) references public.staff_directory(tenant_id,user_id),
 check(owner_id<>reviewer_id),check(client_due is null or due<=client_due),check(jsonb_typeof(checks)='array'));
create table public.tracker_archives(
 tenant_id uuid not null references public.tenants(id),project text not null check(length(project) between 1 and 200),record_id text not null check(length(record_id) between 1 and 200),
 archived_by uuid not null default auth.uid(),archived_at timestamptz not null default now(),primary key(tenant_id,project,record_id));
alter table public.sop_runs enable row level security;alter table public.sop_tasks enable row level security;alter table public.tracker_archives enable row level security;
create policy sop_run_read on public.sop_runs for select to authenticated using(public.is_staff(tenant_id));
create policy sop_run_create on public.sop_runs for insert to authenticated with check(public.is_staff(tenant_id) and public.has_capability(tenant_id,'crm') and public.has_capability(tenant_id,'delivery') and created_by=auth.uid());
create policy sop_task_read on public.sop_tasks for select to authenticated using(public.is_staff(tenant_id));
create policy sop_task_create on public.sop_tasks for insert to authenticated with check(public.is_staff(tenant_id) and public.has_capability(tenant_id,'crm') and public.has_capability(tenant_id,'delivery'));
create policy sop_task_update on public.sop_tasks for update to authenticated using(public.is_staff(tenant_id) and (public.has_capability(tenant_id,'delivery') or auth.uid() in(owner_id,reviewer_id) or auth.uid()=any(support_ids))) with check(public.is_staff(tenant_id));
create policy archive_read on public.tracker_archives for select to authenticated using(public.is_staff(tenant_id));
create policy archive_insert on public.tracker_archives for insert to authenticated with check(public.is_staff(tenant_id) and public.has_capability(tenant_id,'delivery') and archived_by=auth.uid());
create policy archive_delete on public.tracker_archives for delete to authenticated using(public.is_staff(tenant_id) and public.has_capability(tenant_id,'delivery'));
revoke all on public.sop_runs,public.sop_tasks,public.tracker_archives from public,anon,authenticated;
grant select,insert on public.sop_runs,public.sop_tasks to authenticated;
grant update(status,owner_id,reviewer_id,backup_id,support_ids,priority,due,client_due,checks,notes,evidence,next_action,follow_up,blocker,approval_evidence,date_change_reason) on public.sop_tasks to authenticated;
grant select,insert,delete on public.tracker_archives to authenticated;
create index sop_tasks_run_idx on public.sop_tasks(tenant_id,run_id);create index sop_tasks_owner_idx on public.sop_tasks(tenant_id,owner_id,due);
create function nxt_private.guard_sop_task() returns trigger language plpgsql security invoker set search_path='' as $$
declare manager boolean:=public.has_capability(new.tenant_id,'delivery');uid uuid:=auth.uid();begin
 if not public.is_staff(new.tenant_id) then raise exception 'Staff access required';end if;
 if tg_op='INSERT' then
  if new.status<>'Not Started' or new.approved_by is not null or new.approved_at is not null then raise exception 'New SOP tasks must start unapproved';end if;
 else
  -- Serialise transitions within a workflow so dependency checks cannot race completion/reopening.
  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text||':sop-run:'||new.run_id::text,0));
  if new.tenant_id<>old.tenant_id or new.run_id<>old.run_id or new.key<>old.key or new.dependencies<>old.dependencies or new.title<>old.title or new.description<>old.description then raise exception 'Workflow identity and scope cannot change here';end if;
  if not manager and (new.owner_id<>old.owner_id or new.reviewer_id<>old.reviewer_id or new.backup_id<>old.backup_id or new.support_ids<>old.support_ids or new.priority<>old.priority or new.due<>old.due or new.client_due is distinct from old.client_due) then raise exception 'Project manager required for ownership or schedule changes';end if;
  if (new.due<>old.due or new.client_due is distinct from old.client_due) and (length(trim(new.date_change_reason))=0 or new.date_change_reason=old.date_change_reason) then raise exception 'Record a new reason for deadline changes';end if;
  if new.owner_id<>old.owner_id and length(trim(new.notes))=0 then raise exception 'Record the ownership handover in notes';end if;
  if new.status<>old.status and new.status in ('In Progress','Under Review','Completed') and exists(select 1 from unnest(new.dependencies) k where not exists(select 1 from public.sop_tasks d where d.tenant_id=new.tenant_id and d.run_id=new.run_id and d.key=k and d.status='Completed')) then raise exception 'Complete and approve prerequisite tasks first';end if;
  if old.status='Completed' and new.status<>'Completed' then
   if not manager or length(trim(new.notes))=0 then raise exception 'Project manager must record the reason for reopening';end if;
   if exists(select 1 from public.sop_tasks d where d.tenant_id=new.tenant_id and d.run_id=new.run_id and old.key=any(d.dependencies) and d.status<>'Not Started') then raise exception 'Reopen dependent work first';end if;
  end if;
  if old.status='Completed' and (new.checks<>old.checks or new.evidence<>old.evidence or new.approval_evidence<>old.approval_evidence or new.owner_id<>old.owner_id or new.reviewer_id<>old.reviewer_id) and new.status='Completed' then raise exception 'Reopen the task before changing approved work';end if;
  if new.status='Completed' and old.status<>'Completed' then
   if old.status<>'Under Review' or uid<>new.reviewer_id or uid=new.owner_id then raise exception 'The designated independent reviewer must approve work from Under Review';end if;
   if length(trim(new.evidence))=0 or length(trim(new.approval_evidence))=0 or exists(select 1 from jsonb_array_elements(new.checks) ch where ch->>'done' is distinct from 'true') then raise exception 'Complete acceptance checks and record deliverable and approval evidence';end if;
   new.approved_by:=uid;new.approved_at:=now();
  elsif new.status<>'Completed' then new.approved_by:=null;new.approved_at:=null;new.approval_evidence:='';end if;
  if jsonb_typeof(new.checks)<>'array' or jsonb_array_length(new.checks)<>jsonb_array_length(old.checks) or exists(select 1 from jsonb_array_elements(new.checks) with ordinality v(value,n) where value->>'text' is distinct from old.checks->(n::int-1)->>'text' or jsonb_typeof(value->'done') is distinct from 'boolean') then raise exception 'Only acceptance check completion may change';end if;
 end if;
 if new.status='Waiting on Client' and (new.follow_up is null or length(trim(new.next_action))=0) then raise exception 'Waiting on Client requires a next action and follow-up date';end if;
 if new.status='Blocked' and (length(trim(new.blocker))=0 or length(trim(new.next_action))=0 or new.follow_up is null) then raise exception 'Blocked work requires a blocker, next action and escalation follow-up date';end if;
 if exists(select 1 from unnest(array[new.owner_id,new.reviewer_id,new.backup_id]||new.support_ids) person where not exists(select 1 from public.staff_directory d where d.tenant_id=new.tenant_id and d.user_id=person)) then raise exception 'Choose workspace staff for all responsibilities';end if;
 new.updated_at:=now();if tg_op='UPDATE' then new.version:=old.version+1;end if;return new;
end;$$;
revoke all on function nxt_private.guard_sop_task() from public,anon,authenticated;
create trigger sop_task_guard before insert or update on public.sop_tasks for each row execute function nxt_private.guard_sop_task();
create trigger sop_run_audit after insert on public.sop_runs for each row execute function public.record_audit();
create trigger sop_task_audit after insert or update on public.sop_tasks for each row execute function public.record_audit();
-- Archives have a composite key, so use an explicit audit function.
create function nxt_private.audit_tracker_archive() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.audit_events(tenant_id,actor_id,entity,record_id,action) values(coalesce(new.tenant_id,old.tenant_id),auth.uid(),'tracker_archive',null,tg_op);return coalesce(new,old);end;$$;
revoke all on function nxt_private.audit_tracker_archive() from public,anon,authenticated;
create trigger tracker_archive_audit after insert or delete on public.tracker_archives for each row execute function nxt_private.audit_tracker_archive();
create function public.create_sop_workflow(t uuid,operation_id uuid,v jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare oldrow public.sop_runs;run uuid;c uuid;d uuid;p uuid;s jsonb;steps jsonb;selected jsonb;rowdates jsonb;owner uuid;reviewer uuid;support uuid[];dep text[];rolekey text;begin
 if auth.uid() is null or not public.is_staff(t) or not public.has_capability(t,'crm') or not public.has_capability(t,'delivery') then raise exception 'Client and delivery management access required';end if;
 if operation_id is null or length(trim(coalesce(v->>'clientName',''))) not between 1 and 160 or length(trim(coalesce(v->>'brief',''))) not between 10 and 5000 or v->>'service' not in ('web','marketing','general') or length(trim(coalesce(v->>'leadSource','')))=0 then raise exception 'Confirm client, lead source, service and brief';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text||':sop:'||lower(trim(v->>'clientName')),0));
 select * into oldrow from public.sop_runs where tenant_id=t and request_id=operation_id;if found then return jsonb_build_object('run_id',oldrow.id,'duplicate',true);end if;
 for rolekey in select unnest(array['nyasha','kristian','bridget','adrian','tatenda','michael']) loop if not exists(select 1 from public.staff_directory where tenant_id=t and user_id=(v->'roles'->>rolekey)::uuid) then raise exception 'Map every role to workspace staff';end if;end loop;
 c:=nullif(v->>'clientId','')::uuid;
 if c is null then
  select id into c from public.clients where tenant_id=t and lower(trim(title))=lower(trim(v->>'clientName')) and archived_at is null;
  if c is null then insert into public.clients(tenant_id,title,phone,email) values(t,trim(v->>'clientName'),v->>'clientPhone',nullif(v->>'clientEmail','')) returning id into c;end if;
 elsif not exists(select 1 from public.clients where tenant_id=t and id=c and archived_at is null) then raise exception 'Choose an active workspace client';end if;
 if exists(select 1 from public.sop_runs where tenant_id=t and client_id=c) then raise exception 'This client already has an SOP workflow. Open its existing tasks';end if;
 select a.steps into steps from public.sop_templates a where version=1;
 select jsonb_agg(x) into selected from jsonb_array_elements(steps) x where not(x?'service') or x->>'service'=v->>'service';
 insert into public.deals(tenant_id,client_id,title,description,status,lead_source) values(t,c,left(trim(v->>'clientName')||' - SOP opportunity',160),v->>'brief','new',v->>'leadSource') returning id into d;
 insert into public.projects(tenant_id,client_id,title,description,client_visible) values(t,c,left(trim(v->>'clientName')||' - SOP workflow',160),v->>'brief',false) returning id into p;
 insert into public.sop_runs(tenant_id,client_id,deal_id,project_id,request_id,template_version,service,brief,roles) values(t,c,d,p,operation_id,1,v->>'service',v->>'brief',v->'roles') returning id into run;
 for s in select value from jsonb_array_elements(selected) loop
  owner:=(v->'roles'->>(s->>'owner'))::uuid;reviewer:=(v->'roles'->>(s->>'reviewer'))::uuid;rowdates:=v->'dates'->(s->>'key');
  if rowdates->>'due' is null then raise exception 'Set an internal deadline for every task';end if;
  select coalesce(array_agg(k),'{}') into dep from jsonb_array_elements_text(s->'after') k where exists(select 1 from jsonb_array_elements(selected) sel where sel->>'key'=k);
  if exists(select 1 from unnest(dep) k where (v->'dates'->k->>'due')::date>(rowdates->>'due')::date) then raise exception 'Dependency deadlines must come before dependent work';end if;
  select coalesce(array_agg(distinct (v->'roles'->>k)::uuid),'{}') into support from jsonb_array_elements_text(s->'support') k;
  insert into public.sop_tasks(tenant_id,run_id,key,title,description,owner_id,reviewer_id,backup_id,support_ids,dependencies,due,client_due,checks,next_action,follow_up)
  values(t,run,s->>'key',s->>'title',s->>'check',owner,reviewer,(v->'roles'->>(s->>'backup'))::uuid,support,dep,(rowdates->>'due')::date,nullif(rowdates->>'clientDue','')::date,jsonb_build_array(jsonb_build_object('text',s->>'check','done',false)),case when s->>'key'='intake' then 'Contact the prospect and record the next action' else '' end,case when s->>'key'='intake' then (rowdates->>'due')::date else null end);
 end loop;
 return jsonb_build_object('run_id',run,'client_id',c,'deal_id',d,'project_id',p,'duplicate',false);
end;$$;
revoke all on function public.create_sop_workflow(uuid,uuid,jsonb) from public,anon;grant execute on function public.create_sop_workflow(uuid,uuid,jsonb) to authenticated;
create function public.update_sop_task(t uuid,r uuid,expected_version integer,changes jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare task public.sop_tasks;k text;begin
 if auth.uid() is null or not public.is_staff(t) then raise exception 'Staff access required';end if;
 select * into task from public.sop_tasks where tenant_id=t and id=r;if not found then raise exception 'Task unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text||':sop-run:'||task.run_id::text,0));
 select * into task from public.sop_tasks where tenant_id=t and id=r for update;
 if task.version is distinct from expected_version then raise exception 'Task changed. Refresh before saving';end if;
 if not(public.has_capability(t,'delivery') or auth.uid() in(task.owner_id,task.reviewer_id) or auth.uid()=any(task.support_ids)) then raise exception 'Task access required';end if;
 if jsonb_typeof(changes) is distinct from 'object' then raise exception 'Invalid task update';end if;
 for k in select jsonb_object_keys(changes) loop if k not in('status','notes','evidence','checks','nextAction','followUp','blocker','approvalEvidence','due','clientDue','priority','dateChangeReason','ownerId','reviewerId','backupId') then raise exception 'Unsupported SOP field';end if;end loop;
 update public.sop_tasks set status=coalesce(changes->>'status',status),notes=coalesce(changes->>'notes',notes),evidence=coalesce(changes->>'evidence',evidence),checks=coalesce(changes->'checks',checks),next_action=coalesce(changes->>'nextAction',next_action),follow_up=case when changes?'followUp' then nullif(changes->>'followUp','')::date else follow_up end,blocker=coalesce(changes->>'blocker',blocker),approval_evidence=coalesce(changes->>'approvalEvidence',approval_evidence),due=coalesce((changes->>'due')::date,due),client_due=case when changes?'clientDue' then nullif(changes->>'clientDue','')::date else client_due end,priority=coalesce(changes->>'priority',priority),date_change_reason=coalesce(changes->>'dateChangeReason',date_change_reason),owner_id=coalesce((changes->>'ownerId')::uuid,owner_id),reviewer_id=coalesce((changes->>'reviewerId')::uuid,reviewer_id),backup_id=coalesce((changes->>'backupId')::uuid,backup_id) where tenant_id=t and id=r;
 return jsonb_build_object('saved',true);
end;$$;
revoke all on function public.update_sop_task(uuid,uuid,integer,jsonb) from public,anon;grant execute on function public.update_sop_task(uuid,uuid,integer,jsonb) to authenticated;
create function public.archive_tracker_records(t uuid,records jsonb,restore boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$declare item jsonb;begin
 if auth.uid() is null or not public.is_staff(t) or not public.has_capability(t,'delivery') then raise exception 'Delivery management access required';end if;
 if jsonb_typeof(records) is distinct from 'array' or jsonb_array_length(records) not between 1 and 2000 then raise exception 'Select 1-2000 task records';end if;
 for item in select value from jsonb_array_elements(records) loop
  if restore then delete from public.tracker_archives where tenant_id=t and project=item->>'project' and record_id=item->>'id';
  else insert into public.tracker_archives(tenant_id,project,record_id) values(t,item->>'project',item->>'id') on conflict do nothing;end if;
 end loop;return jsonb_build_object('saved',true);
end;$$;
revoke all on function public.archive_tracker_records(uuid,jsonb,boolean) from public,anon;grant execute on function public.archive_tracker_records(uuid,jsonb,boolean) to authenticated;
commit;
