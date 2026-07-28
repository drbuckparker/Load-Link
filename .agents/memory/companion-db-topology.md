---
name: companion DB topology (repointed to website's Replit-managed DB, July 2026)
description: The companion now uses the website project's Replit-managed Neon DB via NEON_DATABASE_URL; the old Neon DB is legacy. How env precedence and schema ownership work after the consolidation.
---

# Companion DB topology (post-consolidation, July 28 2026)

The DB split was resolved by consolidating everything into the **website project's Replit-managed production database** (ep-jolly-tree-ahrdbwmh, us-east-1). The companion now points there.

**How the repoint works:** `DATABASE_URL` here is runtime-managed by Replit and CANNOT be changed via setEnvVars. The repoint was done via **`NEON_DATABASE_URL`** (shared env var), which `server/db.ts` and `drizzle.config.ts` prefer over `DATABASE_URL`. The old value of `DATABASE_URL` (ep-quiet-moon, us-east-2) is the **legacy** Neon DB — do not write to it.

**Schema ownership:** the new DB's schema is owned/migrated by the WEBSITE project's publish flow. Companion-only columns (`jobs.haul_both_ways` + `return_*`, `job_assignments.truck_down_*`, `users.apns_device_token`) and the `companion_notified_jobs` table were added by hand on 2026-07-28; any new companion-only schema must be coordinated with the website agent or it may not exist in the new DB.

**Implications:**
- Dev + deployed companion + live website all share this one DB; writes via the Express pool are live production changes.
- If a companion route 500s with "column does not exist" after a website release, suspect schema drift between this app's SQL and the website-managed schema.
- The migration overwrote user rows: any password hash or role set only companion-side before consolidation was clobbered (had to re-set Calvin's temp password and demo's compound role post-migration).
