---
name: Private jobs visibility layer
description: Dormant, feature-detected privacy enforcement for the website's upcoming Private Projects & Jobs schema.
---

The companion enforces the website's "Private Projects & Jobs with Public Overflow" feature via runtime schema detection (server/visibility.ts), not hardcoded columns.

**Why:** The website owns the shared schema and hadn't landed `jobs.visibility`, `public_positions_remaining`, or a project-invitations table as of July 2026. Hardcoding would break current queries; waiting would leave a leak window when the schema lands. Feature detection (information_schema, 5-min cache) means enforcement switches on automatically with no companion redeploy.

**How to apply:**
- Rules once active: private jobs are listable/viewable only by owner, assigned/applied drivers, project invitees, or anyone if `public_positions_remaining > 0` (overflow is public). Detail route returns 403 "This project is private." Private jobs skip the nearby-driver new-job push broadcast (unless overflow > 0).
- The invite table is discovered by name pattern + required columns (project_id, user_id, status); its name is regex-allowlisted and quoted before SQL interpolation — never relax that (authz-critical dynamic identifier).
- Owner-scoped routes (calendar, earnings, my-jobs, contractor dashboards) intentionally have no filter — they only return the viewer's own/assigned jobs.
- UI shows PRIVATE / "N public openings" badges keyed purely off response fields, so they appear automatically too. Invitation screens were deliberately deferred until the website table exists.
