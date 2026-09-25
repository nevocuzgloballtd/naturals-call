# CallFlow — Supabase frontend

This version uses Vite + Supabase JS. It is designed for Vercel environment variables.

## Vercel environment variables
Add these to the Vercel project:

- `VITE_SUPABASE_URL` = Supabase Project URL
- `VITE_SUPABASE_ANON_KEY` = Supabase publishable/anon key

Do **not** use the Supabase `service_role`/secret key in the browser or in Vercel frontend variables.

Redeploy after saving the variables.

## Local
```bash
npm install
npm run dev
```

## What is connected now
- Supabase email/password authentication
- Profiles
- Saved numbers CRUD
- Call history stored in `calls`
- Dashboard counts from Supabase
- Billing transaction list from Supabase
- Workspace settings saved to `profiles`
- RLS-backed user isolation

The current call button creates a Supabase call record and completes it as a demo call. It does **not** place a real phone call yet.

## Next backend layer
Supabase Edge Functions should handle the real provider connection:
- `make-call`
- `call-webhook`
- `provider-balance`
- later: recharge/payment webhook

Provider secrets stay in Supabase Edge Function secrets, not in Vercel/frontend code.
