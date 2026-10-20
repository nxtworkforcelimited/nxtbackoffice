-- NXT Business OS: run once on a new Supabase project.
begin;
create extension if not exists pgcrypto;
create type public.workspace_role as enum ('owner','admin','staff','client');
create table public.tenants (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 160),
 slug text unique not null, created_at timestamptz not null default now()
);
create table public.clients (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 title text not null check(length(title) between 1 and 160),email text,status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), unique(tenant_id,id)
);
create table public.memberships (
 tenant_id uuid not null references public.tenants(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 role public.workspace_role not null, client_id uuid, created_at timestamptz not null default now(),primary key(tenant_id,user_id),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 check ((role='client' and client_id is not null) or (role<>'client' and client_id is null))
);
-- These functions bypass membership RLS only for the current authenticated user.
create function public.workspace_role_for(t uuid) returns public.workspace_role language sql stable security definer set search_path='' as $$
 select role from public.memberships where tenant_id=t and user_id=(select auth.uid());
$$;
create function public.is_staff(t uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.workspace_role_for(t) in ('owner','admin','staff'),false);
$$;
create function public.can_read_client(t uuid,c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships where tenant_id=t and user_id=(select auth.uid()) and role='client' and client_id=c);
$$;
revoke all on function public.workspace_role_for(uuid),public.is_staff(uuid),public.can_read_client(uuid,uuid) from public,anon;
grant execute on function public.workspace_role_for(uuid),public.is_staff(uuid),public.can_read_client(uuid,uuid) to authenticated;
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.clients enable row level security;
create policy tenant_read on public.tenants for select to authenticated using(public.workspace_role_for(id) is not null);
create policy membership_read on public.memberships for select to authenticated using(user_id=(select auth.uid()) or public.workspace_role_for(tenant_id) in ('owner','admin'));
-- Membership/tenant provisioning is intentionally privileged SQL only in phase one.
create policy client_read on public.clients for select to authenticated using(public.is_staff(tenant_id) or public.can_read_client(tenant_id,id));
create policy client_insert on public.clients for insert to authenticated with check(public.is_staff(tenant_id));
create policy client_update on public.clients for update to authenticated using(public.is_staff(tenant_id)) with check(public.is_staff(tenant_id));

create table public.deals (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 title text not null check(length(title) between 1 and 160),description text check(length(description)<=5000),
 status text not null default 'new' check(status in ('new','qualified','proposal','won','lost')),
 client_id uuid,client_visible boolean not null default false,amount numeric(14,2) not null default 0 check(amount>=0), currency text not null default 'USD' check(currency='USD'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,id),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 check(not client_visible or client_id is not null)
);
alter table public.deals enable row level security;
create index deals_tenant_idx on public.deals(tenant_id,created_at desc);
create index deals_client_idx on public.deals(tenant_id,client_id);
create policy deals_read on public.deals for select to authenticated using(public.is_staff(tenant_id) );
create policy deals_insert on public.deals for insert to authenticated with check(public.is_staff(tenant_id));
create policy deals_update on public.deals for update to authenticated using(public.is_staff(tenant_id)) with check(public.is_staff(tenant_id));

create table public.projects (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 title text not null check(length(title) between 1 and 160),description text check(length(description)<=5000),
 status text not null default 'planned' check(status in ('planned','active','review','completed')),
 client_id uuid,client_visible boolean not null default false,due_date date,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,id),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 check(not client_visible or client_id is not null)
);
alter table public.projects enable row level security;
create index projects_tenant_idx on public.projects(tenant_id,created_at desc);
create index projects_client_idx on public.projects(tenant_id,client_id);
create policy projects_read on public.projects for select to authenticated using(public.is_staff(tenant_id) or (client_visible and public.can_read_client(tenant_id,client_id)));
create policy projects_insert on public.projects for insert to authenticated with check(public.is_staff(tenant_id));
create policy projects_update on public.projects for update to authenticated using(public.is_staff(tenant_id)) with check(public.is_staff(tenant_id));

create table public.tasks (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 title text not null check(length(title) between 1 and 160),description text check(length(description)<=5000),
 status text not null default 'todo' check(status in ('todo','in_progress','done')),
 client_id uuid,client_visible boolean not null default false,due_date date, project_id uuid, assignee_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,id),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 check(not client_visible or client_id is not null)
);
alter table public.tasks enable row level security;
create index tasks_tenant_idx on public.tasks(tenant_id,created_at desc);
create index tasks_client_idx on public.tasks(tenant_id,client_id);
create policy tasks_read on public.tasks for select to authenticated using(public.is_staff(tenant_id) or (client_visible and public.can_read_client(tenant_id,client_id)));
create policy tasks_insert on public.tasks for insert to authenticated with check(public.is_staff(tenant_id));
create policy tasks_update on public.tasks for update to authenticated using(public.is_staff(tenant_id)) with check(public.is_staff(tenant_id));

create table public.social_posts (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 title text not null check(length(title) between 1 and 160),description text check(length(description)<=5000),
 status text not null default 'draft' check(status in ('draft','review','approved','published')),
 client_id uuid,client_visible boolean not null default false,due_date date,channel text not null default 'LinkedIn' check(channel in ('LinkedIn','Facebook','Instagram','Email','Other')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,id),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 check(not client_visible or client_id is not null)
);
alter table public.social_posts enable row level security;
create index social_posts_tenant_idx on public.social_posts(tenant_id,created_at desc);
create index social_posts_client_idx on public.social_posts(tenant_id,client_id);
create policy social_posts_read on public.social_posts for select to authenticated using(public.is_staff(tenant_id) or (client_visible and public.can_read_client(tenant_id,client_id)));
create policy social_posts_insert on public.social_posts for insert to authenticated with check(public.is_staff(tenant_id));
create policy social_posts_update on public.social_posts for update to authenticated using(public.is_staff(tenant_id)) with check(public.is_staff(tenant_id));

create table public.documents (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 title text not null check(length(title) between 1 and 160),description text check(length(description)<=5000),
 status text not null default 'shared' check(status in ('shared','internal')),
 client_id uuid,client_visible boolean not null default false,object_path text not null unique,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,id),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 check(not client_visible or client_id is not null)
);
alter table public.documents enable row level security;
create index documents_tenant_idx on public.documents(tenant_id,created_at desc);
create index documents_client_idx on public.documents(tenant_id,client_id);
create policy documents_read on public.documents for select to authenticated using(public.is_staff(tenant_id) or (client_visible and public.can_read_client(tenant_id,client_id)));
create policy documents_insert on public.documents for insert to authenticated with check(public.is_staff(tenant_id));
create policy documents_update on public.documents for update to authenticated using(public.is_staff(tenant_id)) with check(public.is_staff(tenant_id));

alter table public.tasks add constraint task_project_tenant foreign key(tenant_id,project_id) references public.projects(tenant_id,id);
alter table public.tasks add constraint task_assignee_tenant foreign key(tenant_id,assignee_id) references public.memberships(tenant_id,user_id);
alter table public.documents add constraint document_path_workspace check(split_part(object_path,'/',1)=tenant_id::text);
create policy document_cleanup on public.documents for delete to authenticated using(public.is_staff(tenant_id));
create table public.subscriptions (
 tenant_id uuid primary key references public.tenants(id), plan_code text not null default 'internal',
 status text not null default 'internal' check(status in ('internal','trialing','active','past_due','canceled')),
 billing_customer_id text unique,billing_subscription_id text unique,seat_limit integer not null default 20 check(seat_limit>0),current_period_end timestamptz
);
alter table public.subscriptions enable row level security;
create policy subscription_read on public.subscriptions for select to authenticated using(public.workspace_role_for(tenant_id) in ('owner','admin'));
create table public.audit_events (
 id bigint generated always as identity primary key,tenant_id uuid not null references public.tenants(id),actor_id uuid,
 entity text not null,record_id uuid,action text not null,created_at timestamptz not null default now()
);
alter table public.audit_events enable row level security;
create policy audit_read on public.audit_events for select to authenticated using(public.workspace_role_for(tenant_id) in ('owner','admin'));
create function public.record_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_events(tenant_id,actor_id,entity,record_id,action) values(coalesce(new.tenant_id,old.tenant_id),auth.uid(),tg_table_name,coalesce(new.id,old.id),tg_op);
 return coalesce(new,old);
end;$$;
create function public.touch_record() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end;$$;
revoke all on function public.record_audit(),public.touch_record() from public,anon,authenticated;
create trigger clients_audit after insert or update or delete on public.clients for each row execute function public.record_audit();
create trigger deals_audit after insert or update or delete on public.deals for each row execute function public.record_audit();
create trigger deals_touch before update on public.deals for each row execute function public.touch_record();
create trigger projects_audit after insert or update or delete on public.projects for each row execute function public.record_audit();
create trigger projects_touch before update on public.projects for each row execute function public.touch_record();
create trigger tasks_audit after insert or update or delete on public.tasks for each row execute function public.record_audit();
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_record();
create trigger social_posts_audit after insert or update or delete on public.social_posts for each row execute function public.record_audit();
create trigger social_posts_touch before update on public.social_posts for each row execute function public.touch_record();
create trigger documents_audit after insert or update or delete on public.documents for each row execute function public.record_audit();
create trigger documents_touch before update on public.documents for each row execute function public.touch_record();

grant select on public.tenants,public.memberships,public.subscriptions,public.audit_events to authenticated;
grant select,insert,update on public.clients,public.deals,public.projects,public.tasks,public.social_posts,public.documents to authenticated;
grant delete on public.documents to authenticated;
revoke all on public.tenants,public.memberships,public.clients,public.deals,public.projects,public.tasks,public.social_posts,public.documents,public.subscriptions,public.audit_events from anon;
-- Even if Supabase default grants are permissive, no write policies exist on administration tables.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('workspace-documents','workspace-documents',false,10485760,array['application/pdf','image/png','image/jpeg','text/plain']);
create policy document_object_read on storage.objects for select to authenticated using(
 bucket_id='workspace-documents' and exists(select 1 from public.documents d where d.object_path=name)
);
create policy document_object_insert on storage.objects for insert to authenticated with check(
 bucket_id='workspace-documents' and exists(select 1 from public.documents d where d.object_path=name and public.is_staff(d.tenant_id))
);
create policy document_object_delete on storage.objects for delete to authenticated using(
 bucket_id='workspace-documents' and exists(select 1 from public.documents d where d.object_path=name and public.is_staff(d.tenant_id))
);
commit;
