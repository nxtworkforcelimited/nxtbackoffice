begin;
alter table public.sms_templates drop constraint sms_templates_event_check;
alter table public.sms_templates add constraint sms_templates_event_check check(event in ('welcome','invoice_sent','invoice_reminder','quote_sent','payment_received','project_update','project_completed','ticket_received','ticket_resolved') or event ~ '^custom_[a-f0-9-]{36}$');
alter table public.sms_templates drop constraint sms_templates_context_kind_check;
alter table public.sms_templates add constraint sms_templates_context_kind_check check(context_kind in ('general','invoice','quotation','payment','project','ticket'));
alter table public.sms_templates add column email_subject text not null default '',add column email_body text not null default '';
alter table public.sms_templates add constraint email_template_lengths check(length(email_subject)<=300 and length(email_body)<=10000);
alter table public.sms_templates drop constraint sms_templates_custom_manual;
alter table public.sms_templates add constraint sms_templates_custom_manual check(event in ('welcome','invoice_sent','project_update','project_completed','ticket_received','ticket_resolved') or not enabled);
insert into public.sms_templates(tenant_id,event,name,context_kind,body,enabled)
select s.tenant_id,d.event,d.name,d.kind,d.body,false from public.sms_settings s cross join (values
 ('invoice_reminder','Invoice payment reminder','invoice','Hi {name}, a reminder that {balance} remains on invoice {invoice_number}, due {due_date}. Please check your portal: {portal_link}'),
 ('quote_sent','Quotation sent','quotation','Hi {name}, quotation {quote_number} for {quote_total} is ready. Please review it in your portal: {portal_link}'),
 ('payment_received','Payment received','payment','Thank you, {name}! We received {payment_amount} for invoice {invoice_number}. Remaining balance: {balance}. Receipt: {portal_link}')
) d(event,name,kind,body) on conflict do nothing;
update public.sms_templates set email_subject=case event
 when 'invoice_sent' then 'NXT Workforce invoice {invoice_number}'
 when 'invoice_reminder' then 'Payment reminder: invoice {invoice_number}'
 when 'quote_sent' then 'Your NXT Workforce quotation {quote_number}'
 when 'payment_received' then 'Payment received for invoice {invoice_number}'
 else 'NXT Workforce - '||name end,
 email_body=case event
 when 'invoice_sent' then E'Hi {name},\n\nYour invoice {invoice_number} is available in your client portal.\n\nInvoice total: {invoice_total}\nOutstanding balance: {balance}\nDue date: {due_date}\n\nView your invoice: {portal_link}\n\nThank you for choosing NXT Workforce.'
 when 'invoice_reminder' then E'Hi {name},\n\nThis is a friendly reminder that invoice {invoice_number} has an outstanding balance of {balance}.\n\nDue date: {due_date}\n\nPlease view your invoice and payment details in your portal: {portal_link}\n\nIf you have already paid, please share your payment reference so we can reconcile it.\n\nThank you,\nNXT Workforce'
 when 'quote_sent' then E'Hi {name},\n\nThank you for the opportunity to assist you. Your quotation {quote_number}, totalling {quote_total}, is ready for review.\n\nView the quotation: {portal_link}\n\nPlease contact us with any questions or changes you would like to discuss.\n\nKind regards,\nNXT Workforce'
 when 'payment_received' then E'Hi {name},\n\nThank you for your payment. We have recorded the following:\n\nInvoice: {invoice_number}\nAmount received: {payment_amount}\nPayment reference: {payment_reference}\nPayment date: {payment_date}\nRemaining balance: {balance}\n\nView your updated invoice and receipt: {portal_link}\n\nThank you,\nNXT Workforce'
 else body end;
-- Finance staff may manage only billing templates; other client message access is unchanged.
drop policy sms_templates_read on public.sms_templates;
drop policy sms_templates_insert on public.sms_templates;
drop policy sms_templates_update on public.sms_templates;
create policy sms_templates_read on public.sms_templates for select to authenticated using(public.has_capability(tenant_id,'sms') or (context_kind in ('invoice','quotation','payment') and public.has_capability(tenant_id,'finance')));
create policy sms_templates_insert on public.sms_templates for insert to authenticated with check(public.has_capability(tenant_id,'sms') or (context_kind in ('invoice','quotation','payment') and public.has_capability(tenant_id,'finance')));
create policy sms_templates_update on public.sms_templates for update to authenticated using(public.has_capability(tenant_id,'sms') or (context_kind in ('invoice','quotation','payment') and public.has_capability(tenant_id,'finance'))) with check(public.has_capability(tenant_id,'sms') or (context_kind in ('invoice','quotation','payment') and public.has_capability(tenant_id,'finance')));
alter table public.sms_outbox drop constraint sms_outbox_source_type_check;
alter table public.sms_outbox add constraint sms_outbox_source_type_check check(source_type in ('task','project','social_post','manual_test','manual_template','manual_finance','welcome','invoice_sent','project_update','project_completed','ticket_received','ticket_resolved'));
create or replace function nxt_private.queue_template_sms(t uuid,c uuid,e text,s uuid,k text,vars jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare contact public.clients;template text;pair record;financial jsonb;
begin
 select * into contact from public.clients where tenant_id=t and id=c and archived_at is null;
 if not found or not coalesce(contact.approval_sms_enabled,false) or coalesce(contact.phone,'') !~ '^[+][1-9][0-9]{7,14}$' then return;end if;
 if not exists(select 1 from public.sms_settings where tenant_id=t and enabled) then return;end if;
 select body into template from public.sms_templates where tenant_id=t and event=e and enabled;
 if template is null then return;end if;
 if e='invoice_sent' then
  select jsonb_build_object('invoice_total',b.currency||' '||b.total::text,'balance',b.currency||' '||(b.total-b.paid)::text,'due_date',coalesce(b.due_date::text,'Not specified')) into financial from public.business_items b where b.tenant_id=t and b.id=s and b.client_id=c and b.kind='invoice';
  vars:=coalesce(financial,'{}'::jsonb)||vars;
 end if;
 template:=replace(replace(template,'{name}',left(contact.title,60)),'{portal_link}','https://os.nxt-workforce.com/login');
 for pair in select key,value from jsonb_each_text(vars) loop template:=replace(template,'{'||pair.key||'}',left(pair.value,80));end loop;
 insert into public.sms_outbox(tenant_id,client_id,source_type,source_id,approval_key,recipient,body) values(t,c,e,s,t::text||':'||e||':'||k,contact.phone,template) on conflict(approval_key) do nothing;
end;$$;
revoke all on function nxt_private.queue_template_sms(uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated;
commit;
