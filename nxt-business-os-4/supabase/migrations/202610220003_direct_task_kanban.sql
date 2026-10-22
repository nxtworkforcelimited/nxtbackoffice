-- Tasks no longer require reviewer approval. Projects keep their approval workflow.
begin;

create or replace function public.work_core_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare f public.work_flow; changed boolean;
begin
 if tg_op='INSERT' then
  if tg_table_name='tasks' then
   if new.status not in ('todo','in_progress','under_review','done') then raise exception 'Invalid task stage';end if;
   return new;
  end if;
  if new.client_visible or new.status not in ('planned','active') then raise exception 'Create internal work first, then submit it for review';end if;
  return new;
 end if;

 if new.id<>old.id or new.tenant_id<>old.tenant_id then raise exception 'Work identity cannot change';end if;
 select * into f from public.work_flow where tenant_id=new.tenant_id and kind=tg_table_name and record_id=new.id for update;
 changed:=(to_jsonb(new)-'status'-'client_visible'-'updated_at') is distinct from (to_jsonb(old)-'status'-'client_visible'-'updated_at');

 if tg_table_name='tasks' then
  if changed and f.id is not null then update public.work_flow set revision=revision+1,updated_at=now() where id=f.id;end if;
  return new;
 end if;

 if changed then
  update public.work_flow set revision=revision+1,approved_revision=0,stage='in_progress',updated_at=now() where id=f.id;
  new.client_visible:=false;new.status:='active';
 elsif (new.client_visible and not old.client_visible) or new.status in ('approved','completed') and new.status is distinct from old.status then
  if f.id is null or f.approved_revision<>f.revision or f.stage not in ('approved','complete') then raise exception 'Review approval is required before release or completion';end if;
 elsif new.status='review' and new.status is distinct from old.status then
  if f.stage<>'under_review' then raise exception 'Use Submit for review in the Project workspace';end if;
 end if;
 if new.status is distinct from old.status and new.status in ('planned','active','changes_requested') then new.client_visible:=false;end if;
 return new;
end;$$;

alter function public.save_work(uuid,text,jsonb) rename to save_work_with_approval_v1;
alter function public.save_work_with_approval_v1(uuid,text,jsonb) set schema nxt_private;
revoke all on function nxt_private.save_work_with_approval_v1(uuid,text,jsonb) from public,anon,authenticated;

create function public.save_work(t uuid,k text,v jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid:=nullif(v->>'id','')::uuid;ci uuid:=nullif(v->>'client_id','')::uuid;pid uuid:=nullif(v->>'project_id','')::uuid;assigned uuid:=nullif(v->>'assignee_id','')::uuid;internal_date date:=(v->>'internal_due')::date;client_date date:=nullif(v->>'client_due','')::date;start_date date:=(v->>'scheduled_start')::date;dep uuid:=nullif(v->>'depends_on','')::uuid;f public.work_flow;share boolean:=coalesce((v->>'share_on_approval')::boolean,false);
begin
 if k='projects' then return nxt_private.save_work_with_approval_v1(t,k,v);end if;
 if k<>'tasks' or auth.uid() is null or not public.is_staff(t) then raise exception 'Staff access required';end if;
 if not (public.has_capability(t,'task_admin') or public.has_capability(t,'delivery') or public.workspace_role_for(t) in ('owner','admin')) then raise exception 'Task access required';end if;
 if length(trim(coalesce(v->>'title',''))) not between 1 and 160 or length(coalesce(v->>'description',''))>5000 then raise exception 'Check title and description';end if;
 if internal_date is null or start_date is null or internal_date<start_date or (ci is not null and client_date is null) or (client_date is not null and internal_date>client_date) then raise exception 'Choose a start, internal deadline and (for client work) a later or equal client deadline';end if;
 if ci is not null and not exists(select 1 from public.clients where tenant_id=t and id=ci and archived_at is null) then raise exception 'Choose an active client';end if;
 if assigned is not null and not exists(select 1 from public.staff_directory where tenant_id=t and user_id=assigned) then raise exception 'Choose a provisioned team member';end if;
 if pid is not null and not exists(select 1 from public.projects where tenant_id=t and id=pid and client_id is not distinct from ci and archived_at is null) then raise exception 'Project and task must have the same client';end if;

 if rid is null then
  insert into public.tasks(tenant_id,title,description,client_id,due_date,project_id,assignee_id,client_visible)
  values(t,trim(v->>'title'),coalesce(v->>'description',''),ci,client_date,pid,assigned,false)
  returning id into rid;
 else
  if not exists(select 1 from public.tasks where tenant_id=t and id=rid and archived_at is null) then raise exception 'Task unavailable';end if;
  update public.tasks set title=trim(v->>'title'),description=coalesce(v->>'description',''),client_id=ci,due_date=client_date,project_id=pid,assignee_id=assigned where tenant_id=t and id=rid;
 end if;

 select * into f from public.work_flow where tenant_id=t and kind='tasks' and record_id=rid for update;
 if dep is not null then
  if dep=f.id or not exists(select 1 from public.work_flow where tenant_id=t and id=dep and internal_due<start_date) then raise exception 'Dependency must finish before this task starts';end if;
  if exists(with recursive chain as(select id,depends_on from public.work_flow where tenant_id=t and id=dep union select w.id,w.depends_on from public.work_flow w join chain c on w.id=c.depends_on where w.tenant_id=t) select 1 from chain where id=f.id) then raise exception 'Dependency cycle detected';end if;
 end if;

 update public.work_flow set internal_due=internal_date,scheduled_start=start_date,depends_on=dep,share_on_approval=share,source_name=left(coalesce(v->>'source_name',source_name),200),source_excerpt=left(coalesce(v->>'source_excerpt',source_excerpt),10000),updated_at=now() where id=f.id;
 update public.tasks set client_visible=(share and ci is not null) where tenant_id=t and id=rid;
 return jsonb_build_object('id',rid,'flow_id',f.id);
end;$$;
revoke all on function public.save_work(uuid,text,jsonb) from public,anon;
grant execute on function public.save_work(uuid,text,jsonb) to authenticated;

create function public.move_task_stage(t uuid,fid uuid,target_stage text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.work_flow; task public.tasks; mapped text; dep_stage text;
begin
 if auth.uid() is null or not public.is_staff(t) then raise exception 'Staff access required';end if;
 if target_stage not in ('not_started','in_progress','under_review','complete') then raise exception 'Invalid task stage';end if;
 select * into f from public.work_flow where tenant_id=t and id=fid and kind='tasks' for update;if not found then raise exception 'Task unavailable';end if;
 select * into task from public.tasks where tenant_id=t and id=f.record_id and archived_at is null for update;if not found then raise exception 'Task unavailable';end if;
 if not (public.workspace_role_for(t) in ('owner','admin') or public.has_capability(t,'task_admin') or public.has_capability(t,'delivery') or task.assignee_id=auth.uid()) then raise exception 'You cannot move this task';end if;
 if target_stage<>'not_started' and f.depends_on is not null then
  select stage into dep_stage from public.work_flow where tenant_id=t and id=f.depends_on;
  if dep_stage not in ('approved','complete') then raise exception 'Complete the dependency before moving this task forward';end if;
 end if;
 mapped:=case target_stage when 'not_started' then 'todo' when 'in_progress' then 'in_progress' when 'under_review' then 'under_review' else 'done' end;
 update public.work_flow set stage=target_stage,approved_revision=0,updated_at=now() where id=fid;
 update public.tasks set status=mapped where tenant_id=t and id=f.record_id;
 return jsonb_build_object('id',task.id,'flow_id',fid,'stage',target_stage,'status',mapped);
end;$$;
revoke all on function public.move_task_stage(uuid,uuid,text) from public,anon;
grant execute on function public.move_task_stage(uuid,uuid,text) to authenticated;

-- Old task approval states are normalized into the direct task workflow.
update public.work_flow set stage='under_review',approved_revision=0 where kind='tasks' and stage='approved';
update public.tasks set status='under_review' where id in (select record_id from public.work_flow where kind='tasks' and stage='under_review') and status='approved';
update public.work_flow set stage='in_progress',approved_revision=0 where kind='tasks' and stage='changes_requested';
update public.tasks set status='in_progress' where id in (select record_id from public.work_flow where kind='tasks' and stage='in_progress') and status='changes_requested';
delete from public.work_votes where flow_id in (select id from public.work_flow where kind='tasks');

commit;
