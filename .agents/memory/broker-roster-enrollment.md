---
name: Broker roster enrollment
description: How drivers get onto a broker's roster; website blocks assigning non-roster drivers and has no roster-add endpoint.
---

The website only allows assigning drivers who are ON the broker's roster (assign returns 403 "That truck is not on your roster" — even for pending invitees). There is no upstream roster-add endpoint (POST /api/broker/roster is 404); the ONLY entry path is POST /api/broker/roster/invite {email, name}, which auto-links an existing LoadLink account by email (driverId filled, status "pending") and shows on GET /api/broker/roster immediately. The driver must accept through LoadLink before they're assignable.

**Why:** Aug 2026 — broker had own trucks/drivers on their account but an empty roster and couldn't assign anyone.

**How to apply:**
- Companion GET /api/broker/roster is a pre-wildcard merged route: it auto-invites the broker's own-account drivers (users.trucking_company_id = broker, or assigned_driver_id on the broker's active trucks) that are missing from the upstream roster, deduped by driverId AND email against existing roster entries (pending included), then returns the upstream roster.
- Roster truth (like users) lives in the WEBSITE's own store, not the shared DB — no broker_roster table exists there; never try to write roster rows locally.
- Pending roster entries render greyed with "Invite pending" in the assign sheet; don't make them assignable.

## Broker self-as-driver (Aug 2026)
Brokers can put themselves down as a truck's assigned driver:
- `/api/drivers/search` includes the requester's own account regardless of role (otherwise a broker typing their own name finds nobody and the vehicle save silently stores no driver).
- Roster auto-invite includes the broker's own account ONLY when they are assigned_driver_id on one of their trucks; the resulting self-invite is auto-accepted via upstream `/api/invitations/pending` + `/:id/accept` with the same JWT — but only invitations whose inviter id POSITIVELY matches the broker (never accept on missing/unknown inviter fields).
- Verified live: self-invite → auto-accept → status "accepted" → truck assignable, without touching other pending invitees.

**One driver per truck (Aug 2026):** roster truck enrichment shows ONLY trucks with `assigned_driver_id = driver` — the company-wide unassigned-truck fallback was removed because it duplicated every truck under every driver in the assign sheet. Drivers link to trucks via My Vehicles' Assigned Driver field. Also: website `GET /api/vehicles` began returning 403 to companion syncs (~Aug 2026), so trucks are effectively companion-local; watch for clobbering if that endpoint comes back.
