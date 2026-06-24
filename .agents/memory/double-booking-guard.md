---
name: Truck double-booking enforcement
description: Server-side guard preventing a truck being 'approved' on two date-overlapping active jobs — what it covers and the deliberate gaps.
---

# Truck double-booking enforcement

Server-side enforcement blocks a truck (vehicle) from being `approved` on two active jobs whose working-day sets overlap. Enforced at the three write paths that can flip an assignment to approved / attach a vehicle (job accept auto-approve, assignment approve, assignment vehicle change). Date overlap uses the weekend-aware working-day expansion shared with the calendar.

**Why this exists:** before this, conflict detection was read-only UI (a `vehicle-conflicts` endpoint) and never enforced, so the same truck could be approved on overlapping jobs. replit.md *claimed* "conflict re-check" existed but it was not implemented — doc/code drift.

## Deliberate scope decisions (be consistent)
- **Only `approved` blocks, not `pending`.** Plain applications stay free; a truck is only "booked" once approved. Pending apps are caught later, at approval time. **Why:** multiple drivers/trucks can apply to the same job; blocking at apply-time would be wrong.
- **Auto-approve must check the full set that will become approved**, not just the trucks in the request — the accept flow flips ALL of the driver's pending assignments on that job to approved. Checking only the request payload lets a pre-existing pending row with a conflicting truck slip through.
- **Concurrency race is knowingly NOT closed.** All three paths do check-then-write without a transaction/lock, so two simultaneous approvals of the same truck on overlapping jobs could both pass. Accepted for a low-concurrency, single-contractor manual-approval workflow. If hardening is ever needed: wrap check+write in a txn with `pg_advisory_xact_lock(hashtext(vehicle_id))`. Do not assume the invariant holds under true concurrency.

## Note: pre-existing double-bookings in live data
The guard prevents NEW dupes; it does not clean up existing ones. As of mid-2026 live data already had trucks approved on overlapping jobs (a "Fill" + "Demo" pair overlapping ~June 30). Cleanup is a separate, user-authorized data fix, not something the guard does.
