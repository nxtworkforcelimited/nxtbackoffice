# Native live Master Tracker

Open Projects → Master Tracker · Internal. Tasks, approvals and risks now load and open directly in NXT Business OS. Search, project, owner/support, status and focus filters operate on the live records. Record details show notes, actions, evidence, acceptance checks and linked dependencies/approvals. The original Projects workspace remains the default and is unchanged.

This preserves the source master tracker's read-only behaviour. The three team trackers remain the systems of record. No task writes, approval decisions, file access, duplicate data import or database migration is introduced. The old launch hub is replaced; reviewing these records no longer requires separate tabs.

## Server access

`GET /api/master-tracker?workspace=<id>` resolves the real Supabase user and current membership on every request. Only owner/admin/staff in the configured NXT workspace may proceed. Client, anonymous, missing membership, unknown role, other tenant and revoked membership requests fail before the source feed is contacted. All responses are private/no-store and vary by Cookie. A client cannot bypass this through a direct API request or a modified workspace query.

The Business OS server calls one fixed HTTPS destination: `/api/business-os-feed` on the existing Managing Director Master Tracker Site. Its existing Sites audience is unchanged. Sites dispatch validates its service bearer token; the application endpoint additionally requires a separate strong feed secret and the configured workspace. It accepts GET only, exposes an allowlist of task/approval/risk fields and omits library files, briefs, source credentials and visitor identity.

Configure these server-only production variables through hosting controls:

- `MASTER_TRACKER_WORKSPACE_ID`
- `MASTER_TRACKER_SITES_TOKEN`
- `MASTER_TRACKER_FEED_SECRET`

The source Site uses `BUSINESS_OS_WORKSPACE_ID` and `BUSINESS_OS_FEED_SECRET`. Never use `NEXT_PUBLIC_` for connection credentials. Tokens and shared secrets are absent from source, the browser bundle and API responses. Redirects are never followed. The response shape and expected three source IDs are validated before returning data to the browser.

## Refresh and failure handling

Refresh runs immediately, manually and every 30 seconds while the page is visible; returning to the tab also refreshes. Requests are aborted on unmount/workspace change, and overlapping refreshes are suppressed. Source failures are explicit and exclude that source's records; incomplete portfolio totals show a dash. A whole-feed/network failure retains the last successful snapshot with a stale-data warning. Authentication/access failures clear the snapshot and open details immediately.

The public `/demo` route uses only fictional records and never calls the real feed. Client preview hides and unmounts the entire submodule.

## Verification

Business OS production build and TypeScript pass. All 112 tests pass, including membership/workspace isolation, revocation, live changes between refreshes, partial failures, duplicate source identifiers, redirect denial, malformed payloads and credential filtering. Source tracker tests cover its separate service authorization and read-only response, existing visitor permissions and the hosting runtime. Browser checks cover native lists, detail dialogs, filters, Projects preservation and client hiding. Live source counts are checked separately without editing production records.
