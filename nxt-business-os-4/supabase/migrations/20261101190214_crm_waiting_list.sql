-- Waiting-list consent is separate from earlier CRM product updates and the company newsletter.
create table nxt_newsletter.crm_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (
    length(email) between 3 and 254 and email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    and email !~ '[[:cntrl:]]'
  ),
  joined_at timestamptz not null default now(),
  consent_notice text not null default 'nxt-crm-waitlist-launch-2027-v1'
);
create index crm_waitlist_joined_at_idx on nxt_newsletter.crm_waitlist(joined_at);
alter table nxt_newsletter.crm_waitlist enable row level security;
revoke all on nxt_newsletter.crm_waitlist from public, anon, authenticated;

create function public.nxt_crm_waitlist_join(p_email text, p_consent boolean)
returns void language plpgsql security definer set search_path='' as $$
declare
  normal_email text := lower(btrim(p_email));
  entry_id uuid;
  nxt_tenant uuid;
begin
  if p_consent is not true or normal_email is null or length(normal_email) not between 3 and 254
     or normal_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or normal_email ~ '[[:cntrl:]]' then
    raise exception 'A valid email and waiting-list consent are required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nxt-crm-public-waitlist', 0));
  if exists(select 1 from nxt_newsletter.crm_waitlist where email=normal_email) then
    return;
  end if;
  if (select count(*) from nxt_newsletter.crm_waitlist where joined_at > now()-interval '1 minute') >= 30 then
    raise exception 'Please try again in a minute' using errcode='P0001';
  end if;

  select id into strict nxt_tenant from public.tenants where slug='nxt-workforce';
  insert into nxt_newsletter.crm_waitlist(email) values(normal_email) returning id into entry_id;
  insert into public.notification_outbox(tenant_id,recipient,subject,body,source_type,source_id,event_key)
  values(nxt_tenant,'hello@nxt-workforce.com','NXT Business OS waiting list signup',
    'A visitor joined the NXT Business OS waiting list for the 1 January 2027 launch.'||chr(10)||'Email: '||normal_email,
    'crm_waitlist',entry_id,'crm-waitlist:'||entry_id::text);
end;
$$;
revoke all on function public.nxt_crm_waitlist_join(text, boolean) from public, anon, authenticated;
grant execute on function public.nxt_crm_waitlist_join(text, boolean) to anon, authenticated;
