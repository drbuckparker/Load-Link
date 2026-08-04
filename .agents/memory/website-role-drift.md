---
name: Website role drift
description: The website keeps its OWN users record; companion role changes must be pushed upstream or broker/company endpoints 403.
---

The shared DB's `users.role` is NOT what the website gates on — the website has its own user record (visible via GET `/api/auth/user` with API key + JWT). If the companion persists a role change only locally, the app shows the new role (login overrides with DB role) while the website 403s role-gated endpoints (`/api/broker/*` → `{"error":"Broker access required"}`). Symptom: broker posts a job (POST /api/jobs proxies fine, job exists upstream) but it "disappears" because the broker jobs list can't load.

**Why:** Aug 2026 — a broker's job vanished after posting; DB said `broker`, website said `trucking_company`. Root cause: companion `PUT /api/profile/role` updated only the local DB.

**How to apply:**
- Any role persistence in the companion must also PUT the role upstream. The accepted endpoint is `PUT /api/users/:id` with `{role}` (returns full user). `PUT /api/profile` rejects `role` ("No valid fields to update"); `PUT /api/profile/role` and `PATCH` are 404 upstream.
- CAUTION: `POST /api/auth/switch-role` on the website with `{role}` may set an unexpected role (it set `driver` during probing) — do not use it.
- Diagnose drift by comparing `SELECT role FROM users` vs website `GET /api/auth/user` role; fix with the PUT above.
- Login log line `[Login] Using DB role 'X' over website-reported 'Y'` is the tell that drift exists (login now auto-heals simple-role drift; compound roles are never pushed upstream).
- Website mutation endpoints can 428 `PRIVACY_CONSENT_REQUIRED` for accounts that never accepted the privacy policy on the website — the website checks its OWN record, not the shared-DB consent columns. Clear it via website `POST /api/auth/accept-privacy-policy` with `{version}` (user JWT + API key); never consent on a user's behalf without an explicit user action.
