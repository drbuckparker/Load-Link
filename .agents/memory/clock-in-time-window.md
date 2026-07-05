---
name: Clock-in timing rule (24/7 on the job day, no time-of-day window)
description: There is intentionally NO "N minutes before start" clock-in window; the pickup time is informational. Only a lenient day-level backstop + the geofence gate clock-in.
---

# Clock-in timing: 24/7 on the scheduled day, pickup time is informational

There is **no time-of-day clock-in window**. A driver can clock in at ANY hour on
a job's scheduled day. The `pickup_time` (e.g. "5:00 PM") is the scheduled start
shown to drivers — informational only, **never a hard gate**.

**Why:** the operator (Parker Trucking) wants "24-hour-a-day acceptance —
whenever somebody wants to start a job, they should be able to." An earlier design
blocked clock-in until 15 min before `pickup_time` (enforced on both client and
server via `parsePickupTime` + an untrusted `tz_offset` wall-clock reconstruction).
That was removed: it fought the product intent AND the tz reconstruction was
fragile (mixed-format pickup strings + spoofable/absent offset caused both false
blocks and the original "clock-in opens Monday" style bugs).

**The only timing guards that remain:**
- **Client** (`app/job/[id].tsx`, `clockInRestriction`): gates by scheduled WORK
  DAY only (via `getJobDateRange`, whose day-1-is-always-included rule means a
  Sat/Sun job is available on that exact day, not slid to the next weekday). No
  time-of-day branch. This is UX, not security.
- **Server** (`POST /api/jobs/:id/clock-in`): a lenient DAY-level backstop —
  reject (`NOT_STARTED`) only if the clock-in instant is a full day or more before
  the scheduled day's UTC midnight (`scheduledDayUTC - 24h`). The 24h slack means
  no real timezone can wrongly block a legitimate same-day clock-in; clocking in
  late is always allowed. Deliberately does NOT replicate the client's exact
  working-day/timezone logic — doing so would require the untrusted `tz_offset`
  local-day reconstruction we removed.
- **Geofence** (same route): the real guard — must be within 15 miles of pickup,
  dropoff, or the route between them.

**Accepted tradeoff:** the server backstop allows a ~24h-early window (the prior
calendar day) for an already-approved driver who is physically on site. Code
review flagged this as a medium business-rule gap and wanted strict server-side
day membership; we deliberately declined — it conflicts with the user's
permissiveness ask and reintroduces the fragile tz logic. The geofence + approved
assignment are the real controls.

**How to apply:** do NOT reintroduce a "minutes before start" window. `pickup_time`
is display-only for clock-in. If a future ask needs stricter day enforcement,
derive the driver's local day from a trusted source (not the raw request body) or
keep the lenient UTC-slack approach — never re-add the 15-min tz_offset guard.
