---
name: dev-local role entitlement vs active view
description: Why role switching must not persist users.role for dev-local sessions, and how compound-role accounts (e.g. the demo login) avoid getting trapped.
---

# dev-local role entitlement vs active view

For dev-local sessions (the local Express auth path where the session jwt starts with `dev-local:`, authenticating against the local `users` table rather than the website), the `users.role` column is BOTH the account's role-entitlement source on re-login AND, historically, where the active view was persisted. Those two uses conflict.

**Rule:** In `PUT /api/profile/role`, do NOT persist the switched role to `users.role` for dev-local sessions. Track the active view only in the in-memory session (`auth.user.role`) + `sessions.json`. Website-backed sessions still persist, since their entitlement comes from the upstream website on each login, not from local `users.role`.

**Why:** Login captures `originalRole` from `users.role` and gates switching via `allowedRolesForUser(originalRole)`. If the active view were written back, a compound entitlement like `driver_trucking_company_contractor` would collapse to a single role on the next login and the account could no longer switch — it would be trapped. This is exactly what the prospect demo login (`demo@loadlink.com`) relies on.

**How to apply:** `GET /api/profile` and `GET /api/auth/me` both return the in-memory session user, so an in-session switch sticks for the UI without any DB write. The role switcher UI shows all roles regardless; the backend `allowedRolesForUser` is the real authorization gate. Keep entitlement in `users.role`, keep active view in the session.
