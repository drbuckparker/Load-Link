---
name: Job driver resolution
description: Where a job's "driver" actually lives and how to derive their trucking company
---

# A job's driver is (almost always) the approved job_assignment, not jobs.driver_id

`jobs.driver_id` is usually NULL. Haulers apply/are assigned via the
`job_assignments` table, and even a completed job commonly has `driver_id` NULL
with an `approved` assignment holding the real hauler. Many of these "drivers"
are actually `role = trucking_company` users.

**How to resolve the driver for display:** prefer `jobs.driver_id` if set, else
the best `job_assignment` — `approved` first, then most recent still-active
(exclude rejected/withdrawn/cancelled/expired). Order by
`(status='approved') DESC, approved_at DESC NULLS LAST, created_at DESC`.

**"Trucking company they work for":** `COALESCE(NULLIF(parent.company,''),
NULLIF(driver.company,''))` where parent = the user whose id =
`driver.trucking_company_id`. A real driver has a parent company; a
trucking_company/owner-operator uses their own `company` (may be empty).

**Why:** chat header and Leave-a-Review both showed placeholder "Driver" /
"Independent Owner-Operator" because `GET /api/jobs/:id` only returned
`contractor_name` and both screens keyed off `jobs.driver_id`/`driver_name`,
which were null. Any screen needing the driver identity for a job must go
through assignment resolution, not `jobs.driver_id` alone.

**How to apply:** when a UI needs the hauler's name/company for a job, ensure
the feeding endpoint resolves via assignments; `/api/jobs/:id` now returns
`driver_name` + `driver_company` this way, and it also returns `assignments[]`
with `driver_full_name`/`driver_company` for client-side fallback.
