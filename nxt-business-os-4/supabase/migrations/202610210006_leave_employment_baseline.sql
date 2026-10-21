-- A zero opening balance dated immediately before employment lets leave_balance
-- accrue the first employment day once, without inventing an eight-day opening.
-- Existing account balances and rates are not changed by this migration.
begin;
create or replace function public.configure_leave_account(t uuid,e uuid,v jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare employee public.employees;
begin
 if auth.uid() is null or not public.leave_manager(t) then
  raise exception 'HR or payroll administrator required';
 end if;
 select * into employee from public.employees where tenant_id=t and id=e for update;
 if not found then raise exception 'Employee unavailable';end if;
 if employee.start_date is null then
  if coalesce(v->>'employee_start_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
   raise exception 'Enter the verified employment start date';
  end if;
  employee.start_date:=(v->>'employee_start_date')::date;
  update public.employees set start_date=employee.start_date where tenant_id=t and id=e;
 end if;
 if ((v->>'opening_date')::date<employee.start_date and not (
       (v->>'opening_date')::date=employee.start_date-1
       and (v->>'opening_balance')::numeric=0
     ))
    or (v->>'opening_date')::date>current_date
    or (v->>'accrual_start')::date<employee.start_date
    or (v->>'opening_balance')::numeric>(v->>'balance_cap')::numeric then
  raise exception 'Check employment/opening dates and balance. Only a zero balance may start on the day before employment';
 end if;
 insert into public.leave_accounts(
  tenant_id,employee_id,opening_date,opening_balance,accrual_start,
  monthly_rate,balance_cap,day_basis,policy_note,configured_by
 ) values(
  t,e,(v->>'opening_date')::date,(v->>'opening_balance')::numeric,
  (v->>'accrual_start')::date,(v->>'monthly_rate')::numeric,
  (v->>'balance_cap')::numeric,v->>'day_basis',v->>'policy_note',auth.uid()
 ) on conflict(tenant_id,employee_id) do update set
  opening_date=excluded.opening_date,opening_balance=excluded.opening_balance,
  accrual_start=excluded.accrual_start,monthly_rate=excluded.monthly_rate,
  balance_cap=excluded.balance_cap,day_basis=excluded.day_basis,
  policy_note=excluded.policy_note,configured_by=auth.uid(),updated_at=now();
end;$$;
revoke all on function public.configure_leave_account(uuid,uuid,jsonb) from public,anon;
grant execute on function public.configure_leave_account(uuid,uuid,jsonb) to authenticated;
commit;
