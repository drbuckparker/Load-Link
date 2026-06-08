---
name: Account deletion cascade
description: How in-app account deletion works and the maintenance constraint it imposes when the shared DB schema changes.
---

# Account deletion (Apple Guideline 5.1.1(v))

`DELETE /api/account` (companion `server/routes.ts`) does a single-transaction hard delete across the shared Neon DB. All FKs referencing `users(id)` are `NO ACTION` (no DB-level cascade), so the route deletes every dependent row **manually, deepest children first**, then the user row last, then invalidates all local sessions for that userId.

Owner-vs-participant rule: rows the user *owns* are deleted (jobs by `contractor_id`, trucks, projects, materials, documents); rows where the user was merely a *participant* are dissociated, not deleted (`jobs.driver_id`, `trucks.assigned_driver_id`, `driver_vehicles.assigned_driver_id`, other users' `users.trucking_company_id` → set NULL).

**Why this matters:** the cascade is a hard-coded ordered list, not self-validating.
**How to apply:** any time a new table/column adds a `NO ACTION` FK to `users`, `jobs`, `job_runs`, or `trucks`, you MUST add a matching DELETE/NULL step to this route in the correct order — otherwise account deletion fails at runtime with a 500 (FK violation) and the whole transaction rolls back. Verified correct against the live schema as of June 2026.

Known limitation: companion has no Stripe access, so deletion does NOT cancel website Stripe subscriptions (most companion users are free-tier).
