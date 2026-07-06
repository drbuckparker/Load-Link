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

**Same pattern bites JOB edits:** `PUT /api/jobs/:id` writes the shared DB, but
`syncJobs()` re-pulls the website's jobs every ~60s and `upsertMany` overwrites
every column. So a job field the website never learns about reverts on the next
sync. The route originally only pushed `pushToWebsite(PUT /api/jobs/:id)` when the
**date** changed, so **time-only** (`pickup_time`) edits reverted on refresh. Fix:
push on ANY update (`updates.length > 0`), not just `dateChanged`. General rule:
any companion write to a website-synced entity must be mirrored upstream or the
down-sync clobbers it.

**Pushing is NOT enough for a job's terminal status.** Marking a job
`completed` (contractor `PUT /api/jobs/:id {status:'completed'}`) writes the
shared DB and pushes upstream, yet the job still "vanished for ~60s then
reappeared under Open." The website's `GET /api/jobs` keeps reporting the job
`open` (it doesn't treat a companion completion as terminal), so the next
`syncJobs` upsert reverts `status` to open. Fix: a **`jobTerminalGuard`** in
`upsertRow` (mirrors `withdrawnGuard`) — when the *incoming* website status is
NOT `completed`/`cancelled`, append `WHERE jobs.status::text NOT IN
('completed','cancelled')` so a non-terminal website row can never overwrite a
locally-terminal job. A genuine website completion (incoming terminal) still
wins; local reinstate is a direct UPDATE (not an upsert) so it still works; the
reconcile block already skips terminal jobs. General rule: a companion-owned
*terminal* state needs a down-sync guard, not just an upstream push, because the
website may never agree it's terminal.

**Count/list parity:** any contractor dashboard count (e.g. "OPEN JOBS",
"ACTIVE") must reuse the *exact* definition its tapped-in list uses, or the
number diverges from what the user sees. The Open predicate lives in
`lib/job-filters.ts` (`isOpenTabJob`) and is shared by the dashboard stat and the
My Jobs > Open tab. The dashboard fetches `/api/contractor/jobs` with NO status
param (all statuses), so the shared predicate must positively gate status to
`open|accepted|pending` (both tab endpoints already restrict `?status=open` to
those three, so the gate is a no-op there but essential to exclude `in_progress`
on the dashboard's full list). Same trap bit "ACTIVE": the server Active filter
includes `pending` but the dashboard tile originally omitted it — keep the tile's
filter and the `?status=active` server WHERE in sync (in_progress/accepted/
pending + active-run, minus completed/cancelled).

**"Active" must include jobs with a live work session, not just status.** A truck
clocking in creates a `job_runs` row `status='active'` but the job's own status
stays `open` (it never flips to in_progress). So a job being actively worked was
invisible to both the dashboard ACTIVE tile and the My Jobs > Active tab (both
keyed only on job status). Fix: `/api/contractor/jobs` exposes `active_run_count`
(subquery) and its status filters treat an active `job_run` as Active
(`?status=active` includes `EXISTS(active run)`; `?status=open` **excludes** it so
the job moves Open→Active, not both); `isOpenTabJob` drops `active_run_count>0`;
the dashboard tile counts `active_run_count>0`. `/api/jobs` (driver browse +
contractor calendar day-view) was deliberately left unchanged to avoid altering
driver browsing — the field is absent there and reads as 0.

**Frontend "Drop Pin on Map" edit gotcha:** the site-address `LocationPickerModal` is a
`presentationStyle="fullScreen"` modal, so the project edit modal must be *closed* before
it opens (two fullScreen iOS modals can't stack) — done via `setEditingProject(null)` then
`setShowEditProjectMapPicker(true)` after 300ms. This makes editing feel like "the window
closed without saving." Fix applied: on pin-select for an existing project, **auto-save
immediately** (fire the update mutation with the picked address/coords) instead of making
the user reopen the editor and tap Save again; reopen the editor only on cancel or save
failure. Backend persistence is separate (sticky site fields above) and was the deeper
root cause of "address reverts."
