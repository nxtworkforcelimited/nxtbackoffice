# KaguviGo leads and Microsoft Excel

The public page is `/kaguvigo`. Its form writes directly to `website_leads` in the OS database, linked to the existing Carguvi Go client. Staff with CRM access use `/app?module=leads` to filter by business, update status/notes and export a CSV. No email is sent automatically. The old Sites database remains separate; its records were checked before migration (zero signups).

## Microsoft setup still required

Installing a SharePoint connector in ChatGPT does not create a background workflow. To continuously write real rows, create a scheduled Power Automate flow with Excel Online (Business), using a workbook in SharePoint or OneDrive for Business. Availability/licensing of HTTP actions depends on the Microsoft plan.

1. Create `KaguviGo-Leads.xlsx`, with an Excel table named `Leads` and columns:
   `LeadID, Business, Name, Phone, Email, Interest, Source, Status, CreatedAt, ConsentedAt`.
   Format the contact columns as Text.
2. Generate a random secret (at least 32 characters). Set `LEADS_EXCEL_SYNC_TOKEN` as a server-only production environment variable in Vercel, then redeploy. Store the same token in the flow's secured connection/settings. Never put it in the landing page, workbook, Git, or a query string. Enable Secure Inputs/Outputs on HTTP actions.
3. Recurrence: every five minutes, concurrency **1**. GET `https://os.nxt-workforce.com/api/integrations/excel/leads` with `Authorization: Bearer <secret>`. Parse the `leads` array.
4. Process the array **sequentially**. Look up each `LeadID` in the Excel table. Add a row only if that ID is absent. Map all returned column names. Do not use email alone as the Excel key.
5. Only after a row exists successfully, POST to the same endpoint with the same Authorization header and JSON `{"lead_ids":["<LeadID>"]}`. Do not acknowledge failed writes.
6. Failures remain pending in the OS and are retried by the next run. The LeadID lookup prevents duplicate rows if a previous add succeeded but its acknowledgement failed. The API returns at most 50 pending leads per run, oldest first.
7. Verify with a clearly marked test signup: confirm one OS row, one workbook row and the OS Synced marker. Repeat the signup; it must not create another lead. Remove the test only after checking it end to end.

This is a one-way **new lead capture** sync. Later OS status/notes edits are not pushed to Excel. No Microsoft connection is claimed until the actual flow and workbook have been tested.

## Protection

The public form cannot read leads or choose a business. Consent is required and stored. Duplicate email addresses within a business do not overwrite an existing lead. Rate limits are atomic in Postgres. The integration endpoint is disabled until its token is configured, exposes only KaguviGo leads, and never permits arbitrary database operations. CSV and Excel values are escaped to prevent spreadsheet formula execution.
