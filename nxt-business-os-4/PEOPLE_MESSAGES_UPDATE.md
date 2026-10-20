# Employees, leave and client messages

## Install on the existing system
1. Back up your Supabase database using your normal process.
2. In Supabase SQL Editor, run only `supabase/migrations/202610200001_people_messages.sql` once. Existing foundation, business and collaboration migrations must already be installed. Do not rerun those older migrations.
3. Deploy this project folder to the existing Vercel `nxt-business-os` project. Preserve its environment variables.
4. Sign in as Nyasha. Open Employees to add employee details, bank details, birthdays and private CV/ID documents. Open an employee and save monthly gross salary with its effective date. Annual equivalent is monthly salary multiplied by 12.
5. Under Permissions, give payroll access only to trusted HR/payroll managers. Owners retain access. Ordinary staff can use Leave Requests for their own requests; payroll managers can review other staff requests. A second authorised manager must review an owner's own leave.
6. Client accounts now see Messages instead of Quotes & Invoices. Staff with delivery permission can choose a client and reply. Messages refresh every ten seconds while open.

## What is included
- Employee creation/editing and active/inactive status; bank, contact, birthday and start-date fields.
- Effective-dated gross salary history; annual equivalent display.
- Private CV, ID, contract and other uploads, PDF/JPG/PNG/DOCX, maximum 10 MB. Downloads use short-lived signed links.
- Leave submission, approval/rejection notes, own pending request cancellation, status tracking.
- Persistent client-company message threads isolated by workspace and client.
- Client finance access removed in database policy, including invoice payment visibility through its parent invoice. Staff finance access remains.

## Limits
Employee records do not create login accounts. Leave requests use the signed-in staff identity. Leave balances, accruals, public holidays and pay deductions are not calculated. Annual salary equivalent excludes variable pay. Salary records do not yet feed a separate payroll application automatically. Existing payroll calculation safeguards remain unchanged.
Messages are in-app only; this update does not add email delivery. Existing notification email setup still needs its cron authorization mismatch resolved. Incomplete file uploads remain labelled incomplete and can be retried; document deletion/replacement is not provided in this release.

## Verification
TypeScript and production build checked. Database tests cover staff/client isolation, private employee storage, client invoice removal, message reply visibility and leave review permissions. Live Supabase/Vercel deployment and end-to-end browser testing have not been performed here.
