---
name: Role-view gating for contractor-only job actions
description: Why contractor-only UI actions must gate on the active role, not just job ownership.
---

# Role-view gating for contractor-only job actions

**Fact:** In the companion, `user.role` reflects the *currently switched* single
role (session-scoped view), not the compound entitlement. So a
`driver_trucking_company_contractor` account viewing as fleet manager has
`user.role === 'trucking_company'`, and `isContractorRole` (
`role.includes('contractor') && role !== 'trucking_company'`) is **false** there.

**Rule:** Contractor-only job-management actions (e.g. MARK JOB COMPLETED) must
gate on `isMyPostedJob && isContractor`, not ownership alone. Gating on ownership
only made the button appear in the fleet/driver view of a job the account posted.
**Why:** the poster owns the job in every view, so `isMyPostedJob` can't
distinguish "acting as contractor" from "acting as fleet manager."

**Do NOT hard-enforce contractor role on the server for job completion.**
`PUT /api/jobs/:id` correctly rejects non-owners (403) but intentionally does
NOT require a contractor role. Any non-driver role can post jobs, so a pure
`trucking_company` account can legitimately own a job; a server role gate would
make such jobs impossible to complete (trapped). The role restriction is a
UI/view concern; server enforces ownership.

**Tell:** if ACCEPT JOB shows on a job the account posted, the active view is a
non-contractor role (`canAccept` requires `!isContractor`) — expected in fleet view.
