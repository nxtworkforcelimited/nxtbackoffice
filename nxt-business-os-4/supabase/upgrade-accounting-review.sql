-- Accounting review workflow. Screenshot imports are drafts, never opening balances.
create table public.accounting_accounts(tenant_id uuid not null references public.tenants(id),code text not null,name text not null,account_group text not null check(account_group in ('asset','liability','equity','income','expense')),primary key(tenant_id,code));
create table public.accounting_reviewers(tenant_id uuid not null references public.tenants(id),user_id uuid not null references auth.users(id),can_post boolean not null default false,primary key(tenant_id,user_id));
create table public.accounting_drafts(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),entry_date date not null,description text not null check(length(trim(description)) between 1 and 300),reference text not null default '',amount numeric(16,2) check(amount>0),lines jsonb not null default '[]',status text not null default 'draft' check(status in ('draft','approved','posted')),source text not null default 'manual',approved_by uuid references auth.users(id),posted_journal_id uuid references public.accounting_journals(id),created_by uuid default auth.uid(),created_at timestamptz not null default now(),unique(tenant_id,source,reference));
alter table public.accounting_accounts enable row level security;
alter table public.accounting_reviewers enable row level security;
alter table public.accounting_drafts enable row level security;
revoke all on public.accounting_accounts,public.accounting_reviewers,public.accounting_drafts from anon,authenticated;
grant select on public.accounting_accounts,public.accounting_reviewers,public.accounting_drafts to authenticated;
grant insert,update on public.accounting_drafts to authenticated;
create policy accounts_read on public.accounting_accounts for select to authenticated using(public.has_capability(tenant_id,'finance'));
create policy reviewers_read on public.accounting_reviewers for select to authenticated using(public.has_capability(tenant_id,'finance'));
create policy drafts_read on public.accounting_drafts for select to authenticated using(public.has_capability(tenant_id,'finance'));
create policy drafts_create on public.accounting_drafts for insert to authenticated with check(public.has_capability(tenant_id,'finance_admin') and created_by=auth.uid() and status='draft' and approved_by is null and posted_journal_id is null and source='manual');
create policy drafts_edit on public.accounting_drafts for update to authenticated using(public.has_capability(tenant_id,'finance_admin') and status='draft') with check(public.has_capability(tenant_id,'finance_admin') and status='draft' and approved_by is null and posted_journal_id is null);
create trigger accounting_draft_audit after insert or update on public.accounting_drafts for each row execute function public.record_audit();
insert into public.accounting_accounts(tenant_id,code,name,account_group) select t.id,a.* from public.tenants t cross join (values ('1000','Cash / Bank','asset'),('1010','Petty cash','asset'),('1020','Mobile money','asset'),('1100','Accounts receivable','asset'),('1200','Employee loans receivable','asset'),('1300','Prepayments','asset'),('1310','Rental deposits','asset'),('1400','Computer equipment','asset'),('1410','Furniture and fittings','asset'),('1420','Phones and office equipment','asset'),('1490','Accumulated depreciation','asset'),('1500','Input VAT recoverable','asset'),('2000','Accounts payable','liability'),('2100','Tax payable','liability'),('2110','Output VAT','liability'),('2120','Corporate income tax payable','liability'),('2200','Salaries payable','liability'),('2210','Employee reimbursements payable','liability'),('2300','Customer deposits / deferred revenue','liability'),('2400','Interest-free company loans payable','liability'),('2500','Accrued expenses','liability'),('3000','Equity / opening balance','equity'),('3100','Retained earnings','equity'),('4000','Sales revenue','income'),('4010','Digital solutions revenue','income'),('4020','Customer support revenue','income'),('4030','Marketing services revenue','income'),('4040','Back-office services revenue','income'),('4090','Sales returns and allowances','income'),('5000','Operating expenses','expense'),('5010','Salaries and wages','expense'),('5020','Rent','expense'),('5030','Internet and telephone','expense'),('5040','Software and hosting','expense'),('5050','Advertising and marketing','expense'),('5060','Transport and travel','expense'),('5070','Professional fees','expense'),('5080','Bank and payment charges','expense'),('5090','Office supplies','expense'),('5100','Depreciation expense','expense'),('5110','Repairs and maintenance','expense'),('5200','Corporate income tax expense','expense')) a(code,name,account_group);
-- Resolve reviewer identities from verified work emails, scoped to NXT membership.
create or replace function public.validate_journal() returns trigger language plpgsql security invoker set search_path='' as $$declare l jsonb;dr numeric:=0;cr numeric:=0;d numeric;c numeric;begin
 if jsonb_typeof(new.lines)<>'array' or jsonb_array_length(new.lines) not between 2 and 100 then raise exception 'Use 2–100 journal lines';end if;
 for l in select * from jsonb_array_elements(new.lines) loop
 if not exists(select 1 from public.accounting_accounts a where a.tenant_id=new.tenant_id and a.code=l->>'account') then raise exception 'Unknown ledger account';end if;
 d:=(l->>'debit')::numeric;c:=(l->>'credit')::numeric;
 if d is null or c is null or d<0 or c<0 or d>100000000 or c>100000000 or round(d,2)<>d or round(c,2)<>c or (d=0)=(c=0) then raise exception 'Each line needs exactly one positive debit or credit, to two decimal places';end if;
 dr:=dr+d;cr:=cr+c;end loop;
 if dr<>cr or dr=0 then raise exception 'Journal debits and credits must balance';end if;return new;end;$$;
-- Privileged transactional RPC is needed to advance approvals and insert immutable journals.
-- It authorizes using the protected reviewer table, never user-editable metadata.
create function public.accounting_review(p_tenant uuid,p_id uuid,p_action text) returns public.accounting_drafts language plpgsql security definer set search_path='' as $$declare d public.accounting_drafts; jid uuid;begin
 if auth.uid() is null or not public.has_capability(p_tenant,'finance_admin') then raise exception 'Finance access required';end if;
 if not exists(select 1 from public.accounting_reviewers r where r.tenant_id=p_tenant and r.user_id=auth.uid() and (p_action='approve' or (p_action='post' and r.can_post))) then raise exception 'Only the configured accountant or approver may perform this action';end if;
 select * into d from public.accounting_drafts where tenant_id=p_tenant and id=p_id for update;
 if not found then raise exception 'Draft not found';end if;
 if p_action='approve' and d.status='draft' then
 -- Validate using the exact posting trigger in a rollback-only subtransaction.
 begin
 insert into public.accounting_journals(tenant_id,entry_date,currency,description,lines,source_type,source_id) values(p_tenant,d.entry_date,'USD',d.description,d.lines,'review_validation',d.id);
 raise exception using errcode='ZX001',message='validation_only';
 exception when sqlstate 'ZX001' then null;end;
 update public.accounting_drafts set status='approved',approved_by=auth.uid() where id=d.id returning * into d;
 elsif p_action='post' and d.status='approved' then
 insert into public.accounting_journals(tenant_id,entry_date,currency,description,lines,source_type,source_id,created_by) values(p_tenant,d.entry_date,'USD',d.description,d.lines,'reviewed',d.id,auth.uid()) returning id into jid;
 update public.accounting_drafts set status='posted',posted_journal_id=jid where id=d.id returning * into d;
 else raise exception 'Invalid workflow transition';end if;return d;end;$$;
revoke all on function public.accounting_review(uuid,uuid,text) from public,anon;
grant execute on function public.accounting_review(uuid,uuid,text) to authenticated;

-- Prevent the legacy immediate manual-post path; automated source events are unaffected.
drop policy journals_post on public.accounting_journals;
create policy accounting_audit_read on public.audit_events for select to authenticated using(public.has_capability(tenant_id,'finance') and entity in ('accounting_drafts','accounting_journals'));
