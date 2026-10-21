-- Published 2025 PAYE tables, user-authorised USD overtime, and auditable leave accounts.
-- No unverified tax-year extension, opening leave balance or employee start date is invented.
begin;
create table public.payroll_tax_tables(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),tax_year integer not null check(tax_year between 2020 and 2100),currency text not null default 'USD' check(currency='USD'),tables jsonb not null,source text not null,approved_by uuid,approved_at timestamptz,created_at timestamptz not null default now(),unique(tenant_id,tax_year,currency));
alter table public.payroll_tax_tables enable row level security;
create policy tax_table_read on public.payroll_tax_tables for select to authenticated using(public.has_capability(tenant_id,'payroll'));
revoke all on public.payroll_tax_tables from public,anon,authenticated;grant select on public.payroll_tax_tables to authenticated;
insert into public.payroll_tax_tables(tenant_id,tax_year,tables,source,approved_at)
select id,2025,'{"daily":[{"from":0,"rate":0,"deduct":0},{"from":3.30,"rate":20,"deduct":0.66},{"from":9.87,"rate":25,"deduct":1.15},{"from":32.89,"rate":30,"deduct":2.79},{"from":65.76,"rate":35,"deduct":6.08},{"from":98.64,"rate":40,"deduct":11.01}],"weekly":[{"from":0,"rate":0,"deduct":0},{"from":23.09,"rate":20,"deduct":4.62},{"from":69.24,"rate":25,"deduct":8.08},{"from":230.78,"rate":30,"deduct":19.62},{"from":461.55,"rate":35,"deduct":42.69},{"from":692.32,"rate":40,"deduct":77.31}],"fortnightly":[{"from":0,"rate":0,"deduct":0},{"from":46.16,"rate":20,"deduct":9.23},{"from":138.47,"rate":25,"deduct":16.15},{"from":461.55,"rate":30,"deduct":39.23},{"from":923.09,"rate":35,"deduct":85.38},{"from":1384.63,"rate":40,"deduct":154.62}],"monthly":[{"from":0,"rate":0,"deduct":0},{"from":100.01,"rate":20,"deduct":20},{"from":300.01,"rate":25,"deduct":35},{"from":1000.01,"rate":30,"deduct":85},{"from":2000.01,"rate":35,"deduct":185},{"from":3000.01,"rate":40,"deduct":335}],"annual":[{"from":0,"rate":0,"deduct":0},{"from":1200.01,"rate":20,"deduct":240},{"from":3600.01,"rate":25,"deduct":420},{"from":12000.01,"rate":30,"deduct":1020},{"from":24000.01,"rate":35,"deduct":2220},{"from":36000.01,"rate":40,"deduct":4020}]}'::jsonb,
'ZIMRA USD Jan-Dec 2025 Tax Tables (user supplied and matched to official publication): https://www.zimra.co.zw/domestic-taxes/tax-tables?download=4211:usd-jan-dec-2025-tax-tables',now() from public.tenants;
create function public.adopt_payroll_tax_year(t uuid,y integer,source_year integer,review_note text) returns void language plpgsql security definer set search_path='' as $$declare source_row public.payroll_tax_tables;begin
 if auth.uid() is null or not public.has_capability(t,'payroll_admin') then raise exception 'Payroll administrator required';end if;
 if y not between 2020 and 2100 or length(trim(review_note)) not between 20 and 1000 then raise exception 'Document the source and confirmation that these bands apply to the selected year';end if;
 select * into source_row from public.payroll_tax_tables where tenant_id=t and tax_year=source_year and currency='USD';if not found then raise exception 'Source table unavailable';end if;
 insert into public.payroll_tax_tables(tenant_id,tax_year,tables,source,approved_by,approved_at) values(t,y,source_row.tables,'Finance-approved application for '||y||'. Original table year '||source_year||'. '||review_note,auth.uid(),now()) on conflict(tenant_id,tax_year,currency) do update set tables=excluded.tables,source=excluded.source,approved_by=excluded.approved_by,approved_at=excluded.approved_at;
end;$$;
create trigger payroll_tax_table_audit after insert or update on public.payroll_tax_tables for each row execute function public.record_audit();

create table public.leave_accounts(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,employee_id uuid not null,opening_date date not null,opening_balance numeric(10,4) not null check(opening_balance>=0),accrual_start date not null,monthly_rate numeric(8,4) not null check(monthly_rate between 0 and 10),balance_cap numeric(10,4) not null check(balance_cap between 1 and 365),day_basis text not null check(day_basis in ('calendar','weekdays')),policy_note text not null check(length(trim(policy_note)) between 10 and 2000),configured_by uuid not null default auth.uid(),updated_at timestamptz not null default now(),unique(tenant_id,employee_id),foreign key(tenant_id,employee_id) references public.employees(tenant_id,id));
create table public.leave_adjustments(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,employee_id uuid not null,effective_date date not null,days numeric(10,4) not null check(days between -365 and 365 and days<>0),reason text not null check(length(trim(reason)) between 10 and 1000),created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),foreign key(tenant_id,employee_id) references public.employees(tenant_id,id));
create table public.leave_account_history(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,employee_id uuid not null,before_value jsonb,after_value jsonb not null,actor_id uuid,created_at timestamptz not null default now());
create table public.leave_holidays(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),holiday date not null,label text not null,unique(tenant_id,holiday));
alter table public.leave_accounts enable row level security;alter table public.leave_adjustments enable row level security;alter table public.leave_account_history enable row level security;alter table public.leave_holidays enable row level security;
create function public.leave_manager(t uuid) returns boolean language sql stable security definer set search_path='' as $$select public.has_capability(t,'payroll_admin') or public.has_capability(t,'hr') or public.has_capability(t,'approve_leave');$$;
create function public.leave_account_visible(t uuid,e uuid) returns boolean language sql stable security definer set search_path='' as $$select public.leave_manager(t) or public.has_capability(t,'payroll') or exists(select 1 from public.employees where tenant_id=t and id=e and user_id=auth.uid());$$;
create policy leave_account_read on public.leave_accounts for select to authenticated using(public.leave_account_visible(tenant_id,employee_id));
create policy leave_adjustment_read on public.leave_adjustments for select to authenticated using(public.leave_account_visible(tenant_id,employee_id));
create policy leave_history_read on public.leave_account_history for select to authenticated using(public.leave_manager(tenant_id));
create policy holiday_read on public.leave_holidays for select to authenticated using(public.is_staff(tenant_id));
create policy holiday_manage on public.leave_holidays for all to authenticated using(public.leave_manager(tenant_id)) with check(public.leave_manager(tenant_id));
revoke all on public.leave_accounts,public.leave_adjustments,public.leave_account_history,public.leave_holidays from public,anon,authenticated;
grant select on public.leave_accounts,public.leave_adjustments,public.leave_account_history,public.leave_holidays to authenticated;grant insert,update,delete on public.leave_holidays to authenticated;
create index leave_account_employee on public.leave_accounts(tenant_id,employee_id);
create index leave_request_period on public.leave_requests(tenant_id,user_id,status,starts,ends);
create index leave_adjustment_employee on public.leave_adjustments(tenant_id,employee_id,effective_date);
create function public.leave_account_audit() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.leave_account_history(tenant_id,employee_id,before_value,after_value,actor_id) values(new.tenant_id,new.employee_id,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid());return new;end;$$;
create trigger leave_account_changes after insert or update on public.leave_accounts for each row execute function public.leave_account_audit();
create trigger leave_adjustments_audit after insert on public.leave_adjustments for each row execute function public.record_audit();
create function public.configure_leave_account(t uuid,e uuid,v jsonb) returns void language plpgsql security definer set search_path='' as $$declare employee public.employees;begin
 if auth.uid() is null or not public.leave_manager(t) then raise exception 'HR or payroll administrator required';end if;
 select * into employee from public.employees where tenant_id=t and id=e for update;if not found then raise exception 'Employee unavailable';end if;
 if employee.start_date is null then
  if coalesce(v->>'employee_start_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Enter the verified employment start date';end if;
  employee.start_date:=(v->>'employee_start_date')::date;
  update public.employees set start_date=employee.start_date where tenant_id=t and id=e;
 end if;
 if (v->>'opening_date')::date<employee.start_date or (v->>'opening_date')::date>current_date or (v->>'accrual_start')::date<employee.start_date or (v->>'opening_balance')::numeric>(v->>'balance_cap')::numeric then raise exception 'Check start/opening dates and the opening balance';end if;
 insert into public.leave_accounts(tenant_id,employee_id,opening_date,opening_balance,accrual_start,monthly_rate,balance_cap,day_basis,policy_note,configured_by) values(t,e,(v->>'opening_date')::date,(v->>'opening_balance')::numeric,(v->>'accrual_start')::date,(v->>'monthly_rate')::numeric,(v->>'balance_cap')::numeric,v->>'day_basis',v->>'policy_note',auth.uid()) on conflict(tenant_id,employee_id) do update set opening_date=excluded.opening_date,opening_balance=excluded.opening_balance,accrual_start=excluded.accrual_start,monthly_rate=excluded.monthly_rate,balance_cap=excluded.balance_cap,day_basis=excluded.day_basis,policy_note=excluded.policy_note,configured_by=auth.uid(),updated_at=now();
end;$$;
create function public.leave_balance(t uuid,e uuid,as_of date default current_date) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a public.leave_accounts;employee public.employees;r record;balance numeric:=0;earned numeric:=0;used numeric:=0;adjusted numeric:=0;credit numeric;reserved numeric:=0;pending numeric:=0;begin
 if auth.uid() is null or not public.leave_account_visible(t,e) then raise exception 'Leave account access denied';end if;
 select * into employee from public.employees where tenant_id=t and id=e;if not found then raise exception 'Employee unavailable';end if;
 select * into a from public.leave_accounts where tenant_id=t and employee_id=e;
 if not found then return jsonb_build_object('configured',false,'employee_id',e,'name',employee.name,'start_date',employee.start_date,'message','Confirm the employee start date, opening balance and leave policy to activate accrual');end if;
 if as_of<a.opening_date or as_of>current_date+366 or as_of-a.opening_date>36525 then raise exception 'Choose a balance date after the opening date and no more than a year ahead';end if;
 balance:=a.opening_balance;
 for r in
 select d::date as day,
 case when d::date>=a.accrual_start then a.monthly_rate/extract(day from (date_trunc('month',d)+interval '1 month - 1 day')) else 0 end as credit,
 case when (a.day_basis='calendar' or (extract(isodow from d)<6 and not exists(select 1 from public.leave_holidays h where h.tenant_id=t and h.holiday=d::date))) and exists(select 1 from public.leave_requests l where l.tenant_id=t and l.user_id=employee.user_id and l.kind='Annual' and l.status='approved' and d::date between l.starts and l.ends) then 1 else 0 end as debit,
 coalesce((select sum(x.days) from public.leave_adjustments x where x.tenant_id=t and x.employee_id=e and x.effective_date=d::date),0) as adjustment
 from generate_series(a.opening_date+1,as_of,interval '1 day') d
 loop
  credit:=least(r.credit,greatest(0,a.balance_cap-balance));balance:=balance+credit+r.adjustment-r.debit;earned:=earned+credit;used:=used+r.debit;adjusted:=adjusted+r.adjustment;
 end loop;
 select count(*) into reserved from public.leave_requests l cross join lateral generate_series(greatest(l.starts,as_of+1),l.ends,interval '1 day') d where l.tenant_id=t and l.user_id=employee.user_id and l.kind='Annual' and l.status='approved' and (a.day_basis='calendar' or (extract(isodow from d)<6 and not exists(select 1 from public.leave_holidays h where h.tenant_id=t and h.holiday=d::date)));
 select count(*) into pending from public.leave_requests l cross join lateral generate_series(l.starts,l.ends,interval '1 day') d where l.tenant_id=t and l.user_id=employee.user_id and l.kind='Annual' and l.status='pending' and (a.day_basis='calendar' or (extract(isodow from d)<6 and not exists(select 1 from public.leave_holidays h where h.tenant_id=t and h.holiday=d::date)));
 return jsonb_build_object('configured',true,'employee_id',e,'name',employee.name,'as_of',as_of,'opening',a.opening_balance,'accrued',round(earned,2),'taken',used,'adjustments',adjusted,'balance',round(balance,2),'reserved',reserved,'pending',pending,'available',round(balance-reserved,2),'policy',to_jsonb(a));
end;$$;
create function public.leave_dashboard(t uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$declare rows jsonb:='[]';e record;begin
 if auth.uid() is null or not public.is_staff(t) then raise exception 'Staff access required';end if;
 for e in select id,name,user_id,start_date,status from public.employees where tenant_id=t and (public.leave_manager(t) or user_id=auth.uid()) order by name loop rows:=rows||jsonb_build_array(jsonb_build_object('employee',to_jsonb(e),'balance',public.leave_balance(t,e.id,current_date)));end loop;return rows;
end;$$;
create function public.adjust_leave(t uuid,e uuid,day date,amount numeric,reason text) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.leave_manager(t) or auth.uid() is null then raise exception 'HR or payroll administrator required';end if;
 perform 1 from public.leave_accounts where tenant_id=t and employee_id=e and day>opening_date and day<=current_date for update;if not found then raise exception 'Choose a configured account and an adjustment date after its opening date';end if;
 insert into public.leave_adjustments(tenant_id,employee_id,effective_date,days,reason) values(t,e,day,amount,reason);
end;$$;
-- Retain Nyasha/Bridget's approve_leave permissions and the no-self-approval rule.
create or replace function public.review_leave(t uuid,r uuid,decision text,note text default '') returns public.leave_requests language plpgsql security definer set search_path='' as $$
declare item public.leave_requests;employee uuid;a public.leave_accounts;balance jsonb;days numeric;begin
 select * into item from public.leave_requests where id=r and tenant_id=t for update;if not found then raise exception 'Leave request unavailable';end if;
 if auth.uid() is null or not public.is_staff(t) then raise exception 'Staff access required';end if;
 if decision='cancelled' and item.status='pending' and item.user_id=auth.uid() then null;
 elsif decision in ('approved','rejected','cancelled') then
  if not public.has_capability(t,'approve_leave') or item.user_id=auth.uid() then raise exception 'Another authorised leave approver must review this request';end if;
 else raise exception 'Invalid decision';end if;
 if not (item.status='pending' or (item.status='approved' and decision='cancelled')) then raise exception 'This request is no longer reviewable';end if;
 if length(note)>3000 then raise exception 'Note too long';end if;
 if decision='approved' then
  if exists(select 1 from public.leave_requests where tenant_id=t and user_id=item.user_id and status='approved' and id<>r and daterange(starts,ends,'[]')&&daterange(item.starts,item.ends,'[]')) then raise exception 'This employee already has approved leave covering these dates';end if;
  if item.kind='Annual' then
   select id into employee from public.employees where tenant_id=t and user_id=item.user_id;
   select * into a from public.leave_accounts where tenant_id=t and employee_id=employee for update;if not found then raise exception 'Configure the employee leave account before approving annual leave';end if;
   balance:=public.leave_balance(t,employee,current_date);
   select count(*) into days from generate_series(item.starts,item.ends,interval '1 day') d where a.day_basis='calendar' or (extract(isodow from d)<6 and not exists(select 1 from public.leave_holidays h where h.tenant_id=t and h.holiday=d::date));
   if days>(balance->>'available')::numeric then raise exception 'Insufficient accrued annual leave: available % days',balance->>'available';end if;
  end if;
 end if;
 update public.leave_requests set status=decision,review_note=note,reviewed_by=auth.uid() where id=r returning * into item;return item;
end;$$;
create function public.guard_leave_submission() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.ends-new.starts>365 then raise exception 'A leave request cannot exceed 366 days';end if;
 if new.starts<current_date then raise exception 'Request future leave; ask HR to record a historical balance adjustment';end if;
 if exists(select 1 from public.leave_requests where tenant_id=new.tenant_id and user_id=new.user_id and status in ('pending','approved') and daterange(starts,ends,'[]')&&daterange(new.starts,new.ends,'[]')) then raise exception 'A pending/approved request already covers these dates';end if;return new;
end;$$;
create trigger leave_submission_guard before insert on public.leave_requests for each row execute function public.guard_leave_submission();
revoke all on function public.leave_manager(uuid),public.leave_account_visible(uuid,uuid),public.leave_balance(uuid,uuid,date),public.leave_dashboard(uuid),public.configure_leave_account(uuid,uuid,jsonb),public.adjust_leave(uuid,uuid,date,numeric,text),public.adopt_payroll_tax_year(uuid,integer,integer,text) from public,anon;
grant execute on function public.leave_manager(uuid),public.leave_account_visible(uuid,uuid),public.leave_balance(uuid,uuid,date),public.leave_dashboard(uuid),public.configure_leave_account(uuid,uuid,jsonb),public.adjust_leave(uuid,uuid,date,numeric,text),public.adopt_payroll_tax_year(uuid,integer,integer,text) to authenticated;
revoke all on function public.leave_account_audit(),public.guard_leave_submission() from public,anon,authenticated;

create function public.payroll_v3(t uuid,v jsonb,save_draft boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare employee public.employees;table_row public.payroll_tax_tables;band jsonb;p jsonb;warning text:='';frequency text:=v->>'frequency';period_start date:=(v->>'period_start')::date;period_end date:=(v->>'period_end')::date;paid_from date:=(v->>'paid_from')::date;paid_to date:=(v->>'paid_to')::date;pay_date date:=(v->>'pay_date')::date;factor numeric:=1;units numeric;denominator numeric;basis text:=v->>'proration_basis';field text;amount numeric;base numeric;hours numeric;ot numeric;gross numeric;taxable numeric;paye numeric;levy numeric;net numeric;nssa numeric;request_id uuid:=(v->>'request_id')::uuid;existing public.business_items;result public.business_items;fingerprint text;leave_info jsonb;
begin
 if auth.uid() is null or not public.has_capability(t,'payroll') then raise exception 'Payroll access required';end if;
 select * into employee from public.employees where tenant_id=t and id=(v->>'employee_id')::uuid and status='active';if not found then raise exception 'Choose an active employee';end if;
 if frequency not in ('daily','weekly','fortnightly','monthly','annual') or frequency is null or period_start is null or period_end is null or paid_from is null or paid_to is null or pay_date is null then raise exception 'Choose frequency, regular period, paid dates and payment date';end if;
 if period_start>period_end or paid_from<period_start or paid_to>period_end or paid_from>paid_to or period_end-period_start>366 or extract(year from period_start)<>extract(year from period_end) or extract(year from pay_date)<>extract(year from period_end) then raise exception 'Check dates: one tax year per calculation and paid dates inside the regular period';end if;
 if (frequency='monthly' and (period_start<>date_trunc('month',period_start)::date or period_end<>(date_trunc('month',period_start)+interval '1 month - 1 day')::date)) or (frequency='weekly' and period_end-period_start<>6) or (frequency='fortnightly' and period_end-period_start<>13) or (frequency='daily' and period_start<>period_end) or (frequency='annual' and (period_start<>date_trunc('year',period_start)::date or period_end<>(date_trunc('year',period_start)+interval '1 year - 1 day')::date)) then raise exception 'Choose a full regular salary period before selecting partial paid dates';end if;
 if basis='full' then if paid_from<>period_start or paid_to<>period_end then raise exception 'Choose proration for a partial paid period';end if;units:=period_end-period_start+1;denominator:=units;
 elsif basis='calendar_days' then units:=paid_to-paid_from+1;denominator:=period_end-period_start+1;
 elsif basis='manual_units' then units:=(v->>'paid_units')::numeric;denominator:=(v->>'period_units')::numeric;if units is null or denominator is null or units<=0 or denominator<=0 or units>denominator or denominator>10000 or length(trim(coalesce(v->>'proration_note','')))<10 then raise exception 'Check units and describe the approved proration method';end if;
 else raise exception 'Choose a proration basis';end if;
 factor:=units/denominator;
 foreach field in array array['base','allowances','commission','overtime_hours','nssa','allowable_deductions','tax_credit','other_deductions'] loop
  if jsonb_typeof(v->field) is distinct from 'number' then raise exception 'Enter a numeric amount for %',field;end if;
  amount:=(v->>field)::numeric;if amount<0 or amount>100000000 or round(amount,2)<>amount then raise exception 'Use non-negative values with at most two decimal places';end if;
 end loop;
 hours:=(v->>'overtime_hours')::numeric;if hours>(paid_to-paid_from+1)*24 then raise exception 'Overtime hours exceed the selected paid period';end if;
 ot:=round(hours*5,2);base:=round((v->>'base')::numeric*factor,2);gross:=base+(v->>'allowances')::numeric+(v->>'commission')::numeric+ot;nssa:=(v->>'nssa')::numeric;
 if nssa>gross or (v->>'allowable_deductions')::numeric+nssa>gross then raise exception 'Tax relief and NSSA cannot exceed gross earnings';end if;
 taxable:=round(greatest(0,gross-nssa-(v->>'allowable_deductions')::numeric),2);
 select * into table_row from public.payroll_tax_tables where tenant_id=t and tax_year=extract(year from pay_date)::int and currency='USD';
 if not found then select * into table_row from public.payroll_tax_tables where tenant_id=t and tax_year=2025 and currency='USD';warning:='Illustrative calculation using the supplied 2025 tables. Finance must confirm their applicability to the selected tax year before finalisation.';end if;
 if table_row.id is null then raise exception 'No USD PAYE table configured';end if;
 select value into band from jsonb_array_elements(table_row.tables->frequency) where taxable>=(value->>'from')::numeric order by (value->>'from')::numeric desc limit 1;
 if band is null then raise exception 'Tax table does not contain this frequency';end if;
 paye:=round(greatest(0,taxable*(band->>'rate')::numeric/100-(band->>'deduct')::numeric-(v->>'tax_credit')::numeric),2);levy:=round(paye*0.03,2);net:=round(gross-nssa-paye-levy-(v->>'other_deductions')::numeric,2);if net<0 then raise exception 'Deductions would produce negative net pay';end if;
 if not coalesce((v->>'statutory_confirmed')::boolean,false) then warning:=concat_ws(' ',nullif(warning,''),'Finance review of NSSA eligibility/amount, deductions, tax credits, and overtime contract terms is still required.');end if;
 if factor<1 and not coalesce((v->>'partial_tax_confirmed')::boolean,false) then warning:=concat_ws(' ',nullif(warning,''),'Confirm the selected tax frequency and partial-period treatment; statutory thresholds were not prorated.');end if;
 leave_info:=case when exists(select 1 from public.leave_accounts where tenant_id=t and employee_id=employee.id and opening_date<=least(paid_to,current_date)) then public.leave_balance(t,employee.id,least(paid_to,current_date)) else jsonb_build_object('configured',false) end;
 p:=jsonb_build_object('payroll_version',3,'employee_id',employee.id,'employee',employee.name,'currency','USD','period_start',period_start,'period_end',period_end,'paid_from',paid_from,'paid_to',paid_to,'pay_date',pay_date,'frequency',frequency,'proration_basis',basis,'paid_units',units,'period_units',denominator,'proration_factor',factor,'proration_note',left(coalesce(v->>'proration_note',''),1000),'contractual_base',(v->>'base')::numeric,'base',base,'allowances',(v->>'allowances')::numeric,'commission',(v->>'commission')::numeric,'overtime_hours',hours,'overtime_rate',5,'overtime',ot,'gross',gross,'taxable',taxable,'nssa',nssa,'allowable_deductions',(v->>'allowable_deductions')::numeric,'tax_credit',(v->>'tax_credit')::numeric,'paye',paye,'aids_levy',levy,'other_deductions',(v->>'other_deductions')::numeric,'net',net,'tax_band',band,'tax_table_id',table_row.id,'tax_year',extract(year from pay_date)::int,'table_year',table_row.tax_year,'table_snapshot',to_jsonb(table_row),'rules_snapshot',jsonb_build_object('source',table_row.source),'warning',warning,'statutory_confirmed',coalesce((v->>'statutory_confirmed')::boolean,false),'partial_tax_confirmed',coalesce((v->>'partial_tax_confirmed')::boolean,false),'leave_snapshot',leave_info);
 if not save_draft then return p;end if;
 if request_id is null then raise exception 'Reopen the form to obtain a request reference';end if;
 fingerprint:=md5((v-'request_id')::text);perform pg_advisory_xact_lock(hashtextextended(t::text||request_id::text,0));
 select * into existing from public.business_items where tenant_id=t and kind='payroll' and payload->>'request_id'=request_id::text;
 if found then if existing.created_by<>auth.uid() or existing.payload->>'input_fingerprint'<>fingerprint then raise exception 'This draft request already exists with different details';end if;return to_jsonb(existing);end if;
 insert into public.business_items(tenant_id,kind,title,client_id,currency,payload,total,due_date,status) values(t,'payroll',employee.name,null,'USD',p||jsonb_build_object('request_id',request_id,'input_fingerprint',fingerprint),net,pay_date,'draft') returning * into result;return to_jsonb(result);
end;$$;
-- Keep the previously tested financial actions and v2 payroll path, adding finalisation for version 3.
alter function public.business_action(uuid,uuid,text,jsonb) rename to business_action_v2;
alter function public.business_action_v2(uuid,uuid,text,jsonb) set schema nxt_private;
revoke all on function nxt_private.business_action_v2(uuid,uuid,text,jsonb) from public,anon,authenticated;
create function public.business_action(t uuid,r uuid,a text,v jsonb default '{}') returns public.business_items language plpgsql security definer set search_path='' as $$declare b public.business_items;tax_rule public.payroll_tax_tables;begin
 select * into b from public.business_items where tenant_id=t and id=r for update;if not found then raise exception 'Record unavailable';end if;
 if b.kind<>'payroll' or b.payload->>'payroll_version'<>'3' then return nxt_private.business_action_v2(t,r,a,v);end if;
 if auth.uid() is null or not public.has_capability(t,'payroll') or not public.has_capability(t,'payroll_admin') then raise exception 'Payroll administrator required';end if;
 if a<>'finalise' then raise exception 'Action unavailable';end if;if b.status='finalised' then return b;end if;
 if b.status<>'draft' or coalesce(b.payload->>'warning','')<>'' then raise exception 'Resolve the draft warnings and recalculate before finalisation';end if;
 select * into tax_rule from public.payroll_tax_tables where tenant_id=t and id=(b.payload->>'tax_table_id')::uuid;
 if tax_rule.tax_year is distinct from (b.payload->>'tax_year')::int or tax_rule.approved_at is null or to_jsonb(tax_rule) is distinct from b.payload->'table_snapshot' then raise exception 'Tax-year approval changed or is missing. Recalculate the draft';end if;
 update public.business_items set status='finalised',payload=payload||jsonb_build_object('finalised_by',auth.uid(),'finalised_at',now()) where id=r returning * into b;return b;
end;$$;
revoke all on function public.payroll_v3(uuid,jsonb,boolean),public.business_action(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.payroll_v3(uuid,jsonb,boolean),public.business_action(uuid,uuid,text,jsonb) to authenticated;
commit;
