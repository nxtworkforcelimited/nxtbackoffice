begin;
drop policy if exists business_read on public.business_items;
create policy business_read on public.business_items for select to authenticated using(
 public.has_capability(tenant_id,
  case
   when kind in ('quote','invoice') then 'finance'
   when kind='payroll' then 'payroll'
   when kind='sms' then 'sms'
   else 'delivery'
  end
 )
 or (kind='request' and public.can_read_client(tenant_id,client_id))
 or (kind='invoice' and status in ('issued','paid') and public.can_read_client(tenant_id,client_id))
 or (kind='quote' and status in ('issued','accepted') and public.can_read_client(tenant_id,client_id))
);
commit;
