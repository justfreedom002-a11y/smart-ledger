# Smart Ledger (GitHub Pages + Supabase)

A small browser-based accounting app. Static front end is hosted on GitHub Pages; Supabase provides authentication and cloud database.

## Before you start
- A GitHub account and repository.
- A Supabase project.
- Do not commit any service-role key, database password, or other secret to GitHub.
- `config.js` should contain only the Supabase Project URL and publishable/anon key. These are intended for browser use when Row Level Security (RLS) is correctly configured.

## 1. Upload the files
Upload all files/folders in this package to the root of your `smart-ledger` GitHub repository. Keep the folder structure, including `supabase/schema.sql` and `supabase/functions/create-user/index.ts`.

## 2. Configure Supabase
1. Open Supabase -> SQL Editor.
2. Paste and run `supabase/schema.sql`.
3. In Authentication -> Users, create the initial admin with email `admin@smartledger.local` and a strong password.
4. Copy the new auth user's UUID.
5. In SQL Editor run:
   ```sql
   INSERT INTO public.profiles (id, username, role, is_active)
   VALUES ('PASTE-ADMIN-UUID-HERE', 'admin', 'admin', true);
   ```
6. In Project Settings -> API, copy the Project URL and publishable/anon key.
7. Edit `config.js` in GitHub and replace the two placeholder values. Never use the `service_role` key in `config.js`.

## 3. Deploy the create-user Edge Function
The create-user function allows only an authenticated active admin to create login accounts. It uses Supabase's server-side service role secret and must never be deployed as browser code.

Recommended: use the Supabase CLI to deploy:
- Install the Supabase CLI.
- Run `supabase login`.
- Link your project: `supabase link --project-ref YOUR_PROJECT_REF`.
- Set the function secret if needed using Supabase dashboard/CLI. Supabase Edge Functions normally provide `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` automatically.
- Deploy: `supabase functions deploy create-user`.

If you do not want to install tools, you can create the function in the Supabase Dashboard's Edge Functions editor and paste `supabase/functions/create-user/index.ts`. Availability of dashboard editing/deployment may vary by current Supabase UI and plan.

## 4. Enable GitHub Pages
In the GitHub repository:
1. Open Settings -> Pages.
2. Under Build and deployment, choose Deploy from a branch.
3. Select branch `main` and folder `/ (root)`.
4. Save, then wait for the published URL.

## 5. Log in
- User ID: `admin`
- Password: the password you set for `admin@smartledger.local` in Supabase.
- Create additional users from Admin -> Create User.

## Important behavior
- Dashboard totals sum Amount and do not subtract Discount.
- Blank Amount/Discount are stored as null and contribute zero to totals.
- Admin can create/deactivate categories, create users, and delete records.
- All active users can view all records and create records.
- CSV exports include line items, category subtotals, and a grand total.

## Current starter limitations
This is a functional starter, not a fully audited financial product. Before using it for important business records, test permissions and exports with non-admin accounts. Use regular CSV backups. The app currently uses date fields in the browser's local timezone; created timestamps are stored by Supabase.
