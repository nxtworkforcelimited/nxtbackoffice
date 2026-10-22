begin;
alter table public.clients add column if not exists logo_path text;
alter table public.clients drop constraint if exists clients_logo_path_check;
alter table public.clients add constraint clients_logo_path_check check(logo_path is null or length(logo_path) between 1 and 500);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('client-logos','client-logos',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=true,file_size_limit=2097152,allowed_mime_types=array['image/png','image/jpeg','image/webp'];

drop policy if exists client_logo_insert on storage.objects;
drop policy if exists client_logo_delete on storage.objects;
create policy client_logo_insert on storage.objects for insert to authenticated
with check(
 bucket_id='client-logos'
 and public.has_capability((storage.foldername(name))[1]::uuid,'crm')
);
create policy client_logo_delete on storage.objects for delete to authenticated
using(
 bucket_id='client-logos'
 and public.has_capability((storage.foldername(name))[1]::uuid,'crm')
);
commit;