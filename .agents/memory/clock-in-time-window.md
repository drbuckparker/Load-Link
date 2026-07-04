---
name: Clock-in early-time window
description: The "how early can a driver clock in before start time" rule lives in TWO places that must stay in sync.
---

# Clock-in early-time window (client note + server guard must match)

A driver may clock in only up to **15 minutes before** the job's scheduled start
time (start = `pickup_time` on the scheduled date; if no pickup_time, midnight of
that day). Enforced in two places that must be kept in lockstep:

- **Client** (`app/job/[id].tsx`, `clockInRestriction`): when too early, the
  clock-in button is replaced by the note "Clock-in is allowed up to 15 minutes
  before the start time." A 30s tick effect (only while not clocked in) re-renders
  so the button unlocks on its own at the threshold without a manual refresh.
- **Server** (`POST /api/jobs/:id/clock-in`, `TOO_EARLY`): authoritative guard.
  It validates against `startedAt`, which is the manual `custom_time`/`customTime`
  if supplied — so the manual "Adjust Clock In Time" picker cannot bypass the
  window. Client gating alone is not enough; old clients / direct API calls hit
  this.

**Why:** UI-only gating is bypassable (manual time picker, stale clients, direct
API). The number was 30 min in both places before; the user asked for 15. If you
change the window, change BOTH the client and server or they disagree.

**How to apply:** any change to the early-clock-in window means editing both the
`clockInRestriction` block and the server `TOO_EARLY` block; keep the minutes and
the user-facing wording consistent. Distinct from the 15-**mile** geofence guard
in the same server route.
