# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

---

## Commands

```bash
npm run dev          # dev server on http://localhost:3000
npm run build        # production build (also type-checks)
npm run lint         # eslint
npx tsc --noEmit     # TypeScript check without building

# Playwright e2e tests (require running app on port 3000)
npm run test:e2e           # all tests
npm run test:masters       # registration/student tests
npm run test:questions     # question bank tests
npm run test:import-ai     # AI import flow tests
npx playwright test tests/path/to/spec.ts  # single file
```

Environment variables go in `.env.local` (not committed). Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `RESEND_API_KEY`
- `OPENAI_API_KEY`
- `REGISTRATION_TOKEN_SECRET`

---

## Architecture

### Two Supabase clients — never mix them

| Client | File | Used in |
|---|---|---|
| Browser (anon key, PKCE session) | `app/lib/supabase/client.ts` | `"use client"` components only |
| Server (service role, no session) | `app/lib/server/supabaseAdmin.ts` | Server Components, API route handlers |

`createSupabaseAdminClient()` returns a service-role client that bypasses RLS. It **must never** be imported in `"use client"` files. All data mutations that require admin intent must validate the caller's identity **before** using this client.

### Authentication flow

1. **`AuthContext`** (`app/contexts/AuthContext.tsx`) — loads Supabase session + `profiles` row client-side. Exposes `{ user, profile, loading }` via `useAuth()`.
2. **`AppShell`** (`app/components/AppShell.tsx`) — wraps every page. On mount, reads auth state and redirects:
   - Not authenticated → `/login`
   - Already authenticated + public route → `/dashboard` (admin) or `/minhas-jornadas` (student)
   - `must_change_password` → `/alterar-senha`
   - Student on non-student route → `/minhas-jornadas`
3. **No `middleware.ts` exists.** All route protection is client-side in `AppShell`. API routes **must** enforce their own authorization; they cannot rely on `AppShell`.

### Two user tables

- **`profiles`** — one row per `auth.users` entry; `role` is either `"admin"` or `"student"`. Used by `AuthContext` and admin UI.
- **`students`** — separate table for student-specific fields (`cpf`, `phone`, `status`, `origin`). `id` matches `auth.users.id`. A student has a row in **both** tables.

### Admin API authorization (current state)

Admin API routes (`/api/admin/**`) call `createSupabaseAdminClient()` directly **without an auth check**. They are only protected by the fact that the admin UI sends the request — there is no server-side validation that the caller is an authenticated admin. This is the gap targeted by **Sprint Segurança A**.

Pattern to add at the top of every admin route handler:
```ts
import { requireAdmin } from "@/lib/server/authGuard"; // to be created

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin; // 401/403
  // ... rest of handler
}
```

### Student API authorization (current state)

Student routes use `getStudentFromRequest(request)` from `app/lib/server/supabaseStudentAuth.ts`. It:
1. Reads `Authorization: Bearer <token>` header
2. Calls `supabase.auth.getUser(token)` to validate the JWT server-side
3. Looks up the `students` table to confirm the row exists and `status !== "blocked"`
4. Returns `null` if any check fails

Client components that call student APIs must pass the Supabase session token:
```ts
const { data: { session } } = await supabase.auth.getSession();
await fetch("/api/student/...", {
  headers: { Authorization: `Bearer ${session?.access_token}` },
});
```

### Page data-fetching pattern

Every route with data follows the two-file pattern described in AGENTS.md:
- `page.tsx` — async Server Component, calls `createSupabaseAdminClient()`, passes data as props
- `page-client.tsx` — `"use client"`, receives props, handles all state and interaction

Student pages (`/meus-simulados`, `/minhas-jornadas`) are an exception: their `page.tsx` renders only the client component without server data; data is fetched client-side via `/api/student/**` endpoints using the session token.

### Migrations

All migrations live in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`. Never edit existing migrations. Every migration must be wrapped in `BEGIN; ... COMMIT;`. Run them via the Supabase dashboard or `supabase db push`.

### Public routes (no auth required)

`/login`, `/esqueci-senha`, `/redefinir-senha`, `/cadastro`, `/cadastro/confirmar`, `/primeiro-acesso`, `/alterar-senha`, `/r/[token]` (public report link).

The AppShell detects these via `publicRoutes` array and the `pathname.startsWith("/r/")` check, and skips sidebar/header rendering entirely.

### Security tokens

`app/lib/security/registrationTokens.ts` provides HMAC-SHA256 helpers used for first-access links, invite tokens, and registration confirmations. The secret key comes from `REGISTRATION_TOKEN_SECRET` env var (falls back to `SUPABASE_SERVICE_ROLE_KEY` in dev).
