-- Future invoices are proper issued client documents, with explicit payment terms.
-- Existing historical draft invoices are left unchanged for review.
begin;

alter function public.create_business_item(uuid,text,jsonb) rename to create_business_item_v4;
alter function public.create_business_item_v4(uuid,text,jsonb) set schema nxt_private;
revoke all on function nxt_private.create_business_item_v4(uuid,text,jsonb) from public,anon,authenticated;

create or replace function nxt_private.deliver_invoice(t uuid,b public.business_items)
returns public.business_items language plpgsql security definer set search_path='' as $$
declare terms text:=coalesce(b.payload->>'payment_terms','full_payment'); recipient text; result public.business_items;
begin
 if b.kind<>'invoice' then return b;end if;
 if terms not in ('50_before_50_after','70_before_30_after','full_payment') then raise exception 'Choose valid invoice payment terms';end if;
 update public.business_items
 set status='issued',
     payload=payload||jsonb_build_object(
       'payment_terms',terms,
       'issued_at',coalesce(payload->'issued_at',to_jsonb(now()))
     )
 where id=b.id
 returning * into result;

 if not (result.payload ? 'delivery_notified_at') then
  select email into recipient from public.clients where tenant_id=t and id=result.client_id;
  if recipient is not null and position('@' in recipient)>1 then
   insert into public.notification_outbox(tenant_id,recipient,subject,body)
   values(
    t,recipient,
    'Invoice '||result.reference||' from NXT Workforce',
    'A new invoice is available in your NXT client portal. Reference: '||result.reference||
    '. Amount: '||result.currency||' '||to_char(result.total,'FM999999999990.00')||
    case when result.due_date is not null then '. Due: '||result.due_date::text else '' end||
    '. Sign in to your client portal to view the invoice.'
   );
   update public.business_items set payload=payload||jsonb_build_object('delivery_notified_at',now()) where id=result.id returning * into result;
  end if;
 end if;
 return result;
end;$$;
revoke all on function nxt_private.deliver_invoice(uuid,public.business_items) from public,anon,authenticated;

create function public.create_business_item(t uuid,k text,v jsonb)
returns public.business_items language plpgsql security definer set search_path='' as $$
declare b public.business_items; terms text;
begin
 if k='invoice' then
  terms:=coalesce(v->'payload'->>'payment_terms','full_payment');
  if terms not in ('50_before_50_after','70_before_30_after','full_payment') then raise exception 'Choose valid invoice payment terms';end if;
 end if;
 b:=nxt_private.create_business_item_v4(t,k,v);
 if k='invoice' then b:=nxt_private.deliver_invoice(t,b);end if;
 return b;
end;$$;
revoke all on function public.create_business_item(uuid,text,jsonb) from public,anon;
grant execute on function public.create_business_item(uuid,text,jsonb) to authenticated;

alter function public.business_action(uuid,uuid,text,jsonb) rename to business_action_v5;
alter function public.business_action_v5(uuid,uuid,text,jsonb) set schema nxt_private;
revoke all on function nxt_private.business_action_v5(uuid,uuid,text,jsonb) from public,anon,authenticated;

create function public.business_action(t uuid,r uuid,a text,v jsonb default '{}')
returns public.business_items language plpgsql security definer set search_path='' as $$
declare result public.business_items;
begin
 result:=nxt_private.business_action_v5(t,r,a,v);
 if result.kind='invoice' and a in ('issue','convert','recur') then
  result:=nxt_private.deliver_invoice(t,result);
 end if;
 return result;
end;$$;
revoke all on function public.business_action(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.business_action(uuid,uuid,text,jsonb) to authenticated;

commit;
