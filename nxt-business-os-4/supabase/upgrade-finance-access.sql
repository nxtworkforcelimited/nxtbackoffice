-- Run once AFTER upgrade-team-operations.sql. No existing data is deleted.
begin;
alter table public.member_permissions drop constraint member_permissions_capability_check;
alter table public.member_permissions add constraint member_permissions_capability_check check(capability in ('crm','delivery','content','approve_content','documents','finance','payroll','sms','reports','website','hr','approve_leave','tickets','task_admin','finance_admin'));
-- Shared task work, with creation/assignment/archive restricted to task administrators.
alter policy tasks_read on public.tasks using(public.is_staff(tenant_id) or (client_visible and archived_at is null and public.can_read_client(tenant_id,client_id)));
alter policy projects_read on public.projects using(public.is_staff(tenant_id) or (client_visible and archived_at is null and public.can_read_client(tenant_id,client_id)));
alter policy tasks_insert on public.tasks with check(public.has_capability(tenant_id,'task_admin'));
alter policy tasks_update on public.tasks using(public.is_staff(tenant_id)) with check(public.is_staff(tenant_id));
drop policy own_task_update on public.tasks;
create or replace function public.guard_task_update() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if current_user in ('postgres','supabase_admin') then return new;end if;
 if tg_op='UPDATE' and not public.has_capability(old.tenant_id,'task_admin') then
 if not public.is_staff(old.tenant_id) or old.archived_at is not null or (to_jsonb(new)-'status'-'title'-'description'-'due_date'-'updated_at') is distinct from (to_jsonb(old)-'status'-'title'-'description'-'due_date'-'updated_at') then raise exception 'Task administrators manage assignment, sharing and archive';end if;
 end if;
 if new.assignee_id is not null and not exists(select 1 from public.staff_directory d where d.tenant_id=new.tenant_id and d.user_id=new.assignee_id) then raise exception 'Assign a provisioned staff member';end if;
 return new;end;$$;
alter policy task_delete on public.tasks using(public.has_capability(tenant_id,'task_admin') and archived_at is not null);
alter policy ticket_read on public.it_tickets using(public.is_staff(tenant_id));
alter policy ticket_comment_create on public.it_ticket_comments with check(author_id=auth.uid() and public.has_capability(tenant_id,'tickets') and exists(select 1 from public.it_tickets t where t.id=ticket_id and t.tenant_id=it_ticket_comments.tenant_id));
alter policy deals_read on public.deals using(public.is_staff(tenant_id));
create table public.finance_records(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),kind text not null check(kind in ('expense','purchase_order','subscription')),reference text not null default ('NXT-'||upper(substr(gen_random_uuid()::text,1,8))),title text not null check(length(trim(title)) between 1 and 160),vendor text not null default '',description text not null default '',order_lines jsonb not null default '[]',currency text not null check(currency in ('USD','ZWG','GBP','AUD')),amount numeric(14,2) not null check(amount>=0),due_date date,status text not null default 'draft',billing_cycle text not null default 'monthly' check(billing_cycle in ('weekly','monthly','quarterly','yearly','once')),last_paid date,created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,id),
 foreign key(tenant_id,created_by) references public.memberships(tenant_id,user_id),
 check((kind='expense' and status in ('draft','approved','paid','cancelled')) or (kind='purchase_order' and status in ('draft','issued','received','cancelled')) or (kind='subscription' and status in ('active','free_trial','cancelled'))));
alter table public.finance_records enable row level security;
create policy finance_records_read on public.finance_records for select to authenticated using(public.is_staff(tenant_id));
create policy finance_records_create on public.finance_records for insert to authenticated with check(public.has_capability(tenant_id,'finance') and created_by=auth.uid() and ((kind in ('expense','purchase_order') and status='draft') or kind='subscription'));
create policy finance_records_edit on public.finance_records for update to authenticated using(public.has_capability(tenant_id,'finance')) with check(public.has_capability(tenant_id,'finance'));
revoke all on public.finance_records from anon,authenticated;
grant select,insert,update on public.finance_records to authenticated;
create index finance_records_tenant_due on public.finance_records(tenant_id,kind,due_date);
create table public.accounting_journals(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),entry_date date not null,currency text not null check(currency in ('USD','ZWG','GBP','AUD')),description text not null check(length(trim(description)) between 1 and 300),lines jsonb not null,source_type text not null default 'manual',source_id uuid,created_by uuid default auth.uid(),created_at timestamptz not null default now(),unique(tenant_id,source_type,source_id));
alter table public.accounting_journals enable row level security;
create policy journals_read on public.accounting_journals for select to authenticated using(public.is_staff(tenant_id));
create policy journals_post on public.accounting_journals for insert to authenticated with check(public.has_capability(tenant_id,'finance_admin') and created_by=auth.uid() and source_type='manual' and source_id is null);
revoke all on public.accounting_journals from anon,authenticated;
grant select,insert on public.accounting_journals to authenticated;
-- A journal is an immutable balanced entry. Correct mistakes with an offsetting entry.
create function public.validate_journal() returns trigger language plpgsql security invoker set search_path='' as $$declare l jsonb;dr numeric:=0;cr numeric:=0;d numeric;c numeric;begin
 if jsonb_typeof(new.lines)<>'array' or jsonb_array_length(new.lines) not between 2 and 100 then raise exception 'Use 2–100 journal lines';end if;
 for l in select * from jsonb_array_elements(new.lines) loop
 if l->>'account' not in ('1000','1100','2000','2100','3000','4000','5000') or l->>'account' is null then raise exception 'Unknown ledger account';end if;
 d:=(l->>'debit')::numeric;c:=(l->>'credit')::numeric;
 if d is null or c is null or d<0 or c<0 or d>100000000 or c>100000000 or round(d,2)<>d or round(c,2)<>c or (d=0)=(c=0) then raise exception 'Each line needs exactly one positive debit or credit, to two decimal places';end if;
 dr:=dr+d;cr:=cr+c;
 end loop;
 if dr<>cr or dr=0 then raise exception 'Journal debits and credits must balance';end if;return new;
end;$$;
create trigger balanced_journal before insert on public.accounting_journals for each row execute function public.validate_journal();
create function public.guard_finance_record() returns trigger language plpgsql security invoker set search_path='' as $$declare l jsonb;total numeric:=0;qty numeric;unit numeric;begin
 if new.kind='purchase_order' then
 if jsonb_typeof(new.order_lines)<>'array' or jsonb_array_length(new.order_lines) not between 1 and 50 then raise exception 'Add 1–50 purchase order lines';end if;
 for l in select * from jsonb_array_elements(new.order_lines) loop
 qty:=(l->>'quantity')::numeric;unit:=(l->>'unit_price')::numeric;
 if length(trim(coalesce(l->>'description','')))=0 or qty is null or qty<=0 or qty>100000 or unit is null or unit<0 or unit>100000000 or round(unit,2)<>unit then raise exception 'Invalid purchase order line';end if;
 total:=total+round(qty*unit,2);end loop;new.amount:=total;
 end if;
 if new.kind='subscription' and new.status<>'cancelled' and new.due_date is null then raise exception 'Add renewal/trial end date';end if;
 if new.kind='expense' and new.amount<=0 then raise exception 'Expense amount must be positive';end if;
 if tg_op='UPDATE' then
 if new.tenant_id<>old.tenant_id or new.kind<>old.kind or new.id<>old.id or new.created_by<>old.created_by or new.reference<>old.reference then raise exception 'Record identity cannot change';end if;
 if new.kind in ('expense','purchase_order') then
 if old.status<>'draft' and (to_jsonb(new)-'status'-'updated_at') is distinct from (to_jsonb(old)-'status'-'updated_at') then raise exception 'Issued/approved financial records are locked';end if;
 if old.status<>new.status then
 if not public.has_capability(new.tenant_id,'finance_admin') then raise exception 'Financial administrator required';end if;
 if not ((new.kind='expense' and ((old.status='draft' and new.status in ('approved','cancelled')) or (old.status='approved' and new.status='paid'))) or (new.kind='purchase_order' and ((old.status='draft' and new.status in ('issued','cancelled')) or (old.status='issued' and new.status in ('received','cancelled'))))) then raise exception 'Invalid financial status transition';end if;
 end if;end if;
 end if;new.updated_at:=now();return new;
end;$$;
create trigger finance_record_guard before insert or update on public.finance_records for each row execute function public.guard_finance_record();
-- Internal trigger: caller cannot execute this function directly. Creates one journal per financial event.
create function public.post_finance_event() returns trigger language plpgsql security definer set search_path='' as $$declare d text;c text;amt numeric;sid uuid;label text;journal_lines jsonb;tax numeric;begin
 if tg_table_name='finance_records' then
 if new.kind<>'expense' or new.status=old.status then return new;end if;
 if new.status='approved' then d:='5000';c:='2000';label:='Expense approval';elsif new.status='paid' then d:='2000';c:='1000';label:='Expense payment';else return new;end if;
 amt:=new.amount;sid:=new.id;
 elsif tg_table_name='business_items' then
 if new.kind<>'invoice' or new.status<>'issued' or old.status<>'draft' then return new;end if;
 amt:=new.total;d:='1100';c:='4000';sid:=new.id;label:='Invoice issued';
 else
 amt:=new.amount;d:='1000';c:='1100';sid:=new.id;label:='Invoice payment';
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
end;$$;
revoke all on function public.post_finance_event() from public,anon,authenticated;
create trigger expense_ledger after update on public.finance_records for each row execute function public.post_finance_event();
create trigger invoice_ledger after update on public.business_items for each row execute function public.post_finance_event();
create trigger payment_ledger after insert on public.invoice_payments for each row execute function public.post_finance_event();
create trigger finance_audit after insert or update on public.finance_records for each row execute function public.record_audit();
create trigger journal_audit after insert on public.accounting_journals for each row execute function public.record_audit();
-- Amend the checked business action function to restrict financial issue/payment to financial admins.
do $$declare def text;begin
 select pg_get_functiondef('public.business_action(uuid,uuid,text,jsonb)'::regprocedure) into def;
 def:=replace(def,'if a=''issue''', 'if b.kind in (''quote'',''invoice'') and not public.has_capability(t,''finance_admin'') then raise exception ''Financial administrator required'';end if;'||chr(10)||' if a=''issue''');execute def;
end $$;
commit;
