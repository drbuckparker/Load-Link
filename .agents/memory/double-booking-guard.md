---
name: Truck double-booking enforcement
description: Server-side guard preventing a truck being 'approved' on two date-overlapping active jobs — what it covers and the deliberate gaps.
---

# Truck double-booking enforcement

Server-side enforcement blocks a truck (vehicle) from being `approved` on two active jobs whose working-day sets overlap. Enforced at the three write paths that can flip an assignment to approved / attach a vehicle (job accept auto-approve, assignment approve, assignment vehicle change). Date overlap uses the weekend-aware working-day expansion shared with the calendar.

**Driver guard added (parallel to truck guard):** `findApprovedDriverConflicts` + `driverConflictMessage(self)` mirror the truck functions but key on `driver_id`. Wired into the TWO paths where a driver becomes approved — job accept auto-approve (checks `auth.userId`, self-facing message) and assignment approve (now also SELECTs `driver_id`, contractor-facing message). NOT on vehicle-change (driver doesn't change there). Same scope/caveats as truck guard below (only `approved` blocks; concurrency race + cross-writer/website paths NOT closed). Overlap is day-level on purpose — these are day-bookings, no time-of-day slotting.

**Why this exists:** before this, conflict detection was read-only UI (a `vehicle-conflicts` endpoint) and never enforced, so the same truck could be approved on overlapping jobs. replit.md *claimed* "conflict re-check" existed but it was not implemented — doc/code drift.

## Deliberate scope decisions (be consistent)
- **Only `approved` blocks, not `pending`.** Plain applications stay free; a truck is only "booked" once approved. Pending apps are caught later, at approval time. **Why:** multiple drivers/trucks can apply to the same job; blocking at apply-time would be wrong.
- **Auto-approve must check the full set that will become approved**, not just the trucks in the request — the accept flow flips ALL of the driver's pending assignments on that job to approved. Checking only the request payload lets a pre-existing pending row with a conflicting truck slip through.
- **Concurrency race is knowingly NOT closed.** All three paths do check-then-write without a transaction/lock, so two simultaneous approvals of the same truck on overlapping jobs could both pass. Accepted for a low-concurrency, single-contractor manual-approval workflow. If hardening is ever needed: wrap check+write in a txn with `pg_advisory_xact_lock(hashtext(vehicle_id))`. Do not assume the invariant holds under true concurrency.

## Note: pre-existing double-bookings are not auto-cleaned
The guard only prevents NEW dupes; it never modifies existing approved assignments. So overlapping approvals created before the guard can persist in the data. Detecting/cleaning them is a separate, user-authorized data fix (run `findApprovedTruckConflicts`-style query, confirm with the user, then un-approve the losing assignment) — not something the guard does.
