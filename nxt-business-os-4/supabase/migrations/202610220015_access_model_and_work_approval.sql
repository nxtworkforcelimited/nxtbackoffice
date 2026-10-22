begin;

alter table public.member_permissions drop constraint if exists member_permissions_capability_check;
alter table public.member_permissions add constraint member_permissions_capability_check
check (capability = any (array[
'crm','delivery','content','approve_content','documents','finance','accounting','payroll','sms','reports','website','hr','approve_leave','tickets','task_admin','finance_admin','payroll_admin'
]::text[]));

-- All internal users get every day-to-day app capability.
insert into public.member_permissions(tenant_id,user_id,capability)
select m.tenant_id,m.user_id,c.capability
from public.memberships m
cross join (values
 ('crm'),('delivery'),('content'),('documents'),('finance'),('sms'),('reports'),('hr'),('tickets')
) as c(capability)
where m.tenant_id='bdb66466-e569-4a47-beb4-046fd03fdbce' and m.role<>'client'
on conflict do nothing;

-- Accounting is restricted to Nyasha and Kristian.
delete from public.member_permissions
where tenant_id='bdb66466-e569-4a47-beb4-046fd03fdbce'
  and capability='accounting'
  and user_id not in ('3c5d23a8-6fea-48ca-a630-37124a10d1db','2f0123f5-8e00-4ab6-92d1-cd3ec8ff0f74');

insert into public.member_permissions(tenant_id,user_id,capability) values
('bdb66466-e569-4a47-beb4-046fd03fdbce','3c5d23a8-6fea-48ca-a630-37124a10d1db','accounting'),
('bdb66466-e569-4a47-beb4-046fd03fdbce','2f0123f5-8e00-4ab6-92d1-cd3ec8ff0f74','accounting')
on conflict do nothing;

-- Payroll is restricted to Nyasha, Kristian and Bridget.
delete from public.member_permissions
where tenant_id='bdb66466-e569-4a47-beb4-046fd03fdbce'
  and capability in ('payroll','payroll_admin')
  and user_id not in ('3c5d23a8-6fea-48ca-a630-37124a10d1db','2f0123f5-8e00-4ab6-92d1-cd3ec8ff0f74','4f661657-3ec7-4246-9d72-04cc3e4f3841');

insert into public.member_permissions(tenant_id,user_id,capability) values
('bdb66466-e569-4a47-beb4-046fd03fdbce','3c5d23a8-6fea-48ca-a630-37124a10d1db','payroll'),
('bdb66466-e569-4a47-beb4-046fd03fdbce','3c5d23a8-6fea-48ca-a630-37124a10d1db','payroll_admin'),
('bdb66466-e569-4a47-beb4-046fd03fdbce','2f0123f5-8e00-4ab6-92d1-cd3ec8ff0f74','payroll'),
('bdb66466-e569-4a47-beb4-046fd03fdbce','2f0123f5-8e00-4ab6-92d1-cd3ec8ff0f74','payroll_admin'),
('bdb66466-e569-4a47-beb4-046fd03fdbce','4f661657-3ec7-4246-9d72-04cc3e4f3841','payroll'),
('bdb66466-e569-4a47-beb4-046fd03fdbce','4f661657-3ec7-4246-9d72-04cc3e4f3841','payroll_admin')
on conflict do nothing;

-- Project/task completion approval is Nyasha or Michael only.
delete from public.member_permissions
where tenant_id='bdb66466-e569-4a47-beb4-046fd03fdbce'
  and capability='task_admin'
  and user_id not in ('3c5d23a8-6fea-48ca-a630-37124a10d1db','c6aa278d-db23-4464-93c2-6308934fe99c');

insert into public.member_permissions(tenant_id,user_id,capability) values
('bdb66466-e569-4a47-beb4-046fd03fdbce','3c5d23a8-6fea-48ca-a630-37124a10d1db','task_admin'),
('bdb66466-e569-4a47-beb4-046fd03fdbce','c6aa278d-db23-4464-93c2-6308934fe99c','task_admin')
on conflict do nothing;

create or replace function public.move_task_stage(t uuid, fid uuid, target_stage text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.work_flow; task public.tasks; mapped text; dep_stage text;
begin
 if auth.uid() is null or not public.is_staff(t) then raise exception 'Staff access required';end if;
 if target_stage not in ('not_started','in_progress','under_review','complete') then raise exception 'Invalid task stage';end if;
 select * into f from public.work_flow where tenant_id=t and id=fid and kind='tasks' for update;if not found then raise exception 'Task unavailable';end if;
 select * into task from public.tasks where tenant_id=t and id=f.record_id and archived_at is null for update;if not found then raise exception 'Task unavailable';end if;
 if not (public.workspace_role_for(t) in ('owner','admin') or public.has_capability(t,'task_admin') or public.has_capability(t,'delivery') or task.assignee_id=auth.uid()) then raise exception 'You cannot move this task';end if;
 if target_stage='complete' then
   if f.stage<>'under_review' then raise exception 'Move the task to Under review before approval';end if;
   if not exists(select 1 from public.work_reviewers r where r.tenant_id=t and r.user_id=auth.uid()) then raise exception 'Only Nyasha or Michael can approve tasks as complete';end if;
 end if;
 mapped:=case target_stage when 'not_started' then 'todo' when 'in_progress' then 'in_progress' when 'under_review' then 'under_review' else 'done' end;
 update public.work_flow set stage=target_stage,approved_revision=0,depends_on=null,updated_at=now() where id=fid;
 update public.tasks set status=mapped where tenant_id=t and id=f.record_id;
 return jsonb_build_object('id',task.id,'flow_id',fid,'stage',target_stage,'status',mapped);
end;$$;

create or replace function public.move_work_stage(t uuid, fid uuid, target_stage text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.work_flow; mapped text;
begin
 if auth.uid() is null or not public.is_staff(t) then raise exception 'Staff access required';end if;
 if target_stage not in ('not_started','in_progress','under_review','complete') then raise exception 'Invalid stage';end if;
 select * into f from public.work_flow where tenant_id=t and id=fid for update;if not found then raise exception 'Work unavailable';end if;
 if f.kind='tasks' then return public.move_task_stage(t,fid,target_stage);end if;
 if f.kind<>'projects' then raise exception 'Work unavailable';end if;
 if target_stage='complete' then
   if f.stage<>'under_review' then raise exception 'Move the project to Under review before approval';end if;
   if not exists(select 1 from public.work_reviewers r where r.tenant_id=t and r.user_id=auth.uid()) then raise exception 'Only Nyasha or Michael can approve projects as complete';end if;
 end if;
 mapped:=case target_stage when 'not_started' then 'planned' when 'in_progress' then 'active' when 'under_review' then 'review' else 'completed' end;
 update public.work_flow set stage=target_stage,approved_revision=0,depends_on=null,updated_at=now() where id=fid;
 update public.projects set status=mapped where tenant_id=t and id=f.record_id;
 return jsonb_build_object('id',f.record_id,'flow_id',fid,'stage',target_stage,'status',mapped);
end;$$;

commit;