begin;
-- Attachments inherit the parent record's visibility. Uploads cannot modify submitted artwork.
create table public.work_attachments (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 post_id uuid,request_id uuid,name text not null check(length(name) between 1 and 200),
 mime text not null check(mime in ('image/jpeg','image/png','image/webp','video/mp4','video/webm','application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
 bytes bigint not null check(bytes between 1 and 52428800),object_path text not null unique,
 position integer not null default 0,uploaded_by uuid not null default auth.uid(),created_at timestamptz default now(),
 check(num_nonnulls(post_id,request_id)=1),
 foreign key(tenant_id,post_id) references public.social_posts(tenant_id,id) on delete cascade,
 foreign key(tenant_id,request_id) references public.business_items(tenant_id,id) on delete cascade
);
alter table public.work_attachments enable row level security;
create policy attachment_read on public.work_attachments for select to authenticated using(
 exists(select 1 from public.social_posts p where p.id=post_id and p.tenant_id=work_attachments.tenant_id)
 or exists(select 1 from public.business_items b where b.id=request_id and b.tenant_id=work_attachments.tenant_id and b.kind='request'));
create function public.guard_attachment() returns trigger language plpgsql security definer set search_path='' as $$
declare s text;begin
 if new.uploaded_by<>auth.uid() or new.object_path<>new.tenant_id::text||'/'||new.id::text then raise exception 'Invalid attachment identity';end if;
 if new.post_id is not null then
  select status into s from public.social_posts where id=new.post_id and tenant_id=new.tenant_id for update;
  if s is null or s not in ('draft','changes_requested') or not public.has_capability(new.tenant_id,'content') then raise exception 'Return content to draft before changing attachments';end if;
 else
  select status into s from public.business_items where id=new.request_id and tenant_id=new.tenant_id and kind='request' and (public.has_capability(new.tenant_id,'delivery') or public.can_read_client(new.tenant_id,client_id)) for update;
  if s is null or s<>'open' then raise exception 'Request is unavailable or closed';end if;
 end if;
 return new;
end;$$;
create trigger attachment_guard before insert on public.work_attachments for each row execute function public.guard_attachment();
create policy attachment_insert on public.work_attachments for insert to authenticated with check(uploaded_by=auth.uid());
grant select,insert on public.work_attachments to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('work-attachments','work-attachments',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
create policy work_object_read on storage.objects for select to authenticated using(bucket_id='work-attachments' and exists(select 1 from public.work_attachments a where a.object_path=storage.objects.name));
create policy work_object_insert on storage.objects for insert to authenticated with check(bucket_id='work-attachments' and exists(select 1 from public.work_attachments a where a.object_path=storage.objects.name and a.uploaded_by=auth.uid() and (
 exists(select 1 from public.social_posts p where p.id=a.post_id and p.status in ('draft','changes_requested') and public.has_capability(p.tenant_id,'content'))
 or exists(select 1 from public.business_items b where b.id=a.request_id and b.kind='request' and b.status='open'))));
-- Dedicated approvers can read the records they review.
create policy reviewer_posts on public.social_posts for select to authenticated using(public.has_capability(tenant_id,'approve_content'));
-- Durable email queue, never exposed to browser clients.
create table public.notification_outbox(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),recipient text not null,subject text not null,body text not null,created_at timestamptz not null default now(),sent_at timestamptz,attempts integer not null default 0,last_error text);
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon,authenticated;
create function public.queue_work_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient_row record; label text;begin
 if tg_table_name='social_posts' then
  if old.status=new.status then return new;end if;
  label:='Content: '||new.title||' - '||replace(new.status,'_',' ');
 else
  if new.kind<>'request' then return new;end if;
  if tg_op='UPDATE' and old.status=new.status then return new;end if;
  label:='Request: '||new.title||' - '||new.status;
 end if;
 -- Notify workspace owners (Nyasha after the account setup); no client mail is sent.
 for recipient_row in
 select distinct u.email from public.memberships m join auth.users u on u.id=m.user_id
 where m.tenant_id=new.tenant_id and u.email is not null and m.role='owner' 
 loop
 insert into public.notification_outbox(tenant_id,recipient,subject,body) values(new.tenant_id,recipient_row.email,label,'There is an update in your NXT workspace. Sign in to review it.');
 end loop;
 return new;
end;$$;
create trigger social_notice after update on public.social_posts for each row execute function public.queue_work_notice();
create trigger request_notice after insert or update on public.business_items for each row execute function public.queue_work_notice();
-- Delete only the attachment link; its private object becomes inaccessible and can be cleaned up later.
create function public.remove_work_attachment(t uuid,r uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.work_attachments;s text;begin
 select * into a from public.work_attachments where tenant_id=t and id=r;
 if not found then raise exception 'Attachment unavailable';end if;
 if a.post_id is not null then
 select status into s from public.social_posts where id=a.post_id and tenant_id=t for update;
 if s not in ('draft','changes_requested') or not public.has_capability(t,'content') then raise exception 'Return content to draft before changing attachments';end if;
 else
 select status into s from public.business_items where id=a.request_id and tenant_id=t and (public.has_capability(t,'delivery') or public.can_read_client(t,client_id)) for update;
 if s is null or s<>'open' then raise exception 'Request unavailable or closed';end if;
 end if;
 delete from public.work_attachments where id=r and tenant_id=t;
end;$$;
revoke all on function public.remove_work_attachment(uuid,uuid) from public,anon;
grant execute on function public.remove_work_attachment(uuid,uuid) to authenticated;
create function public.check_uploaded_artwork() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='manager_review' and old.status is distinct from new.status and exists(
 select 1 from public.work_attachments a where a.post_id=new.id and not exists(select 1 from storage.objects o where o.bucket_id='work-attachments' and o.name=a.object_path)) then
 raise exception 'An attachment is still uploading. Wait for it to finish, or remove the failed attachment before submitting.';end if;
 return new;
end;$$;
create trigger artwork_ready before update on public.social_posts for each row execute function public.check_uploaded_artwork();
grant select,update on public.notification_outbox to service_role;
commit;
