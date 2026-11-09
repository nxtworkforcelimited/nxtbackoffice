-- Where a CRM opportunity came from: a tracked link ("link:<code>") or a general source
-- such as "cold-calling". Additive; existing deals keep an empty source.
begin;
alter table public.deals add column if not exists lead_source text not null default '' check(length(lead_source)<=80);
create index if not exists deals_lead_source_idx on public.deals(tenant_id,lead_source) where lead_source<>'';
commit;
