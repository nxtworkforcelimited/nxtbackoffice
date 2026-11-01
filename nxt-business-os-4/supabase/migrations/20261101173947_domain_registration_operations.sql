begin;
-- Depends on 20261101164010_domain_customer_checkout.sql, already deployed.
alter table public.nxt_domain_orders add column fulfilment_version integer not null default 0;

create function nxt_domains.is_admin() returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.memberships m join public.tenants t on t.id=m.tenant_id
 where m.user_id=(select auth.uid()) and t.slug='nxt-workforce' and m.role::text in ('owner','admin'));
$$;
revoke all on function nxt_domains.is_admin() from public,anon;
grant execute on function nxt_domains.is_admin() to authenticated;

create table public.nxt_domain_events (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.nxt_domain_orders(id),
 actor_id uuid not null references auth.users(id),
 actor_label text not null,
 from_status text not null,
 to_status text not null,
 note text not null default '' check(length(note)<=2000),
 registration_reference text not null default '' check(length(registration_reference)<=120),
 created_at timestamptz not null default now()
);
create index nxt_domain_events_order_date on public.nxt_domain_events(order_id,created_at desc);
create index nxt_domain_events_actor on public.nxt_domain_events(actor_id);
create index nxt_domain_orders_queue_date on public.nxt_domain_orders(created_at desc,id);
alter table public.nxt_domain_events enable row level security;
revoke all on public.nxt_domain_events from public,anon,authenticated;
grant select on public.nxt_domain_events to authenticated;
grant all on public.nxt_domain_events to service_role;
create policy nxt_domain_events_admin on public.nxt_domain_events for select to authenticated using((select nxt_domains.is_admin()));

create function public.nxt_domain_admin_queue(p_query text default '',p_status text default '',p_payment text default '',p_page integer default 0)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare rows jsonb;total integer;counts jsonb;unpaid integer;
begin
 if not nxt_domains.is_admin() then raise exception 'NXT administrator access required' using errcode='42501';end if;
 if p_query is null or length(p_query)>100 or p_page is null or p_page not between 0 and 10000 or p_status is null or p_status not in ('','pending','processing','registered','needs_attention','cancelled') or p_payment is null or p_payment not in ('','unpaid','paid','refunded') then raise exception 'Invalid filters' using errcode='22023';end if;
 select coalesce(jsonb_object_agg(s,n),'{}') into counts from (select fulfilment_status s,count(*) n from public.nxt_domain_orders group by fulfilment_status) c;
 select count(*) into unpaid from public.nxt_domain_orders where payment_status='unpaid' and fulfilment_status<>'cancelled';
 with matched as (
 select o.* from public.nxt_domain_orders o where (p_status='' or o.fulfilment_status=p_status) and (p_payment='' or o.payment_status=p_payment)
 and (p_query='' or strpos(lower(o.customer_email||' '||coalesce(o.details->'owner'->>'name','')||' '||coalesce(o.details->'owner'->>'organisation','')||' '||o.items::text),lower(p_query))>0)
 ), page as (select * from matched order by created_at desc,id limit 50 offset p_page*50)
 select (select count(*) from matched),coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id) from page),'[]') into total,rows;
 return jsonb_build_object('orders',rows,'total',total,'counts',counts,'unpaid',unpaid);
end;$$;
revoke all on function public.nxt_domain_admin_queue(text,text,text,integer) from public,anon;
grant execute on function public.nxt_domain_admin_queue(text,text,text,integer) to authenticated;

-- Only this narrowly scoped operation may update registration status. Payment
-- fields and customer details are never writable through the staff endpoint.
create function nxt_domains.update_registration(p_order uuid,p_version integer,p_status text,p_note text,p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.nxt_domain_orders;prior text;who text;
begin
 if auth.uid() is null or not nxt_domains.is_admin() then raise exception 'NXT administrator access required' using errcode='42501';end if;
 if p_version is null or p_status is null or p_status not in ('pending','processing','needs_attention','registered','cancelled') or p_note is null or length(p_note)>2000 or p_reference is null or length(p_reference)>120 then raise exception 'Invalid update' using errcode='22023';end if;
 select * into o from public.nxt_domain_orders where id=p_order for update;
 if not found then raise exception 'Order not found' using errcode='P0002';end if;
 if o.fulfilment_version<>p_version then raise exception 'This order changed. Refresh and try again.' using errcode='40001';end if;
 prior:=o.fulfilment_status;
 if prior<>p_status then
  if not ((prior='pending' and p_status in ('processing','needs_attention','cancelled')) or (prior='processing' and p_status in ('registered','needs_attention','cancelled')) or (prior='needs_attention' and p_status in ('processing','cancelled')) or (prior='registered' and p_status='needs_attention')) then raise exception 'Invalid status transition' using errcode='22023';end if;
  if p_status in ('processing','registered') and o.payment_status<>'paid' then raise exception 'Confirm payment before processing this registration.' using errcode='22023';end if;
  if p_status='registered' and length(btrim(p_reference))=0 then raise exception 'Enter the registrar confirmation reference.' using errcode='22023';end if;
  if p_status in ('needs_attention','cancelled') and length(btrim(p_note))=0 then raise exception 'Add a reason for this status.' using errcode='22023';end if;
 elsif length(btrim(p_note))=0 and length(btrim(p_reference))=0 then raise exception 'Add a note or change the status.' using errcode='22023';
 end if;
 select email into who from auth.users where id=auth.uid();
 update public.nxt_domain_orders set fulfilment_status=p_status,fulfilment_version=fulfilment_version+1,
 registered_at=case when p_status='registered' then coalesce(registered_at,now()) else registered_at end where id=o.id returning * into o;
 insert into public.nxt_domain_events(order_id,actor_id,actor_label,from_status,to_status,note,registration_reference)
 values(o.id,auth.uid(),coalesce(who,'NXT administrator'),prior,p_status,btrim(p_note),btrim(p_reference));
 return to_jsonb(o);
end;$$;
revoke all on function nxt_domains.update_registration(uuid,integer,text,text,text) from public,anon;
grant execute on function nxt_domains.update_registration(uuid,integer,text,text,text) to authenticated;
create function public.nxt_domain_update_registration(p_order uuid,p_version integer,p_status text,p_note text,p_reference text)
returns jsonb language sql security invoker set search_path='' as $$ select nxt_domains.update_registration(p_order,p_version,p_status,p_note,p_reference) $$;
revoke all on function public.nxt_domain_update_registration(uuid,integer,text,text,text) from public,anon;
grant execute on function public.nxt_domain_update_registration(uuid,integer,text,text,text) to authenticated;
commit;
