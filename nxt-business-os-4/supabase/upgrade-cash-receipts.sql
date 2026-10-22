-- Keep existing receipts unclassified; new manual receipts explicitly select bank or cash.
alter table public.invoice_payments add column payment_method text check(payment_method in ('bank','cash'));
insert into public.accounting_accounts(tenant_id,code,name,account_group) select id,'1030','Cash on hand','asset' from public.tenants on conflict do nothing;
CREATE OR REPLACE FUNCTION nxt_private.business_action_base(t uuid, r uuid, a text, v jsonb DEFAULT '{}'::jsonb)
 RETURNS business_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  b public.business_items;
  result public.business_items;
  cap text;
  amt numeric;
  pd date;
begin
  select * into b
  from public.business_items
  where tenant_id = t and id = r
  for update;

  if not found then
    raise exception 'Record unavailable';
  end if;

  cap := case
    when b.kind in ('quote', 'invoice') then 'finance'
    when b.kind = 'payroll' then 'payroll'
    when b.kind = 'sms' then 'sms'
    else 'delivery'
  end;

  if not public.has_capability(t, cap) then
    raise exception 'Permission denied';
  end if;

  if a = 'issue'
    and b.kind in ('quote', 'invoice')
    and b.status = 'draft'
  then
    update public.business_items
    set status = 'issued'
    where id = r
    returning * into result;

  elsif a = 'convert' and b.kind = 'quote' then
    select * into result
    from public.business_items
    where parent_id = r and kind = 'invoice';

    if found then
      return result;
    end if;

    insert into public.business_items (
      tenant_id, kind, title, client_id, currency,
      payload, total, due_date, parent_id
    )
    values (
      t, 'invoice', b.title, b.client_id, b.currency,
      b.payload, b.total, b.due_date, r
    )
    returning * into result;

  elsif a = 'payment'
    and b.kind = 'invoice'
    and b.status = 'issued'
  then
    amt := round((v->>'amount')::numeric, 2);

    if amt is null or amt <= 0 or b.paid + amt > b.total then
      raise exception 'Invalid payment amount';
    end if;

    insert into public.invoice_payments (
      tenant_id, invoice_id, amount, reference, payment_method
    )
    values (t, r, amt, v->>'reference', coalesce(v->>'payment_method','bank'));

    update public.business_items
    set
      paid = paid + amt,
      status = case
        when paid + amt = total then 'paid'
        else 'issued'
      end
    where id = r
    returning * into result;

  elsif a = 'close' and b.kind = 'request' then
    update public.business_items
    set status = 'closed'
    where id = r
    returning * into result;

  elsif a = 'finalise'
    and b.kind = 'payroll'
    and b.status = 'draft'
  then
    update public.business_items
    set status = 'finalised'
    where id = r
    returning * into result;

  elsif a = 'recur'
    and b.kind = 'invoice'
    and b.payload->>'recurrence' = 'monthly'
    and b.status in ('issued', 'paid')
    and b.parent_id is null
  then
    pd := (v->>'period')::date;

    if pd is null
      or b.due_date is null
      or date_trunc('month', pd)
        <= date_trunc('month', b.due_date)
      or pd > current_date
    then
      raise exception
        'Choose a due recurrence period after the original invoice';
    end if;

    pd := date_trunc('month', pd)::date;

    insert into public.business_items (
      tenant_id, kind, title, client_id, currency,
      payload, total, due_date, parent_id, period
    )
    values (
      t, 'invoice', b.title, b.client_id, b.currency,
      b.payload || '{"recurrence":"none"}',
      b.total, pd, r, pd
    )
    on conflict (parent_id, period) do nothing
    returning * into result;

    if result.id is null then
      select * into result
      from public.business_items
      where parent_id = r and period = pd;
    end if;

  else
    raise exception 'Action unavailable';
  end if;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.post_finance_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare d text;c text;amt numeric;sid uuid;label text;journal_lines jsonb;tax numeric;begin
 if tg_table_name='finance_records' then
 if new.kind<>'expense' or new.status=old.status then return new;end if;
 if new.status='approved' then d:='5000';c:='2000';label:='Expense approval';elsif new.status='paid' then d:='2000';c:='1000';label:='Expense payment';else return new;end if;
 amt:=new.amount;sid:=new.id;
 elsif tg_table_name='business_items' then
 if new.kind<>'invoice' or new.status<>'issued' or old.status<>'draft' then return new;end if;
 amt:=new.total;d:='1100';c:='4000';sid:=new.id;label:='Invoice issued';
 else
 amt:=new.amount;d:=case when new.payment_method='cash' then '1030' else '1000' end;c:='1100';sid:=new.id;label:='Invoice payment';
 end if;
 if amt>0 then
 journal_lines:=jsonb_build_array(jsonb_build_object('account',d,'debit',amt,'credit',0),jsonb_build_object('account',c,'debit',0,'credit',amt));
 if tg_table_name='business_items' then
 tax:=coalesce((new.payload->>'tax')::numeric,0);
 if tax>0 then journal_lines:=jsonb_build_array(jsonb_build_object('account',d,'debit',amt,'credit',0),jsonb_build_object('account','4000','debit',0,'credit',amt-tax),jsonb_build_object('account','2100','debit',0,'credit',tax));end if;
 end if;
 if tg_table_name='invoice_payments' then
 insert into public.accounting_journals(tenant_id,entry_date,currency,description,lines,source_type,source_id) select new.tenant_id,current_date,b.currency,label||' '||b.reference,jsonb_build_array(jsonb_build_object('account',d,'debit',amt,'credit',0),jsonb_build_object('account',c,'debit',0,'credit',amt)),label,sid from public.business_items b where b.id=new.invoice_id and b.tenant_id=new.tenant_id;
 else
 insert into public.accounting_journals(tenant_id,entry_date,currency,description,lines,source_type,source_id) values(new.tenant_id,current_date,new.currency,label||' '||new.reference,journal_lines,label,sid);
 end if;end if;return new;
end;$function$;

