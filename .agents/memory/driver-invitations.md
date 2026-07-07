---
name: Driver/foreman invitations
description: How the companion handles email invitations vs the website's side-effects
---

# Driver/foreman invitations

The shared Neon DB has a `driver_invitations` table (carries both `contractor_id` and `trucking_company_id`, plus an `invitation_type` enum of `driver|foreman`).

**Decision:** the companion **reads** the invitation list directly from the shared DB (local-first read, scoped by `contractor_id = me OR trucking_company_id = me`) but must **proxy creation** to the website's `POST /api/invitations` (forward with the session JWT).

**Why:** creating an invite has side-effects the companion cannot replicate — sending the accept-link email and owning the acceptance flow that provisions the new user. A direct DB insert would create a row that never emails anyone.

**How to apply:** any new invite-like feature (anything that emails an external party a signup/accept link) should proxy the write to the website and only read state back from the shared DB. Send dual-keyed (camel + snake) payloads to the website since its handler's expected casing can't be probed live (companion JWTs in `.data/sessions.json` are frequently stale).

## Invite acceptance & account linkage are website-owned

**Self-serve signup roles (companion register screen):** trucking_company, contractor, trucking_company_contractor ONLY. Drivers and foremen must NOT be able to self-register — they only join via invite, so every driver/foreman is linked to a parent account (no standalone/orphan accounts).

**Acceptance is website-first:** the companion cannot implement invite acceptance in-app. Sending an invite proxies to the website, which emails the accept link, runs its own signup/acceptance page, and sets the linkage before syncing back to the shared DB. Linkage fields on `users`: drivers → `trucking_company_id`; foremen → `contractor_affiliation_id` (+ `foreman_activated` bool). Building an in-app invite-acceptance flow would require website API changes (out of scope for the companion project).

**Invite-screen role gating (app/invite.tsx):** a trucking_company invites drivers, a contractor invites foremen, the combined role can invite both (gate off `role.includes('trucking_company')` / `role.includes('contractor')`). Rationale: a contractor inviting a "driver" would create a driver with no trucking_company_id to attach to — the exact orphan case to avoid.
