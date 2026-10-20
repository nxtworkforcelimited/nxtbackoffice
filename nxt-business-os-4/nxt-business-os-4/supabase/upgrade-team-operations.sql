-- Run once after the four existing migrations. Does not create Auth users or delete records.
begin;
alter table public.member_permissions drop constraint member_permissions_capability_check;
alter table public.member_permissions add constraint member_permissions_capability_check check(capability in ('crm','delivery','content','approve_content','documents','finance','payroll','sms','reports','website','hr','approve_leave','tickets'));
create table public.staff_directory(
 tenant_id uuid not null,user_id uuid not null,name text not null,email text not null,job_title text not null default '',department text not null default '',reports_to text not null default '',
 primary key(tenant_id,user_id),foreign key(tenant_id,user_id) references public.memberships(tenant_id,user_id) on delete cascade);
alter table public.staff_directory enable row level security;
create policy directory_read on public.staff_directory for select to authenticated using(public.is_staff(tenant_id));
create policy directory_manage on public.staff_directory for all to authenticated using(public.workspace_role_for(tenant_id)='owner') with check(public.workspace_role_for(tenant_id)='owner' and exists(select 1 from public.memberships m where m.tenant_id=staff_directory.tenant_id and m.user_id=staff_directory.user_id and m.role<>'client'));
revoke all on public.staff_directory from anon;
grant select,insert,update on public.staff_directory to authenticated;
alter table public.employees add column department text not null default '',add column reports_to text not null default '';
alter policy employees_manage on public.employees using(public.has_capability(tenant_id,'hr') or public.has_capability(tenant_id,'payroll')) with check((public.has_capability(tenant_id,'hr') or public.has_capability(tenant_id,'payroll')) and (user_id is null or exists(select 1 from public.memberships m where m.tenant_id=employees.tenant_id and m.user_id=employees.user_id and m.role<>'client')));
alter policy leave_read on public.leave_requests using(public.is_staff(tenant_id) and (user_id=auth.uid() or public.has_capability(tenant_id,'approve_leave')));
-- Preserve the existing checked review function, replacing only its reviewer capability.
do $$ declare definition text;begin
 select pg_get_functiondef('public.review_leave(uuid,uuid,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'''payroll''','''approve_leave''');
 definition:=replace(definition,'Another payroll manager','Another leave approver');execute definition;
end $$;
alter table public.clients add column archived_at timestamptz;
alter table public.projects add column archived_at timestamptz;
alter table public.tasks add column archived_at timestamptz;
-- Assigned staff may read their own tasks and linked project; managers retain delivery access.
alter policy tasks_read on public.tasks using(public.has_capability(tenant_id,'delivery') or (public.is_staff(tenant_id) and assignee_id=auth.uid()) or (client_visible and archived_at is null and public.can_read_client(tenant_id,client_id)));
alter policy projects_read on public.projects using(public.has_capability(tenant_id,'delivery') or (public.is_staff(tenant_id) and exists(select 1 from public.tasks t where t.tenant_id=projects.tenant_id and t.project_id=projects.id and t.assignee_id=auth.uid())) or (client_visible and archived_at is null and public.can_read_client(tenant_id,client_id)));
alter policy client_read on public.clients using(public.is_staff(tenant_id) or (archived_at is null and public.can_read_client(tenant_id,id)));
create policy own_task_update on public.tasks for update to authenticated using(public.is_staff(tenant_id) and assignee_id=auth.uid() and archived_at is null) with check(public.is_staff(tenant_id) and assignee_id=auth.uid() and archived_at is null);
create function public.guard_task_update() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if current_user in ('postgres','supabase_admin') then return new;end if;
 if tg_op='UPDATE' and not public.has_capability(old.tenant_id,'delivery') then
 if not public.is_staff(old.tenant_id) or old.assignee_id is distinct from auth.uid() or (to_jsonb(new)-'status'-'updated_at') is distinct from (to_jsonb(old)-'status'-'updated_at') then raise exception 'Only your task status can be changed';end if;
 end if;
 if new.assignee_id is not null and not exists(select 1 from public.staff_directory d where d.tenant_id=new.tenant_id and d.user_id=new.assignee_id) then raise exception 'Assign a provisioned staff member';end if;
 return new;end;$$;
create trigger task_assignment_guard before insert or update on public.tasks for each row execute function public.guard_task_update();
create table public.it_tickets(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,requester_id uuid not null default auth.uid(),assignee_id uuid,
 reference text not null default ('IT-'||upper(substr(gen_random_uuid()::text,1,8))),title text not null check(length(title) between 1 and 160),description text not null check(length(description) between 1 and 5000),device text not null default '',category text not null check(category in ('Hardware','Software','Network','Account access','Other')),priority text not null default 'Normal' check(priority in ('Low','Normal','High','Urgent')),status text not null default 'New' check(status in ('New','Assigned','In progress','Waiting','Resolved','Closed')),resolution text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,id),
 foreign key(tenant_id,requester_id) references public.memberships(tenant_id,user_id),foreign key(tenant_id,assignee_id) references public.staff_directory(tenant_id,user_id));
create table public.it_ticket_comments(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,ticket_id uuid not null,author_id uuid not null default auth.uid(),body text not null check(length(body) between 1 and 5000),created_at timestamptz not null default now(),foreign key(tenant_id,ticket_id) references public.it_tickets(tenant_id,id),foreign key(tenant_id,author_id) references public.memberships(tenant_id,user_id));
alter table public.it_tickets enable row level security;
alter table public.it_ticket_comments enable row level security;
create policy ticket_read on public.it_tickets for select to authenticated using(public.is_staff(tenant_id) and (requester_id=auth.uid() or public.has_capability(tenant_id,'tickets')));
create policy ticket_create on public.it_tickets for insert to authenticated with check(public.is_staff(tenant_id) and requester_id=auth.uid() and assignee_id is null and status='New' and resolution='');
create policy ticket_manage on public.it_tickets for update to authenticated using(public.has_capability(tenant_id,'tickets')) with check(public.has_capability(tenant_id,'tickets'));
create policy ticket_comment_read on public.it_ticket_comments for select to authenticated using(exists(select 1 from public.it_tickets t where t.id=ticket_id and t.tenant_id=it_ticket_comments.tenant_id));
create policy ticket_comment_create on public.it_ticket_comments for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from public.it_tickets t where t.id=ticket_id and t.tenant_id=it_ticket_comments.tenant_id));
revoke all on public.it_tickets,public.it_ticket_comments from anon;
grant select,insert,update on public.it_tickets to authenticated;
grant select,insert on public.it_ticket_comments to authenticated;
create index tickets_tenant on public.it_tickets(tenant_id,status);
create index tickets_requester on public.it_tickets(tenant_id,requester_id);
create index ticket_comments_parent on public.it_ticket_comments(tenant_id,ticket_id);
create function public.guard_ticket() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op='UPDATE' and (new.tenant_id<>old.tenant_id or new.requester_id<>old.requester_id or new.id<>old.id or new.reference<>old.reference) then raise exception 'Ticket identity cannot change';end if;
 if new.assignee_id is not null and not public.has_capability(new.tenant_id,'tickets') then raise exception 'Ticket manager required';end if;
 if new.status in ('Resolved','Closed') and length(trim(new.resolution))=0 then raise exception 'Add a resolution before closing';end if;
 new.updated_at:=now();return new;end;$$;
create trigger ticket_guard before insert or update on public.it_tickets for each row execute function public.guard_ticket();
create trigger ticket_audit after insert or update on public.it_tickets for each row execute function public.record_audit();
-- Client mail is deliberately enabled per client, never for internal/HR/payroll records.
alter table public.clients add column approval_email_enabled boolean not null default false;
create function public.queue_client_approval() returns trigger language plpgsql security definer set search_path='' as $$declare recipient_email text;begin
 if old.status is not distinct from new.status or new.status<>'client_review' or new.client_id is null then return new;end if;
 select email into recipient_email from public.clients where id=new.client_id and tenant_id=new.tenant_id and archived_at is null and approval_email_enabled;
 if recipient_email is not null and position('@' in recipient_email)>1 then
 insert into public.notification_outbox(tenant_id,recipient,subject,body) values(new.tenant_id,recipient_email,'Ready for your review: '||new.title,'NXT Workforce has approved work for your review. Please sign in to your client portal to review it.');
 end if;return new;end;$$;
revoke all on function public.queue_client_approval() from public,anon,authenticated;
create trigger client_approval_notice after update on public.social_posts for each row execute function public.queue_client_approval();
-- Permanent removal is owner-only, requires prior archive and retains audit events.
-- Existing foreign keys prevent deleting clients/projects that still have linked records.
grant delete on public.clients,public.projects,public.tasks to authenticated;
create policy client_delete on public.clients for delete to authenticated using(public.workspace_role_for(tenant_id)='owner' and archived_at is not null);
create policy project_delete on public.projects for delete to authenticated using(public.workspace_role_for(tenant_id)='owner' and archived_at is not null);
create policy task_delete on public.tasks for delete to authenticated using(public.workspace_role_for(tenant_id)='owner' and archived_at is not null);
commit;
