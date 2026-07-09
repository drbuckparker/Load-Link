---
name: dev-local role entitlement vs active view
description: Why role switching must not persist users.role for dev-local sessions, and how compound-role accounts (e.g. the demo login) avoid getting trapped.
---

# dev-local role entitlement vs active view

For dev-local sessions (the local Express auth path where the session jwt starts with `dev-local:`, authenticating against the local `users` table rather than the website), the `users.role` column is BOTH the account's role-entitlement source on re-login AND, historically, where the active view was persisted. Those two uses conflict.

**Rule:** In `PUT /api/profile/role`, do NOT persist the switched role to `users.role` for ANY compound-entitled account (`allowedRolesForUser(baseRole).length > 1`), nor for dev-local sessions. Track the active view only in the in-memory session (`auth.user.role`) + `sessions.json`. The legacy website-backed persist path now only fires for genuine single-role accounts — where it's a harmless no-op (they can't switch anyway).

**Why:** Login captures `originalRole` from `users.role` and gates switching via `allowedRolesForUser(originalRole)`. The companion shares the website's DB, so `users.role` is the sole entitlement source for BOTH website-backed and dev-local logins — there is no separate upstream entitlement store. If the active view were written back, a compound entitlement like `driver_trucking_company_contractor` collapses to a single role on next login and the account is trapped. This bit BOTH the prospect demo login (dev-local) and a real website-backed compound-role account before the guard was broadened. The earlier "website-backed sessions still persist" assumption was wrong — it assumed an upstream entitlement source that doesn't exist on the shared DB.

**How to apply:** `GET /api/profile` and `GET /api/auth/me` both return the in-memory session user, so an in-session switch sticks for the UI without any DB write. The role switcher UI shows all roles regardless; the backend `allowedRolesForUser` is the real authorization gate. Keep entitlement in `users.role`, keep active view in the session.

## Surfacing entitlement to the client (accountRole)

The active view lives in `auth.user.role` (mutated by the home-page toggle / `PUT /api/profile/role`); the entitlement lives in `auth.originalRole`. To stop the Settings role screen from following the toggle, server user-responses also return `accountRole = originalRole || user.role`, and the Settings "CURRENT" badge keys off `accountRole`, not `role`. The home toggle still drives the active view via `role` and needs no change.

**Why:** without exposing `accountRole`, the client only saw `role` (the active view), so toggling the home view rewrote the Settings account type. Two gotchas that bite here: (1) `originalRole` is captured ONLY at login — changing `users.role` in the DB does NOT update a live session, so the user must sign out and back in for a new entitlement to register; (2) `AuthContext.mapDbUser` maps a fixed allowlist of fields, so any new user field (like `accountRole`) is silently dropped unless explicitly added there AND returned by every user-returning endpoint (login, register, /auth/me, GET/PUT /profile, /profile/status, /profile/role) — easiest via a single `userPayload(user, originalRole)` helper.

**How to apply:** client `getAccountRoleKey(user)` falls back to `user.role` when `accountRole` isn't one of the listed role cards, so single-role and driver-inclusive compound accounts not in the ROLES list are unaffected.

## Role-clobber via background sync (second bite)

`PUT /api/profile/role` was not the only writer: the sync engine's user upsert (`syncUser`) blindly wrote the whole session user back to the shared `users` table, persisting the session-only switched `role` and collapsing the demo account's compound entitlement AGAIN.

**Rule:** any code path that writes the session user to the `users` table must strip session-scoped/security fields first — at minimum `role`, `password`, admin/suspension flags.

**How to apply:** if a compound account's role collapses in the DB with no `PUT /api/profile/role` culprit, audit every `upsertRow("users", ...)`/UPDATE writer; repair via `UPDATE users SET role='<compound>' WHERE id=...` (or re-run the demo seed).
