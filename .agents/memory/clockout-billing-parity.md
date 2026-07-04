---
name: Clock-out persistence & billing parity
description: Why the completed-job summary must mirror server earnings, and the clock-out body-drop trap.
---

# Clock-out persistence & billing parity

**Trap:** The companion clock-out route once ignored `req.body` (only set
`status`/`ended_at=NOW()`), silently dropping `loads_hauled`, end location,
adjusted time, and the billed-duration snapshot. Symptom: summary shows "0 Loads"
and earnings undercount. Any data the client sends on clock-out must be persisted
by the LOCAL DB write — `pushToWebsite` is fire-and-forget, not the persistence path.

**Billing rule (single source of truth):** 1-hour minimum, then 15-minute
segments, rounding up once 5+ min into a segment. It lives in three places that
MUST agree: `getBilledMinutes` (client display), `billedMinutesFrom` (server,
persisted to `job_runs.billed_duration_minutes` on clock-out), and any run-time
edit (PATCH must recompute billed when start/end change, or the snapshot goes stale).

**Parity rule:** Earnings/invoices (`computeJobEarnings`) bill PER RUN, selecting
minutes as `billed_duration_minutes ?? actual_duration_minutes ?? raw timestamp diff`,
then apply the rate by `rate_type` (per_load: loads×rate; flat/flat_rate/per_job:
rate; else hourly). Any UI that shows a "billed total" must use the SAME per-run
selection and the SAME rate-type branches, or the number diverges from the invoice.

**Why:** These four surfaces (display minutes, persisted minutes, edit recompute,
invoice) drifted apart and produced numbers that didn't match each other.
