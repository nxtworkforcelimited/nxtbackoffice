# Free audit confirmation and conversion setup

The live marketing website is a standalone Vercel deployment, separate from the Next.js Business OS. Do not replace it with the older Next.js export: the current deployment contains newer Google tracking and navigation changes.

On 6 November 2026, production deployment `dpl_7SMo1eFR31nNFpZD8KhBhuhh4dLK` was built from every source-file SHA in production baseline `dpl_8wJWuvAyxn2zGWh6U4bYhxYXuouY`, after verification on preview `dpl_2mwrwNEm9aYoTkwBGi46a2qtmXZJ`, with only these overlays from `scripts/standalone`:

- `public-intake.js` replaces the existing script.
- `thank-you/index.html` adds the clean `/thank-you` route using Vercel's static directory index, without changing existing rewrites.
- `thank-you.js` adds receipt-gated confirmation and Google tags.

An audit request redirects only after the existing Supabase insert returns success. Normal contact enquiries keep their inline message. Errors retain customer inputs. A blocked session-storage write leaves the confirmed inline success in place and skips tracking. The receipt contains only a timestamp and a consumed flag, expires after 30 minutes, and is marked consumed before Google loads. Direct, malformed or expired visits do not load Google. Refreshes can show the confirmation but do not load Google again. This prevents accidental duplicate page-view conversions; it is a browser convenience, not a server authentication mechanism or a guarantee against intentionally fabricated browser state.

Existing destinations are preserved: GA4 `G-K5EMQ7FDDH`, Google Ads `AW-18558377672`. No conversion label has been supplied, and no manual conversion event is invented. No names, emails, phone numbers or enquiry text are passed to Google by this change.

In Google Ads, create a website conversion using the URL method:

- Name: Free audit request
- Goal: Submit lead form
- Event: Page load
- Exact URL: `https://www.nxt-workforce.com/thank-you`
- Value: same value for each conversion, USD 50
- Count: One

The Google Ads account still needs this conversion action saved. Do not also create a manual event or import a second GA4 primary conversion for the same lead without a deliberate measurement plan. Existing ad blockers and consent choices can still prevent measurement. The USD 50 is an estimated lead value, not a customer charge.

Run `node --test tests/standalone-audit-tracking.test.mjs`. The tests cover confirmed saves, rejected saves, network failures, validation, honeypots, repeated clicks, regular contact forms, blocked storage, valid/invalid/expired receipts, and repeat page loads.

To release a future change, start from the latest production source file list, not this historical baseline. Preserve untouched file SHA references and override only reviewed files. Build a preview, verify it, then create the same deployment with target `production` on the `nxt-workforce-website` project (`prj_LjvpVQA0vzRuGDr8lxJu3WzVE9pK`, team `team_StdrHjdRdfVlidLfhy9aivYJ`). A direct promotion of the preview returned HTTP 422, so this release used the same reviewed files in a production build.
