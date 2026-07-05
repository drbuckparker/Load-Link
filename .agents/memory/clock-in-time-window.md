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

## Two traps that silently disable this guard

1. **`pickup_time` is mixed-format free text** — real rows hold both 12-hour
   strings ("9:00 AM", "06:30 AM") and bare 24-hour ("07:00"). Naive
   `str.split(':').map(Number)` turns "45 AM" into `NaN` → invalid Date → the
   too-early comparison silently never fires. Both sides now parse via
   `parsePickupTime` in `shared/time.ts` (the single source of truth — handles
   AM/PM + 24h, returns null on garbage). `@shared/*` resolves in both the Express
   server (tsx dev + esbuild ESM prod) and the Expo client (Metro tsconfig paths).

2. **The server runs in UTC; the driver is in a US timezone** — comparing a
   `Date.UTC(...)`-built pickup against a real UTC instant let US-local early
   clock-ins pass even with correct parsing. Fix: the client sends
   `tz_offset: -new Date().getTimezoneOffset()` (minutes east of UTC) on clock-in
   **and** resume; the server reconstructs the driver's wall clock as
   `startedAt + tzOffset*60000` and compares wall-clock-to-wall-clock.

**tz_offset is untrusted client input.** A fabricated large offset would move the
apparent wall clock forward and bypass the guard. The server validates it
(finite, integer, within `[-720, 840]`) AND sanity-checks it against the pickup
longitude (`round(origin_lng/15)*60`, allowing ±180 min for DST / wide zones) —
the geofence already forces the driver to be physically near pickup, so the
pickup's timezone ≈ the driver's. If the client offset is missing or implausible,
the server falls back to the location-derived offset; only when there is also no
`origin_lng` does it fall back to the raw UTC instant (legacy, lenient). Residual:
within the ±180-min plausibility band a driver could still shift a couple hours —
accepted, since fully closing it needs a real tz database.
