---
name: Driver/foreman invitations
description: How the companion handles email invitations vs the website's side-effects
---

# Driver/foreman invitations

The shared Neon DB has a `driver_invitations` table (carries both `contractor_id` and `trucking_company_id`, plus an `invitation_type` enum of `driver|foreman`).

**Decision:** the companion must **proxy BOTH the list read and creation** to the website's `/api/invitations` (forward with the session JWT). The local shared-DB `driver_invitations` table is NOT written by the website — verified July 2026: the website stores invitations in its own DB, so the shared table is permanently empty and a local-first read always shows "no invitations". Keep the local-table read only as a fallback for dev-local sessions.

**Why:** creating an invite has side-effects the companion cannot replicate — sending the accept-link email and owning the acceptance flow that provisions the new user. A direct DB insert would create a row that never emails anyone. And reading locally shows nothing because the website never syncs invitations down.

**Email-delivery caveat (July 2026):** invitations created via the website API return 201 and appear in its list as `pending`, but the accept email may never arrive — that's the website's mail pipeline, unfixable from the companion. The website exposes NO delete/resend/cancel endpoints for invitations, and `PUT /api/invitations/:id` returns 200 but appears to duplicate rather than update — do not call it.

**How to apply:** any new invite-like feature (anything that emails an external party a signup/accept link) should proxy the write to the website and only read state back from the shared DB. Send dual-keyed (camel + snake) payloads to the website since its handler's expected casing can't be probed live (companion JWTs in `.data/sessions.json` are frequently stale).

## Invite acceptance & account linkage are website-owned

**Self-serve signup roles (companion register screen):** trucking_company, contractor, trucking_company_contractor ONLY. Drivers and foremen must NOT be able to self-register — they only join via invite, so every driver/foreman is linked to a parent account (no standalone/orphan accounts).

**Acceptance is website-first:** the companion cannot implement invite acceptance in-app. Sending an invite proxies to the website, which emails the accept link, runs its own signup/acceptance page, and sets the linkage before syncing back to the shared DB. Linkage fields on `users`: drivers → `trucking_company_id`; foremen → `contractor_affiliation_id` (+ `foreman_activated` bool). Building an in-app invite-acceptance flow would require website API changes (out of scope for the companion project).

**Invite-screen role gating (app/invite.tsx):** a trucking_company invites drivers, a contractor invites foremen, the combined role can invite both (gate off `role.includes('trucking_company')` / `role.includes('contractor')`). Rationale: a contractor inviting a "driver" would create a driver with no trucking_company_id to attach to — the exact orphan case to avoid.
