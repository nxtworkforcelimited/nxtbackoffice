# Collaboration update 0.4.0

For an existing deployment, start with **COLLABORATION_UPDATE.md**. Run only the new collaboration migration, then the manager setup script. Do not repeat the foundation migrations.

# NXT Business OS — Design 08 / v0.3

This is a source-code build, not a deployed service. Open `/demo` after local setup for sample staff/client views. Demo changes stay in browser memory.

## Upgrade from v0.2

Preserve your existing `.env.local` and database. Apply only `supabase/migrations/202610160001_business_workspace.sql` to the existing Supabase project, then run `npm ci` and `npm run build`. Do not rerun the foundation migration against an existing database. New installations require both migrations in filename order. Back up production before applying migrations.

The migration gives existing staff their previous operational capabilities. Finance, payroll and manager approval start owner-only; the owner can grant capabilities individually in Permissions. Existing approved content is returned to manager review.

## Implemented in this release

- Design 08 white/lavender staff workspace and client portal with one sign-in and membership-based access.
- CRM, delivery records, documents, social calendar, manager then client approvals, shared comments and client requests.
- Individually assigned staff capabilities enforced by database row-level policies.
- Quotes, invoice conversion, line-item/tax calculation, USD/ZWG/GBP/AUD, manual bank payments, receipts, printable documents and client invoice visibility.
- Recurring monthly invoice drafts generated on demand with duplicate-period protection. Reminders are prepared text; no scheduled delivery worker exists yet.
- Zimbabwe payslip calculation from explicitly configured, verified rules with validity dates. Payslips retain the rules used for calculation.
- SMS drafts; Phone, EcoCash and Omari show coming-soon states.

## Connections and production work still required

Odoo API credentials and mapping (exchange rates plus invoices/accounting), social publishing and platform analytics, Mailchimp, SMS delivery, payment gateways and deployment are not connected. External website/Mailchimp shortcuts do not implement SSO. No automatic payment collection or background recurring/reminder jobs are enabled.

Payroll needs current rules verified by your payroll adviser for each currency and period before use. Mixed-currency payroll apportionment, bank exports and payment execution are not implemented. Invoice generation is not a certified Zimbabwe fiscalisation integration. Company billing details and statutory document requirements need configuration before issuing production invoices.

Homepage partner logos have not been updated; supplied image paths were unavailable and need reattachment. Design 08 is implemented from the recorded brief; no original reference image was available in this session.

## Verification

Production build and TypeScript checks passed. Database tests execute both migrations in PGlite and exercise tenant/client isolation, approval order and locking, invoice calculation, duplicate/overpayments, recurrence idempotency and missing payroll configuration. These do not replace testing against your deployed Supabase instance. Browser visual QA and connected-service end-to-end tests remain outstanding.

---

Previous setup reference follows (release notes above supersede conflicting capability descriptions).

# NXT Business OS

Phase-one foundation for NXT Workforce Limited. Editable Next.js App Router + TypeScript application, Supabase Auth, PostgreSQL with row-level security, and private Supabase Storage. Purple #3C3489, lavender and white; Arial interface.

## Upgrade from the first version

The redesigned interface is version 0.2.0. For an existing installation, stop the development server with Ctrl+C, replace only these two files from this package, and run `npm run dev` again:

- `src/components/dashboard.tsx`
- `src/app/globals.css`

Keep your existing `.env.local` and all Supabase data. No database migration or new dependency is required. Do not rerun the foundation migration or bootstrap. The two-file update changes the interface and preserves the existing API integration and access rules.

The home screen is now an app launcher. CRM, Projects and Tasks include board/list views; Social Planner includes a navigable monthly calendar, workflow board and list; Contacts and Documents include cards/list views. Search, client/status filters and record-detail dialogs are available. Reporting has a dedicated client portfolio table. The client portal has its own permitted app set. Actual records and totals still come from Supabase.

## Start here

1. Install Node.js 22 LTS or newer supported LTS.
2. Open this folder in Visual Studio Code.
3. Run `npm ci`.
4. Run `npm run dev`.
5. Open http://localhost:3000/demo to explore fictional data immediately. Demo changes exist only in browser memory and disappear on refresh. It never accesses Supabase.
6. Follow the Supabase setup below for real accounts and durable records.

The app does not silently substitute demo records for missing real data. `/app` requires an authenticated account and workspace membership. `/demo` is a separate, public demonstration route with fictional records only.

## Supabase setup

1. Create a new Supabase project in your account, selecting an appropriate region.
2. Open its SQL Editor and run `supabase/migrations/202610140001_foundation.sql` once on the new project. The migration includes tables, indexes, constraints, policies, audit triggers and a private file bucket. It is transactional and not intended to be rerun over an existing installation.
3. Copy `.env.example` to `.env.local`. Set the project URL and **publishable key** from Supabase project settings. Do not put a service-role or secret key in these variables. No service-role key is used by this application.
4. Set `NEXT_PUBLIC_APP_URL` to your application origin. It documents the expected deployment URL; redirects currently use the incoming request origin.
5. In Supabase Authentication settings disable public sign-ups for the initial internal rollout. In Authentication > Users create the owner's password account. Use a strong temporary password and communicate it securely; the foundation has no email invitation or password-recovery UI.
6. In `supabase/bootstrap.sql`, replace `REPLACE_WITH_OWNER_EMAIL` with that exact Auth email and execute the script once. This creates NXT Workforce Limited, owner membership and its internal subscription record. No employees or clients are preloaded into production.
7. Restart `npm run dev`. Open `/login` and sign in. The dashboard will be empty until records are created.
8. Create client records through Clients. For more staff or client logins, create an Auth user then use `supabase/provision-member.sql` with the real tenant/user/client UUIDs. Client memberships require a client in the same tenant. These are real accounts, not the demo toggle.

## Daily use

- **Clients:** create clients and update active/inactive state.
- **Sales pipeline:** create USD opportunities and change pipeline stage using the card dropdown.
- **Projects:** create projects, set due dates, change status and explicitly share at creation.
- **Tasks:** create tasks, set due dates, update status and mark complete from the overview.
- **Social planner:** compose captions, assign a channel and planned date, change workflow state. This is planning only; it does not publish to social networks or schedule a background job.
- **Documents:** upload PDF, PNG, JPG or TXT, up to 10 MB. Set client visibility at upload. Downloads use expiring signed URLs from a private bucket. Signed links last 60 seconds; anyone holding one can use it until expiry.
- **Reports:** live workspace totals and CSV export. Opportunity values are not invoiced revenue.
- **Client portal:** same `/login`, automatically restricted by membership. Clients can view shared projects, tasks, posts and documents and download authorized files. They cannot change records, see CRM opportunities, browse other clients or manage staff.

Record creation and status changes are implemented. Full field editing, deletion/archive workflows, task assignment UI, notifications, approval comments, self-service invites, password recovery, social publishing, invoices and payment processing are subsequent phases. Task project/assignee relationships exist in the schema for extension. Users currently have one role per workspace. Staff can manage all operational records within their workspace.

## Deploy with Vercel and Supabase

1. Create a private Git repository and push this folder, excluding `.env.local`, `node_modules` and `.next` (already ignored). Keep the lockfile.
2. Import the repository into Vercel. Select Next.js, Node.js 22, install `npm ci`, build `npm run build`.
3. Add the three environment variables from `.env.example`, using your real Supabase project and deployed application URL. Set them for the intended production/preview environment, then redeploy. Public Supabase values are embedded at build time.
4. In Supabase Auth URL Configuration set Site URL to your deployed HTTPS origin. Add only actual trusted redirect origins if you later enable email links. The initial password sign-in needs no callback route.
5. Run the migration/bootstrap against production if not already done. Use a separate Supabase project for development/testing.
6. Test with separate owner, staff and client users. Confirm a client can see only records explicitly shared with their client company. Confirm revoked membership removes access. Verify upload and download using a real file.
7. Connect your domain and HTTPS via your hosting provider. Configure backups and restore procedures in Supabase before relying on this for business records.

Alternative Node hosting: `npm ci && npm run build && npm start` behind an HTTPS reverse proxy. Preserve the original Host/Origin and forwarded protocol. Password sign-in and mutations enforce same-origin requests. A static-only host cannot run this authenticated application.

No cloud project, domain, Auth account or live deployment was created by this deliverable. Supabase configuration is required for the live backend. It is genuine Next.js source, not a replacement runtime or an Odoo extension.

## Quality checks

```sh
npm run typecheck
npm test
npm run build
```

`npm test` executes the actual SQL migration in embedded PostgreSQL (PGlite), with minimal Auth/Storage table shims, and checks tenant separation, client sharing, write denial, composite foreign keys and storage row-level security. It is not a live Supabase integration test. Supabase Auth, email delivery, real object storage and browser interaction must be verified after project configuration. See `docs/VERIFICATION.md` for completed checks and limits.

## Source map

- `src/app/app` authenticated workspace and dashboard loader
- `src/app/login`, `src/app/auth` password authentication and sign-out
- `src/app/api` validated record mutations and private file handling
- `src/components/dashboard.tsx` responsive interactive dashboard and module screens
- `src/lib` session context, SSR Supabase client, types, validation and fictional demo data
- `src/proxy.ts` session refresh and private cache handling
- `supabase` migration and controlled account provisioning scripts
- `tests` database security tests
- `docs/ARCHITECTURE.md` boundaries, roles, schema and SaaS roadmap

Official implementation references: https://nextjs.org/docs/app/getting-started/installation and https://supabase.com/docs/guides/auth/server-side/creating-a-client .
