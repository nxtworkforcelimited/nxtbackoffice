# Internal Master Tracker under Projects

Open **Projects → Master Tracker · Internal** from a signed-in staff workspace. The default **Projects workspace** still uses the existing operations component, records, filters and workflows. Home and sidebar navigation continue to open that default workspace.

The hub provides the three existing team tracker destinations (Kavi.R, Digital Safety Nest and Pack Easy), the Managing Director Master Tracker and its document library. It reuses the source tracker's eight delivery sections and explains where to find them. Live tasks, decisions, file versions, totals and edits remain in the original private trackers. No migration, copied task snapshot, service credential or new invitation is required.

## Access

The submodule is hidden for client memberships and the demo's client preview. Its catalog is loaded on demand from `GET /api/master-tracker?workspace=<id>`. The server resolves the current authenticated user and verifies owner/admin/staff membership for exactly that workspace. Anonymous requests, client and unknown roles, missing membership and workspace mismatches do not receive the catalog. Responses use private, no-store caching and vary by Cookie. Authorization errors fail closed.

The source Site independently checks its existing invitation and approved account. Business OS membership does not grant ChatGPT tracker access. This preserves the existing tracker audience. No internal project briefs or live records were copied into the public repository or client bundle.

## Integration choice

The inspected Master Tracker source (commit `12b08e5963bafffa76a7316cd291ba78cb212b2a`) sets `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`. Its live API requires its existing ChatGPT identity. Accordingly this is an internal launch hub, not an iframe or native live-data mirror. Each live destination opens in a separate tab with its existing authentication. Section buttons describe the source tabs; users select the corresponding tab after opening the tracker. No unsupported deep links are presented.

A future native live-data integration would need a separately designed, authenticated server feed and permission model. Do not reuse a visitor bypass token or expose source service credentials to the browser.

## Verification

- TypeScript and optimized Next.js production build passed.
- 107 existing and new tests passed, including tenant/client database isolation and the executable Master Tracker response handler for owner, admin, staff, client, anonymous and mismatched workspace contexts.
- Browser QA uses the public fictional demo; it does not request the real catalog or contain live project links. Actual invited staff/client sessions require a production smoke check by those users.
- No database migration, tracker access change or source tracker deployment is included.
- The existing reference shell had inherited horizontal navigation rules that placed the sidebar in document flow. Minimal reference-specific overrides restore the intended fixed sidebar/header; the dashboard design and workspace components are retained.
