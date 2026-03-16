import { db } from "./db";
import { pool } from "./db";

const WEBSITE_API_URL = process.env.WEBSITE_API_URL || process.env.COMPANION_API_URL || "https://loadlink.replit.app";
const WEBSITE_API_KEY = process.env.WEBSITE_API_KEY || process.env.COMPANION_API_KEY || "";

interface SyncAuth {
  jwt: string;
  userId: string;
  user: any;
}

async function websiteFetchSync(
  path: string,
  options: { method?: string; body?: any; jwt?: string; query?: Record<string, string> } = {}
): Promise<any> {
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
  if (!res.ok) {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return null;
    }
    return null;
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  return res.json();
}

const hiddenJobIds = new Set([
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

  const updateClauses = keys
    .filter((k) => k !== idField)
    .map((k) => `${k} = EXCLUDED.${k}`);

  if (updateClauses.length === 0) {
    const sql = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (${idField}) DO NOTHING`;
    await pool.query(sql, values);
  } else {
    const sql = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (${idField}) DO UPDATE SET ${updateClauses.join(", ")}`;
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

export async function syncJobs(auth: SyncAuth): Promise<number> {
  try {
    const allJobs = await websiteFetchSync("/api/jobs", { jwt: auth.jwt });
    if (!Array.isArray(allJobs)) return 0;

    const jobs = allJobs.filter((j: any) => j.id && !hiddenJobIds.has(j.id));
    const count = await upsertMany("jobs", jobs);

    const projectMap = new Map<string, any>();
    for (const j of jobs) {
      const pId = j.projectId || j.project_id;
      const pName = j.projectName || j.project_name;
      const cId = j.contractorId || j.contractor_id;
      if (pId && pName) {
        projectMap.set(pId, {
          id: pId,
          name: pName,
          contractor_id: cId,
          status: "active",
        });
      }
    }

    await updateSyncTime("jobs", auth.userId);
    return count;
  } catch (e: any) {
    console.error("syncJobs error:", e.message);
    return 0;
  }
}

export async function syncProjects(auth: SyncAuth): Promise<number> {
  try {
    let projects: any[] = [];

    const websiteProjects = await websiteFetchSync("/api/projects", { jwt: auth.jwt });
    if (Array.isArray(websiteProjects) && websiteProjects.length > 0) {
      projects = websiteProjects;
    }

    if (projects.length === 0) {
      const allJobs = await websiteFetchSync("/api/jobs", { jwt: auth.jwt });
      if (Array.isArray(allJobs)) {
        const projectMap = new Map<string, any>();
        for (const j of allJobs.filter((j: any) => !hiddenJobIds.has(j.id))) {
          const pId = j.projectId || j.project_id;
          const pName = j.projectName || j.project_name;
          const cId = j.contractorId || j.contractor_id;
          if (pId && pName) {
            projectMap.set(pId, {
              id: pId,
              name: pName,
              contractor_id: cId || auth.userId,
              status: "active",
            });
          }
        }
        projects = [...projectMap.values()];
      }
    }

    const count = await upsertMany("contractor_projects", projects);
    await updateSyncTime("projects", auth.userId);
    return count;
  } catch (e: any) {
    console.error("syncProjects error:", e.message);
    return 0;
  }
}

export async function syncJobAssignments(auth: SyncAuth): Promise<number> {
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
    const mapped = data.map((v: any) => ({
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
      await upsertRow("users", auth.user);
    }
  } catch (e: any) {
    console.error("syncUser error:", e.message);
  }
}

export async function fullSync(auth: SyncAuth): Promise<{ jobs: number; projects: number; assignments: number; vehicles: number }> {
  const t0 = Date.now();
  console.log(`[Sync] Starting full sync for user ${auth.userId}...`);

  await syncUser(auth);

  const [jobs, projects, assignments, vehicles] = await Promise.allSettled([
    syncJobs(auth),
    syncProjects(auth),
    syncJobAssignments(auth),
    syncVehicles(auth),
  ]);

  Promise.allSettled([
    syncAvailability(auth),
    syncInvoices(auth),
    syncNotifications(auth),
  ]).catch(() => {});

  const result = {
    jobs: jobs.status === "fulfilled" ? jobs.value : 0,
    projects: projects.status === "fulfilled" ? projects.value : 0,
    assignments: assignments.status === "fulfilled" ? assignments.value : 0,
    vehicles: vehicles.status === "fulfilled" ? vehicles.value : 0,
  };

  console.log(`[Sync] Full sync complete in ${Date.now() - t0}ms: ${JSON.stringify(result)}`);
  return result;
}

export async function pushToWebsite(
  path: string,
  auth: SyncAuth,
  options: { method?: string; body?: any } = {}
): Promise<any> {
  try {
    const result = await websiteFetchSync(path, {
      method: options.method || "POST",
      body: options.body,
      jwt: auth.jwt,
    });
    return result;
  } catch (e: any) {
    console.error(`[Sync] Push to website failed: ${path}`, e.message);
    return null;
  }
}

const _syncTimers = new Map<string, NodeJS.Timeout>();

const _lastUserActivity = new Map<string, number>();

export function recordUserActivity(userId: string) {
  _lastUserActivity.set(userId, Date.now());
}

export function startPeriodicSync(getActiveAuths: () => SyncAuth[], intervalMs = 60000) {
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
