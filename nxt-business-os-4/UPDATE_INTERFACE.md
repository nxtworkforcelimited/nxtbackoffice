# NXT Business OS interface update

This package retains the Next.js and Supabase architecture.

## Update your existing installation
1. Stop the development server with Control+C.
2. Back up your existing project folder.
3. Replace src/components/dashboard.tsx and src/app/globals.css with the matching files in this package.
4. Keep your existing .env.local file. No database migration is needed.
5. Run npm run dev and refresh the browser.

The home screen adds grouped apps, workspace metrics and quick task creation. The visual update includes a white header, dark purple module navigation, stronger text contrast and clearer app cards.

See docs/APP_CATALOG.md for actual capabilities and missing apps. This is not a full Odoo replacement yet. Social posts are planned records, not automatically published content.
