import type { Pool } from "pg";

// ---------------------------------------------------------------------------
// Private Projects & Jobs — defensive visibility layer.
//
// The website (source of truth for the shared schema) is adding:
//   jobs.visibility / contractor_projects.visibility ('public' | 'private')
//   jobs.public_positions_remaining (int, overflow openings posted publicly)
//   a project invitations table (project_id, user_id, status)
//
// None of these exist yet. This module feature-detects them at runtime so the
// companion starts enforcing privacy the moment the columns appear, with no
// redeploy needed. Until then every helper is a no-op.
// ---------------------------------------------------------------------------

export interface VisibilityFeatures {
  jobsVisibility: boolean;
  projectsVisibility: boolean;
  publicPositionsRemaining: boolean;
  inviteTable: string | null; // fully qualified table name usable in SQL
}

const RECHECK_MS = 5 * 60 * 1000;
let cached: VisibilityFeatures | null = null;
let cachedAt = 0;
let inFlight: Promise<VisibilityFeatures> | null = null;

const NONE: VisibilityFeatures = {
  jobsVisibility: false,
  projectsVisibility: false,
  publicPositionsRemaining: false,
  inviteTable: null,
};

async function detect(pool: Pool): Promise<VisibilityFeatures> {
  try {
    const cols = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND ((table_name = 'jobs' AND column_name IN ('visibility', 'public_positions_remaining'))
           OR (table_name = 'contractor_projects' AND column_name = 'visibility'))`
    );
    const has = (t: string, c: string) =>
      cols.rows.some((r: any) => r.table_name === t && r.column_name === c);

    // Find a project-invitations table with the columns we need. The website
    // may name it project_invitations / projectInvitations etc, so match
    // loosely but require the exact columns before trusting it.
    let inviteTable: string | null = null;
    const tables = await pool.query(
      `SELECT c.table_name, array_agg(c.column_name) AS cols
       FROM information_schema.columns c
       WHERE c.table_schema = 'public'
         AND c.table_name ILIKE '%project%invit%'
       GROUP BY c.table_name`
    );
    for (const row of tables.rows) {
      const cset = new Set<string>(row.cols);
      const name = String(row.table_name);
      // Strict identifier allowlist — this name is interpolated into SQL, so
      // reject anything that isn't a plain lowercase snake_case identifier.
      if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) {
        console.warn(`[Visibility] Ignoring invite table with unsafe name: ${JSON.stringify(name)}`);
        continue;
      }
      if (cset.has("project_id") && cset.has("user_id") && cset.has("status")) {
        inviteTable = `"${name}"`;
        break;
      }
    }

    return {
      jobsVisibility: has("jobs", "visibility"),
      projectsVisibility: has("contractor_projects", "visibility"),
      publicPositionsRemaining: has("jobs", "public_positions_remaining"),
      inviteTable,
    };
  } catch {
    return NONE;
  }
}

export async function getVisibilityFeatures(pool: Pool): Promise<VisibilityFeatures> {
  const now = Date.now();
  if (cached && now - cachedAt < RECHECK_MS) return cached;
  if (!inFlight) {
    inFlight = detect(pool)
      .then((f) => {
        cached = f;
        cachedAt = Date.now();
        return f;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  // If we have a stale cache, serve it rather than blocking the request.
  if (cached) return cached;
  return inFlight;
}

/**
 * SQL predicate limiting rows of `jobs j` to those the user may see.
 * Returns '' when the visibility column doesn't exist yet.
 * The caller binds the user id at $<userParamIdx>.
 *
 * A private job is visible to: its contractor/owner, its assigned driver,
 * drivers with a non-dead assignment, users invited to its project — and to
 * everyone when it has public overflow openings (public_positions_remaining > 0).
 */
export function jobVisibilityPredicate(
  feats: VisibilityFeatures,
  userParamIdx: number,
  alias = "j"
): string {
  if (!feats.jobsVisibility) return "";
  const a = alias;
  const parts = [
    `${a}.visibility IS NULL`,
    `${a}.visibility::text <> 'private'`,
    `${a}.contractor_id::text = $${userParamIdx}::text`,
    `${a}.driver_id::text = $${userParamIdx}::text`,
    // Broker "send-later" rule: on a job posted by a broker, a HELD assignment
    // (sent_at IS NULL) must be completely invisible to the truck — it only
    // grants visibility once the broker sends it. Non-broker jobs are
    // unaffected (driver-created applications also have sent_at NULL).
    `EXISTS (SELECT 1 FROM job_assignments _ja WHERE _ja.job_id = ${a}.id
             AND _ja.driver_id::text = $${userParamIdx}::text
             AND _ja.status::text NOT IN ('rejected','withdrawn','cancelled','expired')
             AND (_ja.sent_at IS NOT NULL OR NOT EXISTS (
               SELECT 1 FROM users _bu
               WHERE _bu.id::text = ${a}.contractor_id::text AND _bu.role::text = 'broker')))`,
  ];
  if (feats.publicPositionsRemaining) {
    parts.push(`COALESCE(${a}.public_positions_remaining, 0) > 0`);
  }
  if (feats.inviteTable) {
    parts.push(
      `EXISTS (SELECT 1 FROM ${feats.inviteTable} _pi WHERE _pi.project_id = ${a}.project_id
               AND _pi.user_id::text = $${userParamIdx}::text
               AND _pi.status::text IN ('pending','accepted'))`
    );
  }
  return ` AND (${parts.join(" OR ")})`;
}

/**
 * Can this user see a specific (already fetched) job row?
 * Used by the job-detail route: assignment/participant status was already
 * computed there, so this only adds the invitation + overflow checks.
 */
export async function canViewPrivateJob(
  pool: Pool,
  feats: VisibilityFeatures,
  job: any,
  userId: string,
  alreadyParticipantOrAssigned: boolean
): Promise<boolean> {
  if (!feats.jobsVisibility) return true;
  const vis = (job.visibility ?? "").toString();
  if (vis !== "private") return true;
  if (alreadyParticipantOrAssigned) return true;
  if (String(job.contractor_id) === String(userId)) return true;
  if (job.driver_id && String(job.driver_id) === String(userId)) return true;
  if (feats.publicPositionsRemaining && Number(job.public_positions_remaining || 0) > 0) return true;
  if (feats.inviteTable && job.project_id) {
    try {
      const r = await pool.query(
        `SELECT 1 FROM ${feats.inviteTable}
         WHERE project_id = $1 AND user_id::text = $2::text
           AND status::text IN ('pending','accepted') LIMIT 1`,
        [job.project_id, userId]
      );
      if (r.rows.length > 0) return true;
    } catch {}
  }
  return false;
}
