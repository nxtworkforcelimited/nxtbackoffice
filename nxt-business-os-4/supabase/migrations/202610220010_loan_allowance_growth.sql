begin;

create or replace function public.loan_allowance(t uuid,eid uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.employees;days_employed int;periods int;earned numeric;used numeric;available numeric;next_date date;
begin
 select * into e from public.employees where tenant_id=t and id=eid;
 if not found then raise exception 'Employee unavailable';end if;
 if e.start_date is null or e.start_date>current_date then
  return jsonb_build_object('earned',0,'used',0,'available',0,'next_increase',e.start_date,'start_date',e.start_date,'periods',0);
 end if;
 days_employed:=current_date-e.start_date;
 periods:=floor(days_employed/14.0)::int;
 earned:=20+(periods*5);
 select coalesce(sum(amount),0) into used
 from public.employee_loans
 where tenant_id=t and employee_id=eid and status in ('requested','approved','deducted');
 available:=greatest(0,earned-used);
 next_date:=e.start_date+((periods+1)*14);
 return jsonb_build_object('earned',earned,'used',used,'available',available,'next_increase',next_date,'start_date',e.start_date,'periods',periods,'increment',5,'interval_days',14,'starting_allowance',20);
end;$$;
revoke all on function public.loan_allowance(uuid,uuid) from public,anon;
grant execute on function public.loan_allowance(uuid,uuid) to authenticated;

create or replace function public.loan_snapshot(t uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.employees;reviewer boolean;rows jsonb;allowance jsonb;
begin
 if auth.uid() is null or not public.is_staff(t) then raise exception 'Staff access required';end if;
 select * into me from public.employees where tenant_id=t and user_id=auth.uid() and status='active' limit 1;
 reviewer:=exists(select 1 from public.employee_loan_reviewers where tenant_id=t and user_id=auth.uid());
 select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('employee_name',e.name,'is_mine',e.user_id=auth.uid()) order by l.created_at desc),'[]'::jsonb)
 into rows
 from public.employee_loans l
 join public.employees e on e.tenant_id=l.tenant_id and e.id=l.employee_id
 where l.tenant_id=t and (reviewer or e.user_id=auth.uid());
 allowance:=case when me.id is null then null else public.loan_allowance(t,me.id) end;
 return jsonb_build_object('reviewer',reviewer,'employee',case when me.id is null then null else jsonb_build_object('id',me.id,'name',me.name) end,'allowance',allowance,'loans',rows);
end;$$;

create or replace function public.request_employee_loan(t uuid,amount numeric,reason text)
returns public.employee_loans language plpgsql security definer set search_path='' as $$
declare e public.employees;l public.employee_loans;recipient record;a jsonb;available numeric;
begin
 if auth.uid() is null or not public.is_staff(t) then raise exception 'Staff access required';end if;
 select * into e from public.employees where tenant_id=t and user_id=auth.uid() and status='active' limit 1;
 if not found then raise exception 'Your login is not linked to an active employee';end if;
 if amount is null or amount<=0 or round(amount,2)<>amount then raise exception 'Enter a valid loan amount with at most two decimals';end if;
 if length(trim(coalesce(reason,''))) not between 5 and 1000 then raise exception 'Add a reason for the loan';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text||e.id::text,0));
 a:=public.loan_allowance(t,e.id);available:=(a->>'available')::numeric;
 if amount>available then raise exception 'You can currently request up to USD %',to_char(available,'FM999999999990.00');end if;
 insert into public.employee_loans(tenant_id,employee_id,requested_by,amount,reason) values(t,e.id,auth.uid(),round(amount,2),trim(reason)) returning * into l;
 for recipient in select u.email from public.employee_loan_reviewers r join auth.users u on u.id=r.user_id where r.tenant_id=t and r.user_id<>auth.uid() and u.email is not null loop
  insert into public.notification_outbox(tenant_id,recipient,subject,body)
  values(t,recipient.email,'Employee loan request: '||e.name,e.name||' requested a USD '||to_char(l.amount,'FM999999999990.00')||' employee loan. Reason: '||l.reason||'. Open Employee Loans in NXT Business OS to review.');
 end loop;
 return l;
end;$$;

commit;