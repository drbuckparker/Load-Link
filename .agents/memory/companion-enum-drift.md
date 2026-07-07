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

## UI count vs. rendered-subset drift

**Symptom:** a header/badge count (e.g. "DRIVER APPLICATIONS (1)") shows N but there are fewer (or zero) items to interact with below it.

**Cause:** the count is derived from the raw fetch while the list below renders only a subset. The `/api/jobs/:id/assignments` (and similar) endpoints return ALL statuses; the job-detail applications UI renders only `pending`+`approved` cards. A single `withdrawn`/`rejected`/`cancelled` assignment inflated the header count with no clickable card.

**How to apply:** any count shown next to a filtered/subset list must be derived from the SAME filtered set, not the raw response. Keep the companion's displayed "applied/active applications" definition aligned with the server list count (pending+approved, i.e. non-withdrawn/non-rejected).

## Signup role keys must be canonical

**Symptom:** picking a specific role on Create Account silently fails ("can't sign in"), while other role buttons work.

**Cause:** a signup role button used a non-canonical key (`owner_operator`) that isn't in the platform's role domain. Canonical roles: `driver`, `contractor`, `trucking_company`, and compounds (`driver_contractor`, `driver_trucking_company`, `trucking_company_contractor`, `driver_trucking_company_contractor`) — see `allowedRolesForUser`. "Owner Operator" is just a friendly label for an independent `driver`.

**How to apply:** the role KEY submitted at registration must be one the server/website recognizes; keep display labels decorative but map them to a canonical role key. When a role-related signup/login misbehaves, check the submitted key against `allowedRolesForUser`, not the label.
