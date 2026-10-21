-- Selectable pay periods, explicit salary proration, and scoped payroll administration.
-- No tax rates are supplied or marked verified by this migration.
begin;
create schema if not exists nxt_private;
revoke all on schema nxt_private from public,anon;
grant usage on schema nxt_private to authenticated,service_role;
alter table public.member_permissions drop constraint member_permissions_capability_check;
alter table public.member_permissions add constraint member_permissions_capability_check check(capability in ('crm','delivery','content','approve_content','documents','finance','payroll','sms','reports','website','hr','approve_leave','tickets','task_admin','finance_admin','payroll_admin'));
alter policy payroll_rules_write on public.payroll_rules using(public.has_capability(tenant_id,'payroll_admin')) with check(public.has_capability(tenant_id,'payroll_admin'));

create function nxt_private.validate_payroll_rule(r jsonb) returns void language plpgsql immutable set search_path='' as $$
declare b jsonb;previous_from numeric:=-1;v numeric;k text;
begin
 if r is null or r->'verified' is distinct from 'true'::jsonb then raise exception 'Finance must configure verified rules for this currency and pay period';end if;
 if length(trim(coalesce(r->>'source','')))<10 or r->>'source' ~* '(replace with|placeholder|example rates)' then raise exception 'Add the verified statutory source and finance reviewer, not placeholder rules';end if;
 if coalesce(r->>'frequency','monthly') not in ('monthly','weekly','fortnightly','daily') then raise exception 'Choose the calculation frequency covered by the verified tax tables';end if;
 if coalesce(r->>'valid_from','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(r->>'valid_to','') !~ '^\d{4}-\d{2}-\d{2}$' or (r->>'valid_to')::date<(r->>'valid_from')::date then raise exception 'Add ordered rule effective dates';end if;
 foreach k in array array['nssa_rate','nssa_ceiling','aids_rate'] loop
  if jsonb_typeof(r->k) is distinct from 'number' then raise exception 'Payroll rule % must be a number',k;end if;
  v:=(r->>k)::numeric;if v<0 or v>100000000 or (k<>'nssa_ceiling' and v>100) then raise exception 'Payroll rule % is outside its allowed range',k;end if;
 end loop;
 if (r->>'nssa_rate')::numeric>0 and (r->>'nssa_ceiling')::numeric<=0 then raise exception 'Add the verified NSSA ceiling for this pay frequency';end if;
 if jsonb_typeof(r->'bands') is distinct from 'array' then raise exception 'Add verified tax bands';end if;
 if jsonb_array_length(r->'bands') not between 2 and 30 then raise exception 'Placeholder tax bands cannot be verified';end if;
 for b in select value from jsonb_array_elements(r->'bands') loop
  foreach k in array array['from','rate','deduct'] loop
   if jsonb_typeof(b->k) is distinct from 'number' or (b->>k)::numeric<0 or (b->>k)::numeric>100000000 then raise exception 'Invalid tax band';end if;
  end loop;
  if (b->>'rate')::numeric>100 or (b->>'from')::numeric<=previous_from or (previous_from=-1 and (b->>'from')::numeric<>0) then raise exception 'Tax bands must start at zero and be ordered';end if;
  previous_from:=(b->>'from')::numeric;
 end loop;
 if not exists(select 1 from jsonb_array_elements(r->'bands') as band_entry(value) where (band_entry.value->>'rate')::numeric>0) then raise exception 'All-zero placeholder rates cannot be verified';end if;
 if r->'partial_period_verified'='true'::jsonb and length(trim(coalesce(r->>'partial_period_note','')))<10 then raise exception 'Document the approved partial-period tax and NSSA treatment';end if;
end;$$;
create function public.guard_payroll_rules() returns trigger language plpgsql security invoker set search_path='' as $$
declare c text;r jsonb;
begin
 if jsonb_typeof(new.rules) is distinct from 'object' then raise exception 'Payroll rules must be an object';end if;
 for c,r in select key,value from jsonb_each(new.rules) loop
  if c not in ('USD','ZWG') or jsonb_typeof(r) is distinct from 'object' then raise exception 'Use currency-specific USD or ZWG rules';end if;
  if r->'verified'='true'::jsonb then
   perform nxt_private.validate_payroll_rule(r);
   new.rules:=jsonb_set(new.rules,array[c],r||jsonb_build_object('verified_by',auth.uid(),'verified_at',now()));
  end if;
 end loop;
 new.updated_at:=now();return new;
end;$$;
create trigger payroll_rules_guard before insert or update on public.payroll_rules for each row execute function public.guard_payroll_rules();
create function public.audit_payroll_rules() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.audit_events(tenant_id,actor_id,entity,record_id,action) values(new.tenant_id,auth.uid(),'payroll_rules',null,tg_op);return new;end;$$;
revoke all on function public.audit_payroll_rules() from public,anon,authenticated;
create trigger payroll_rules_audit after insert or update on public.payroll_rules for each row execute function public.audit_payroll_rules();
-- The trigger's validator is read-only and must be callable by an authorised table writer.
revoke all on function nxt_private.validate_payroll_rule(jsonb),public.guard_payroll_rules() from public,anon;
grant execute on function nxt_private.validate_payroll_rule(jsonb) to authenticated;

-- Preserve the existing checked quote/invoice/request implementation, but do not expose the legacy payroll entry point.
alter function public.create_business_item(uuid,text,jsonb) rename to create_business_item_base;
alter function public.create_business_item_base(uuid,text,jsonb) set schema nxt_private;
revoke all on function nxt_private.create_business_item_base(uuid,text,jsonb) from public,anon,authenticated;
create function public.create_business_item(t uuid,k text,v jsonb) returns public.business_items language plpgsql security definer set search_path='' as $$
declare d jsonb:=coalesce(v->'payload','{}');r jsonb;safe jsonb;start_date date;end_date date;paid_start date;paid_end date;pay_date date;frequency text;basis text;units numeric;full_units numeric;factor numeric;amount numeric;field text;request_id uuid;existing public.business_items;result public.business_items;fingerprint text;
begin
 if k<>'payroll' then return nxt_private.create_business_item_base(t,k,v);end if;
 if auth.uid() is null or not public.has_capability(t,'payroll') then raise exception 'Payroll access required';end if;
 if coalesce(v->>'currency','') not in ('USD','ZWG') then raise exception 'Choose USD or ZiG; mixed-currency payroll requires separate finance handling';end if;
 select rules->(v->>'currency') into r from public.payroll_rules where tenant_id=t;
 perform nxt_private.validate_payroll_rule(r);
 if length(trim(coalesce(v->>'title',''))) not between 1 and 160 then raise exception 'Add the employee name';end if;
 foreach field in array array['period_start','period_end','paid_from','paid_to','pay_date'] loop
  if coalesce(d->>field,'') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose all salary period, paid period and payment dates';end if;
 end loop;
 start_date:=(d->>'period_start')::date;end_date:=(d->>'period_end')::date;paid_start:=(d->>'paid_from')::date;paid_end:=(d->>'paid_to')::date;pay_date:=(d->>'pay_date')::date;
 if start_date>end_date or paid_start<start_date or paid_end>end_date or paid_start>paid_end or end_date-start_date>365 then raise exception 'Paid dates must be ordered and inside the regular salary period';end if;
 frequency:=d->>'frequency';
 if frequency is null or frequency<>coalesce(r->>'frequency','monthly') then raise exception 'The pay frequency must match the finance-verified tax tables';end if;
 if (frequency='monthly' and (start_date<>date_trunc('month',start_date)::date or end_date<>(date_trunc('month',start_date)+interval '1 month - 1 day')::date)) or (frequency='weekly' and end_date-start_date<>6) or (frequency='fortnightly' and end_date-start_date<>13) or (frequency='daily' and end_date<>start_date) then raise exception 'Choose a full regular salary period, then the dates actually being paid';end if;
 if start_date<(r->>'valid_from')::date or end_date>(r->>'valid_to')::date or pay_date<(r->>'valid_from')::date or pay_date>(r->>'valid_to')::date then raise exception 'Verified rules do not cover the full pay period and payment date';end if;
 basis:=d->>'proration_basis';
 if basis='full' then
  if paid_start<>start_date or paid_end<>end_date then raise exception 'Choose a proration method for a partial paid period';end if;
  units:=end_date-start_date+1;full_units:=units;
 elsif basis='calendar_days' then units:=paid_end-paid_start+1;full_units:=end_date-start_date+1;
 elsif basis='manual_units' then
  if jsonb_typeof(d->'paid_units') is distinct from 'number' or jsonb_typeof(d->'period_units') is distinct from 'number' then raise exception 'Enter paid and full-period working days or hours';end if;
  units:=(d->>'paid_units')::numeric;full_units:=(d->>'period_units')::numeric;
  if units<=0 or full_units<=0 or units>full_units or full_units>10000 or length(trim(coalesce(d->>'proration_note','')))<10 then raise exception 'Check proration units and add the approved calculation basis';end if;
 else raise exception 'Choose full pay, calendar days or finance-approved working-day/hour units';end if;
 factor:=units/full_units;
 if (factor<1 or paid_start<>start_date or paid_end<>end_date) and r->'partial_period_verified' is distinct from 'true'::jsonb then raise exception 'Finance must verify partial-period tax and NSSA treatment before prorated payroll can run';end if;
 safe:='{}';
 foreach field in array array['base','allowances','overtime','allowable_deductions','tax_credit','other_deductions'] loop
  if jsonb_typeof(d->field) is distinct from 'number' then raise exception 'Payroll amount % must be a number',field;end if;
  amount:=(d->>field)::numeric;if amount<0 or amount>100000000 or round(amount,2)<>amount then raise exception 'Use non-negative payroll amounts with at most two decimal places';end if;
  safe:=safe||jsonb_build_object(field,amount);
 end loop;
 request_id:=(d->>'request_id')::uuid;if request_id is null then raise exception 'Reopen the payroll form and retry';end if;
 fingerprint:=md5(jsonb_build_object('employee',trim(v->>'title'),'currency',v->>'currency','input',d-'request_id')::text);
 perform pg_advisory_xact_lock(hashtextextended(t::text||request_id::text,0));
 select * into existing from public.business_items where tenant_id=t and kind='payroll' and payload->>'request_id'=request_id::text;
 if found then
  if existing.created_by is distinct from auth.uid() or existing.payload->>'input_fingerprint'<>fingerprint then raise exception 'This payroll request was already used; reopen the form';end if;
  return existing;
 end if;
 -- Prorate BASIC salary only. All other amounts are actual earnings/relief/deductions for the paid period.
 -- Do not silently prorate statutory thresholds, credits, or ceilings.
 safe:=safe||jsonb_build_object('employee',trim(v->>'title'),'base',round((d->>'base')::numeric*factor,2),'contractual_base',(d->>'base')::numeric,'period_start',start_date,'period_end',end_date,'paid_from',paid_start,'paid_to',paid_end,'pay_date',pay_date,'frequency',frequency,'proration_basis',basis,'paid_units',units,'period_units',full_units,'proration_factor',factor,'proration_note',left(coalesce(d->>'proration_note',''),1000),'payroll_version',2,'request_id',request_id,'input_fingerprint',fingerprint);
 result:=nxt_private.create_business_item_base(t,'payroll',jsonb_build_object('title',trim(v->>'title'),'currency',v->>'currency','client_id',null,'due_date',pay_date,'payload',safe));
 return result;
end;$$;
create unique index payroll_request_once on public.business_items(tenant_id,(payload->>'request_id')) where kind='payroll' and payload ? 'request_id';

alter function public.business_action(uuid,uuid,text,jsonb) rename to business_action_base;
alter function public.business_action_base(uuid,uuid,text,jsonb) set schema nxt_private;
revoke all on function nxt_private.business_action_base(uuid,uuid,text,jsonb) from public,anon,authenticated;
create function public.business_action(t uuid,r uuid,a text,v jsonb default '{}') returns public.business_items language plpgsql security definer set search_path='' as $$
declare b public.business_items;rule jsonb;
begin
 select * into b from public.business_items where tenant_id=t and id=r for update;
 if not found then raise exception 'Record unavailable';end if;
 if b.kind<>'payroll' then return nxt_private.business_action_base(t,r,a,v);end if;
 if auth.uid() is null or not public.has_capability(t,'payroll') or not public.has_capability(t,'payroll_admin') then raise exception 'Payroll administrator required to finalise a payslip';end if;
 if a<>'finalise' then raise exception 'Action unavailable';end if;
 if b.status='finalised' then return b;end if;
 if b.status<>'draft' or b.payload->>'payroll_version' is distinct from '2' then raise exception 'Recreate the draft using the dated payroll form before finalising';end if;
 select rules->b.currency into rule from public.payroll_rules where tenant_id=t;
 perform nxt_private.validate_payroll_rule(rule);
 if rule is distinct from b.payload->'rules_snapshot' then raise exception 'Payroll rules changed. Recalculate a new draft before finalising';end if;
 update public.business_items set status='finalised',payload=payload||jsonb_build_object('finalised_by',auth.uid(),'finalised_at',now()) where id=b.id returning * into b;
 return b;
end;$$;
revoke all on function public.create_business_item(uuid,text,jsonb),public.business_action(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.create_business_item(uuid,text,jsonb),public.business_action(uuid,uuid,text,jsonb) to authenticated;
commit;
