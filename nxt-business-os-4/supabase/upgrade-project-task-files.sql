begin;
create table public.work_files(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 task_id uuid,project_id uuid,document_id uuid,object_path text,
 name text not null check(length(name) between 1 and 200),mime text,
 bytes bigint check(bytes between 1 and 52428800),
 client_visible boolean not null default false,uploaded_by uuid not null default auth.uid(),created_at timestamptz not null default now(),
 check(num_nonnulls(task_id,project_id)=1),check(num_nonnulls(document_id,object_path)=1),
 check(document_id is not null or (mime is not null and bytes is not null)),
 check(mime in ('application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','video/mp4','video/webm')),
 foreign key(tenant_id,task_id) references public.tasks(tenant_id,id) on delete cascade,
 foreign key(tenant_id,project_id) references public.projects(tenant_id,id) on delete cascade,
 foreign key(tenant_id,document_id) references public.documents(tenant_id,id)
);
alter table public.work_files enable row level security;
create policy work_files_read on public.work_files for select to authenticated using(
 public.is_staff(tenant_id) or (client_visible and (
 exists(select 1 from public.tasks t where t.tenant_id=work_files.tenant_id and t.id=task_id and t.archived_at is null and t.client_visible and public.can_read_client(t.tenant_id,t.client_id) and (document_id is null or exists(select 1 from public.documents d where d.tenant_id=t.tenant_id and d.id=document_id and d.client_visible and d.client_id=t.client_id)))
 or exists(select 1 from public.projects p where p.tenant_id=work_files.tenant_id and p.id=project_id and p.archived_at is null and p.client_visible and public.can_read_client(p.tenant_id,p.client_id) and (document_id is null or exists(select 1 from public.documents d where d.tenant_id=p.tenant_id and d.id=document_id and d.client_visible and d.client_id=p.client_id)))
 )));
create policy work_files_insert on public.work_files for insert to authenticated with check(public.is_staff(tenant_id) and uploaded_by=auth.uid());
create policy work_files_update on public.work_files for update to authenticated using(public.is_staff(tenant_id) and (uploaded_by=auth.uid() or public.has_capability(tenant_id,'delivery'))) with check(public.is_staff(tenant_id) and (uploaded_by=auth.uid() or public.has_capability(tenant_id,'delivery')));
create policy work_files_delete on public.work_files for delete to authenticated using(public.is_staff(tenant_id) and (uploaded_by=auth.uid() or public.has_capability(tenant_id,'delivery')));
grant select,insert,update,delete on public.work_files to authenticated;
revoke all on public.work_files from anon;
create function public.guard_work_file() returns trigger language plpgsql security invoker set search_path='' as $$
declare parent_client uuid;d public.documents;begin
 if tg_op='UPDATE' and (to_jsonb(new)-'client_visible') is distinct from (to_jsonb(old)-'client_visible') then raise exception 'Only file sharing can be changed; remove and reattach to replace a file';end if;
 if tg_op='INSERT' and new.uploaded_by is distinct from auth.uid() then raise exception 'Invalid uploader';end if;
 if new.task_id is not null then select t.client_id into parent_client from public.tasks t where t.id=new.task_id and t.tenant_id=new.tenant_id and t.archived_at is null;
 else select p.client_id into parent_client from public.projects p where p.id=new.project_id and p.tenant_id=new.tenant_id and p.archived_at is null;end if;
 if not found then raise exception 'Choose an active task or project in this workspace';end if;
 if new.client_visible and parent_client is null then raise exception 'Choose a client on the task/project before sharing files';end if;
 if new.document_id is not null then
 select * into d from public.documents where id=new.document_id and tenant_id=new.tenant_id;
 if not found or d.object_path is null then raise exception 'Source document is unavailable';end if;
 if d.client_id is not null and d.client_id is distinct from parent_client then raise exception 'Source document belongs to another client';end if;
 if new.client_visible and (not d.client_visible or d.client_id is distinct from parent_client) then raise exception 'Share the source document with the same client first, or upload a client-safe copy';end if;
 if tg_op='INSERT' then new.name:=d.title;end if;
 elsif new.object_path is distinct from new.tenant_id::text||'/'||new.id::text then raise exception 'Invalid file path';end if;
 return new;
end;$$;
revoke all on function public.guard_work_file() from public,anon,authenticated;
create trigger work_file_guard before insert or update on public.work_files for each row execute function public.guard_work_file();
create trigger work_file_audit after insert or update or delete on public.work_files for each row execute function public.record_audit();
create index work_files_tasks on public.work_files(tenant_id,task_id);
create index work_files_projects on public.work_files(tenant_id,project_id);
create index work_files_documents on public.work_files(tenant_id,document_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('project-task-files','project-task-files',false,52428800,array['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','video/mp4','video/webm']);
create policy project_task_object_read on storage.objects for select to authenticated using(bucket_id='project-task-files' and exists(select 1 from public.work_files f where f.object_path=storage.objects.name));
create policy project_task_object_insert on storage.objects for insert to authenticated with check(bucket_id='project-task-files' and exists(select 1 from public.work_files f where f.object_path=storage.objects.name and f.uploaded_by=auth.uid() and public.is_staff(f.tenant_id)));
-- Documents is the reusable master library. Add office formats and raise the upload limit to 50 MB.
update storage.buckets set file_size_limit=52428800,allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','video/mp4','video/webm'] where id='workspace-documents';
commit;
