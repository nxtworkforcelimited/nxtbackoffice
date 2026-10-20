begin;
-- Individually assigned capabilities. Owners retain recovery access.
create table public.member_permissions(
 tenant_id uuid not null,user_id uuid not null,capability text not null check(capability in ('crm','delivery','content','approve_content','documents','finance','payroll','sms','reports','website')),
 primary key(tenant_id,user_id,capability),foreign key(tenant_id,user_id) references public.memberships(tenant_id,user_id) on delete cascade
);
alter table public.member_permissions enable row level security;
create function public.has_capability(t uuid,c text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.workspace_role_for(t)='owner',false) or
 (public.is_staff(t) and exists(select 1 from public.member_permissions where tenant_id=t and user_id=auth.uid() and capability=c));
$$;
revoke all on function public.has_capability(uuid,text) from public,anon;
grant execute on function public.has_capability(uuid,text) to authenticated;
create policy permission_read on public.member_permissions for select to authenticated using(user_id=auth.uid() or public.workspace_role_for(tenant_id)='owner');
create policy permission_manage on public.member_permissions for all to authenticated using(public.workspace_role_for(tenant_id)='owner') with check(public.workspace_role_for(tenant_id)='owner');
grant select,insert,delete on public.member_permissions to authenticated;
-- Preserve existing operational access; finance/payroll/approval remain owner-only until granted.
insert into public.member_permissions select m.tenant_id,m.user_id,c from public.memberships m cross join unnest(array['crm','delivery','content','documents','reports']) c where m.role in ('admin','staff');
-- Replace broad staff policies with scoped capabilities.
drop policy client_read on public.clients;drop policy client_insert on public.clients;drop policy client_update on public.clients;
create policy client_read on public.clients for select to authenticated using(public.has_capability(tenant_id,'crm') or public.has_capability(tenant_id,'delivery') or public.has_capability(tenant_id,'content') or public.has_capability(tenant_id,'documents') or public.has_capability(tenant_id,'finance') or public.can_read_client(tenant_id,id));
create policy client_insert on public.clients for insert to authenticated with check(public.has_capability(tenant_id,'crm'));
create policy client_update on public.clients for update to authenticated using(public.has_capability(tenant_id,'crm')) with check(public.has_capability(tenant_id,'crm'));
do $$declare tbl text;cap text;begin
 foreach tbl in array array['deals','projects','tasks','social_posts','documents'] loop
 cap:=case when tbl='deals' then 'crm' when tbl in ('projects','tasks') then 'delivery' when tbl='social_posts' then 'content' else 'documents' end;
 execute format('drop policy %I on public.%I',tbl||'_read',tbl);
 execute format('drop policy %I on public.%I',tbl||'_insert',tbl);
 execute format('drop policy %I on public.%I',tbl||'_update',tbl);
 execute format('create policy %I on public.%I for select to authenticated using(public.has_capability(tenant_id,%L) %s)',tbl||'_read',tbl,cap,case when tbl='deals' then '' else 'or (client_visible and public.can_read_client(tenant_id,client_id))' end);
 execute format('create policy %I on public.%I for insert to authenticated with check(public.has_capability(tenant_id,%L))',tbl||'_insert',tbl,cap);
 execute format('create policy %I on public.%I for update to authenticated using(public.has_capability(tenant_id,%L)) with check(public.has_capability(tenant_id,%L))',tbl||'_update',tbl,cap,cap);
 end loop;
end;$$;
-- Client uploads are always attached to their own company.
alter table public.documents add column uploaded_by uuid default auth.uid();
create policy client_document_insert on public.documents for insert to authenticated with check(public.can_read_client(tenant_id,client_id) and client_visible and status='shared' and uploaded_by=auth.uid());
drop policy document_cleanup on public.documents;
create policy document_cleanup on public.documents for delete to authenticated using(public.has_capability(tenant_id,'documents') or (uploaded_by=auth.uid() and public.can_read_client(tenant_id,client_id)));
drop policy document_object_insert on storage.objects;drop policy document_object_delete on storage.objects;
create policy document_object_insert on storage.objects for insert to authenticated with check(bucket_id='workspace-documents' and exists(select 1 from public.documents d where d.object_path=name and (public.has_capability(d.tenant_id,'documents') or d.uploaded_by=auth.uid())));
create policy document_object_delete on storage.objects for delete to authenticated using(bucket_id='workspace-documents' and exists(select 1 from public.documents d where d.object_path=name and (public.has_capability(d.tenant_id,'documents') or d.uploaded_by=auth.uid())));
-- Two-step approval. Existing approved records must be re-approved.
alter table public.social_posts drop constraint social_posts_status_check;
update public.social_posts set status=case when status='review' then 'manager_review' when status='approved' then 'manager_review' else status end;
alter table public.social_posts add constraint social_posts_status_check check(status in ('draft','manager_review','client_review','approved','changes_requested','published'));
alter table public.social_posts drop constraint social_posts_channel_check;
alter table public.social_posts add constraint social_posts_channel_check check(channel in ('LinkedIn','Facebook','Instagram','TikTok','YouTube','Email','Other'));
alter table public.social_posts add column manager_approved_by uuid,add column client_approved_by uuid;
create function public.guard_social() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.client_visible:=false;
  if new.status<>'draft' or new.manager_approved_by is not null or new.client_approved_by is not null then raise exception 'New content must start as a draft';end if;
 elsif current_user='authenticated' then
  -- Direct updates may edit drafts; state transitions go through the approved RPC only.
  if new.status<>old.status or new.manager_approved_by is distinct from old.manager_approved_by or new.client_approved_by is distinct from old.client_approved_by then raise exception 'Use the approval workflow';end if;
  if old.status not in ('draft','changes_requested') then raise exception 'Approved/submitted content is locked. Return it to draft first.';end if;
  new.manager_approved_by:=null;new.client_approved_by:=null;new.client_visible:=false;
 end if;
 return new;
end;$$;
create trigger social_guard before insert or update on public.social_posts for each row execute function public.guard_social();
create function public.review_content(t uuid,r uuid,a text) returns public.social_posts language plpgsql security definer set search_path='' as $$
declare p public.social_posts;begin
 select * into p from public.social_posts where tenant_id=t and id=r for update;
 if not found then raise exception 'Content unavailable';end if;
 if a='submit' and public.has_capability(t,'content') and p.status in ('draft','changes_requested') then
  p.status:='manager_review';p.client_visible:=false;p.manager_approved_by:=null;p.client_approved_by:=null;
 elsif a='approve' and p.status='manager_review' and public.has_capability(t,'approve_content') then
  p.manager_approved_by:=auth.uid();p.status:=case when p.client_id is null then 'approved' else 'client_review' end;p.client_visible:=p.client_id is not null;
 elsif a='approve' and p.status='client_review' and p.client_visible and public.can_read_client(t,p.client_id) then
  p.client_approved_by:=auth.uid();p.status:='approved';
 elsif a='reject' and ((p.status='manager_review' and public.has_capability(t,'approve_content')) or (p.status='client_review' and p.client_visible and public.can_read_client(t,p.client_id))) then
  p.status:='changes_requested';p.manager_approved_by:=null;p.client_approved_by:=null;
 elsif a='revise' and public.has_capability(t,'content') then
  p.status:='draft';p.manager_approved_by:=null;p.client_approved_by:=null;p.client_visible:=false;
 else raise exception 'This approval action is not permitted';end if;
 update public.social_posts set status=p.status,client_visible=p.client_visible,manager_approved_by=p.manager_approved_by,client_approved_by=p.client_approved_by where id=r returning * into p;
 return p;
end;$$;
revoke all on function public.review_content(uuid,uuid,text) from public,anon;grant execute on function public.review_content(uuid,uuid,text) to authenticated;
-- Shared client discussion, protected by access to the linked post.
create table public.content_comments(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,post_id uuid not null,author_id uuid not null default auth.uid(),body text not null check(length(body) between 1 and 4000),created_at timestamptz not null default now(),foreign key(tenant_id,post_id) references public.social_posts(tenant_id,id) on delete cascade);
alter table public.content_comments enable row level security;
create policy comment_read on public.content_comments for select to authenticated using(exists(select 1 from public.social_posts p where p.tenant_id=content_comments.tenant_id and p.id=post_id));
create policy comment_insert on public.content_comments for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from public.social_posts p where p.tenant_id=content_comments.tenant_id and p.id=post_id));
grant select,insert on public.content_comments to authenticated;
-- Business documents. Writes use narrowly scoped RPCs, never arbitrary browser JSON updates.
create table public.business_items(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),kind text not null check(kind in ('quote','invoice','payroll','request','sms')),
 title text not null check(length(title) between 1 and 160),client_id uuid, status text not null default 'draft',currency text not null default 'USD' check(currency in ('USD','ZWG','GBP','AUD')),
 payload jsonb not null default '{}',total numeric(14,2) not null default 0 check(total>=0),paid numeric(14,2) not null default 0 check(paid>=0 and paid<=total),due_date date,
 reference text not null default ('NXT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),created_by uuid default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 parent_id uuid references public.business_items(id),period date,unique(tenant_id,id),unique(parent_id,period),foreign key(tenant_id,client_id) references public.clients(tenant_id,id)
);
alter table public.business_items enable row level security;
create policy business_read on public.business_items for select to authenticated using(
 public.has_capability(tenant_id,case when kind in ('quote','invoice') then 'finance' when kind='payroll' then 'payroll' when kind='sms' then 'sms' else 'delivery' end)
 or (kind='request' and public.can_read_client(tenant_id,client_id))
 or (kind in ('quote','invoice') and status in ('issued','paid','accepted') and public.can_read_client(tenant_id,client_id))
);
grant select on public.business_items to authenticated;
revoke insert,update,delete on public.business_items from authenticated,anon;
create table public.invoice_payments(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,invoice_id uuid not null,amount numeric(14,2) not null check(amount>0),reference text not null check(length(reference) between 1 and 160),created_at timestamptz not null default now(),foreign key(tenant_id,invoice_id) references public.business_items(tenant_id,id),unique(invoice_id,reference));
alter table public.invoice_payments enable row level security;
create policy payment_read on public.invoice_payments for select to authenticated using(exists(select 1 from public.business_items b where b.id=invoice_id and b.tenant_id=invoice_payments.tenant_id));
grant select on public.invoice_payments to authenticated;
create table public.payroll_rules(tenant_id uuid primary key references public.tenants(id),rules jsonb not null,updated_at timestamptz not null default now());
alter table public.payroll_rules enable row level security;
create policy payroll_rules_read on public.payroll_rules for select to authenticated using(public.has_capability(tenant_id,'payroll'));
create policy payroll_rules_write on public.payroll_rules for all to authenticated using(public.workspace_role_for(tenant_id)='owner') with check(public.workspace_role_for(tenant_id)='owner');
grant select,insert,update on public.payroll_rules to authenticated;
create function public.create_business_item(t uuid,k text,v jsonb) returns public.business_items language plpgsql security definer set search_path='' as $$
declare b public.business_items; cap text;ci uuid;d jsonb:=coalesce(v->'payload','{}');line jsonb;s numeric:=0;qty numeric;price numeric;tax numeric;rule jsonb;br jsonb;gross numeric;taxable numeric;paye numeric:=0;nssa numeric;levy numeric;other numeric;net numeric;cur text:=coalesce(v->>'currency','USD');dt date:=(nullif(v->>'due_date',''))::date;
begin
 cap:=case when k in ('quote','invoice') then 'finance' when k='payroll' then 'payroll' when k='sms' then 'sms' when k='request' then 'delivery' else null end;
 if cap is null then raise exception 'Unknown app';end if;
 ci:=(nullif(v->>'client_id',''))::uuid;
 if k='request' and public.workspace_role_for(t)='client' then
  select client_id into ci from public.memberships where tenant_id=t and user_id=auth.uid();
 elsif not public.has_capability(t,cap) then raise exception 'Permission denied';end if;
 if k in ('quote','invoice') then
  if ci is null then raise exception 'Choose a client';end if;
  if jsonb_typeof(d->'lines') is distinct from 'array' or jsonb_array_length(d->'lines') not between 1 and 50 then raise exception 'Add 1 to 50 line items';end if;
  for line in select * from jsonb_array_elements(d->'lines') loop
   qty:=(line->>'quantity')::numeric;price:=(line->>'unit_price')::numeric;
   if qty is null or price is null or qty<=0 or qty>100000 or price<0 or price>10000000 or length(coalesce(line->>'description','')) not between 1 and 300 then raise exception 'Invalid invoice line';end if;
   s:=s+round(qty*price,2);
  end loop;
  tax:=coalesce((d->>'tax_rate')::numeric,0);if tax<0 or tax>100 then raise exception 'Invalid tax rate';end if;
  d:=d||jsonb_build_object('subtotal',s,'tax',round(s*tax/100,2));s:=s+round(s*tax/100,2);
  if coalesce(d->>'recurrence','none') not in ('none','monthly') then raise exception 'Invalid recurrence';end if;
 elsif k='payroll' then
  if cur not in ('USD','ZWG') then raise exception 'Zimbabwe payroll supports USD or ZiG per calculation';end if;
  select rules->cur into rule from public.payroll_rules where tenant_id=t;
  if rule is null or coalesce((rule->>'verified')::boolean,false)=false or dt is null or nullif(rule->>'valid_from','') is null or nullif(rule->>'valid_to','') is null or dt<(rule->>'valid_from')::date or dt>(rule->>'valid_to')::date then raise exception 'Finance must configure verified rules for this currency and pay period';end if;
  gross:=coalesce((d->>'base')::numeric,0)+coalesce((d->>'allowances')::numeric,0)+coalesce((d->>'overtime')::numeric,0);
  other:=coalesce((d->>'other_deductions')::numeric,0);
  if coalesce((d->>'allowable_deductions')::numeric,0)<0 or coalesce((d->>'tax_credit')::numeric,0)<0 or gross<0 or other<0 or coalesce((d->>'base')::numeric,0)<0 or coalesce((d->>'allowances')::numeric,0)<0 or coalesce((d->>'overtime')::numeric,0)<0 then raise exception 'Negative payroll input';end if;
  nssa:=round(least(gross,(rule->>'nssa_ceiling')::numeric)*(rule->>'nssa_rate')::numeric/100,2);
  taxable:=greatest(0,gross-coalesce((d->>'allowable_deductions')::numeric,0));
  select x into br from jsonb_array_elements(rule->'bands') x where taxable>=(x->>'from')::numeric order by (x->>'from')::numeric desc limit 1;
  if br is null then raise exception 'No tax band';end if;
  paye:=round(greatest(0,taxable*(br->>'rate')::numeric/100-(br->>'deduct')::numeric-coalesce((d->>'tax_credit')::numeric,0)),2);
  levy:=round(paye*(rule->>'aids_rate')::numeric/100,2);net:=round(gross-paye-levy-nssa-other,2);
  if net<0 or nssa is null or levy is null then raise exception 'Invalid payroll configuration or negative net pay';end if;
  d:=d||jsonb_build_object('gross',gross,'taxable',taxable,'paye',paye,'nssa',nssa,'aids_levy',levy,'net',net,'rules_snapshot',rule);s:=net;
 elsif k='sms' then
  if length(coalesce(d->>'message','')) not between 1 and 1600 then raise exception 'SMS message required';end if;
 end if;
 insert into public.business_items(tenant_id,kind,title,client_id,currency,payload,total,due_date,status) values(t,k,v->>'title',ci,cur,d,s,dt,case when k='request' then 'open' else 'draft' end) returning * into b;
 return b;
end;$$;
create function public.business_action(t uuid,r uuid,a text,v jsonb default '{}') returns public.business_items language plpgsql security definer set search_path='' as $$
declare b public.business_items;result public.business_items;cap text;amt numeric;pd date;begin
 select * into b from public.business_items where tenant_id=t and id=r for update;
 if not found then raise exception 'Record unavailable';end if;
 cap:=case when b.kind in ('quote','invoice') then 'finance' when b.kind='payroll' then 'payroll' when b.kind='sms' then 'sms' else 'delivery' end;
 if not public.has_capability(t,cap) then raise exception 'Permission denied';end if;
 if a='issue' and b.kind in ('quote','invoice') and b.status='draft' then
  update public.business_items set status='issued' where id=r returning * into result;
 elsif a='convert' and b.kind='quote' then
  select * into result from public.business_items where parent_id=r and kind='invoice';
  if found then return result;end if;
  insert into public.business_items(tenant_id,kind,title,client_id,currency,payload,total,due_date,parent_id) values(t,'invoice',b.title,b.client_id,b.currency,b.payload,b.total,b.due_date,r) returning * into result;
 elsif a='payment' and b.kind='invoice' and b.status='issued' then
  amt:=round((v->>'amount')::numeric,2);if amt is null or amt<=0 or b.paid+amt>b.total then raise exception 'Invalid payment amount';end if;
  insert into public.invoice_payments(tenant_id,invoice_id,amount,reference) values(t,r,amt,v->>'reference');
  update public.business_items set paid=paid+amt,status=case when paid+amt=total then 'paid' else 'issued' end where id=r returning * into result;
 elsif a='close' and b.kind='request' then update public.business_items set status='closed' where id=r returning * into result;
 elsif a='finalise' and b.kind='payroll' and b.status='draft' then update public.business_items set status='finalised' where id=r returning * into result;
 elsif a='recur' and b.kind='invoice' and b.payload->>'recurrence'='monthly' and b.status in ('issued','paid') and b.parent_id is null then
  pd:=(v->>'period')::date;
  if pd is null or b.due_date is null or date_trunc('month',pd)<=date_trunc('month',b.due_date) or pd>current_date then raise exception 'Choose a due recurrence period after the original invoice';end if;
  pd:=date_trunc('month',pd)::date;
  insert into public.business_items(tenant_id,kind,title,client_id,currency,payload,total,due_date,parent_id,period) values(t,'invoice',b.title,b.client_id,b.currency,b.payload||'{"recurrence":"none"}',b.total,pd,r,pd) on conflict(parent_id,period) do nothing returning * into result;
  if result.id is null then select * into result from public.business_items where parent_id=r and period=pd;end if;
 else raise exception 'Action unavailable';end if;
 return result;
end;$$;
revoke all on function public.create_business_item(uuid,text,jsonb),public.business_action(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.create_business_item(uuid,text,jsonb),public.business_action(uuid,uuid,text,jsonb) to authenticated;
create trigger business_audit after insert or update or delete on public.business_items for each row execute function public.record_audit();
create trigger business_touch before update on public.business_items for each row execute function public.touch_record();
-- Enable approvers to see content without needing edit permission.
create policy approver_read on public.social_posts for select to authenticated using(public.has_capability(tenant_id,'approve_content'));
commit;
