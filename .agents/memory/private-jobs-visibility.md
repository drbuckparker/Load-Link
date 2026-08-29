---
name: Private jobs visibility layer
description: ACTIVE (Aug 2026) — companion-owned jobs.visibility, broker jobs private by default, DB trigger guards against clobber.
---

ACTIVATED Aug 2026: the companion itself added `jobs.visibility` (text, nullable) to the shared DB, so the feature-detected layer in server/visibility.ts is now live. `public_positions_remaining` and the project-invitations table still don't exist.

**Why companion-owned:** the website never enforced privacy AND its /api/jobs payloads report `visibility:'public'` on every job — so any sync that accepts the website's value flips broker jobs public within ~60s. Sync (server/sync.ts upsertRow) drops `visibility` from every website jobs payload; a post-upsert sweep defaults NULL→'private' for broker-owned jobs.

**Trigger guard (critical):** older deployed companion code (and the website itself) writes jobs rows directly, bypassing dev-code fixes. A `BEFORE INSERT OR UPDATE` trigger on jobs (`trg_protect_broker_job_visibility`) forces broker-job inserts private and blocks broker jobs going less-private, unless the session sets `SET LOCAL app.allow_visibility_change='1'` — done only by POST /api/jobs/:id/visibility (broker-owner-only toggle). Any new legitimate visibility writer must set that GUC in its transaction.

**Fail-closed rule:** a broker-posted job with NULL visibility is treated as PRIVATE in jobVisibilityPredicate, canViewPrivateJob, and the new-job push watcher (NULL == public only for non-broker jobs). Application paths (accept AND counter-bid) share privateJobApplicationBlock().

**How to apply:**
- Rules once active: private jobs are listable/viewable only by owner, assigned/applied drivers, project invitees, or anyone if `public_positions_remaining > 0` (overflow is public). Detail route returns 403 "This project is private." Private jobs skip the nearby-driver new-job push broadcast (unless overflow > 0).
- The invite table is discovered by name pattern + required columns (project_id, user_id, status); its name is regex-allowlisted and quoted before SQL interpolation — never relax that (authz-critical dynamic identifier).
- Owner-scoped routes (calendar, earnings, my-jobs, contractor dashboards) intentionally have no filter — they only return the viewer's own/assigned jobs.
- UI shows PRIVATE / "N public openings" badges keyed purely off response fields, so they appear automatically too. Invitation screens were deliberately deferred until the website table exists.

**Fleet self-application rule:** A fleet-entitled combined account may apply one of its own trucks to its own job only in the active trucking-company view. Explicitly public jobs qualify; legacy NULL visibility qualifies only when the job is durably backed by `contractor_projects`. Broker-client projects and project-less NULL jobs stay fail-closed.

**Why:** Exact-role checks blocked combined trucking-company/contractor accounts, while treating every NULL or every project-backed job as public could expose older broker roster work after a role change. Contractor-project provenance distinguishes the intended legacy marketplace jobs.
