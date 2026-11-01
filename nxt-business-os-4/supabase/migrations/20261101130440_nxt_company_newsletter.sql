create table nxt_newsletter.company_subscribers (
  email text primary key check (email = lower(btrim(email)) and length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  joined_at timestamptz not null default now(),
  consent_notice text not null default 'nxt-workforce-newsletter-v1'
);
alter table nxt_newsletter.company_subscribers enable row level security;
revoke all on nxt_newsletter.company_subscribers from public, anon, authenticated;
grant insert (email) on nxt_newsletter.company_subscribers to anon, authenticated;
grant select on nxt_newsletter.company_subscribers to authenticated;
create policy newsletter_signup on nxt_newsletter.company_subscribers
  for insert to anon, authenticated with check (true);
create policy nxt_admins_read_newsletter on nxt_newsletter.company_subscribers
  for select to authenticated using (exists (
    select 1 from public.memberships m join public.tenants t on t.id=m.tenant_id
    where m.user_id=(select auth.uid()) and t.slug='nxt-workforce' and m.role::text in ('owner','admin')
  ));

create function public.nxt_company_newsletter_subscribe(p_email text, p_consent boolean)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_consent is not true then
    raise exception 'Newsletter consent required' using errcode='22023';
  end if;
  insert into nxt_newsletter.company_subscribers(email)
    values (lower(btrim(p_email))) on conflict do nothing;
end;
$$;
revoke all on function public.nxt_company_newsletter_subscribe(text, boolean) from public, anon, authenticated;
grant execute on function public.nxt_company_newsletter_subscribe(text, boolean) to anon, authenticated;

create function public.nxt_company_newsletter_list(p_offset integer default 0)
returns table(email text, joined_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select s.email, s.joined_at from nxt_newsletter.company_subscribers s
  order by s.joined_at desc, s.email limit 100 offset greatest(p_offset,0)
$$;
revoke all on function public.nxt_company_newsletter_list(integer) from public, anon, authenticated;
grant execute on function public.nxt_company_newsletter_list(integer) to authenticated;
