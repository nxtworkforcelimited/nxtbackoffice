# NXT client lifecycle SOP in Master Tracker

Start in **Master Tracker > Start SOP workflow**. Select an existing client or enter a potential client's name, company phone, optional email, lead source and brief. This is the supported client-mention trigger; WhatsApp, email and chat are not monitored automatically.

The form maps the six revised roles to existing staff accounts by full name. Review these mappings before creating the workflow. No permissions are granted or changed by this mapping. Suggested working-day deadlines are estimates, not promised client dates. Every task needs an internal deadline; client deadlines remain optional until agreed. Preview the exact plan, then create it.

Creation is transactional and retry-safe. It reuses the selected/matching active client and creates one linked CRM opportunity, internal project and SOP task workflow. An existing SOP workflow for that client is preserved rather than duplicated (the create action asks you to use the existing workflow). SOP tasks are managed in Master Tracker; the separate legacy Tasks module is unchanged.

## Accountabilities

- Nyasha Kamupira: client services, business approval and frontend development.
- Kristian Kamupira: costing, quotation preparation, invoicing/payment checks and financial close.
- Bridget Kambanje: SLA administration, onboarding, documents and administration.
- Adrian Chaperuka: backend/backoffice development.
- Tatenda Makarakate: research, marketing and project copy.
- Michael Muchinenyika: scope, capacity, prototypes, task coordination, quality review and project close.

Every task has one owner, supporting staff, a backup and a distinct reviewer. The PM may reassign ownership; record the handover in notes. Backup assignment does not silently transfer ownership or grant access.

## Workflow gates

1. Prerequisites must be Completed before dependent work moves into In Progress, Under Review or Completed.
2. Waiting on Client needs a next action and follow-up date.
3. Blocked work needs a blocker, next action and escalation follow-up date. The daily escalation queue shows it to staff; no external messages are sent.
4. Only the designated independent reviewer can complete a task from Under Review. All acceptance checks, deliverable evidence and approval evidence are required.
5. Reviewed work must be reopened before its approved content is changed. Dependent work must be reopened first. Date changes require a newly recorded reason.
6. The template contains explicit proposal approval, written client acceptance, SLA, payment/start-condition, independent QA and release-approval gates. Finance and release tasks record evidence; they do not issue invoices, collect payment, sign agreements or deploy websites automatically.

## Daily work

Use **Daily work > My SOP tasks**, **Awaiting my SOP review**, or **SOP follow-ups due**. Start-of-day and end-of-day checklists remain visible. The daily summary shows due/overdue tasks, review work and follow-ups. Owners update task notes as work progresses and before finishing work.

## Existing tasks and archive

Existing native and external client tasks keep their original workflows. SOP rules apply to newly created SOP workflows. Existing tasks are not silently reassigned, completed or deleted.

Delivery managers can use **Archive shown tasks** after reviewing the current filters. Archived records remain in their source with notes and evidence intact. Choose **Archived tasks** and **Restore shown tasks** to restore visibility. Archive is reversible and applies only to task records, not approval or risk records. Dependency gates still apply to archived SOP prerequisites.

## Deployment / validation

Apply `supabase/upgrade-sop-workflow.sql` once before deploying the application. New tables use RLS; RPCs use the caller's authenticated permissions. The only new security-definer function is a private audit trigger with public execution revoked.

Run `node --test tests/master-tracker.test.mjs tests/native-client-trackers.test.mjs tests/sop-workflow.test.mjs`, TypeScript checks and the Next.js build. The database test covers atomic creation, retries, duplicate clients, dependencies, approval evidence, self-approval rejection, stale versions, archive/restore and tenant isolation. Verify the signed-in intake and preview in a browser before creating a real client workflow.
