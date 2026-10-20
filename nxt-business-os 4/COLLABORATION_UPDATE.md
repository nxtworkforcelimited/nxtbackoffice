# NXT collaboration update 0.4.0

This package is prepared for deployment. It does not change your live site until uploaded to Vercel and the SQL is run.

## 1. Create Nyasha's account first
In your existing Supabase project, create nyasha@nxt-workforce.com under Authentication > Users. Use a private password. Manual creation does not send an invitation email. Do not share passwords or API secrets in chat.

## 2. Database update
Run ONLY supabase/migrations/202610180001_collaboration.sql in SQL Editor, once. The two earlier migrations must already be installed. This creates private attachments and a notification queue. It does not delete existing posts, requests or clients.

Then run supabase/setup-nyasha-manager.sql. It first checks both accounts exist. Nyasha becomes owner (including manager approval and permissions). hello becomes staff with content, documents, CRM and delivery access. The script removes hello's approval permission. Other pre-existing explicit capabilities remain intact. Other owners/reviewers, if any, are not removed. Confirm the output lists Nyasha as owner and hello as staff. Sign both accounts out and back in.

## 3. Deploy
Unzip this package and upload the nxt-business-os folder to the existing Vercel project, as before. Keep your existing Supabase environment variables. Never upload node_modules or an .env.local file.

## 4. Test the complete workflow
- hello creates a post for Kavi.R and saves it. The detail panel opens.
- Add images (JPG, PNG, WebP), multiple images for a carousel, or MP4/WebM video. Each file is limited to 50 MB. Add slides in their intended order; remove and re-add to change order. Uploads go directly to private Supabase storage.
- Wait for uploads to finish. Submit for review. hello cannot approve as manager.
- Sign in as nyasha@nxt-workforce.com. Open Social Planner and approve. Client review follows.
- The matching client can see the caption and media, approve, request changes and comment.
- Return to draft before changing artwork. Re-submit through manager approval afterward.
- Save a request, then add files on its card. Supported request files also include PDF, TXT, DOCX and XLSX. Requests and attachments inherit the linked client's permissions.
- Open portals refresh every 10 seconds while visible, and when focus returns. Refresh is paused while a new-record form or save is active, to protect input.

## 5. Email delivery setup (required before any emails send)
A durable queue records new requests, request resolution and social status changes. Workspace owners receive notices. After the account setup, this includes nyasha@nxt-workforce.com. No client notification emails are sent. Comments and attachment additions do not yet generate separate emails.

Use a Resend account, verify a sending domain, and create an API key. Add these Vercel server environment variables:
- RESEND_API_KEY: from Resend.
- NOTIFICATION_FROM: a sender on your verified domain, for example NXT Workforce <notifications@nxt-workforce.com>.
- SUPABASE_SERVICE_ROLE_KEY: Supabase server service-role key. Keep private; never use NEXT_PUBLIC_.
- CRON_SECRET: a long randomly generated private token.
- NEXT_PUBLIC_APP_URL: https://nxt-business-os.vercel.app

Redeploy after adding variables. Configure an authenticated scheduler to GET /api/notifications every minute with Authorization: Bearer YOUR_CRON_SECRET. Use a scheduler/hosting plan that supports that frequency. No scheduler is activated by this package. Email delivery stays inactive until configured. Do not invoke the endpoint with browser-visible secrets.

Each run sends up to 25 queued messages. Provider idempotency protects immediate retries. Check notification_outbox.last_error in Supabase for failures; after five attempts entries stop retrying. Resolve the cause before manually resetting attempts for those specific IDs. Do not reset already sent entries. Prolonged failures around delivery acknowledgement require provider-log review before retrying, because idempotency has a limited retention period.

Queued notices from testing will send once delivery is enabled. Review pending recipients and events in notification_outbox first. No actual emails were sent during development.

## Limits
Automatic social publishing is still not connected. Attachment removal unlinks the file; private orphan objects need periodic administrative storage cleanup. Standard video uploads are limited to 50 MB and may need retrying on unstable connections. The account setup does not implement email invitations. Existing legacy Documents uploads are unchanged.
