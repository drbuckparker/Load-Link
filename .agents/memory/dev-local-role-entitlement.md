---
name: dev-local role entitlement vs active view
description: Why role switching must not persist users.role for dev-local sessions, and how compound-role accounts (e.g. the demo login) avoid getting trapped.
---

# dev-local role entitlement vs active view

For dev-local sessions (the local Express auth path where the session jwt starts with `dev-local:`, authenticating against the local `users` table rather than the website), the `users.role` column is BOTH the account's role-entitlement source on re-login AND, historically, where the active view was persisted. Those two uses conflict.

**Rule:** In `PUT /api/profile/role`, do NOT persist the switched role to `users.role` for ANY compound-entitled account (`allowedRolesForUser(baseRole).length > 1`), nor for dev-local sessions. Track the active view only in the in-memory session (`auth.user.role`) + `sessions.json`. The legacy website-backed persist path now only fires for genuine single-role accounts — where it's a harmless no-op (they can't switch anyway).

**Why:** Login captures `originalRole` from `users.role` and gates switching via `allowedRolesForUser(originalRole)`. The companion shares the website's DB, so `users.role` is the sole entitlement source for BOTH website-backed and dev-local logins — there is no separate upstream entitlement store. If the active view were written back, a compound entitlement like `driver_trucking_company_contractor` collapses to a single role on next login and the account is trapped. This bit BOTH the prospect demo login (`demo@loadlink.com`, dev-local) and a real website-backed account (`drbuckparker@gmail.com`) before the guard was broadened. The earlier "website-backed sessions still persist" assumption was wrong — it assumed an upstream entitlement source that doesn't exist on the shared DB.

**How to apply:** `GET /api/profile` and `GET /api/auth/me` both return the in-memory session user, so an in-session switch sticks for the UI without any DB write. The role switcher UI shows all roles regardless; the backend `allowedRolesForUser` is the real authorization gate. Keep entitlement in `users.role`, keep active view in the session.
