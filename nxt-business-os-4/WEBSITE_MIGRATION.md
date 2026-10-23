# NXT Workforce website migration

Branch: `website-migration-v1`

This branch starts the move from Odoo-hosted pages into the existing NXT Business OS.

## Phase 1 included
- Public NXT site at `/` instead of redirecting visitors to `/app`.
- Services, Industries, About, Contact, Free Audit, Insights and Blog routes.
- Contact and Free Audit submissions stored in Supabase and mirrored into the CRM deals table.
- `website_pages` CMS table for published/draft content.
- Website Manager route in Business OS will manage this content.
- Existing staff/client OS remains at `/app`.

## Before production
1. Back up Odoo pages, forms, CRM leads, contacts, blog content and media.
2. Apply `supabase/migrations/202610230001_website_cms.sql` to the existing Supabase project.
3. Ensure Vercel has `SUPABASE_SERVICE_ROLE_KEY` and optionally `NXT_WORKSPACE_SLUG=nxt-workforce`.
4. Move every Odoo/Netlify image into NXT-owned storage and update page content to use those assets.
5. Migrate all remaining Odoo service/industry pages and native blog/insight content.
6. Connect transactional email acknowledgement and calendar booking.
7. Run end-to-end tests before pointing `nxt-workforce.com` away from Odoo.
8. Keep Odoo and the current Netlify asset host online until cutover verification is complete.
