begin;
alter table public.sms_templates drop constraint if exists sms_templates_event_check;
alter table public.sms_templates add constraint sms_templates_event_check check(event in ('welcome','invoice_sent','project_update','project_completed','ticket_received','ticket_resolved') or event ~ '^custom_[a-f0-9-]{36}$');
alter table public.sms_templates add column name text not null default '',add column context_kind text not null default 'general' check(context_kind in ('general','invoice','project','ticket'));
update public.sms_templates set name=case event when 'welcome' then 'Account welcome' when 'invoice_sent' then 'Invoice sent' when 'project_update' then 'Project update' when 'project_completed' then 'Project completed' when 'ticket_received' then 'Ticket received' when 'ticket_resolved' then 'Ticket resolved' else name end,
 context_kind=case when event='invoice_sent' then 'invoice' when event like 'project_%' then 'project' when event like 'ticket_%' then 'ticket' else 'general' end;
alter table public.sms_templates add constraint sms_templates_name_length check(length(name)<=100);
-- Additional templates are selected manually; only the six built-in events have automatic triggers.
alter table public.sms_templates add constraint sms_templates_custom_manual check(event not like 'custom_%' or not enabled);
alter table public.sms_outbox drop constraint if exists sms_outbox_source_type_check;
alter table public.sms_outbox add constraint sms_outbox_source_type_check check(source_type in ('task','project','social_post','manual_test','manual_template','welcome','invoice_sent','project_update','project_completed','ticket_received','ticket_resolved'));
commit;
