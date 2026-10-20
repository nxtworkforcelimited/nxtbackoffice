# Application architecture

## Request flow

Browser → Next.js App Router → Supabase SSR client using the user's cookie session → Supabase Auth / PostgreSQL / private Storage.

Server components load the selected membership and query workspace records. Mutation route handlers verify the current user with `auth.getUser`, validate same-origin requests, resolve membership and validate payloads with Zod. Every database call uses the caller's session, so PostgreSQL RLS also applies. No privileged service-role key is present in app code. The cookie proxy refreshes sessions; route handlers and page loaders independently authenticate.

`/demo` is isolated fictional browser state. `/app` never reads that state. The client-preview toggle exists only in demo mode; production access follows the database role.

## Multi-tenant model

A tenant is a subscribing business. NXT Workforce Limited is the first tenant. A client is a customer of that business, not another tenant. Each account can have memberships in multiple tenants. The dashboard workspace selector chooses among authorized memberships; arbitrary URL IDs do not grant access.

| Table | Purpose and boundary |
|---|---|
| tenants | Business identity; readable by members only |
| memberships | User, role and optional client identity per tenant |
| clients | Customer directory scoped to tenant |
| deals | Internal USD sales opportunities; clients cannot read them |
| projects | Client-associated delivery work |
| tasks | Work items; optional tenant-constrained project and assignee |
| social_posts | Caption, planned date, channel and workflow state |
| documents | Metadata and immutable object path in a private bucket |
| subscriptions | Reserved plan/status/provider IDs and seat limit; privileged writes only |
| audit_events | Append-only operational record-change events; owner/admin reads |

All operational records carry `tenant_id`. Composite foreign keys ensure client/project/assignee references cannot cross businesses. Application queries also filter tenant explicitly. Client-visible records require a non-null client association. RLS allows client reads only when both the visibility flag and client membership match. Storage object reads depend on visible document metadata; storage writes additionally require staff membership. Audit events record actor, time, entity and action, without duplicating sensitive document contents.

## Roles

| Capability | Owner / admin | Staff | Client |
|---|---|---|---|
| Workspace operational reads and writes | Yes | Yes | No |
| Read own explicitly shared work | Yes | Yes | Yes |
| See CRM sales opportunities | Yes | Yes | No |
| Upload files | Yes | Yes | No |
| Download authorized documents | Yes | Yes | Yes |
| Read audit and subscription rows | Yes | No | No |
| Provision members through app | Not implemented | No | No |

Membership provisioning in phase one is a database-administrator operation. Never derive authorization from editable user metadata. A client account must reference a client belonging to the same tenant. Delete the membership to revoke workspace access; existing signed file URLs can remain valid until their 60-second expiry.

## Foundations for future subscriptions

The schema supports multiple businesses now. Billing is not active and plan/seat limits are not yet enforced. Before selling subscriptions:

1. Add verified checkout and signature-checked, idempotent billing webhooks. Only trusted server handlers may update subscription state.
2. Implement transactional tenant onboarding and seat-limit enforcement; prevent races when adding members.
3. Add audited owner/admin invitations, safe role changes and last-owner protection. Never expose a raw membership update endpoint.
4. Enforce entitlements on server mutations and scheduled jobs, not only in navigation.
5. Add payment recovery, cancellation/export/deletion workflows and business-specific settings.
6. Add pagination and database aggregates. The foundation fetches complete visible collections and is intended for a small internal workspace. Supabase's configured maximum result count can truncate larger datasets; move dashboard reports to scoped database aggregations before growth.
7. Add monitoring, rate limits appropriate to deployment, backup restore drills and automated live multi-tenant integration tests.

## Deliberate phase-one boundaries

Dates are calendar dates, not exact posting timestamps. Social publishing is not connected. Amounts are USD only. Client access is read-only. Record creation and status edits are supported; other edits use administrator SQL until expanded UI is added. Account/password lifecycle is managed in Supabase. No employee names, actual client data or business credentials are embedded. Storage uploads have file-type/size restrictions but no malware scanner; add scanning and quarantine before broad external file submission.

The current application is a deployable foundation for internal validation, not an assertion that a fully audited subscription product is ready for sale.
