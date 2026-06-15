---
name: companion enum drift
description: Mobile app's hardcoded enum option lists can drift from the website's actual data values, silently breaking filters/labels.
---

# Companion enum drift

The mobile app hardcodes option lists (truck types, statuses, material types, etc.) in the frontend, but the actual row data is synced from the website, whose data model often supports MORE enum values than the app lists.

**Symptom:** a filter or label "doesn't work" — filtering yields empty results, or values render as raw snake_case — because the app's hardcoded list omits values that exist in the synced data (and may list values that have no rows).

**Concrete example (June 2026):** the Find Jobs truck-type filter offered only `end_dump`/`side_dump`/`belly_dump`, but synced jobs were mostly `tri_axle`/`tandem_dump`/`super_dump`. Two bugs compounded: the server handlers also ignored the `truck_type` query param entirely. Fix needed BOTH: server applying the param, and the frontend list + `formatTruckType` covering all six real values.

**Why:** companion is a thin client over the website's shared DB; the website is the source of truth for enum domains.

**How to apply:** when a filter/label over synced data misbehaves, check the live distinct DB values (`SELECT DISTINCT <col> FROM <table>`) against the app's hardcoded list AND confirm the server route actually reads/applies the query param — don't assume either side is complete.
