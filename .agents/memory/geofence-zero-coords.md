---
name: Geofence (0,0) coordinate trap
description: Why a failed GPS read must never fall back to {lat:0,lng:0} in the clock-in geofence flow.
---

# Geofence (0,0) coordinate trap

A failed/denied/timed-out GPS read must resolve to `null`, never to `{lat:0, lng:0}`.

**Why:** `(0,0)` is a real point in the ocean off Africa (~6000 mi from the US).
The clock-in geofence treats `0` as a valid coordinate (`0` is not null, not NaN),
so a `(0,0)` fallback makes the haversine report the driver is ~6000 miles from
the job site and wrongly blocks clock-in with an `OUT_OF_GEOFENCE` 403. Reported
in the wild as "Android said I was 6000 miles from my start point." Android fails
location (permission/GPS-off/timeout) more often than iOS, so the symptom is
Android-skewed.

**How to apply:** The driver-location helper returns coords-or-null and rejects
`(0,0)`/non-finite. Geofenced actions (clock-in, both normal + resume paths) must
abort with a "location required" message when null. Non-geofenced actions
(clock-out) may proceed but must OMIT lat/lng rather than send `0,0` (otherwise a
bogus `start_lat` gets persisted). Server keeps a defense-in-depth guard: treat
`(0,0)` as missing → `400 LOCATION_REQUIRED`, not a distance computation. Only an
exact `(0,0)` is rejected; a single zero axis (true equator/prime-meridian) is
still allowed.
