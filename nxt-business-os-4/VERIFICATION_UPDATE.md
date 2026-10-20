# Version 0.7 verification

Production Next.js build and TypeScript passed. All 27 PGlite database tests passed.

New verification covers shared staff access without HR/payroll disclosure, all-staff task edits with protected creation/assignment/archive/deletion, shared ticket visibility with Adrian/owner-only updates/comments, subscriptions requiring trial/renewal dates, expense approval locks and journal posting, balanced immutable journals, purchase-order authorisation and invoice issue/payment posting with tax separated from revenue.

Older tests run against the earlier upgrade before applying the revised rules; the final tests then apply upgrade-finance-access.sql and apply-access-rules.sql and verify the new access model.

The test database uses Auth/Storage shims. These checks do not verify live Supabase, real account credentials, storage transfers, production scheduling, email delivery or browser screen interactions. Browser verification was unavailable; no live deployment or email was performed.


## v0.8 device register
- Production build and TypeScript passed.
- 28 database tests passed, including register management rights, staff/client isolation, cross-workspace ticket links, duplicate asset tags, protected history and retirement.
- Browser and live production verification have not been performed.
- Run upgrade-device-register.sql once before deploying this source.


## Tickets and back-office builds
29 database tests passed; production build passed. New coverage: staff ticket submission linked to builds, IT-only build updates, review notes for completion, tenant isolation. Supabase migration applied to NXT Workforce. Live authenticated UI end-to-end checks not performed.
