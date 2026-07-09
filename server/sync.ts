import { db } from "./db";
import { pool } from "./db";
import { deletedVehicleIds, jobSyncPaused } from "./deleted-vehicles";

const WEBSITE_API_URL = process.env.WEBSITE_API_URL || process.env.COMPANION_API_URL || "https://loadlinklive.com";
const WEBSITE_API_KEY = process.env.WEBSITE_API_KEY || process.env.COMPANION_API_KEY || "";

interface SyncAuth {
  jwt: string;
  userId: string;
  user: any;
}

async function websiteFetchWithStatus(
  path: string,
  options: { method?: string; body?: any; jwt?: string; query?: Record<string, string> } = {}
): Promise<{ ok: boolean; status: number; data: any; errorText?: string }> {
  const url = new URL(path, WEBSITE_API_URL);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    "X-API-Key": WEBSITE_API_KEY,
    "Content-Type": "application/json",
  };
  if (options.jwt) headers["Authorization"] = `Bearer ${options.jwt}`;

  const fetchOpts: RequestInit = { method: options.method || "GET", headers };
  if (options.body && options.method !== "GET") fetchOpts.body = JSON.stringify(options.body);

  const res = await fetch(url.toString(), fetchOpts);
  const ct = res.headers.get("content-type") || "";
  let data: any = null;
  let errorText: string | undefined;
  let ok = res.ok;
  if (ct.includes("application/json")) {
    try { data = await res.json(); } catch { data = null; }
  } else {
    try {
      const txt = await res.text();
      errorText = txt.slice(0, 500);
      if (ok && /^\s*<!doctype\s+html|<html/i.test(txt)) {
        ok = false;
        errorText = `Endpoint returned HTML SPA shell (likely missing API route): ${path}`;
      }
    } catch {}
  }
  return { ok, status: res.status, data, errorText };
}

async function websiteFetchSync(
  path: string,
  options: { method?: string; body?: any; jwt?: string; query?: Record<string, string> } = {}
): Promise<any> {
  const r = await websiteFetchWithStatus(path, options);
  if (!r.ok) {
    console.warn(`[websiteFetchSync] ${options.method || "GET"} ${path} failed: ${r.status} ${r.errorText?.slice(0, 200) || ""}`);
    return null;
  }
  return r.data;
}

const hiddenJobIds = new Set([
  "964f3e5b-6fa2-4aa2-9f2f-57a98bf5835d",
  "415b98c6-6102-4170-93b1-65601200e267",
  "a863fc31-8346-4577-af17-c90201b3cecf",
  "78f95aef-24d3-4d14-acd3-e534dae5e124",
  "35d2ec43-7a9e-42fd-8692-bc2753aaa33a",
  "ca460caf-6b12-4328-bb92-1c75ab6056ff",
  "0316e819-f18c-4403-878d-06986573e979",
  "95f5512c-36df-4c84-afdc-c6fd81549839",
  "9abdfb36-32f2-4077-8250-da5d0a6bfd01",
  "024cdfbc-7e82-4420-b960-fe7e7b860283",
  "122b233f-5d75-4bbe-a46e-8afe1686771a",
  "8c128208-163f-4d7a-bbf9-0e9b9d06cc2b",
  "ae14fedb-dd4d-4cf5-a07a-0b6aa23f232e",
  "ba805c10-982e-4008-950a-7d9cc34f6830",
  "71a89320-160a-40c4-9967-1b2e8db25942",
  "37cdee04-1606-4bbb-88c2-b51dd5e7e6c2",
  "b0067804-b81d-4ef0-902b-a7ec32e170f7",
  "fb353d76-e763-402b-990c-1498abee7904",
  "70eb099c-5499-4877-b33d-1db79bc060b4",
  "119aa6fa-6a7c-4a4a-802f-3343fa1f6ed0",
  "a9fc2cbc-3df6-4c68-9e00-137a8730e191",
  "d56e9fda-118a-464a-a85e-3e0f4b59cb97",
  "cead455d-8870-4465-8d7e-cd4591f1c714",
  "df66e51e-0dc8-451e-bd25-a8812ab7e261",
  "a8194fd8-df25-4e62-8852-204e6c9a834a",
  "9b4c1fef-1c8c-4b08-a86a-30c569073fb0",
  "9acd4492-b2c6-41d6-9a4b-f3fbb2d0a8ee",
  "4c3c7262-f8c6-4dd3-918d-621db4010b42",
  "1ddadca8-4555-4f5d-af3c-8be2bd3faed4",
  "e10d2ecb-142e-4db2-8704-4e8c82fad225",
  "5242f9a5-f65e-459c-b4aa-57e2ba2df478",
  "b6a22aec-1b61-43a8-b041-9e7d92531349",
  "260669a8-564b-4711-82af-dfc57daf65ed",
  "996c08da-c1ee-4863-a811-d29565e19625",
  "eec5123e-70d0-43f9-a0f0-1471d52e61e9",
  "5fd6891d-8bf8-4b81-bc89-b5c963767051",
  "0c9c925b-07f6-4caf-b00d-871671e266fb",
]);

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function normalizeToSnake(obj: any): Record<string, any> {
  if (!obj || typeof obj !== "object") return {};
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[camelToSnake(key)] = val;
  }
  return result;
}

async function getTableColumns(tableName: string): Promise<Set<string>> {
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
    [tableName]
  );
  return new Set(result.rows.map((r: any) => r.column_name));
}

const _columnCache = new Map<string, Set<string>>();

async function getCachedColumns(tableName: string): Promise<Set<string>> {
  if (!_columnCache.has(tableName)) {
    _columnCache.set(tableName, await getTableColumns(tableName));
  }
  return _columnCache.get(tableName)!;
}

const ARCHIVE_PROTECTED_TABLES = new Set(["jobs", "trucks"]);

async function upsertRow(tableName: string, data: Record<string, any>, idField = "id"): Promise<void> {
  const columns = await getCachedColumns(tableName);
  const normalized = normalizeToSnake(data);

  const filteredEntries = Object.entries(normalized).filter(
    ([key, val]) => columns.has(key) && val !== undefined
  );

  if (filteredEntries.length === 0 || !normalized[idField]) return;

  const keys = filteredEntries.map(([k]) => k);
  const values = filteredEntries.map(([, v]) => v);
  const placeholders = values.map((_, i) => `$${i + 1}`);

  // For notifications, never let a sync revert a locally-read notification back
  // to unread. mark-read is applied to the local DB only (not pushed upstream),
  // so the website still reports is_read=false; a blind overwrite would make
  // cleared notifications reappear. Make is_read "sticky": once read locally or
  // upstream, it stays read.
  const readSticky = tableName === "notifications";
  // Project site fields (address + coords) are companion-owned: the website's
  // /api/contractor-projects PUT returns 200 but does NOT persist them, so its
  // GET reports them back as null. A blind overwrite would wipe a contractor's
  // locally-saved project address on the next sync. Preserve the local value
  // whenever the website sends null/absent; let a real website value win.
  const projectSiteSticky = tableName === "contractor_projects";
  const PROJECT_SITE_FIELDS = new Set(["site_address", "site_lat", "site_lng"]);
  const updateClauses = keys
    .filter((k) => k !== idField)
    .map((k) => {
      if (readSticky && k === "is_read") {
        return `is_read = (COALESCE(${tableName}.is_read, false) OR COALESCE(EXCLUDED.is_read, false))`;
      }
      if (projectSiteSticky && PROJECT_SITE_FIELDS.has(k)) {
        return `${k} = COALESCE(EXCLUDED.${k}, ${tableName}.${k})`;
      }
      return `${k} = EXCLUDED.${k}`;
    });

  const archiveGuard = ARCHIVE_PROTECTED_TABLES.has(tableName) && columns.has("archived_at");
  const withdrawnGuard = tableName === "job_assignments" && columns.has("status");
  // Marking a job completed (or cancelled) is a companion-side terminal action.
  // The website's /api/jobs can still report the job as non-terminal (open/
  // accepted/pending), so a blind upsert would revert a just-completed job back
  // to Open on the next ~60s sync (it vanishes from Completed and reappears
  // under Open). Never let a non-terminal website status overwrite a locally
  // terminal job; a real website completion/cancellation still wins.
  const jobTerminalGuard = tableName === "jobs" && columns.has("status");

  if (updateClauses.length === 0) {
    const sql = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (${idField}) DO NOTHING`;
    await pool.query(sql, values);
  } else {
    let whereClause = "";
    if (archiveGuard) {
      const incomingArchived = normalized["archived_at"];
      if (!incomingArchived) {
        whereClause = ` WHERE ${tableName}.archived_at IS NULL`;
      }
    }
    if (withdrawnGuard) {
      const prefix = whereClause ? " AND " : " WHERE ";
      whereClause += `${prefix}${tableName}.status::text != 'withdrawn'`;
    }
    if (jobTerminalGuard) {
      const incomingStatus = String(normalized["status"] ?? "").toLowerCase();
      if (incomingStatus !== "completed" && incomingStatus !== "cancelled") {
        const prefix = whereClause ? " AND " : " WHERE ";
        whereClause += `${prefix}${tableName}.status::text NOT IN ('completed', 'cancelled')`;
      }
    }
    const sql = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (${idField}) DO UPDATE SET ${updateClauses.join(", ")}${whereClause}`;
    await pool.query(sql, values);
  }
}

async function upsertMany(tableName: string, rows: any[], idField = "id"): Promise<number> {
  let count = 0;
  for (const row of rows) {
    try {
      await upsertRow(tableName, row, idField);
      count++;
    } catch (e: any) {
      console.error(`Sync upsert ${tableName} error:`, e.message?.slice(0, 120));
    }
  }
  return count;
}

async function updateSyncTime(entityType: string, userId: string) {
  await pool.query(
    `INSERT INTO sync_metadata (entity_type, last_synced_at, user_id) VALUES ($1, NOW(), $2) ON CONFLICT (entity_type) DO UPDATE SET last_synced_at = NOW(), user_id = $2`,
    [entityType, userId]
  );
}

async function getLastSyncTime(entityType: string): Promise<Date | null> {
  const result = await pool.query(
    `SELECT last_synced_at FROM sync_metadata WHERE entity_type = $1`,
    [entityType]
  );
  return result.rows.length > 0 ? new Date(result.rows[0].last_synced_at) : null;
}

export async function syncJobs(auth: SyncAuth, prefetchedJobs?: any[]): Promise<number> {
  if (jobSyncPaused) return 0;
  try {
    let jobs: any[];
    if (prefetchedJobs) {
      jobs = prefetchedJobs;
    } else {
      const allJobs = await websiteFetchSync("/api/jobs", { jwt: auth.jwt });
      if (!Array.isArray(allJobs)) return 0;
      jobs = allJobs.filter((j: any) => j.id && !hiddenJobIds.has(j.id));
    }

    const localJobsResult = await pool.query(
      `SELECT id, material, contractor_id, scheduled_date, created_at FROM jobs WHERE archived_at IS NULL`
    );
    const localJobs = localJobsResult.rows;

    const toDayStr = (v: any): string => {
      if (!v) return '';
      if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().substring(0, 10);
      const s = String(v);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
      const d = new Date(s);
      return isNaN(d.getTime()) ? '' : d.toISOString().substring(0, 10);
    };

    const websiteIdToLocalId: Record<string, string> = {};
    const deduped = jobs.filter((wj: any) => {
      const wId = wj.id;
      if (localJobs.some((lj: any) => lj.id === wId)) return true;
      const wMaterial = (wj.material || '').toLowerCase().trim();
      const wContractor = String(wj.contractor_id || wj.contractorId || '');
      const wScheduledStr = toDayStr(wj.scheduled_date || wj.scheduledDate);
      const wCreated = new Date(wj.created_at || wj.createdAt || 0).getTime();

      for (const lj of localJobs) {
        if (lj.id === wId) continue;
        const lMaterial = (lj.material || '').toLowerCase().trim();
        const lContractor = String(lj.contractor_id || '');
        const lScheduledStr = toDayStr(lj.scheduled_date);
        const lCreated = new Date(lj.created_at).getTime();
        const matchAll =
          lMaterial === wMaterial &&
          lContractor === wContractor &&
          lScheduledStr === wScheduledStr &&
          Math.abs(wCreated - lCreated) < 300000;
        if (matchAll) {
          console.log(`[syncJobs dedup] dropping website job ${wId} -> matches local ${lj.id}`);
          websiteIdToLocalId[wId] = lj.id;
          return false;
        }
        if (lMaterial === wMaterial && lContractor === wContractor && lScheduledStr === wScheduledStr) {
          console.log(`[syncJobs dedup-near-miss] wId=${wId} lId=${lj.id} mat=ok contractor=ok sched=ok createdDiffMs=${wCreated - lCreated}`);
        }
      }
      return true;
    });
    if (Object.keys(websiteIdToLocalId).length > 0) {
      console.log(`[syncJobs] dedup mappings:`, websiteIdToLocalId);
    }

    const count = await upsertMany("jobs", deduped);

    try {
      const websiteIds = new Set<string>(jobs.map((j: any) => String(j.id)));
      const dedupedToOriginalIds = new Set<string>(Object.values(websiteIdToLocalId));
      const reconcileResult = await pool.query(
        `SELECT id FROM jobs
         WHERE (contractor_id = $1 OR driver_id = $1)
           AND archived_at IS NULL
           AND status NOT IN ('completed', 'cancelled')
           AND created_at < NOW() - INTERVAL '5 minutes'
           AND id NOT IN (
             SELECT (body->>'id')::text FROM sync_queue
             WHERE user_id = $2 AND succeeded_at IS NULL AND body ? 'id'
             UNION
             SELECT regexp_replace(path, '^/api/jobs/([^/]+).*$', '\\1') FROM sync_queue
             WHERE user_id = $2 AND succeeded_at IS NULL AND path ~ '^/api/jobs/[^/]+'
           )`,
        [auth.userId, auth.userId]
      );
      const removedIds: string[] = [];
      for (const row of reconcileResult.rows) {
        const lid = String(row.id);
        if (!websiteIds.has(lid) && !dedupedToOriginalIds.has(lid)) {
          removedIds.push(lid);
        }
      }
      if (removedIds.length > 0) {
        console.log(`[syncJobs reconcile] cancelling ${removedIds.length} local jobs missing from website:`, removedIds);
        await pool.query(
          `UPDATE jobs SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, NOW()), archived_at = COALESCE(archived_at, NOW())
           WHERE id = ANY($1::varchar[])`,
          [removedIds]
        );
      }
    } catch (e: any) {
      console.error("syncJobs reconcile error:", e.message);
    }

    await updateSyncTime("jobs", auth.userId);
    return count;
  } catch (e: any) {
    console.error("syncJobs error:", e.message);
    return 0;
  }
}

export async function syncProjects(auth: SyncAuth, cachedJobs?: any[]): Promise<number> {
  if (jobSyncPaused) return 0;
  try {
    const websiteProjects = await websiteFetchSync("/api/contractor-projects", {
      jwt: auth.jwt,
      query: { contractorId: auth.userId },
    });
    if (!Array.isArray(websiteProjects)) {
      await updateSyncTime("projects", auth.userId);
      return 0;
    }

    const count = websiteProjects.length > 0 ? await upsertMany("contractor_projects", websiteProjects) : 0;

    try {
      const websiteIds = new Set<string>(websiteProjects.map((p: any) => String(p.id)));
      const reconcileResult = await pool.query(
        `SELECT id FROM contractor_projects
         WHERE contractor_id = $1
           AND deleted_at IS NULL
           AND created_at < NOW() - INTERVAL '5 minutes'
           AND id NOT IN (
             SELECT (body->>'id')::text FROM sync_queue
             WHERE user_id = $2 AND succeeded_at IS NULL AND body ? 'id'
             UNION
             SELECT regexp_replace(path, '^/api/(contractor-projects|projects)/([^/]+).*$', '\\2') FROM sync_queue
             WHERE user_id = $2 AND succeeded_at IS NULL AND path ~ '^/api/(contractor-projects|projects)/[^/]+'
           )`,
        [auth.userId, auth.userId]
      );
      const removedIds: string[] = [];
      for (const row of reconcileResult.rows) {
        const lid = String(row.id);
        if (!websiteIds.has(lid)) removedIds.push(lid);
      }
      if (removedIds.length > 0) {
        console.log(`[syncProjects reconcile] soft-deleting ${removedIds.length} local projects missing from website:`, removedIds);
        await pool.query(
          `UPDATE contractor_projects SET deleted_at = NOW() WHERE id = ANY($1::varchar[])`,
          [removedIds]
        );
      }
    } catch (e: any) {
      console.error("syncProjects reconcile error:", e.message);
    }

    await updateSyncTime("projects", auth.userId);
    return count;
  } catch (e: any) {
    console.error("syncProjects error:", e.message);
    return 0;
  }
}

export async function syncJobAssignments(auth: SyncAuth): Promise<number> {
  if (jobSyncPaused) return 0;
  try {
    const data = await websiteFetchSync("/api/assignments", { jwt: auth.jwt });
    if (!Array.isArray(data)) return 0;
    const count = await upsertMany("job_assignments", data);
    await updateSyncTime("job_assignments", auth.userId);
    return count;
  } catch (e: any) {
    console.error("syncJobAssignments error:", e.message);
    return 0;
  }
}

export async function syncVehicles(auth: SyncAuth): Promise<number> {
  try {
    const data = await websiteFetchSync("/api/vehicles", { jwt: auth.jwt });
    if (!Array.isArray(data)) return 0;
    const mapped = data
      .filter((v: any) => !deletedVehicleIds.has(String(v.id)))
      .map((v: any) => ({
        ...v,
        trucking_company_id: v.trucking_company_id || v.truckingCompanyId || v.driver_id || v.driverId || auth.userId,
      }));
    const count = await upsertMany("trucks", mapped);
    await updateSyncTime("vehicles", auth.userId);
    return count;
  } catch (e: any) {
    console.error("syncVehicles error:", e.message);
    return 0;
  }
}

export async function syncAvailability(auth: SyncAuth): Promise<number> {
  try {
    const data = await websiteFetchSync("/api/availability", { jwt: auth.jwt });
    if (!Array.isArray(data)) return 0;
    const count = await upsertMany("driver_availability", data);
    await updateSyncTime("availability", auth.userId);
    return count;
  } catch (e: any) {
    console.error("syncAvailability error:", e.message);
    return 0;
  }
}

export async function syncInvoices(auth: SyncAuth): Promise<number> {
  try {
    const data = await websiteFetchSync("/api/invoices", { jwt: auth.jwt });
    if (!Array.isArray(data)) return 0;
    const count = await upsertMany("monthly_invoices", data);
    await updateSyncTime("invoices", auth.userId);
    return count;
  } catch (e: any) {
    console.error("syncInvoices error:", e.message);
    return 0;
  }
}

export async function syncNotifications(auth: SyncAuth): Promise<number> {
  try {
    const data = await websiteFetchSync("/api/notifications", { jwt: auth.jwt });
    if (!Array.isArray(data)) return 0;
    const count = await upsertMany("notifications", data);
    await updateSyncTime("notifications", auth.userId);
    return count;
  } catch (e: any) {
    console.error("syncNotifications error:", e.message);
    return 0;
  }
}

export async function syncUser(auth: SyncAuth): Promise<void> {
  try {
    if (auth.user && auth.user.id) {
      // Never write session-scoped or security-sensitive fields back to the
      // shared users table. `role` in particular can be a temporary in-session
      // view switch (e.g. a compound driver_trucking_company_contractor account
      // viewing as trucking_company); persisting it collapses the compound
      // entitlement — the exact trap PUT /api/profile/role guards against.
      const { role, password, is_admin, isAdmin, is_suspended, isSuspended, ...safeUser } = auth.user;
      await upsertRow("users", safeUser);
    }
  } catch (e: any) {
    console.error("syncUser error:", e.message);
  }
}

const _syncInProgress = new Map<string, boolean>();

export async function fullSync(auth: SyncAuth): Promise<{ jobs: number; projects: number; assignments: number; vehicles: number }> {
  if (_syncInProgress.get(auth.userId)) {
    return { jobs: 0, projects: 0, assignments: 0, vehicles: 0 };
  }
  _syncInProgress.set(auth.userId, true);

  const t0 = Date.now();
  console.log(`[Sync] Starting full sync for user ${auth.userId}...`);

  try {
    await syncUser(auth);

    let jobCount = 0;
    let jobsList: any[] = [];
    if (!jobSyncPaused) {
      const allJobs = await websiteFetchSync("/api/jobs", { jwt: auth.jwt });
      jobsList = Array.isArray(allJobs) ? allJobs.filter((j: any) => j.id && !hiddenJobIds.has(j.id)) : [];
      jobCount = await syncJobs(auth, jobsList);
    }

    const [projects, assignments, vehicles] = await Promise.allSettled([
      syncProjects(auth, jobsList),
      syncJobAssignments(auth),
      syncVehicles(auth),
    ]);

    Promise.allSettled([
      syncAvailability(auth),
      syncInvoices(auth),
      syncNotifications(auth),
      drainSyncQueue(auth),
    ]).catch(() => {});

    const result = {
      jobs: jobCount,
      projects: projects.status === "fulfilled" ? projects.value : 0,
      assignments: assignments.status === "fulfilled" ? assignments.value : 0,
      vehicles: vehicles.status === "fulfilled" ? vehicles.value : 0,
    };

    console.log(`[Sync] Full sync complete in ${Date.now() - t0}ms: ${JSON.stringify(result)}`);
    return result;
  } finally {
    _syncInProgress.set(auth.userId, false);
  }
}

let _syncQueueReady = false;
async function ensureSyncQueueTable(): Promise<void> {
  if (_syncQueueReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR NOT NULL,
      path VARCHAR NOT NULL,
      method VARCHAR NOT NULL,
      body JSONB,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_status INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_attempted_at TIMESTAMP,
      succeeded_at TIMESTAMP,
      dedupe_key VARCHAR UNIQUE NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sync_queue_user_pending_idx
      ON sync_queue(user_id, id) WHERE succeeded_at IS NULL;
  `);

  const fksToDrop: Array<[string, string]> = [
    ["jobs", "jobs_project_id_fkey"],
    ["jobs", "jobs_contractor_id_users_id_fk"],
    ["jobs", "jobs_driver_id_users_id_fk"],
    ["trucks", "trucks_trucking_company_id_fkey"],
    ["trucks", "trucks_assigned_driver_id_fkey"],
    ["contractor_projects", "contractor_projects_contractor_id_fkey"],
  ];
  for (const [table, fk] of fksToDrop) {
    try {
      await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${fk}`);
    } catch (e: any) {
      console.warn(`[Sync] Failed to drop FK ${fk}:`, e.message);
    }
  }

  _syncQueueReady = true;
}

const MAX_SYNC_ATTEMPTS = 15;

function buildDedupeKey(userId: string, method: string, path: string, body: any): string {
  const bodyId = body && typeof body === "object" ? (body.id || body.ID) : undefined;
  const idPart = bodyId || "_";
  return `${userId}|${method}|${path}|${idPart}`;
}

async function attemptQueuedPush(rowId: number, auth: SyncAuth): Promise<any> {
  const r = await pool.query(`SELECT * FROM sync_queue WHERE id = $1`, [rowId]);
  const row = r.rows[0];
  if (!row || row.succeeded_at) return null;
  try {
    const result = await websiteFetchWithStatus(row.path, {
      method: row.method,
      body: row.body,
      jwt: auth.jwt,
    });
    if (result.ok) {
      await pool.query(
        `UPDATE sync_queue SET succeeded_at = NOW(), last_attempted_at = NOW(), attempts = attempts + 1, last_status = $1, last_error = NULL WHERE id = $2`,
        [result.status, rowId]
      );
      return result.data;
    } else {
      const errSnippet = (result.errorText || (result.data && JSON.stringify(result.data))) || "";
      const errMsg = `HTTP ${result.status}${errSnippet ? `: ${String(errSnippet).slice(0, 300)}` : ""}`;
      const TERMINAL_STATUSES = new Set([400, 403, 404, 410, 415, 422]);
      const terminal = TERMINAL_STATUSES.has(result.status);
      const newAttempts = terminal ? MAX_SYNC_ATTEMPTS : null;
      if (terminal) {
        await pool.query(
          `UPDATE sync_queue SET attempts = $1, last_attempted_at = NOW(), last_status = $2, last_error = $3 WHERE id = $4`,
          [newAttempts, result.status, errMsg, rowId]
        );
      } else {
        await pool.query(
          `UPDATE sync_queue SET attempts = attempts + 1, last_attempted_at = NOW(), last_status = $1, last_error = $2 WHERE id = $3`,
          [result.status, errMsg, rowId]
        );
      }
      console.error(`[Sync] Push ${row.method} ${row.path} failed: ${errMsg}${terminal ? " (terminal)" : ""}`);
      return null;
    }
  } catch (e: any) {
    const errMsg = e?.message?.slice(0, 500) || "unknown error";
    await pool.query(
      `UPDATE sync_queue SET attempts = attempts + 1, last_attempted_at = NOW(), last_error = $1 WHERE id = $2`,
      [errMsg, rowId]
    );
    console.error(`[Sync] Push ${row.method} ${row.path} threw: ${errMsg}`);
    return null;
  }
}

export async function pushToWebsite(
  path: string,
  auth: SyncAuth,
  options: { method?: string; body?: any } = {}
): Promise<any> {
  try {
    await ensureSyncQueueTable();
    const method = options.method || "POST";
    const body = options.body ?? null;
    const dedupeKey = buildDedupeKey(auth.userId, method, path, body);

    const ins = await pool.query(
      `INSERT INTO sync_queue (user_id, path, method, body, dedupe_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (dedupe_key) DO UPDATE
         SET body = EXCLUDED.body,
             succeeded_at = NULL,
             attempts = 0,
             last_error = NULL,
             last_status = NULL
       RETURNING id`,
      [auth.userId, path, method, body ? JSON.stringify(body) : null, dedupeKey]
    );
    const rowId = ins.rows[0].id;
    return await attemptQueuedPush(rowId, auth);
  } catch (e: any) {
    console.error(`[Sync] pushToWebsite enqueue failed for ${path}:`, e.message);
    return null;
  }
}

export async function drainSyncQueue(auth: SyncAuth, limit = 50): Promise<{ attempted: number; succeeded: number; failed: number }> {
  await ensureSyncQueueTable();
  const result = await pool.query(
    `SELECT id FROM sync_queue
     WHERE user_id = $1 AND succeeded_at IS NULL AND attempts < $2
     ORDER BY id ASC LIMIT $3`,
    [auth.userId, MAX_SYNC_ATTEMPTS, limit]
  );
  let succeeded = 0, failed = 0;
  for (const row of result.rows) {
    const r = await attemptQueuedPush(row.id, auth);
    if (r !== null) succeeded++; else failed++;
  }
  if (result.rows.length > 0) {
    console.log(`[Sync] drainSyncQueue user=${auth.userId} attempted=${result.rows.length} succeeded=${succeeded} failed=${failed}`);
  }
  return { attempted: result.rows.length, succeeded, failed };
}

export async function getSyncQueueStatus(userId: string): Promise<{ pending: number; failed: number }> {
  try {
    await ensureSyncQueueTable();
    const r = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE succeeded_at IS NULL AND attempts < $2)::int AS pending,
         COUNT(*) FILTER (WHERE succeeded_at IS NULL AND attempts >= $2)::int AS failed
       FROM sync_queue WHERE user_id = $1`,
      [userId, MAX_SYNC_ATTEMPTS]
    );
    return { pending: r.rows[0].pending || 0, failed: r.rows[0].failed || 0 };
  } catch {
    return { pending: 0, failed: 0 };
  }
}

export async function enqueueExistingVehicles(auth: SyncAuth): Promise<number> {
  await ensureSyncQueueTable();
  const result = await pool.query(
    `SELECT id, truck_type, make, model, year, license_plate, vin_number, truck_number,
            capacity, assigned_driver_id, has_tarp, color
     FROM trucks
     WHERE (trucking_company_id = $1 OR assigned_driver_id = $1) AND archived_at IS NULL`,
    [auth.userId]
  );
  let queued = 0;
  for (const t of result.rows) {
    const dedupeKey = buildDedupeKey(auth.userId, "POST", "/api/vehicles", { id: t.id });
    const exists = await pool.query(
      `SELECT id, succeeded_at FROM sync_queue WHERE dedupe_key = $1`,
      [dedupeKey]
    );
    if (exists.rows[0]?.succeeded_at) continue;
    const body = {
      id: t.id,
      truckType: t.truck_type,
      make: t.make,
      model: t.model,
      year: t.year,
      licensePlate: t.license_plate,
      vinNumber: t.vin_number,
      truckNumber: t.truck_number,
      maxCapacityTons: t.capacity,
      assignedDriverId: t.assigned_driver_id,
      hasTarp: t.has_tarp,
      color: t.color,
    };
    await pool.query(
      `INSERT INTO sync_queue (user_id, path, method, body, dedupe_key)
       VALUES ($1, '/api/vehicles', 'POST', $2, $3)
       ON CONFLICT (dedupe_key) DO UPDATE
         SET body = EXCLUDED.body, attempts = 0, last_error = NULL, last_status = NULL`,
      [auth.userId, JSON.stringify(body), dedupeKey]
    );
    queued++;
  }
  return queued;
}

export async function backfillUserEntities(_auth: SyncAuth, _force = false): Promise<{ projects: number; vehicles: number }> {
  return { projects: 0, vehicles: 0 };
}

export async function enqueueExistingProjects(auth: SyncAuth, projectIds?: string[]): Promise<number> {
  await ensureSyncQueueTable();
  let query = `SELECT id, name, job_number, site_address, site_lat, site_lng, notes, status
               FROM contractor_projects WHERE contractor_id = $1 AND deleted_at IS NULL`;
  const params: any[] = [auth.userId];
  if (projectIds && projectIds.length > 0) {
    query += ` AND id = ANY($2::varchar[])`;
    params.push(projectIds);
  }
  const result = await pool.query(query, params);
  let queued = 0;
  for (const p of result.rows) {
    const dedupeKey = buildDedupeKey(auth.userId, "POST", "/api/projects", { id: p.id });
    const exists = await pool.query(
      `SELECT id, succeeded_at FROM sync_queue WHERE dedupe_key = $1`,
      [dedupeKey]
    );
    if (exists.rows[0]?.succeeded_at) continue;
    const body = {
      id: p.id,
      name: p.name,
      jobNumber: p.job_number,
      siteAddress: p.site_address,
      siteLat: p.site_lat,
      siteLng: p.site_lng,
      notes: p.notes,
      status: p.status,
    };
    await pool.query(
      `INSERT INTO sync_queue (user_id, path, method, body, dedupe_key)
       VALUES ($1, '/api/projects', 'POST', $2, $3)
       ON CONFLICT (dedupe_key) DO UPDATE
         SET body = EXCLUDED.body, attempts = 0, last_error = NULL, last_status = NULL`,
      [auth.userId, JSON.stringify(body), dedupeKey]
    );
    queued++;
  }
  return queued;
}

const _syncTimers = new Map<string, NodeJS.Timeout>();

const _lastUserActivity = new Map<string, number>();

export function recordUserActivity(userId: string) {
  _lastUserActivity.set(userId, Date.now());
}

export function startPeriodicSync(getActiveAuths: () => SyncAuth[], intervalMs = 120000) {
  if (_syncTimers.has("periodic")) {
    clearInterval(_syncTimers.get("periodic")!);
  }

  const timer = setInterval(async () => {
    const auths = getActiveAuths();
    if (auths.length === 0) return;

    const recentlyActive = auths
      .filter(a => {
        const lastActive = _lastUserActivity.get(a.userId);
        return lastActive && (Date.now() - lastActive) < 300_000;
      })
      .slice(0, 2);

    if (recentlyActive.length === 0) return;

    for (const auth of recentlyActive) {
      try {
        await fullSync(auth);
      } catch (e: any) {
        console.error(`[Sync] Periodic sync failed for ${auth.userId}:`, e.message);
      }
    }
  }, intervalMs);

  _syncTimers.set("periodic", timer);
  console.log(`[Sync] Periodic sync started (every ${intervalMs / 1000}s)`);
}
