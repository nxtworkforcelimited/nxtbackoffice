begin;
create schema if not exists nxt_domains;
revoke all on schema nxt_domains from public, anon;
grant usage on schema nxt_domains to authenticated, service_role;
create table public.nxt_domain_prices (
 extension text primary key check(extension in ('co.zw','com','co.uk','co.com','co.za','net','org')),
 registration_cents integer check(registration_cents>0),
 renewal_cents integer check(renewal_cents>0),
 currency text not null default 'USD' check(currency='USD'),
 enabled boolean not null default false,
 updated_at timestamptz not null default now(),
 check(not enabled or (registration_cents is not null and renewal_cents is not null))
);
insert into public.nxt_domain_prices(extension) values ('co.zw'),('com'),('co.uk'),('co.com'),('co.za'),('net'),('org');
alter table public.nxt_domain_prices enable row level security;
revoke all on public.nxt_domain_prices from public, anon, authenticated;
grant select on public.nxt_domain_prices to anon, authenticated;
grant all on public.nxt_domain_prices to service_role;
create policy public_prices on public.nxt_domain_prices for select to anon,authenticated using(true);
create table public.nxt_domain_orders (
 id uuid primary key,
 customer_id uuid not null references auth.users(id),
 customer_email text not null,
 details jsonb not null,
 items jsonb not null,
 total_cents integer not null check(total_cents>0),
 currency text not null check(currency='USD'),
 payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid','refunded')),
 fulfilment_status text not null default 'pending' check(fulfilment_status in ('pending','processing','registered','cancelled','needs_attention')),
 payment_reference text,
 paid_at timestamptz,
 registered_at timestamptz,
 created_at timestamptz not null default now()
);
create index nxt_domain_orders_customer_date on public.nxt_domain_orders(customer_id,created_at desc);
alter table public.nxt_domain_orders enable row level security;
revoke all on public.nxt_domain_orders from public,anon,authenticated;
grant select on public.nxt_domain_orders to authenticated;
grant all on public.nxt_domain_orders to service_role;
create policy customer_orders on public.nxt_domain_orders for select to authenticated using(customer_id=(select auth.uid()));
create policy nxt_staff_orders on public.nxt_domain_orders for select to authenticated using(exists(select 1 from public.memberships m join public.tenants t on t.id=m.tenant_id where m.user_id=(select auth.uid()) and t.slug='nxt-workforce' and m.role::text in ('owner','admin')));

create function nxt_domains.place_order(p_id uuid,p_domains jsonb,p_details jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); verified_email text; d text; ext text; price public.nxt_domain_prices; items jsonb:='[]'; total integer:=0; existing public.nxt_domain_orders; result public.nxt_domain_orders; k text;
begin
 select email into verified_email from auth.users where id=uid and email_confirmed_at is not null;
 if uid is null or verified_email is null then raise exception 'Sign in with a verified email';end if;
 if p_id is null or jsonb_typeof(p_domains)<>'array' or jsonb_array_length(p_domains) not between 1 and 5 or jsonb_typeof(p_details)<>'object' or octet_length(p_details::text)>12000 or coalesce(p_details->>'consent','')<>'true' or coalesce(p_details->>'termsVersion','')<>'domain-checkout-v1' then raise exception 'Invalid order';end if;
 if (select count(*) from jsonb_array_elements_text(p_domains))<>(select count(distinct x) from jsonb_array_elements_text(p_domains) x) then raise exception 'Duplicate domains';end if;
 for k in select unnest(array['name','organisation','physical','postal','city','country','phone','email']) loop
  if coalesce(length(btrim(p_details->'owner'->>k)),0) not between 1 and 254 or coalesce(length(btrim(p_details->'billing'->>k)),0) not between 1 and 254 then raise exception 'Incomplete contact';end if;
 end loop;
 if coalesce(length(btrim(p_details->>'description')),0) not between 1 and 200 or coalesce(length(btrim(p_details->>'usage')),0) not between 1 and 200 or coalesce(length(btrim(p_details->>'notices')),0) not between 1 and 200 then raise exception 'Incomplete business details';end if;
 -- A retry can return only the same customer's identical original order.
 select * into existing from public.nxt_domain_orders where id=p_id;
 if found then
  if existing.customer_id<>uid or existing.details<>p_details or (select jsonb_agg(x->>'domain' order by x->>'domain') from jsonb_array_elements(existing.items) x)<>(select jsonb_agg(x order by x) from jsonb_array_elements_text(p_domains) x) then raise exception 'Order already exists with different details';end if;
  return to_jsonb(existing);
 end if;
 if (select count(*) from public.nxt_domain_orders where customer_id=uid and created_at>now()-interval '1 hour')>=5 then raise exception 'Too many recent orders';end if;
 for d in select jsonb_array_elements_text(p_domains) loop
  if d!~'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.](co[.]zw|com|co[.]uk|co[.]com|co[.]za|net|org)$' then raise exception 'Invalid domain';end if;
  ext:=substring(d from position('.' in d)+1);
  select * into price from public.nxt_domain_prices where extension=ext and enabled;
  if not found then raise exception 'Prices are not published for this extension';end if;
  total:=total+price.registration_cents;
  items:=items||jsonb_build_array(jsonb_build_object('domain',d,'registration_cents',price.registration_cents,'renewal_cents',price.renewal_cents,'years',1));
 end loop;
 insert into public.nxt_domain_orders(id,customer_id,customer_email,details,items,total_cents,currency) values(p_id,uid,verified_email,p_details,items,total,'USD') returning * into result;
 return to_jsonb(result);
end;$$;
revoke all on function nxt_domains.place_order(uuid,jsonb,jsonb) from public,anon;
grant execute on function nxt_domains.place_order(uuid,jsonb,jsonb) to authenticated;
create function public.nxt_domain_place_order(p_id uuid,p_domains jsonb,p_details jsonb) returns jsonb language sql security invoker set search_path='' as $$ select nxt_domains.place_order(p_id,p_domains,p_details) $$;
revoke all on function public.nxt_domain_place_order(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.nxt_domain_place_order(uuid,jsonb,jsonb) to authenticated;

create table public.nxt_domain_payments (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references public.nxt_domain_orders(id),
 customer_id uuid not null references auth.users(id),
 reference uuid not null unique default gen_random_uuid(),
 msisdn text not null check(msisdn~'^2637[0-9]{8}$'),
 amount_cents integer not null check(amount_cents>0),
 currency text not null check(currency='USD'),
 state text not null default 'created' check(state in ('created','auth_pending','otp_sent','processing','paid','needs_attention')),
 payment_reference text unique,
 otp_reference text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.nxt_domain_payments enable row level security;
revoke all on public.nxt_domain_payments from public,anon,authenticated;
grant all on public.nxt_domain_payments to service_role;
-- Invoker function is service-role only. Atomic, idempotent reconciliation of a provider-confirmed payment.
create function public.nxt_domain_confirm_payment(p_order uuid,p_user uuid,p_reference uuid,p_payment_reference text,p_amount_cents integer,p_currency text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.nxt_domain_orders;s public.nxt_domain_payments;
begin
 select * into o from public.nxt_domain_orders where id=p_order and customer_id=p_user for update;
 if not found then raise exception 'Order is unavailable';end if;
 select * into s from public.nxt_domain_payments where order_id=o.id and customer_id=p_user and reference=p_reference for update;
 if not found or s.amount_cents<>p_amount_cents or s.currency<>p_currency or o.total_cents<>p_amount_cents or o.currency<>p_currency or coalesce(length(p_payment_reference),0) not between 1 and 200 then raise exception 'Payment mismatch';end if;
 if o.payment_status='paid' then
  if o.payment_reference<>p_payment_reference then raise exception 'Payment mismatch';end if;
  return to_jsonb(o);
 end if;
 if o.payment_status<>'unpaid' then raise exception 'Payment requires review';end if;
 update public.nxt_domain_payments set state='paid',payment_reference=p_payment_reference,updated_at=now() where id=s.id;
 update public.nxt_domain_orders set payment_status='paid',payment_reference=p_payment_reference,paid_at=now() where id=o.id returning * into o;
 return to_jsonb(o);
end;$$;
revoke all on function public.nxt_domain_confirm_payment(uuid,uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.nxt_domain_confirm_payment(uuid,uuid,uuid,text,integer,text) to service_role;
commit;
