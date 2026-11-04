# Manshverse

AI chat platform with multiple models, personas, analytics, and premium plans. Built with React, Vite, Supabase Auth/Postgres, Groq, and OpenRouter.

## Fresh Supabase setup

1. Create a new Supabase project.
2. Copy `.env.example` to `.env` and fill in the project URL and anon/publishable key from **Project Settings → API**.
3. Run every SQL file in `supabase/migrations` in timestamp order in the Supabase SQL Editor. This creates the initial schema and then applies the backend security and quota hardening.
4. Create the first account in Manshverse. In the SQL Editor, promote that account to admin by replacing the email below:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   where email = 'YOUR_ADMIN_EMAIL';
   ```

5. Sign out and sign in again so the new admin claim is included in the session token.
6. In **Authentication → Sign In / Providers**, keep Email enabled and turn on **Confirm email**. In **Authentication → SMTP Settings**, configure custom SMTP (Resend is one option); Supabase's built-in sender is heavily rate-limited.
7. In **Authentication → URL Configuration**, set the Site URL to `https://manshverse.site` and add `http://localhost:5173/**` and `https://manshverse.site/**` to Redirect URLs (also add your actual production host if it differs).
8. In **Authentication → Providers**, enable Google and GitHub and add each provider's client ID/secret and Supabase callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`). The app sends users back to `/auth/callback` after provider authentication.
9. Set `GROQ_API_KEY` as a server-only secret in the deployment environment for `/api/openrouter`. The AI route requires a valid Manshverse session and checks database quota limits before calling Groq. Existing OpenRouter models also require `OPENROUTER_API_KEY`.

```sh
npm install
npm run dev
```

This is an empty-start schema. No Firebase records or accounts are copied or deleted. The old Firebase project can remain as an archive; the app no longer imports or depends on Firebase.

## Deployment environment

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `GROQ_API_KEY` in the deployment provider. Keep provider keys server-only; never add a `VITE_` prefix. The server routes use the Supabase URL and anon key to verify user sessions; the anon key is safe to expose when Row Level Security is enabled. Only the Supabase anon/publishable key belongs in the browser; never expose a service-role key.
