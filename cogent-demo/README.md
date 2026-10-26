# Cogent Banking Demo

This branch records the architecture and deployment details for the Cogent Technology Associates demo.

## Public website
- Full Cogent website content
- White, gold and black visual direction
- Official Cogent logo
- Banking and support photography
- Services, COGBI, industries, partners, current news and contact details
- Gaborone office map and Zimbabwe support office reference

## Service desk
Two live demo perspectives share the same Supabase backend:
- Client portal: submit tickets, follow replies and view project progress
- Cogent staff: Kembo, Roy, Tichaona, Shelton and Kuda

Service desk capabilities include:
- Ticket creation and automatic assignment
- SLA timing, priorities and sentiment flags
- Client replies and internal notes
- Time tracking
- Project management and tasks
- Client 360
- CRM pipeline
- Invoices
- Knowledge base and automation views
- Operational reports and Cogent AI service brief

## Demo credentials
Password for all demo accounts: CogentDemo123!

Client:
- client@afc-demo.com

Cogent staff:
- kembo@cogent-demo.com
- roy@cogent-demo.com
- tichaona@cogent-demo.com
- shelton@cogent-demo.com
- kuda@cogent-demo.com

## Backend
Supabase Edge Function: cogent-demo-api
Tables are isolated with RLS enabled and direct anon/authenticated access revoked. The Edge Function uses server-side secret-key access and a demo session token.

## Hosting
Vercel project: cogent-banking-live
