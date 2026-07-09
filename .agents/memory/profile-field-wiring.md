---
name: Profile field wiring (4 layers)
description: Why a new user-profile field can silently no-op unless wired through every layer, and that also_driver must be role-gated server-side.
---

Adding/editing a `users` profile field in the companion requires wiring it through **four** layers or the write silently no-ops (no error, value never persists):

1. `User` type in `contexts/AuthContext.tsx`
2. `mapDbUser()` — must read the snake_case DB column, or the client never sees the saved value (toggle/field always shows default)
3. `updateUser()` — has a hardcoded `updates.X -> dbUpdates.snake` map; a field not listed is dropped before the PUT
4. Server `PUT /api/profile` `PROFILE_ALLOWLIST` — anything not allowlisted is stripped server-side

**Why:** the "I also drive" (`also_driver`) toggle appeared in the UI but did nothing — it was missing from mapDbUser, updateUser's map, AND the server allowlist, so the toggle read `undefined` and its write was discarded at two points.

**How to apply:** when a profile toggle/field "doesn't stick," check all four layers, not just the UI.

**Fifth failure mode — session, not persistence:** the website's companion login returns a MINIMAL user (id, email, fullName, role, truckType). A profile field can persist to the DB perfectly yet still show "Not set" after any (silent) re-login, because the session user is rebuilt from that minimal payload. Fix: hydrate the session user from the `users` row at login and lazily on `/api/auth/me` + `GET /api/profile` (excluding `password` and `role` — role is session-scoped view state). If a field "saves but reverts after re-login," suspect session rebuild, not the write path. Also: `userPayload` must strip `password` — dev-local login and hydration both carry the full `SELECT *` row.

**Security gate:** `also_driver` makes an account driver-discoverable (`/api/drivers/search` treats `also_driver = true` as driver-eligible). Allowlisting it alone lets any authenticated user self-enable driver discovery via direct API. It must be role-gated in `PUT /api/profile` to trucking-company-type accounts (accountRole `.includes('trucking_company')`), since UI role-gating is not a security control. Same caution applies to any future profile field that grants a capability/visibility elsewhere.
