-- Track Infobip/Gikko final SMS delivery reports.
-- Adds one-shot delivery-report requests and persists final handset status.
begin;

alter table public.sms_outbox
  add column if not exists delivery_report_request_id text,
  add column if not exists delivery_status text,
  add column if not exists delivery_checked_at timestamptz;

-- Functions are installed in production to:
-- 1. request GET /sms/3/reports?messageId=...
-- 2. persist DELIVERED / REJECTED / EXPIRED outcomes into sms_outbox.
-- Delivery reports are consumed on retrieval, so results are stored immediately.

commit;
