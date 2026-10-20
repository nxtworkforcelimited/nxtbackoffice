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
