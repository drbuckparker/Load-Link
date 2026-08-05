---
name: Companion session persistence
description: How companion app sign-in sessions survive deploys, and the traps around them
---

The companion server's bearer tokens map to website JWTs in an in-memory map mirrored to `.data/sessions.json` AND a `companion_sessions` DB table (token PK, entry jsonb).

Rules learned the hard way (Aug 2026):
- **Deployed filesystem is ephemeral** — the JSON file alone wipes on every autoscale cold start, logging everyone out. The DB table is the durable store; it's loaded into memory at boot.
- **Slim session entries before persisting**: session `user` objects can carry multi-MB base64 `profile_image_url`; unslimmed, sessions.json hit 436MB and the jsonb insert overflowed. Strip string fields >100KB — `/api/auth/me` re-hydrates the user from the users table anyway.
- **DB sync must be upsert-only** — a "delete rows not in my memory" sync deletes sibling instances' fresh sessions under autoscale. Explicit deletes only on logout (by token) and account deletion (by token + `entry->>'userId'`); a 60s sweep evicts in-memory sessions whose DB row vanished (cross-instance revocation); 90-day TTL cleanup at boot.
- **Client must not wipe stored credentials on transient failures**: silent relogin distinguishes 'invalid' (401/403 → real sign-out) from 'transient' (network/5xx → keep cached user signed in). Wiping on any failure was forcing users back to the sign-in screen.
