---
name: SQL seeding gotchas (executeSql + parametrized inserts)
description: Two silent-failure traps when seeding Postgres via the executeSql tool or parametrized INSERTs; how to avoid leaving the DB half-seeded.
---

# SQL seeding gotchas

## 1. `executeSql` does NOT throw on SQL error
The code-execution `executeSql(...)` callback returns `{ success: false, output, exitCode, exitReason }` on a failed statement — it resolves, it does not reject. Code that just `await`s it and prints success will report a phantom success.

**Why:** During demo seeding, a `jobs` INSERT failed (NOT NULL violation) but the script printed "jobs inserted: 33" because it logged `array.length`, never `r.success`. Dependent rows (`job_assignments`) then inserted fine because `job_assignments.job_id` has no enforced FK to `jobs`, so the breakage was invisible until an API returned 0 rows.

**How to apply:** Always check `r.success` (or wrap in a helper that throws on `!r.success`) after every `executeSql`. For multi-table seeds, prefer a real transactional script (`pg` client + BEGIN/COMMIT/ROLLBACK) with post-commit `count(*)` assertions, not ad-hoc `executeSql` calls.

## 2. A parametrized INSERT that lists a defaulted column and passes NULL overrides the default
Postgres applies a column DEFAULT only when the column is OMITTED from the INSERT column list. If you list the column and bind `NULL`, you insert NULL — which fails NOT-NULL columns like `jobs.urgent` (default false), `requires_tarp`, `requires_weight_tickets`, `includes_weekends`.

**Why:** A generic row builder mapped any `undefined` field to `null` and included every column in the INSERT. NOT-NULL-with-default columns then got an explicit NULL and the whole statement failed.

**How to apply:** Either omit defaulted columns from the column list, or give them an explicit real value in your row defaults (the seed script sets `urgent:false` etc. in its job defaults).

## 3. A bound param reused inside a CASE (or as a bare NULL) needs an explicit cast
`pool.query("... SET col = $1, ts = CASE WHEN $1 IS NULL THEN NULL ELSE NOW() END", [val])` fails with **"could not determine data type of parameter $1"** — Postgres can't infer the param's type from a CASE/NULL context alone. Cast it: `$1::text` (or the right type) at each use.

**Why:** The truck-down endpoint set `truck_down_status = $1` and reused `$1` in a `CASE WHEN $1 IS NULL` for the timestamp; the driver passed/cleared the value but every call 500'd until both `$1` were written `$1::text`.

**How to apply:** Any `pg` parametrized statement where a placeholder appears only in NULL-comparison / CASE / generic contexts (never next to a typed column) should carry an explicit `::type` cast.
