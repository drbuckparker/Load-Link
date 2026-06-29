---
name: Truck double-booking enforcement
description: Server-side guard preventing a truck being 'approved' on two date-overlapping active jobs — what it covers and the deliberate gaps.
---

# Truck double-booking enforcement

Server-side enforcement blocks a truck (vehicle) from being `approved` on two active jobs whose working-day sets overlap. Enforced at the three write paths that can flip an assignment to approved / attach a vehicle (job accept auto-approve, assignment approve, assignment vehicle change). Date overlap uses the weekend-aware working-day expansion shared with the calendar.

**Driver guard added (parallel to truck guard):** `findApprovedDriverConflicts` + `driverConflictMessage(self)` mirror the truck functions but key on `driver_id`. Wired into the TWO paths where a driver becomes approved — job accept auto-approve (checks `auth.userId`, self-facing message) and assignment approve (now also SELECTs `driver_id`, contractor-facing message). NOT on vehicle-change (driver doesn't change there). Same scope/caveats as truck guard below (only `approved` blocks; concurrency race + cross-writer/website paths NOT closed). Overlap is day-level on purpose — these are day-bookings, no time-of-day slotting.

**Fleet exemption (trucking companies are NOT solo drivers):** the driver guard models "one human can't be in two places". A trucking company runs a FLEET — different trucks, different drivers — so it CAN legitimately have different trucks approved on overlapping days. `isFleetAccount(userId)` = `users.role` contains `'trucking_company'` (covers compound roles `driver_trucking_company`, `trucking_company_contractor`, etc.). For fleets the driver-level guard AND the driver-level half of auto-withdraw are skipped — they pass `driverIds=[]`; only the per-truck guard/withdraw (by `vehicle_id`) still applies, so the SAME truck still can't double-book. Solo `driver` accounts are unaffected. **Why:** the original driver guard wrongly rejected a whole fleet application when it picked a DIFFERENT truck than one already booked.

**Why this exists:** before this, conflict detection was read-only UI (a `vehicle-conflicts` endpoint) and never enforced, so the same truck could be approved on overlapping jobs. replit.md *claimed* "conflict re-check" existed but it was not implemented — doc/code drift.

## Deliberate scope decisions (be consistent)
- **Only `approved` blocks, not `pending`.** Plain applications stay free; a truck is only "booked" once approved. Pending apps are caught later, at approval time. **Why:** multiple drivers/trucks can apply to the same job; blocking at apply-time would be wrong.
- **Auto-approve must check the full set that will become approved**, not just the trucks in the request — the accept flow flips ALL of the driver's pending assignments on that job to approved. Checking only the request payload lets a pre-existing pending row with a conflicting truck slip through.
- **Concurrency race is knowingly NOT closed.** All three paths do check-then-write without a transaction/lock, so two simultaneous approvals of the same truck on overlapping jobs could both pass. Accepted for a low-concurrency, single-contractor manual-approval workflow. If hardening is ever needed: wrap check+write in a txn with `pg_advisory_xact_lock(hashtext(vehicle_id))`. Do not assume the invariant holds under true concurrency.

## Two-sided model: guard (block) + auto-withdraw (cleanup)
The double-booking feature now has TWO complementary halves — touching one without the other leaves a broken UX:
- **Guard** (above): blocks approving a truck/driver already `approved` on an overlapping job (409).
- **Auto-withdraw**: `withdrawConflictingPendingApplications(targetJobId, vehicleIds[], driverIds[], auth)` runs AFTER a truck/driver becomes approved (manual assignment-approve + accept-route auto-approve). It flips that same truck's/driver's still-`pending` apps on OTHER overlapping active jobs to `withdrawn`, notifies the applicant (in-app `notifications` row, type `general`, + push), and reopens any other job left with no active applicants.
- **Why:** without it, the loser's pending apps linger in OTHER contractors' applicant lists; those contractors click Approve and only ever hit the guard's 409 ("already booked"). Auto-withdraw clears the dead applications so that never happens.
- **How to apply:** the withdraw UPDATE is conditional (`AND status='pending' RETURNING id`) so it never clobbers a concurrent approval; only RETURNING'd rows get notified/reopened. Reopen is guarded to `status IN ('open','pending')` so an accepted/in_progress job is never demoted. Matches the local withdraw routes: NO pushToWebsite (shared-DB write is the source of truth; sync.ts withdrawnGuard keeps it from reverting). Same concurrency caveat as the guard — not transactional, acceptable for the single-contractor workflow.

## Note: pre-existing double-bookings are not auto-cleaned
The guard only prevents NEW dupes; it never modifies existing approved assignments. So overlapping approvals created before the guard can persist in the data. Detecting/cleaning them is a separate, user-authorized data fix (run `findApprovedTruckConflicts`-style query, confirm with the user, then un-approve the losing assignment) — not something the guard does.

## Find Jobs availability hide filter (GET /api/jobs)
The driver/browse "available jobs" list hides a job when any: (a) fully crewed (approved >= trucks_needed), (b) caller is already an approved truck on it, (c) application cap reached and caller hasn't applied. **Decision:** (a) hides for EVERYONE including the contractor who posted the job; (b)/(c) stay contractor-exempt so a poster still sees their own NOT-yet-full postings.
**Why:** a fully-staffed job is no longer "available", so it should drop out for all viewers (was previously visible to the poster because the whole hide block was gated by `contractor_id != caller`). The demo compound-role account posts AND applies, which surfaced this.
