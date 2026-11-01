# NXT Workforce website migration

The public website and Business OS share the Next.js app. Staff and clients continue to sign in under `/app`.

## Recovered website

On 1 November 2026 we retrieved the 77 HTML documents listed in `src/lib/v6-page-map.ts`, the stylesheet, the JavaScript and 31 referenced media files. The upstream hashes and byte counts are in `docs/v6-recovery.json`. This inventory covers files referenced by the public pages. It cannot account for unpublished or unlinked media in the old site export.

The bridge reads bundled HTML from `content/v6`. Assets are served from `public/v6`. The existing clean paths work, and old `.html` links redirect to their clean equivalents. Both `/free-audits` and `/free-audit` remain available. The original pages share the top-level domain registration link. The Services page includes domain registration and monthly data protection, with separate enquiry choices.

## Release checks

- Verify the preview uses a suitable non-production Supabase environment. The two branch migrations target `website_pages` and `website_enquiries`. The NXT Backoffice project currently has `nxt_website_posts` and `nxt_website_enquiries` for the separate static website. Review tenant permissions and decide how leads from both interfaces should be managed before enabling the migration forms.
- Verify the CMS can publish and revert a draft for the NXT tenant, and that an enquiry and its CRM deal are recorded together. The existing PR handler writes them in separate calls and can acknowledge an enquiry when the CRM insert fails.
- Connect transactional acknowledgements and the consultation calendar. Review historical contact details, metadata, mobile navigation, accessibility and outstanding Odoo content against the original export.
- Run the tests, type check and production build on the exact release commit. Two current-main assertions concerning the staff recovery UI and API failed during this review. Resolve them before a production release.

## Cutover and rollback

1. Keep Render, Odoo and the old Netlify source accessible. Confirm the approved preview, registrar access, TLS certificates, and both public hostnames. Capture the working website DNS records, TTLs and previous release immediately before the switch.
2. After owner approval, move only the apex and www web records. On 1 November the apex A record was `216.24.57.1` and the www CNAME was `nxt-workforce-coming-soon.onrender.com`. Preserve Microsoft 365 records and the Business OS subdomain.
3. Check HTTPS and redirects for both public hosts, the 77 routes and both service enquiry journeys. Verify the Business OS login separately.
4. If checks fail, restore the recorded apex/www targets and previous working website deployment. Verify the Render page and email/OS records again. Retain any successfully recorded enquiries for reconciliation.
