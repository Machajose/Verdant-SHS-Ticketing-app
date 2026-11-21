# School of Health Sciences Gala — Admin Ticket Workspace

Private internal workspace for gala administrators. This is not a public event advert or a coursemate booking site. Admins sign in to issue tickets, track guests, verify M-Pesa references, download QR passes, export the guest list, and check people in.

## Local visual preview
Open this folder in VS Code. Run npm install, then npm run dev. Without Supabase credentials, Vite uses a clearly labelled local preview: ticket changes stay in memory and disappear on refresh.

## Supabase setup
1. Create a project for this gala or use an existing project.
2. Run supabase/schema.sql in Supabase SQL Editor.
3. Create/invite each administrator under Supabase Authentication. Disable public sign-ups so coursemates cannot create accounts.
4. Copy .env.example to .env.local. Add the Supabase project URL and publishable/anon key.
5. Restart the Vite server. When credentials are present, the workspace requires sign-in. Magic-link requests are configured not to create new users.

All authenticated users can administer tickets, matching the current small organising team. The SQL policies deny anonymous access and do not grant delete access. Use only the public anon/publishable key in the Vite app; never put a service-role key in frontend code.

## Event details and group admissions
The event is configured in src/config/event.js: School of Health Sciences Gala at Stanley Havens (proposed), week 12 Friday, 6 PM to midnight, estimated single admission KES 900. Date, venue and final pricing are not confirmed. Admins can set the amount actually verified for a group pass while issuing it. A single QR represents one group arriving together, with a capacity of 3 or 5 guests.

## Project structure
- src/App.jsx — auth boundary and workspace composition
- src/components/layout — workspace navigation
- src/components/dashboard — ticket and event overview
- src/components/tickets — issue/preview tickets, guest list, downloads and CSV export
- src/components/checkin — QR camera/manual entry check-in
- src/hooks/useTickets.js — Supabase and local-preview ticket operations
- src/config/event.js — editable event information and ticket artwork
- supabase/schema.sql — ticket storage, unique M-Pesa reference and authenticated RLS policies

## Stack
React, Vite and Tailwind CSS for the app; Supabase Auth and Postgres for the backend. Express is not needed for the current frontend routes and database access. A private server or Supabase Edge Function can be added if payment-provider verification or webhooks are introduced.
