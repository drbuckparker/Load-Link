---
name: Driver/foreman invitations
description: How the companion handles email invitations vs the website's side-effects
---

# Driver/foreman invitations

The shared Neon DB has a `driver_invitations` table (carries both `contractor_id` and `trucking_company_id`, plus an `invitation_type` enum of `driver|foreman`).

**Decision:** the companion **reads** the invitation list directly from the shared DB (local-first read, scoped by `contractor_id = me OR trucking_company_id = me`) but must **proxy creation** to the website's `POST /api/invitations` (forward with the session JWT).

**Why:** creating an invite has side-effects the companion cannot replicate — sending the accept-link email and owning the acceptance flow that provisions the new user. A direct DB insert would create a row that never emails anyone.

**How to apply:** any new invite-like feature (anything that emails an external party a signup/accept link) should proxy the write to the website and only read state back from the shared DB. Send dual-keyed (camel + snake) payloads to the website since its handler's expected casing can't be probed live (companion JWTs in `.data/sessions.json` are frequently stale).
