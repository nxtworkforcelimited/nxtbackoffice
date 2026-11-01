-- Allow controlled manual SMS tests alongside workflow-generated SMS.
begin;
alter table public.sms_outbox drop constraint if exists sms_outbox_source_type_check;
alter table public.sms_outbox
  add constraint sms_outbox_source_type_check
  check (source_type in ('task','project','social_post','manual_test'));
commit;
