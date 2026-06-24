---
name: Calendar/fleet cross-tenant truck scoping
description: Why fleet (trucking_company) calendar/dashboard views must filter assignments to the viewer's own trucks — a shared job carries other companies' trucks.
---

# Calendar/fleet view must scope to the viewer's own trucks

A single job can carry job_assignments for trucks owned by DIFFERENT trucking companies (e.g. a contractor posts a job and approves both his own truck and a subcontractor's truck). Any fleet (trucking_company) view that lists "my trucks' bookings" must filter assignments to the viewer's own trucks (`trucks.trucking_company_id === viewer userId`).

**Why:** the trucking_company branch of the calendar query returns every job where ANY of the viewer's trucks is assigned. If the handler then expands one row per assignment on that job without re-filtering by truck owner, it surfaces OTHER companies' trucks as if they were the viewer's fleet. This caused a real report ("that truck is Calvin's") — a subcontractor's truck showed in another company's Fleet Manager calendar.

**How to apply:**
- Distinguish the three viewer modes by active session role: `contractor` (job poster — SHOULD see all assigned trucks incl. subs), `trucking_company` / fleet (MUST see only own trucks), `driver`.
- When scoping a fleet view, filter not just the assignment rows but every per-job array derived from them (vehicle list shown in modals, active clock-in runs, etc.) — each is a separate potential cross-tenant leak.
- Compound accounts (e.g. `driver_trucking_company_contractor`) switch their active session role to a single value; key off that active value, not the original compound string.
