-- Blog: posts written and managed in NXT Business OS, published through a public read-only feed and hosted pages.
-- Additive. Posts are archived, never deleted.
begin;

create table if not exists public.blog_posts(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 client_id uuid,
 title text not null check(length(btrim(title)) between 1 and 160),
 slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug)<=90),
 h1 text not null default '' check(length(h1)<=160),
 excerpt text not null default '' check(length(excerpt)<=400),
 body text not null default '' check(length(body)<=100000),
 focus_keyword text not null default '' check(length(focus_keyword)<=80),
 hero_path text check(hero_path is null or length(hero_path) between 1 and 500),
 hero_alt text not null default '' check(length(hero_alt)<=200),
 og_image_path text check(og_image_path is null or length(og_image_path) between 1 and 500),
 meta_title text not null default '' check(length(meta_title)<=120),
 meta_description text not null default '' check(length(meta_description)<=320),
 canonical_url text not null default '' check(canonical_url='' or canonical_url ~ '^https://[^\s]+$'),
 category text not null default '' check(length(category)<=60),
 tags text[] not null default '{}' check(coalesce(array_length(tags,1),0)<=15),
 author_name text not null default '' check(length(author_name)<=100),
 status text not null default 'draft' check(status in ('draft','review','published','archived')),
 publish_at timestamptz,
 published_at timestamptz,
 created_by uuid,
 updated_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id)
);
-- One address per site (NXT's own blog, or one client's blog)
create unique index if not exists blog_posts_site_slug_key on public.blog_posts(tenant_id,coalesce(client_id,'00000000-0000-0000-0000-000000000000'::uuid),slug);
create index if not exists blog_posts_list_idx on public.blog_posts(tenant_id,status,updated_at desc);

alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from anon,authenticated;
grant select,insert,update on public.blog_posts to authenticated;
drop policy if exists blog_read on public.blog_posts;
create policy blog_read on public.blog_posts for select to authenticated using(public.has_capability(tenant_id,'content'));
drop policy if exists blog_create on public.blog_posts;
create policy blog_create on public.blog_posts for insert to authenticated with check(public.has_capability(tenant_id,'content') and created_by=(select auth.uid()));
drop policy if exists blog_update on public.blog_posts;
create policy blog_update on public.blog_posts for update to authenticated using(public.has_capability(tenant_id,'content')) with check(public.has_capability(tenant_id,'content'));

-- Writers can draft and send for review. Only people who can approve content publish, unpublish or reschedule a live post.
create schema if not exists nxt_private;
create or replace function nxt_private.guard_blog_post() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.tenant_id<>old.tenant_id or new.id<>old.id) then raise exception 'Post identity cannot change';end if;
 if new.status='published' and (tg_op='INSERT' or old.status<>'published') and not public.has_capability(new.tenant_id,'approve_content') then
  raise exception 'Publishing needs approval permission';
 end if;
 if tg_op='UPDATE' and old.status='published' and new.status<>'published' and not public.has_capability(new.tenant_id,'approve_content') then
  raise exception 'Unpublishing needs approval permission';
 end if;
 if tg_op='UPDATE' and old.status='published' and new.status='published' and not public.has_capability(new.tenant_id,'approve_content')
    and (new.slug<>old.slug or new.title<>old.title or new.body<>old.body or new.meta_description<>old.meta_description or new.meta_title<>old.meta_title or new.h1<>old.h1 or new.publish_at is distinct from old.publish_at or new.canonical_url<>old.canonical_url) then
  raise exception 'Editing a live post needs approval permission';
 end if;
 if new.status='published' and new.published_at is null then new.published_at:=now();end if;
 if tg_op='UPDATE' and old.published_at is not null and new.published_at is distinct from old.published_at then new.published_at:=old.published_at;end if;
 new.updated_at:=now();new.updated_by:=auth.uid();
 return new;
end;$$;
revoke all on function nxt_private.guard_blog_post() from public,anon,authenticated;
drop trigger if exists blog_post_guard on public.blog_posts;
create trigger blog_post_guard before insert or update on public.blog_posts for each row execute function nxt_private.guard_blog_post();

-- Public images for posts. Anyone can view; only content staff of that workspace can upload (folder = workspace id).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('blog-images','blog-images',true,5242880,array['image/png','image/jpeg','image/webp','image/gif'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/png','image/jpeg','image/webp','image/gif'];
drop policy if exists blog_image_insert on storage.objects;
create policy blog_image_insert on storage.objects for insert to authenticated
with check(bucket_id='blog-images' and public.has_capability((storage.foldername(name))[1]::uuid,'content'));

commit;
