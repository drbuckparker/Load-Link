---
name: Companion project sync requires POST + PUT
description: Why companion contractor-project writes must push BOTH a create and an update to the website, or projects vanish or lose their address.
---

# Contractor-project writes must push to the website (POST then PUT)

Companion routes that mutate `contractor_projects` (create / edit / delete / restore) must
push upstream to the website's `/api/contractor-projects`, not just write the shared DB.

**Why (two distinct failure modes):**
1. **Auto-delete:** `syncProjects()` reconciles local rows against the website's
   `GET /api/contractor-projects` list and soft-deletes any it can't find (5-min grace,
   unless a not-yet-succeeded `sync_queue` row exists). A project that was never pushed
   is invisible upstream and gets wiped ~5 min after creation. (Jobs survive because
   `POST /api/jobs` already pushes.)
2. **Site-field wipe:** the website's **POST** create endpoint *registers* a project but
   does **not persist** `site_address`/`site_lat`/`site_lng`. The same sync then
   down-syncs (`upsertMany("contractor_projects", websiteProjects)`) and overwrites the
   local row with the site-less website copy, erasing the address/coords. Only the
   website **PUT** persists site fields (proven: PUT-updated projects keep their address;
   POST-only ones lose it).
3. **Edit-revert (down-sync clobber):** even with PUT, the website does NOT persist site
   fields for many projects, so its `GET /api/contractor-projects` keeps returning
   `site_address=null`. The plain down-sync upsert (`col = EXCLUDED.col`) then writes that
   null back over a freshly-edited local address every cycle, so app edits "revert" within
   ~2 min. Fix: `upsertRow` treats site fields as **sticky** — for `contractor_projects`,
   `site_address/site_lat/site_lng` use `col = COALESCE(EXCLUDED.col, table.col)` so a
   website null never clobbers a local value (mirrors the `is_read` readSticky pattern).
   This makes the companion's local value the source of truth for site fields (the website
   can still push a non-null update, but never wipe to null).

**How to apply:**
- Create and restore must push **POST (register) then PUT (persist site fields)**, in
  order (await POST before PUT). DELETE pushes DELETE.
- Website validation requires **snake_case** site fields (`site_address/site_lat/site_lng`);
  camelCase => HTTP 400 "Validation error". Numeric coords are fine.
- `job_number` is not round-tripped by the website for any project — a pre-existing
  website limitation, don't rely on it surviving a sync.
- A not-yet-succeeded `sync_queue` row (even one stuck on a retryable 401) exempts the
  project from the reconcile soft-delete, so transient upstream auth failures won't
  re-trigger auto-deletion; the queued write drains once the session JWT refreshes.
