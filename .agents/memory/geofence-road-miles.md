---
name: Geofence uses road miles
description: The 15-mile clock-in/out geofence is driving distance, not straight-line — and how fallbacks are layered
---

## Rule
The 15-mile clock-in/clock-out geofence means ROAD miles (Google Directions driving distance), never straight-line. Straight-line math survives only as (a) a free prefilter — ≤1 air mile is always in range, skip the API; (b) the fallback when Directions is unreachable, so an API outage never blocks a legitimate clock-in; (c) the trigger for the background "forgot to clock out" reminder (no API calls from a background watcher; air > 15 implies road > 15, so it's valid, just conservative).

**Why:** The user (contractor) caught a driver clocked out 23 air miles from the site who was really ~50 road miles away; short-haul terrain (rivers, mountains) makes air miles badly understate real distance. Road miles are what he pays for.

**How to apply:** Any new distance display or geofence check should go through the server's road-mile helpers (Directions lookup with rounded-coord cache; ZERO_RESULTS cached, real API failures not cached) and fall back to air miles only on lookup failure — labeled without the word "road". Client-side warnings must not compute their own straight-line "miles from site" figures anymore.
