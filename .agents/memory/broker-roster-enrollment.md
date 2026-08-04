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
