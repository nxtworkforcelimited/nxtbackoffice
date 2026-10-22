-- Projects now use the same direct-post workflow as tasks. No reviewer approval gate.
begin;

alter function public.save_work(uuid,text,jsonb) rename to save_work_direct_tasks_v1;
alter function public.save_work_direct_tasks_v1(uuid,text,jsonb) set schema nxt_private;
revoke all on function nxt_private.save_work_direct_tasks_v1(uuid,text,jsonb) from public,anon,authenticated;

create function public.save_work(t uuid,k text,v jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid:=nullif(v->>'id','')::uuid;ci uuid:=nullif(v->>'client_id','')::uuid;pid uuid:=nullif(v->>'project_id','')::uuid;assigned uuid:=nullif(v->>'assignee_id','')::uuid;internal_date date:=(v->>'internal_due')::date;client_date date:=nullif(v->>'client_due','')::date;start_date date:=(v->>'scheduled_start')::date;f public.work_flow;share boolean:=coalesce((v->>'share_on_approval')::boolean,false);
begin
 if k='tasks' then return nxt_private.save_work_direct_tasks_v1(t,k,v||jsonb_build_object('depends_on',null));end if;
 if k<>'projects' or auth.uid() is null or not public.is_staff(t) then raise exception 'Staff access required';end if;
 if not (public.has_capability(t,'delivery') or public.workspace_role_for(t) in ('owner','admin')) then raise exception 'Project access required';end if;
 if length(trim(coalesce(v->>'title',''))) not between 1 and 160 or length(coalesce(v->>'description',''))>5000 then raise exception 'Check title and description';end if;
 if internal_date is null or start_date is null or internal_date<start_date or (ci is not null and client_date is null) or (client_date is not null and internal_date>client_date) then raise exception 'Choose a start, internal deadline and (for client work) a later or equal client deadline';end if;
 if ci is not null and not exists(select 1 from public.clients where tenant_id=t and id=ci and archived_at is null) then raise exception 'Choose an active client';end if;

 if rid is null then
  insert into public.projects(tenant_id,title,description,client_id,due_date,client_visible)
  values(t,trim(v->>'title'),coalesce(v->>'description',''),ci,client_date,false)
  returning id into rid;
 else
  if not exists(select 1 from public.projects where tenant_id=t and id=rid and archived_at is null) then raise exception 'Project unavailable';end if;
  update public.projects set title=trim(v->>'title'),description=coalesce(v->>'description',''),client_id=ci,due_date=client_date where tenant_id=t and id=rid;
 end if;

 select * into f from public.work_flow where tenant_id=t and kind='projects' and record_id=rid for update;
 update public.work_flow set internal_due=internal_date,scheduled_start=start_date,depends_on=null,share_on_approval=share,approved_revision=0,updated_at=now() where id=f.id;
 update public.projects set client_visible=(share and ci is not null) where tenant_id=t and id=rid;
 return jsonb_build_object('id',rid,'flow_id',f.id);
end;$$;
revoke all on function public.save_work(uuid,text,jsonb) from public,anon;
grant execute on function public.save_work(uuid,text,jsonb) to authenticated;

create function public.move_work_stage(t uuid,fid uuid,target_stage text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.work_flow; mapped text; rec jsonb;
begin
 if auth.uid() is null or not public.is_staff(t) then raise exception 'Staff access required';end if;
 if target_stage not in ('not_started','in_progress','under_review','complete') then raise exception 'Invalid stage';end if;
 select * into f from public.work_flow where tenant_id=t and id=fid for update;if not found then raise exception 'Work unavailable';end if;
 if f.kind='tasks' then return public.move_task_stage(t,fid,target_stage);end if;
 if f.kind<>'projects' then raise exception 'Work unavailable';end if;
 if not (public.workspace_role_for(t) in ('owner','admin') or public.has_capability(t,'delivery')) then raise exception 'You cannot move this project';end if;
 mapped:=case target_stage when 'not_started' then 'planned' when 'in_progress' then 'active' when 'under_review' then 'review' else 'completed' end;
 update public.work_flow set stage=target_stage,approved_revision=0,depends_on=null,updated_at=now() where id=fid;
 update public.projects set status=mapped where tenant_id=t and id=f.record_id;
 return jsonb_build_object('id',f.record_id,'flow_id',fid,'stage',target_stage,'status',mapped);
end;$$;
revoke all on function public.move_work_stage(uuid,uuid,text) from public,anon;
grant execute on function public.move_work_stage(uuid,uuid,text) to authenticated;

update public.work_flow set depends_on=null,approved_revision=0 where kind='projects';
update public.work_flow set stage='under_review',approved_revision=0 where kind='projects' and stage='approved';
update public.projects set status='review' where id in (select record_id from public.work_flow where kind='projects' and stage='under_review') and status='approved';
update public.work_flow set stage='in_progress',approved_revision=0 where kind='projects' and stage='changes_requested';
update public.projects set status='active' where id in (select record_id from public.work_flow where kind='projects' and stage='in_progress') and status='changes_requested';
delete from public.work_votes where flow_id in (select id from public.work_flow where kind='projects');

commit;