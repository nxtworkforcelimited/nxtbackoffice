# Owner-only client portal invitations

Applied to NXT Workforce on 20 October 2026: `upgrade-client-invitations.sql`. Do not run the same upgrade again there. Future installations need this SQL after the team operations upgrade.

Use Contacts → open a saved active contact → Client portal invitation → Invite client. Save the intended email first. Only owners can invite/resend. Sending explicitly grants that client login access to this contact's shared work. Staff and other-client/workspace accounts are rejected; existing valid client logins receive a fresh password-setup link. Resend is rate-limited to one attempt per contact per 60 seconds. Every attempt is recorded without the token. “Accepted by email provider” does not prove inbox delivery or invitation acceptance.

Client opens email → Continue to password setup → enters and confirms a password of 12–128 characters → portal opens. Links use Supabase one-time verification; expired/used links need resend. The initial email-link GET does not consume the token. Password setup requires a matching short-lived server cookie and verified user session. Existing client membership visibility restrictions still apply. A contact/email edit does not revoke prior logins; remove obsolete memberships separately.

Required production environment: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, RESEND_API_KEY, NOTIFICATION_FROM, NEXT_PUBLIC_APP_URL (HTTPS). Email uses the configured sender and Resend directly; no cron is needed for invitations. Service credentials and generated setup tokens stay server-side. No new invitation emails were sent during deployment verification.

# Ticket workflow and Back Office Builds update

Tickets use four displayed stages: Not started, In progress, Under review, Complete. Existing database states remain compatible. All internal staff can submit/view tickets; ticket-capability holders and workspace owners update/assign/comment. Clients retain their existing restricted portal.

Back Office Builds: IT administrators add systems, URLs, target dates, assignees, acceptance requirements and review notes. All staff can view. Link tickets through the ticket form. Ready means build Complete plus no linked unresolved tickets; new/reopened tickets immediately make it Not ready on refresh. Review notes are required for Complete. This is a manual readiness tracker, not automatic certification or a connection to other deployments.

For a future installation, run `upgrade-backoffice-builds.sql` after operations, finance and device-register SQL. The migration has already been applied to the NXT Workforce production database on 20 October 2026; do not run it again there. New back offices built from this source include these features once their database is provisioned and IT roles assigned. Separate existing back-office repositories need their own update.

# v0.8 — Device Register

For installations where the operations and finance SQL updates already succeeded:
1. Run `supabase/upgrade-device-register.sql` ONCE in Supabase SQL Editor.
2. Complete staff setup and run `apply-access-rules.sql` last if not already done.
3. Upload this updated source into the existing `nxt-business-os-4` GitHub folder. Keep Vercel Root Directory `nxt-business-os-4` and existing environment variables.
4. Wait for Vercel Ready, sign out and sign in. Open Device Register.
5. Nyasha or Adrian can add equipment and assign a staff member. Everyone internal can view. Clients cannot access devices.
6. Under IT Tickets select a Registered device. Only Nyasha/Adrian can change an existing ticket's link. Linked tickets and resolutions appear in Device Register.

Equipment includes unique workspace asset tag, name, category, serial number, make/model, location, assignment, status, purchase date, warranty and repair notes. Every save records an immutable snapshot. Use Retired instead of deleting equipment. No automatic warranty email, purchase accounting/depreciation, or attachment upload is included.

Earlier setup instructions follow. Do not repeat SQL upgrades that have succeeded.

# NXT Business OS 0.7 — shared workspace and finance

This is an updated source package, not a live deployment. Tickets and the new apps appear only AFTER these files are uploaded to the existing GitHub project and Vercel deploys them successfully. SQL alone cannot add menus.

## Installation — existing NXT project

1. Keep a database backup and the working deployment for rollback.
2. You already reported success running `supabase/upgrade-team-operations.sql`. Do NOT rerun it. If installing on another environment, apply the four original migrations and that operations upgrade first.
3. In the existing Supabase SQL Editor run `supabase/upgrade-finance-access.sql` ONCE. It adds finance tables and revises task/ticket rules without deleting existing data.
4. Ensure the four staff Auth accounts exist: bridget@nxt-workforce.com, michael@nxt-workforce.com, tatenda@nxt-workforce.com, adrian@nxt-workforce.com. If missing, create them in Authentication > Users with unique private passwords. Manual creation does not send an invitation. Never upload passwords or private environment files.
5. Run `supabase/setup-nxt-team.sql` if staff/employee linking has not been completed. It can be rerun, but applies the older baseline permissions; always run step 6 LAST.
6. Run `supabase/apply-access-rules.sql`. It is re-runnable and implements the revised shared-access instructions. It resets staff/admin capability grants in Nyasha's workspace, then gives restricted capabilities to the specified people. It preserves the owner and client memberships. Review the result table. If Nyasha owns multiple workspaces, it stops for manual workspace selection.
7. In GitHub, open the existing repository's `nxt-business-os-4` folder and upload the CONTENTS of this package's `nxt-business-os-4` folder there, preserving all nested folders. Alternatively upload the whole folder at the repository root to replace paths under the same existing folder. Do not create `nxt-business-os-4/nxt-business-os-4`.
8. Commit the files. Vercel Root Directory stays `nxt-business-os-4`. Preserve all environment variables. Wait for the newest commit to show Ready, then use the production URL.
9. Sign all accounts out and back in. As Nyasha, confirm version 0.7 is deployed by checking the Expenses, Quotations, Purchase Orders, Subscriptions, Accounting and IT Tickets menu entries. Test separately as Adrian, Bridget, Michael and Tatenda.

## Revised access rules

| Area | Staff access | Administration |
|---|---|---|
| Employees and Payroll | Nyasha and Bridget only | Nyasha and Bridget; payroll-rule configuration remains owner-only |
| Leave Requests | Staff can submit/view/cancel their own pending leave in My Leave | Nyasha and Bridget can view/review staff leave; no self approval |
| CRM and client contacts | Everyone can view | Nyasha and Michael can create/update contacts and CRM opportunities |
| Tasks | Everyone can view and update title, description, status and due date on active tasks | Nyasha and Michael can create, assign, share, archive/restore and delete archived tasks |
| IT Tickets | Everyone can submit and view all staff tickets in the workspace | Only Nyasha and Adrian can update/assign/resolve/close tickets or post ticket updates |
| Projects, content, documents, requests and reports | Shared staff access | Existing content approvals stay with Nyasha; client permissions remain isolated |
| Expenses, quotations, invoices, purchase orders, subscriptions and accounting | Staff can view; finance staff access is assigned to everyone, allowing draft creation/editing and subscription tracking | Nyasha and Michael authorise expenses/POs, issue invoices/quotes, record financial payments and post manual journals |
| Permission settings | Nyasha only | Michael has module administration, not the owner role; HR/payroll remain private |

All staff refers to internal memberships, not client portal users. Future staff need a login, membership and directory entry; rerun apply-access-rules.sql to apply the shared staff defaults. The directory retains the previously agreed reporting lines.

## Finance apps

- **Expenses:** staff create/edit drafts with supplier, amount, currency, date and description. Nyasha/Michael approve, then mark paid. Approved amounts lock. Approval posts debit Operating Expenses / credit Accounts Payable; payment posts debit Accounts Payable / credit Cash/Bank. Drafts may be cancelled. Approved/paid expenses cannot be deleted; corrections require accounting review and offsetting entries.
- **Quotations / Invoices:** separate menu entries use the existing line-item document engine, tax field, quote-to-invoice conversion, PDF printing and manual payment recording. Staff prepare drafts; Nyasha/Michael issue and record payments. This is not an online payment gateway.
- **Purchase Orders:** staff create online drafts with item descriptions, quantities and unit prices. The database computes the total. Nyasha/Michael issue, mark received or cancel issued orders. Issued financial details lock. Print/save a PDF for the supplier. POs do not automatically create bills, send supplier email, move stock or post expenses.
- **Subscriptions:** title/service, supplier, price, currency, billing cycle, next renewal/trial-end date and active/free_trial/cancelled status. Zero-cost trials are supported. The list marks overdue dates and renewals due within seven days. Update the next due date after renewal; this release does not charge cards, roll dates automatically or send subscription reminder emails.
- **Accounting:** balanced double-entry journal register, currency/date filters, trial balance, revenue/expense totals and ledger CSV export. Accounts: Cash/Bank, Receivables, Payables, Tax Payable, Equity/Opening Balance, Sales and Operating Expenses. Invoices issued after this upgrade post receivables/revenue and separate the entered tax to Tax Payable; invoice payments post bank/receivables. No statutory tax rates are supplied or verified. Posted journals are immutable; use offsetting entries for corrections.

Accounting is a management-ledger foundation. Historical invoices/payments are NOT backfilled. Enter reviewed opening balances before relying on balances, especially when receiving payments for invoices issued before the upgrade. Bank feeds/reconciliation, multi-currency exchange gains, detailed balance-sheet reporting, period closing, fiscalisation and statutory returns are not implemented. Amounts are displayed and exported separately by currency.

## Existing features and limits

The earlier employee records, private salary history/files, client messages, notification queue and reviewed-payslip finalisation remain. Salary history still does not feed payroll automatically. Payroll requires verified rules for the currency and pay period; finalising a payslip does not execute a bank payment.

Archive removes clients/projects/tasks from working lists; Show archived allows restore. Permanent removal requires prior archive, confirmation and the relevant administrator. Linked records may block deletion. No sample clients are automatically deleted. `/demo` remains a temporary sample workspace; use `/app` for real data.

IT ticket attachments, asset inventory, SLA timers and automatic ticket emails are not included. Recommended next additions are a company-device register linked to tickets, and receipt attachments plus bank reconciliation for finance.

## Client approval email

Keep the deployed sender `NXT Workforce <alerts@notifications.nxt-workforce.com>` in NOTIFICATION_FROM. Existing RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_APP_URL and CRON_SECRET must remain configured. The scheduler must call `/api/notifications` with the matching Bearer secret.

A client contact email and the approval-email opt-in flag are stored in the existing client record. A social post moving from manager_review to client_review queues a client email. This does not email internal tasks, HR, payroll or tickets to clients. No second database is required. Email delivery and scheduler authorization have NOT been verified by this package. Test with a dedicated client address/portal account and inspect the provider log and receiving inbox. Provider acceptance is not proof of inbox placement.

## Verification

Production build, TypeScript and 27 database tests passed. Tests cover old and new permissions, task editing restrictions, ticket isolation/admin updates, trial due dates, expense locks/posting, journal balance/immutability, PO approval and invoice/payment ledger entries including tax separation. Browser verification could not run because a browser was unavailable in the runtime. Live Auth, actual Supabase, storage and inbox delivery must be tested after installation.


## Task/project files and AI Assistant

Apply upgrade-project-task-files.sql and upgrade-ai-assistant.sql after the previous upgrades. Both have been applied to the connected production Supabase project.

Tasks and Projects now have Files and master documents for saved records. Direct uploads support PDF, Office, CSV, images and MP4/WebM, up to 50 MB each. Documents supports the same formats and serves as the reusable master library. Linking a tracker does not import spreadsheet rows or create tasks automatically. Files are internal by default. Clients require a shared parent and a shared attachment; linked documents additionally require the source document shared with the same client. Uploaders and delivery managers can remove attachment links or change visibility. Removing a link retains its master. Direct file removal removes access; physical object cleanup is not implemented. Signed download links expire after 60 seconds.

AI Assistant is deployed disabled by default. Set an approved project metered-spend cap in Vercel AI Gateway before activation, choose a current text model from the live catalog, then configure server-only AI_GATEWAY_MODEL and AI_CHAT_ENABLED=true and redeploy. Vercel OIDC authenticates production; use AI_GATEWAY_API_KEY only for local or external environments. Never put credentials in NEXT_PUBLIC variables. The integration was checked against the live catalog and Chat Completions documentation; live model authentication and answers have not been tested because activation is pending budget approval.

The assistant uses session RLS and explicit client filters, never service role. It reads the newest 30 rows each of Projects, Tasks, Social Planner and Documents, with bounded descriptions. Document titles only; file contents are not ingested. It has no write tools or conversation memory. Each user has a database-enforced limit of 10 questions per hour per workspace; failed provider requests still count. Usage stores counts only, not chat content. A provider request sends the question and permitted record excerpts through AI Gateway. Review provider retention and logging settings before activation. Hard monetary limits must be set in Gateway; the application question limit is not a monetary cap.
