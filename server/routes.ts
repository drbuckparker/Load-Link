import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { pool } from "./db";
import { fullSync, pushToWebsite, startPeriodicSync, recordUserActivity, syncJobAssignments, drainSyncQueue, getSyncQueueStatus, backfillUserEntities } from "./sync";
import { deletedVehicleIds, pauseJobSync, resumeJobSync } from "./deleted-vehicles";

const WEBSITE_API_URL = process.env.WEBSITE_API_URL || process.env.COMPANION_API_URL || "https://loadlinklive.com";
const WEBSITE_API_KEY = process.env.WEBSITE_API_KEY || process.env.COMPANION_API_KEY || "";

const DATA_DIR = join(process.cwd(), ".data");
try { mkdirSync(DATA_DIR, { recursive: true }); } catch {}

async function sendPushNotification(userId: string, title: string, body: string, data?: Record<string, any>) {
  try {
    const result = await pool.query(`SELECT expo_push_token FROM users WHERE id::text = $1 LIMIT 1`, [userId]);
    const token = result.rows[0]?.expo_push_token;
    if (!token) return;
    const message = { to: token, sound: 'default' as const, title, body, data: data || {} };
    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!pushRes.ok) console.error('Push notification failed:', pushRes.status);
  } catch (e: any) {
    console.error('Push notification error:', e.message);
  }
}

function loadJsonMap<T>(filename: string): Map<string, T> {
  try {
    const raw = readFileSync(join(DATA_DIR, filename), "utf-8");
    const entries: [string, T][] = JSON.parse(raw);
    return new Map(entries);
  } catch { return new Map(); }
}

function saveJsonMap<T>(filename: string, map: Map<string, T>) {
  try {
    if (map.size > 200) {
      const entries = [...map.entries()];
      const trimmed = entries.slice(entries.length - 200);
      map.clear();
      for (const [k, v] of trimmed) map.set(k, v);
    }
    writeFileSync(join(DATA_DIR, filename), JSON.stringify([...map.entries()]), "utf-8");
  } catch {}
}

const tokenToJwt = loadJsonMap<{ jwt: string; userId: string; user: any; originalRole?: string }>("sessions.json");

// Returns the set of roles this user is authorized to switch between based on
// their account's base role (e.g. a driver_contractor may switch between
// 'driver' and 'contractor' views; a plain 'driver' may not switch at all).
function allowedRolesForUser(baseRole: string): string[] {
  if (!baseRole) return [];
  const compound: Record<string, string[]> = {
    driver_contractor: ["driver", "contractor"],
    driver_trucking_company: ["driver", "trucking_company"],
    trucking_company_contractor: ["trucking_company", "contractor"],
    driver_trucking_company_contractor: ["driver", "trucking_company", "contractor"],
  };
  return compound[baseRole] ?? [baseRole];
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
]);

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function addDualKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(addDualKeys);
  if (obj === null || typeof obj !== "object" || obj instanceof Date) return obj;
  const result: any = {};
  for (const key of Object.keys(obj)) {
    const val = addDualKeys(obj[key]);
    result[key] = val;
    const snake = camelToSnake(key);
    const camel = snakeToCamel(key);
    if (snake !== key) result[snake] = val;
    if (camel !== key) result[camel] = val;
  }
  return result;
}

function getWebsiteAuth(req: Request): { jwt: string; userId: string; user: any } | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return tokenToJwt.get(token) || null;
  }
  return null;
}

async function websiteFetch(
  path: string,
  options: {
    method?: string;
    body?: any;
    jwt?: string;
    query?: Record<string, string>;
  } = {}
): Promise<globalThis.Response> {
  const url = new URL(path, WEBSITE_API_URL);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, v);
      }
    }
  }

  const headers: Record<string, string> = {
    "X-API-Key": WEBSITE_API_KEY,
    "Content-Type": "application/json",
  };

  if (options.jwt) {
    headers["Authorization"] = `Bearer ${options.jwt}`;
  }

  const fetchOpts: RequestInit = {
    method: options.method || "GET",
    headers,
  };

  if (options.body && options.method !== "GET") {
    fetchOpts.body = JSON.stringify(options.body);
  }

  return fetch(url.toString(), fetchOpts);
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min`;
  if (hours > 0) return `${hours} hr`;
  return `${minutes} min`;
}


export async function registerRoutes(app: Express): Promise<Server> {
  function requireAuth(req: Request, res: Response, next: Function) {
    const auth = getWebsiteAuth(req);
    if (auth) {
      (req as any).userId = auth.userId;
      (req as any).websiteJwt = auth.jwt;
      recordUserActivity(auth.userId);
      return next();
    }
    return res.status(401).json({ message: "Not authenticated" });
  }

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }

      // Dev-only local authentication. In production the upstream website is the
      // sole authority for credentials. In development the workspace uses its own
      // database (separate from the website's), so we authenticate directly
      // against the local users table. This lets developers sign in without the
      // website accepting the account (e.g. Sign-in-with-Replit accounts).
      if (process.env.NODE_ENV !== "production") {
        try {
          const localRes = await pool.query(
            `SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1`,
            [email],
          );
          const dbUser = localRes.rows[0];
          if (dbUser?.password && (await bcrypt.compare(password, dbUser.password))) {
            const localToken = crypto.randomBytes(32).toString("hex");
            const authEntry = {
              jwt: `dev-local:${dbUser.id}`,
              userId: dbUser.id,
              user: dbUser,
              originalRole: dbUser.role as string,
            };
            tokenToJwt.set(localToken, authEntry);
            saveJsonMap("sessions.json", tokenToJwt);
            return res.json({ token: localToken, user: addDualKeys(dbUser) });
          }
        } catch (devErr: any) {
          console.error("Dev local login failed, falling back to website:", devErr.message);
        }
      }

      // Always validate credentials against the upstream website. We forward
      // the password so the website can verify it. The cached-session fast-path
      // that existed previously is removed because it allowed anyone who knew
      // a valid email to receive a bearer token without a password check.
      const websiteRes = await websiteFetch("/api/companion/auth/login", {
        method: "POST",
        body: { email, password },
      });

      const data = await websiteRes.json();

      if (!websiteRes.ok) {
        return res.status(websiteRes.status).json({
          message: data.message || data.error || "Invalid credentials",
        });
      }

      const jwt = data.token;
      const user = data.user;

      if (!jwt || !user) {
        return res.status(500).json({ message: "Invalid response from auth service" });
      }

      const localToken = crypto.randomBytes(32).toString("hex");
      const authEntry = { jwt, userId: user.id, user, originalRole: user.role as string };
      tokenToJwt.set(localToken, authEntry);
      saveJsonMap("sessions.json", tokenToJwt);

      const enrichedUser = addDualKeys(user);
      res.json({ token: localToken, user: enrichedUser });

      fullSync(authEntry).catch(() => {});
      return;
    } catch (err: any) {
      console.error("Login error:", err.message);
      return res.status(500).json({ message: "Authentication service unavailable" });
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const websiteRes = await websiteFetch("/api/companion/auth/register", {
        method: "POST",
        body: req.body,
      });

      const data = await websiteRes.json();

      if (!websiteRes.ok) {
        return res.status(websiteRes.status).json(data);
      }

      const jwt = data.token;
      const user = data.user;

      if (jwt && user) {
        const localToken = crypto.randomBytes(32).toString("hex");
        tokenToJwt.set(localToken, { jwt, userId: user.id, user });
        saveJsonMap("sessions.json", tokenToJwt);
        return res.json({ token: localToken, user: addDualKeys(user) });
      }

      return res.json(addDualKeys(data));
    } catch (err: any) {
      console.error("Register error:", err.message);
      return res.status(500).json({ message: "Registration service unavailable" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      tokenToJwt.delete(authHeader.slice(7));
      saveJsonMap("sessions.json", tokenToJwt);
    }
    return res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    return res.json({ user: addDualKeys(auth.user) });
  });

  // Permanently delete the authenticated user's account and ALL associated data.
  // Required by Apple App Store Guideline 5.1.1(v). Runs as a single transaction
  // against the shared DB — if any step fails, nothing is deleted.
  app.delete("/api/account", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    const userId = auth.userId;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Reusable subqueries for the user's owned jobs / job runs
      const ownedJobs = `SELECT id FROM jobs WHERE contractor_id = $1`;
      const relevantRuns = `SELECT id FROM job_runs WHERE driver_id = $1 OR job_id IN (${ownedJobs})`;

      // --- Deepest children first (job_run / job children) ---
      await client.query(
        `DELETE FROM weight_tickets WHERE driver_id = $1 OR job_id IN (${ownedJobs}) OR job_run_id IN (${relevantRuns})`,
        [userId]
      );
      await client.query(
        `DELETE FROM driver_location_updates WHERE driver_id = $1 OR job_run_id IN (${relevantRuns})`,
        [userId]
      );
      await client.query(
        `DELETE FROM still_working_checks WHERE driver_id = $1 OR job_id IN (${ownedJobs}) OR job_run_id IN (${relevantRuns})`,
        [userId]
      );
      await client.query(
        `DELETE FROM job_photos WHERE driver_id = $1 OR job_id IN (${ownedJobs}) OR job_run_id IN (${relevantRuns})`,
        [userId]
      );
      await client.query(
        `DELETE FROM scheduled_notifications WHERE driver_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM job_bids WHERE driver_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM job_stops WHERE added_by_user_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM job_messages WHERE sender_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM reviews WHERE reviewer_id = $1 OR reviewee_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM conversation_actions WHERE user_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM monthly_invoices WHERE contractor_id = $1 OR driver_id = $1`,
        [userId]
      );
      await client.query(
        `DELETE FROM job_runs WHERE driver_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );
      await client.query(
        `DELETE FROM job_assignments WHERE driver_id = $1 OR job_id IN (${ownedJobs})`,
        [userId]
      );

      // --- Trucks / availability / invitations ---
      await client.query(
        `DELETE FROM truck_availability WHERE trucking_company_id = $1 OR truck_id IN (SELECT id FROM trucks WHERE trucking_company_id = $1)`,
        [userId]
      );
      await client.query(
        `DELETE FROM driver_invitations WHERE contractor_id = $1 OR driver_id = $1 OR trucking_company_id = $1 OR assigned_truck_id IN (SELECT id FROM trucks WHERE trucking_company_id = $1)`,
        [userId]
      );
      await client.query(`DELETE FROM trucks WHERE trucking_company_id = $1`, [userId]);
      await client.query(`UPDATE trucks SET assigned_driver_id = NULL WHERE assigned_driver_id = $1`, [userId]);
      await client.query(`DELETE FROM driver_vehicles WHERE driver_id = $1`, [userId]);
      await client.query(`UPDATE driver_vehicles SET assigned_driver_id = NULL WHERE assigned_driver_id = $1`, [userId]);

      // --- Jobs: delete owned; dissociate where the user was the assigned driver ---
      await client.query(`DELETE FROM jobs WHERE contractor_id = $1`, [userId]);
      await client.query(`UPDATE jobs SET driver_id = NULL WHERE driver_id = $1`, [userId]);

      // --- Documents / contractor data / favorites / availability ---
      await client.query(
        `DELETE FROM document_shares WHERE contractor_id = $1 OR document_id IN (SELECT id FROM driver_documents WHERE driver_id = $1)`,
        [userId]
      );
      await client.query(`DELETE FROM driver_documents WHERE driver_id = $1`, [userId]);
      await client.query(`DELETE FROM contractor_materials WHERE contractor_id = $1`, [userId]);
      await client.query(`DELETE FROM contractor_projects WHERE contractor_id = $1`, [userId]);
      await client.query(`DELETE FROM contractor_favorites WHERE contractor_id = $1`, [userId]);
      await client.query(`DELETE FROM driver_availability WHERE driver_id = $1`, [userId]);
      await client.query(`DELETE FROM driver_favorites WHERE driver_id = $1 OR favoriter_id = $1`, [userId]);
      await client.query(`DELETE FROM company_favorites WHERE driver_id = $1 OR company_id = $1`, [userId]);
      await client.query(`DELETE FROM foreman_requests WHERE foreman_id = $1 OR target_company_id = $1`, [userId]);

      // --- Per-user system rows ---
      await client.query(`DELETE FROM notifications WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM push_subscriptions WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM sync_metadata WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM sync_queue WHERE user_id = $1`, [userId]);

      // --- Dissociate other users who point to this account as their trucking company ---
      await client.query(`UPDATE users SET trucking_company_id = NULL WHERE trucking_company_id = $1`, [userId]);

      // --- Finally, the account itself ---
      const del = await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
      if (del.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Account not found" });
      }

      await client.query("COMMIT");

      // Invalidate ALL local sessions for this user (in case of multiple devices)
      let sessionsChanged = false;
      for (const [token, session] of tokenToJwt.entries()) {
        if (session.userId === userId) {
          tokenToJwt.delete(token);
          sessionsChanged = true;
        }
      }
      if (sessionsChanged) saveJsonMap("sessions.json", tokenToJwt);

      return res.json({ ok: true });
    } catch (err: any) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("Account deletion error:", err.message);
      return res.status(500).json({ message: "Failed to delete account. Please try again." });
    } finally {
      client.release();
    }
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const websiteRes = await websiteFetch("/api/auth/forgot-password", {
        method: "POST",
        body: req.body,
      });
      const data = await websiteRes.json();
      return res.status(websiteRes.status).json(data);
    } catch {
      return res.json({ message: "If an account exists with that email, a reset link has been sent." });
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const websiteRes = await websiteFetch("/api/auth/reset-password", {
        method: "POST",
        body: req.body,
      });
      const data = await websiteRes.json();
      return res.status(websiteRes.status).json(data);
    } catch {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/auth/set-password", requireAuth, async (req: Request, res: Response) => {
    try {
      const websiteRes = await websiteFetch("/api/auth/set-password", { method: "POST", body: req.body, jwt: getWebsiteAuth(req)?.jwt });
      const data = await websiteRes.json();
      return res.status(websiteRes.status).json(data);
    } catch {
      return res.status(500).json({ message: "Service unavailable" });
    }
  });

  app.post("/api/push/register", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const { token, expoPushToken, expo_push_token } = req.body;
      const pushToken = token || expoPushToken || expo_push_token;
      if (pushToken) {
        await pool.query(`UPDATE users SET expo_push_token = $1 WHERE id = $2`, [pushToken, auth.userId]);
      }
    } catch {}
    return res.json({ ok: true });
  });

  app.get("/api/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const startDate = req.query.start_date as string | undefined;
      const endDate = req.query.end_date as string | undefined;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;
      const driverId = req.query.driver_id as string | undefined;

      let query = `SELECT j.*, cp.name as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id WHERE j.archived_at IS NULL`;
      const params: any[] = [];
      let paramIdx = 1;

      if (hiddenJobIds.size > 0) {
        query += ` AND j.id NOT IN (${[...hiddenJobIds].map((_, i) => `$${paramIdx + i}`).join(',')})`;
        params.push(...hiddenJobIds);
        paramIdx += hiddenJobIds.size;
      }

      const singleDate = req.query.date as string | undefined;
      if (singleDate) {
        query += ` AND (
          j.scheduled_date::date = $${paramIdx}::date
          OR (
            j.scheduled_date::date < $${paramIdx}::date
            AND COALESCE(j.estimated_days, 1)::numeric > 1
            AND (j.scheduled_date::date + (CEIL(COALESCE(j.estimated_days, 1)::numeric * 2)::int) * INTERVAL '1 day')::date >= $${paramIdx}::date
          )
        )`;
        params.push(singleDate);
        paramIdx++;
      }
      if (startDate) {
        query += ` AND (j.scheduled_date >= $${paramIdx} OR j.created_at >= $${paramIdx})`;
        params.push(new Date(startDate));
        paramIdx++;
      }
      if (endDate) {
        query += ` AND (j.scheduled_date <= $${paramIdx} OR j.created_at <= $${paramIdx})`;
        params.push(new Date(endDate));
        paramIdx++;
      }
      if (status) {
        const statusLower = status.toLowerCase();
        if (statusLower === 'in_progress' || statusLower === 'active') {
          query += ` AND j.status::text IN ('in_progress', 'accepted', 'pending')`;
        } else if (statusLower === 'open') {
          query += ` AND j.status::text IN ('open', 'accepted', 'pending')`;
        } else {
          query += ` AND j.status::text = $${paramIdx}`;
          params.push(statusLower);
          paramIdx++;
        }
      }
      if (driverId) {
        query += ` AND (j.driver_id = $${paramIdx} OR j.id IN (SELECT job_id FROM job_assignments WHERE driver_id = $${paramIdx}))`;
        params.push(driverId);
        paramIdx++;
      }
      if (search) {
        query += ` AND (j.material_type ILIKE $${paramIdx} OR j.pickup_location ILIKE $${paramIdx} OR j.dropoff_location ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
      }
      // Hide jobs from Find Jobs when they're no longer truly available to apply to.
      // EXCEPTION: never hide a job from the contractor who posted it — they should
      // always be able to see their own postings in Find Jobs as a "this is live"
      // confirmation, regardless of crewed/approved/cap status.
      // Conditions for hiding (apply only when caller is NOT the contractor):
      //   a) Fully crewed: approved trucks >= trucks_needed
      //   b) Application cap hit: (pending+approved) >= cap AND caller hasn't applied
      //      Cap by trucks_needed: 1 -> 5, 2 -> 8, 3+ -> 3 * trucks_needed
      //   c) Caller is already an approved truck on this job — it lives on their
      //      calendar now, not in Find Jobs.
      query += ` AND NOT (
        j.contractor_id::text != $${paramIdx}
        AND j.status::text IN ('open', 'accepted', 'pending')
        AND (
          (SELECT COUNT(*) FROM job_assignments ja
            WHERE ja.job_id = j.id AND ja.status::text = 'approved')
          >= COALESCE(j.trucks_needed, 1)
          OR EXISTS (
            SELECT 1 FROM job_assignments ja
            WHERE ja.job_id = j.id AND ja.driver_id = $${paramIdx}
              AND ja.status::text = 'approved'
          )
          OR (
            (SELECT COUNT(*) FROM job_assignments ja
              WHERE ja.job_id = j.id AND ja.status::text IN ('pending', 'approved'))
            >= CASE
                WHEN COALESCE(j.trucks_needed, 1) <= 1 THEN 5
                WHEN COALESCE(j.trucks_needed, 1) = 2 THEN 8
                ELSE 3 * COALESCE(j.trucks_needed, 1)
              END
            AND NOT EXISTS (
              SELECT 1 FROM job_assignments ja
              WHERE ja.job_id = j.id AND ja.driver_id = $${paramIdx}
                AND ja.status::text IN ('pending', 'approved')
            )
          )
        )
      )`;
      params.push(auth.userId);
      paramIdx++;
      query += ` ORDER BY j.scheduled_date ASC NULLS LAST, j.created_at DESC`;

      const result = await pool.query(query, params);
      return res.json(result.rows.map(addDualKeys));
    } catch (e: any) {
      console.error("GET /api/jobs local error:", e.message);
      return res.json([]);
    }
  });

  app.get("/api/jobs/archived", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT j.*, cp.name as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id
         WHERE j.archived_at IS NOT NULL AND (j.contractor_id = $1 OR j.driver_id = $1 OR j.id IN (SELECT job_id FROM job_assignments WHERE driver_id = $1))
         ORDER BY j.archived_at DESC`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.post("/api/jobs/:id/unarchive", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const upd = await pool.query(
        `UPDATE jobs SET archived_at = NULL, status = 'open', cancelled_at = NULL
         WHERE id = $1 AND (contractor_id::text = $2 OR driver_id::text = $2) RETURNING id`,
        [req.params.id, auth.userId]
      );
      if (upd.rowCount === 0) return res.status(404).json({ message: "Job not found" });
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Unarchive job error:", e.message);
      return res.status(500).json({ message: "Failed to unarchive job" });
    }
  });

  app.post("/api/jobs/:id/cancel", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const reason = (req.body?.reason || '').toString();
      const upd = await pool.query(
        `UPDATE jobs SET status = 'cancelled', cancelled_at = NOW()
         WHERE id = $1 AND (contractor_id::text = $2 OR driver_id::text = $2) RETURNING id`,
        [req.params.id, auth.userId]
      );
      if (upd.rowCount === 0) return res.status(404).json({ message: "Job not found" });
      pushToWebsite(`/api/jobs/${req.params.id}/cancel`, auth, { method: "POST", body: reason ? { reason } : {} }).catch(() => {});
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Cancel job error:", e.message);
      return res.status(500).json({ message: "Failed to cancel job" });
    }
  });

  app.post("/api/jobs/:id/archive", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const upd = await pool.query(
        `UPDATE jobs SET archived_at = NOW()
         WHERE id = $1 AND (contractor_id::text = $2 OR driver_id::text = $2) RETURNING id`,
        [req.params.id, auth.userId]
      );
      if (upd.rowCount === 0) return res.status(404).json({ message: "Job not found" });
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Archive job error:", e.message);
      return res.status(500).json({ message: "Failed to archive job" });
    }
  });

  app.get("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT j.*, cp.name as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN users u ON j.contractor_id::text = u.id::text WHERE j.id = $1`,
        [req.params.id]
      );
      if (result.rows.length > 0) {
        const job = result.rows[0];
        const isParticipant = (
          String(job.contractor_id) === auth.userId ||
          String(job.driver_id) === auth.userId
        );
        let hasAssignment = false;
        if (!isParticipant) {
          const aCheck = await pool.query(
            `SELECT 1 FROM job_assignments WHERE job_id = $1 AND driver_id = $2
             AND status::text NOT IN ('rejected', 'withdrawn', 'cancelled', 'expired') LIMIT 1`,
            [req.params.id, auth.userId]
          );
          hasAssignment = aCheck.rows.length > 0;
        }
        const canSeeDetails = isParticipant || hasAssignment;
        if (canSeeDetails) {
          const assignResult = await pool.query(
            `SELECT ja.*, t.make as vehicle_make, t.model as vehicle_model, t.year as vehicle_year,
                    t.truck_number as vehicle_truck_number, t.license_plate as vehicle_license_plate,
                    t.truck_type as vehicle_truck_type, t.capacity as vehicle_capacity, t.has_tarp as vehicle_has_tarp
             FROM job_assignments ja LEFT JOIN trucks t ON ja.vehicle_id = t.id WHERE ja.job_id = $1`, [req.params.id]);
          const runsResult = await pool.query(`SELECT * FROM job_runs WHERE job_id = $1 ORDER BY created_at DESC`, [req.params.id]);
          const weightResult = await pool.query(`SELECT * FROM weight_tickets WHERE job_id = $1`, [req.params.id]);
          job.assignments = assignResult.rows.map(row => {
            const a = addDualKeys(row);
            if (row.vehicle_id) {
              a.vehicle = {
                id: row.vehicle_id,
                make: row.vehicle_make, model: row.vehicle_model, year: row.vehicle_year,
                truck_number: row.vehicle_truck_number, truckNumber: row.vehicle_truck_number,
                license_plate: row.vehicle_license_plate, licensePlate: row.vehicle_license_plate,
                truck_type: row.vehicle_truck_type, truckType: row.vehicle_truck_type,
                capacity: row.vehicle_capacity, max_capacity_tons: row.vehicle_capacity,
                has_tarp: row.vehicle_has_tarp, hasTarp: row.vehicle_has_tarp,
              };
            }
            return a;
          });
          job.jobRuns = runsResult.rows.map(addDualKeys);
          job.job_runs = job.jobRuns;
          job.runs = job.jobRuns;
          job.weightTickets = weightResult.rows.map(addDualKeys);
          job.weight_tickets = job.weightTickets;
        } else {
          job.assignments = [];
          job.jobRuns = [];
          job.job_runs = [];
          job.runs = [];
          job.weightTickets = [];
          job.weight_tickets = [];
        }
        return res.json(addDualKeys(job));
      }
      return res.status(404).json({ message: "Job not found" });
    } catch (e: any) {
      console.error("GET /api/jobs/:id error:", e.message);
      return res.status(500).json({ message: "Failed to load job" });
    }
  });

  app.post("/api/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const id = crypto.randomUUID();
      const body = { ...req.body, id, contractor_id: auth.userId, status: 'open', created_at: new Date().toISOString() };

      const columns = ['id', 'contractor_id', 'material', 'origin_address', 'destination_address', 'rate', 'rate_type',
        'truck_type', 'status', 'scheduled_date', 'project_id', 'trucks_needed', 'estimated_days', 'includes_weekends', 'includes_saturday', 'includes_sunday',
        'estimated_cost', 'origin_lat', 'origin_lng', 'destination_lat', 'destination_lng', 'job_type',
        'requires_weight_tickets', 'requires_tarp', 'urgent', 'paperwork_description', 'created_at', 'updated_at',
        'capacity_needed', 'total_tons_needed', 'total_amount_unit', 'pickup_time', 'estimated_trips'];

      const snakeBody: Record<string, any> = {};
      for (const [k, v] of Object.entries(body)) {
        snakeBody[camelToSnake(k)] = v;
      }
      snakeBody.id = id;
      snakeBody.contractor_id = auth.userId;
      snakeBody.status = snakeBody.status || 'open';
      snakeBody.created_at = snakeBody.created_at || new Date().toISOString();
      snakeBody.updated_at = new Date().toISOString();

      const validCols = columns.filter(c => snakeBody[c] !== undefined);
      const vals = validCols.map(c => snakeBody[c]);
      const placeholders = vals.map((_, i) => `$${i + 1}`);

      await pool.query(`INSERT INTO jobs (${validCols.join(', ')}) VALUES (${placeholders.join(', ')})`, vals);

      const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [id]);
      const job = result.rows[0] || { id, ...snakeBody };

      const pushBody = { ...req.body, id };
      console.log(`POST /api/jobs pushing to website with projectId=${pushBody.projectId || pushBody.project_id || 'none'}, id=${id}`);
      pushToWebsite("/api/jobs", auth, { method: "POST", body: pushBody }).catch(() => {});

      return res.status(201).json(addDualKeys(job));
    } catch (e: any) {
      console.error("POST /api/jobs error:", e.message);
      return res.status(500).json({ message: "Failed to create job" });
    }
  });

  app.put("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;

      const beforeRow = await pool.query(`SELECT scheduled_date, material, contractor_id FROM jobs WHERE id = $1`, [req.params.id]);
      if (!beforeRow.rows[0]) return res.status(404).json({ message: "Job not found" });
      if (String(beforeRow.rows[0].contractor_id) !== String(auth.userId)) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const prevDate = beforeRow.rows[0]?.scheduled_date ? String(beforeRow.rows[0].scheduled_date).slice(0, 10) : null;
      const jobMaterial = beforeRow.rows[0]?.material || '';
      const jobContractorId = beforeRow.rows[0]?.contractor_id;

      if (!beforeRow.rows[0] || String(jobContractorId) !== auth.userId) {
        return res.status(403).json({ message: "You do not have permission to update this job" });
      }

      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;
      for (const [k, v] of Object.entries(req.body)) {
        if (v !== undefined) {
          const col = camelToSnake(k);
          updates.push(`${col} = $${idx}`);
          values.push(v);
          idx++;
        }
      }
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(req.params.id);
        await pool.query(`UPDATE jobs SET ${updates.join(', ')} WHERE id = $${idx}`, values);
      }

      const newDateRaw = req.body?.scheduledDate ?? req.body?.scheduled_date;
      const newDate = newDateRaw ? String(newDateRaw).slice(0, 10) : null;
      const dateChanged = newDate && prevDate && newDate !== prevDate;

      if (dateChanged) {
        const approvedAssignments = await pool.query(
          `SELECT id, driver_id FROM job_assignments WHERE job_id = $1 AND status::text = 'approved'`,
          [req.params.id]
        );
        if (approvedAssignments.rows.length > 0) {
          await pool.query(
            `UPDATE job_assignments SET status = 'pending', approved_at = NULL WHERE job_id = $1 AND status::text = 'approved'`,
            [req.params.id]
          );
          await pool.query(`UPDATE jobs SET status = 'open', updated_at = NOW() WHERE id = $1 AND status::text = 'accepted'`, [req.params.id]);

          const contractorRow = jobContractorId
            ? await pool.query(`SELECT full_name, company FROM users WHERE id::text = $1`, [String(jobContractorId)])
            : { rows: [] as any[] };
          const contractorName = contractorRow.rows[0]?.company || contractorRow.rows[0]?.full_name || 'The contractor';
          const formatted = (() => {
            try {
              const [y, m, d] = newDate.split('-').map(Number);
              return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            } catch { return newDate; }
          })();
          const notifTitle = 'Job Date Changed - Confirm Availability';
          const notifBody = `${contractorName} moved the ${jobMaterial || 'job'} to ${formatted}. Re-confirm to keep your assignment.`;
          for (const a of approvedAssignments.rows) {
            if (a.driver_id) {
              sendPushNotification(String(a.driver_id), notifTitle, notifBody, { jobId: req.params.id, type: 'job_date_changed' });
            }
          }
        }
      }

      const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
      if (dateChanged) {
        pushToWebsite(`/api/jobs/${req.params.id}`, auth, { method: "PUT", body: req.body }).catch(() => {});
      }
      return res.json(addDualKeys(result.rows[0] || { id: req.params.id }));
    } catch (e: any) {
      console.error("PUT /api/jobs error:", e.message);
      return res.status(500).json({ message: "Failed to update job" });
    }
  });

  app.delete("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const upd = await pool.query(
        `UPDATE jobs SET status = 'cancelled', cancelled_at = NOW(), archived_at = NOW()
         WHERE id = $1 AND (contractor_id::text = $2 OR driver_id::text = $2) RETURNING id`,
        [req.params.id, auth.userId]
      );
      if (upd.rowCount === 0) return res.status(404).json({ message: "Job not found" });
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.post("/api/jobs/:id/accept", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const { vehicleIds } = req.body || {};

      // Look up the job + caller's favorite status BEFORE writing any assignments,
      // so we can enforce the auto-approval truck cap.
      const jobRow = await pool.query(
        `SELECT contractor_id, COALESCE(trucks_needed, 1)::int AS trucks_needed FROM jobs WHERE id = $1`,
        [req.params.id]
      );
      const contractorId = jobRow.rows[0]?.contractor_id;
      const trucksNeeded = Number(jobRow.rows[0]?.trucks_needed) || 1;

      let isAutoApprove = false;
      if (contractorId) {
        const userRow = await pool.query(`SELECT company FROM users WHERE id::text = $1`, [auth.userId]);
        const driverCompany = userRow.rows[0]?.company || '';
        const favCheck = await pool.query(
          `SELECT id FROM contractor_favorites WHERE contractor_id = $1 AND (
            (favorite_type = 'driver' AND favorite_driver_id = $2)
            OR (favorite_type = 'company' AND favorite_company_name = $3 AND $3 != '')
          ) LIMIT 1`,
          [contractorId, auth.userId, driverCompany]
        );
        isAutoApprove = favCheck.rows.length > 0;
      }

      // Auto-approval cap: an auto-approved driver cannot push the approved truck
      // count over `trucks_needed`. Existing pending applications by this same
      // driver also count, because the auto-approve sweep below will flip them.
      const requestedCount = (vehicleIds && Array.isArray(vehicleIds) && vehicleIds.length > 0)
        ? vehicleIds.length
        : 1;
      if (isAutoApprove) {
        const approvedRow = await pool.query(
          `SELECT COUNT(*)::int AS c FROM job_assignments WHERE job_id = $1 AND status::text = 'approved'`,
          [req.params.id]
        );
        const myPendingRow = await pool.query(
          `SELECT COUNT(*)::int AS c FROM job_assignments WHERE job_id = $1 AND driver_id = $2 AND status::text = 'pending'`,
          [req.params.id, auth.userId]
        );
        const approvedCount = approvedRow.rows[0]?.c || 0;
        const myPendingCount = myPendingRow.rows[0]?.c || 0;
        const slotsLeft = Math.max(0, trucksNeeded - approvedCount - myPendingCount);
        if (slotsLeft === 0) {
          return res.status(400).json({
            message: `This job is already fully staffed (${approvedCount + myPendingCount}/${trucksNeeded} trucks).`,
          });
        }
        if (requestedCount > slotsLeft) {
          return res.status(400).json({
            message: `This job only has ${slotsLeft} truck slot${slotsLeft === 1 ? '' : 's'} left for auto-approval. You're trying to book ${requestedCount}.`,
          });
        }
      }

      await pool.query(`UPDATE jobs SET status = 'pending', updated_at = NOW() WHERE id = $1`, [req.params.id]);

      if (vehicleIds && Array.isArray(vehicleIds) && vehicleIds.length > 0) {
        for (const vehicleId of vehicleIds) {
          const id = crypto.randomUUID();
          await pool.query(
            `INSERT INTO job_assignments (id, job_id, driver_id, vehicle_id, status, created_at)
             VALUES ($1, $2, $3, $4, 'pending', NOW())
             ON CONFLICT DO NOTHING`,
            [id, req.params.id, auth.userId, vehicleId]
          );
        }
      } else {
        const id = crypto.randomUUID();
        await pool.query(
          `INSERT INTO job_assignments (id, job_id, driver_id, status, created_at)
           VALUES ($1, $2, $3, 'pending', NOW())
           ON CONFLICT DO NOTHING`,
          [id, req.params.id, auth.userId]
        );
      }

      let autoApproved = false;
      if (isAutoApprove) {
        await pool.query(
          `UPDATE job_assignments SET status = 'approved', approved_at = NOW() WHERE job_id = $1 AND driver_id = $2 AND status::text = 'pending'`,
          [req.params.id, auth.userId]
        );
        await pool.query(`UPDATE jobs SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [req.params.id]);
        autoApproved = true;
      }

      pushToWebsite(`/api/jobs/${req.params.id}/accept`, auth, { method: "POST", body: req.body }).catch(() => {});
      const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
      const jobForNotif = result.rows[0];
      if (contractorId && contractorId !== auth.userId) {
        const applicantRow = await pool.query(`SELECT full_name, company FROM users WHERE id::text = $1`, [auth.userId]);
        const applicantName = applicantRow.rows[0]?.company || applicantRow.rows[0]?.full_name || 'A driver';
        const truckCount = (vehicleIds && Array.isArray(vehicleIds)) ? vehicleIds.length : 1;
        const notifTitle = 'New Truck Application';
        const notifBody = `${applicantName} applied ${truckCount} truck${truckCount > 1 ? 's' : ''} to your ${jobForNotif?.material || ''} job`;
        sendPushNotification(contractorId, notifTitle, notifBody, { jobId: req.params.id, type: 'job_application' });
      }
      return res.json({ ...addDualKeys(jobForNotif || { id: req.params.id, status: 'pending' }), autoApproved });
    } catch (e: any) {
      console.error("Accept job error:", e.message);
      return res.status(500).json({ message: "Failed to accept job" });
    }
  });

  app.get("/api/jobs/:id/vehicle-conflicts", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const jobResult = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
      const job = jobResult.rows[0];

      const assignResult = await pool.query(
        `SELECT ja.*, j.scheduled_date, j.estimated_days, j.material as job_material FROM job_assignments ja
         JOIN jobs j ON ja.job_id = j.id
         WHERE ja.vehicle_id IS NOT NULL AND ja.job_id != $1
         AND j.status::text IN ('open', 'in_progress', 'pending', 'accepted')
         AND ja.status::text NOT IN ('withdrawn', 'rejected', 'cancelled', 'expired')`,
        [req.params.id]
      );

      const vehiclesResult = await pool.query(
        `SELECT * FROM trucks WHERE trucking_company_id = $1 AND archived_at IS NULL`,
        [auth.userId]
      );

      const availResult = await pool.query(
        `SELECT * FROM driver_availability WHERE driver_id = $1 AND is_available = false AND vehicle_id IS NOT NULL`,
        [auth.userId]
      );

      const requiredCapacity = (() => {
        if (!job?.capacity_needed) return 0;
        const match = String(job.capacity_needed).match(/([\d.]+)/);
        return match ? parseFloat(match[1]) : 0;
      })();
      const requiresTarp = job?.requires_tarp || false;
      const requiredType = job?.truck_type || null;

      const jobStart = job?.scheduled_date ? new Date(job.scheduled_date) : null;
      const jobDays = Math.ceil(Number(job?.estimated_days) || 1);
      const jobDateKeys: string[] = [];
      if (jobStart) {
        for (let i = 0; i < jobDays; i++) {
          const d = new Date(jobStart);
          d.setDate(d.getDate() + i);
          jobDateKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
        }
      }

      const vehicleConflicts: Record<string, any> = {};
      for (const v of vehiclesResult.rows) {
        const vId = v.id;
        const vCapacity = parseFloat(v.capacity) || 0;
        const vHasTarp = v.has_tarp || false;
        const vType = v.truck_type || null;

        let blocked = false;
        let wrongType = false;
        let lowCapacity = false;
        let noTarp = false;
        let unavailable = false;
        const conflictDates: string[] = [];
        const conflictJobs: string[] = [];

        if (requiredType && vType && String(vType) !== String(requiredType)) {
          wrongType = true;
          blocked = true;
        }
        if (requiredCapacity > 0 && vCapacity > 0 && vCapacity < requiredCapacity) {
          lowCapacity = true;
          blocked = true;
        }
        if (requiresTarp && !vHasTarp) {
          noTarp = true;
          blocked = true;
        }

        for (const avail of availResult.rows) {
          if (avail.vehicle_id !== vId) continue;
          const aDate = new Date(avail.date);
          const aKey = `${aDate.getUTCFullYear()}-${String(aDate.getUTCMonth() + 1).padStart(2, '0')}-${String(aDate.getUTCDate()).padStart(2, '0')}`;
          if (jobDateKeys.includes(aKey)) {
            unavailable = true;
            blocked = true;
            break;
          }
        }

        for (const a of assignResult.rows) {
          if (a.vehicle_id !== vId) continue;
          const aStart = new Date(a.scheduled_date);
          const aDays = Math.ceil(Number(a.estimated_days) || 1);
          for (let i = 0; i < aDays; i++) {
            const d = new Date(aStart);
            d.setDate(d.getDate() + i);
            const dKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
            if (jobDateKeys.includes(dKey)) {
              conflictDates.push(dKey);
              if (a.job_material && !conflictJobs.includes(a.job_material)) conflictJobs.push(a.job_material);
              blocked = true;
            }
          }
        }

        vehicleConflicts[vId] = {
          blocked, wrongType, lowCapacity, noTarp, unavailable,
          conflictDates: [...new Set(conflictDates)],
          conflictJobs,
          requiredTons: requiredCapacity,
          vehicleTons: vCapacity,
        };
      }

      return res.json({ vehicleConflicts, requiredTruckType: requiredType });
    } catch (e: any) {
      console.error("vehicle-conflicts error:", e.message);
      return res.json({ vehicleConflicts: {} });
    }
  });

  app.post("/api/jobs/:id/counter-bid", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const { rate, note } = req.body;
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO job_assignments (id, job_id, driver_id, status, counter_bid_rate, counter_bid_note, created_at)
         VALUES ($1, $2, $3, 'counter_bid', $4, $5, NOW()) ON CONFLICT DO NOTHING`,
        [id, req.params.id, auth.userId, rate, note]
      );
      pushToWebsite(`/api/jobs/${req.params.id}/bids`, auth, { method: "POST", body: req.body }).catch(() => {});
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Counter bid error:", e.message);
      return res.status(500).json({ message: "Failed to submit counter bid" });
    }
  });

  app.post("/api/jobs/:id/withdraw", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const myAssignments = await pool.query(
        `SELECT id FROM job_assignments WHERE job_id = $1 AND driver_id = $2`,
        [req.params.id, auth.userId]
      );
      await pool.query(`UPDATE job_assignments SET status = 'withdrawn' WHERE job_id = $1 AND driver_id = $2`, [req.params.id, auth.userId]);
      const remaining = await pool.query(`SELECT COUNT(*) FROM job_assignments WHERE job_id = $1 AND status::text NOT IN ('withdrawn', 'rejected')`, [req.params.id]);
      if (parseInt(remaining.rows[0]?.count || '0') === 0) {
        await pool.query(`UPDATE jobs SET status = 'open', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      }
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.delete("/api/jobs/:id/assignments/:assignmentId", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const aRow = await pool.query(
        `SELECT ja.driver_id, j.contractor_id FROM job_assignments ja
         JOIN jobs j ON ja.job_id = j.id
         WHERE ja.id = $1 AND ja.job_id = $2`,
        [req.params.assignmentId, req.params.id]
      );
      if (aRow.rows.length === 0) return res.status(404).json({ message: "Assignment not found" });
      const { driver_id, contractor_id } = aRow.rows[0];
      if (String(contractor_id) !== auth.userId && String(driver_id) !== auth.userId) {
        return res.status(403).json({ message: "You do not have permission to modify this assignment" });
      }
      await pool.query(`UPDATE job_assignments SET status = 'withdrawn' WHERE id = $1`, [req.params.assignmentId]);
      const remaining = await pool.query(`SELECT COUNT(*) FROM job_assignments WHERE job_id = $1 AND status::text NOT IN ('withdrawn', 'rejected')`, [req.params.id]);
      const remainingCount = parseInt(remaining.rows[0]?.count || '0');
      if (remainingCount === 0) {
        await pool.query(`UPDATE jobs SET status = 'open', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      }
      return res.json({ ok: true, remainingAssignments: remainingCount });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.post("/api/cleanup-duplicate-assignments", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      await pool.query(
        `DELETE FROM job_assignments
         WHERE driver_id = $1
           AND id NOT IN (
             SELECT MIN(id) FROM job_assignments
             WHERE driver_id = $1
             GROUP BY job_id, driver_id
           )`,
        [auth.userId]
      );
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.get("/api/jobs/:id/assignments", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const jobRow = await pool.query(`SELECT contractor_id, driver_id FROM jobs WHERE id = $1`, [req.params.id]);
      if (jobRow.rows.length === 0) return res.status(404).json({ message: "Job not found" });
      const { contractor_id, driver_id } = jobRow.rows[0];
      const isContractor = String(contractor_id) === auth.userId;
      const isDriver = String(driver_id) === auth.userId;
      if (!isContractor && !isDriver) {
        const aCheck = await pool.query(
          `SELECT 1 FROM job_assignments WHERE job_id = $1 AND driver_id = $2
           AND status::text NOT IN ('rejected', 'withdrawn', 'cancelled', 'expired') LIMIT 1`,
          [req.params.id, auth.userId]
        );
        if (aCheck.rows.length === 0) {
          return res.status(403).json({ message: "You do not have access to this job's assignments" });
        }
      }

      try {
        await syncJobAssignments(auth);
      } catch {}

      const result = await pool.query(
        `SELECT ja.*, u.full_name as driver_name, u.phone as driver_phone, u.email as driver_email, u.truck_type as driver_truck_type, u.rating as driver_rating, u.company as driver_company,
                t.make as vehicle_make, t.model as vehicle_model, t.year as vehicle_year,
                t.truck_number as vehicle_truck_number, t.license_plate as vehicle_license_plate,
                t.truck_type as vehicle_truck_type, t.capacity as vehicle_capacity, t.has_tarp as vehicle_has_tarp
         FROM job_assignments ja 
         LEFT JOIN users u ON ja.driver_id = u.id 
         LEFT JOIN trucks t ON ja.vehicle_id = t.id
         WHERE ja.job_id = $1`,
        [req.params.id]
      );
      return res.json(result.rows.map(row => {
        const a = addDualKeys(row);
        if (row.vehicle_id) {
          a.vehicle = {
            id: row.vehicle_id,
            make: row.vehicle_make, model: row.vehicle_model, year: row.vehicle_year,
            truck_number: row.vehicle_truck_number, truckNumber: row.vehicle_truck_number,
            license_plate: row.vehicle_license_plate, licensePlate: row.vehicle_license_plate,
            truck_type: row.vehicle_truck_type, truckType: row.vehicle_truck_type,
            capacity: row.vehicle_capacity, max_capacity_tons: row.vehicle_capacity, maxCapacityTons: row.vehicle_capacity,
            has_tarp: row.vehicle_has_tarp, hasTarp: row.vehicle_has_tarp,
          };
        }
        return a;
      }));
    } catch {
      return res.json([]);
    }
  });

  app.post("/api/jobs/:id/assignments/:assignmentId/approve", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const jobCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [req.params.id]);
      if (!jobCheck.rows[0] || jobCheck.rows[0].contractor_id !== auth.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await pool.query(`UPDATE job_assignments SET status = 'approved', approved_at = NOW() WHERE id = $1 AND job_id = $2`, [req.params.assignmentId, req.params.id]);
      await pool.query(`UPDATE jobs SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      pushToWebsite(`/api/job-assignments/${req.params.assignmentId}/approve`, auth, { method: "POST" }).catch(() => {});
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Approve assignment error:", e.message);
      return res.status(500).json({ message: "Failed to approve" });
    }
  });

  app.post("/api/jobs/:id/assignments/:assignmentId/reject", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const jobCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [req.params.id]);
      if (!jobCheck.rows[0] || jobCheck.rows[0].contractor_id !== auth.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await pool.query(`UPDATE job_assignments SET status = 'rejected' WHERE id = $1 AND job_id = $2`, [req.params.assignmentId, req.params.id]);
      pushToWebsite(`/api/job-assignments/${req.params.assignmentId}/reject`, auth, { method: "POST" }).catch(() => {});
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.get("/api/favorites", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT cf.*, 
          COALESCE(u.first_name || ' ' || u.last_name, '') as driver_name,
          u.company as driver_company
        FROM contractor_favorites cf
        LEFT JOIN users u ON cf.favorite_driver_id = u.id AND cf.favorite_type = 'driver'
        WHERE cf.contractor_id = $1 
        ORDER BY cf.created_at DESC`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/favorites", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const { favoriteType, favoriteDriverId, favoriteCompanyName } = req.body;
      const id = crypto.randomUUID();
      if (favoriteType === 'driver' && favoriteDriverId) {
        await pool.query(
          `INSERT INTO contractor_favorites (id, contractor_id, favorite_type, favorite_driver_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [id, auth.userId, 'driver', favoriteDriverId]
        );
      } else if (favoriteType === 'company' && favoriteCompanyName) {
        await pool.query(
          `INSERT INTO contractor_favorites (id, contractor_id, favorite_type, favorite_company_name) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [id, auth.userId, 'company', favoriteCompanyName]
        );
      }
      return res.json({ ok: true, id });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/favorites/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      await pool.query(`DELETE FROM contractor_favorites WHERE id = $1 AND contractor_id = $2`, [req.params.id, auth.userId]);
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/assignments/:assignmentId/vehicle", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const aRow = await pool.query(
        `SELECT ja.driver_id, j.contractor_id FROM job_assignments ja
         JOIN jobs j ON ja.job_id = j.id
         WHERE ja.id = $1`,
        [req.params.assignmentId]
      );
      if (aRow.rows.length === 0) return res.status(404).json({ message: "Assignment not found" });
      const { driver_id, contractor_id } = aRow.rows[0];
      if (String(contractor_id) !== auth.userId && String(driver_id) !== auth.userId) {
        return res.status(403).json({ message: "You do not have permission to modify this assignment" });
      }
      const { vehicleId, vehicle_id } = req.body;
      const vid = vehicleId || vehicle_id;
      await pool.query(`UPDATE job_assignments SET vehicle_id = $1 WHERE id = $2`, [vid, req.params.assignmentId]);
      pushToWebsite(`/api/job-assignments/${req.params.assignmentId}/vehicle`, auth, { method: "PUT", body: req.body }).catch(() => {});
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Failed to assign vehicle" });
    }
  });

  app.post("/api/jobs/:id/clock-in", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;

      // Re-entrancy: if driver already clocked into THIS job, return that run
      const existingRun = await pool.query(
        `SELECT id FROM job_runs WHERE job_id = $1 AND driver_id = $2 AND status::text = 'active'`,
        [req.params.id, auth.userId]
      );
      if (existingRun.rows.length > 0) {
        const result = await pool.query(`SELECT * FROM job_runs WHERE id = $1`, [existingRun.rows[0].id]);
        return res.json(addDualKeys(result.rows[0]));
      }

      // Rule: only one active job at a time across all jobs
      const otherActive = await pool.query(
        `SELECT jr.id, jr.job_id, j.material
         FROM job_runs jr
         LEFT JOIN jobs j ON j.id = jr.job_id
         WHERE jr.driver_id = $1 AND jr.status::text = 'active' AND jr.job_id != $2
         LIMIT 1`,
        [auth.userId, req.params.id]
      );
      if (otherActive.rows.length > 0) {
        const other = otherActive.rows[0];
        return res.status(409).json({
          code: "ALREADY_CLOCKED_IN",
          message: `You're already clocked into another job${other.material ? ` (${other.material})` : ''}. Clock out first.`,
          activeJobId: other.job_id,
          activeRunId: other.id,
        });
      }

      // Rule: caller must be assigned to the job (or be the direct driver)
      const jobOwnership = await pool.query(
        `SELECT driver_id, contractor_id FROM jobs WHERE id = $1`,
        [req.params.id]
      );
      const jobOwner = jobOwnership.rows[0];
      const isDirectDriver = jobOwner && String(jobOwner.driver_id) === auth.userId;
      const isJobContractor = jobOwner && String(jobOwner.contractor_id) === auth.userId;
      if (!isDirectDriver && !isJobContractor) {
        const assignCheck = await pool.query(
          `SELECT 1 FROM job_assignments WHERE job_id = $1 AND driver_id = $2
           AND status::text NOT IN ('rejected', 'withdrawn', 'cancelled', 'expired') LIMIT 1`,
          [req.params.id, auth.userId]
        );
        if (assignCheck.rows.length === 0) {
          return res.status(403).json({ code: "NOT_ASSIGNED", message: "You are not assigned to this job" });
        }
      }

      // Load job for time/geofence rules
      const jobRes = await pool.query(
        `SELECT id, scheduled_date, pickup_time, origin_lat, origin_lng, destination_lat, destination_lng
         FROM jobs WHERE id = $1`,
        [req.params.id]
      );
      const job = jobRes.rows[0];
      if (!job) return res.status(404).json({ message: "Job not found" });

      const now = new Date();
      const customTime = req.body?.custom_time || req.body?.customTime || null;
      const startedAt = customTime ? new Date(customTime) : now;
      if (customTime && (isNaN(startedAt.getTime()) || startedAt.getTime() > now.getTime() + 60_000)) {
        return res.status(400).json({ code: "INVALID_TIME", message: "Clock-in time can't be in the future." });
      }

      // Rule: cannot clock in more than 30 min before scheduled start
      if (job.scheduled_date) {
        const dateStr = String(job.scheduled_date).substring(0, 10);
        const [y, m, d] = dateStr.split('-').map(Number);
        let scheduledStart: Date;
        if (job.pickup_time) {
          const [hh, mm] = String(job.pickup_time).split(':').map(Number);
          scheduledStart = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
        } else {
          // No pickup time: treat midnight (start of day) as the scheduled start
          scheduledStart = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
        }
        const earliest = new Date(scheduledStart.getTime() - 30 * 60 * 1000);
        if (startedAt < earliest) {
          const diffMin = Math.ceil((earliest.getTime() - startedAt.getTime()) / 60000);
          const startStr = scheduledStart.toLocaleString('en-US', {
            month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit',
          });
          return res.status(400).json({
            code: "TOO_EARLY",
            message: `Clock-in opens 30 min before the scheduled start (${startStr}). Try again in ${diffMin} min.`,
            earliestAt: earliest.toISOString(),
            scheduledStartAt: scheduledStart.toISOString(),
          });
        }
      }

      // Rule: must be within 15 miles of pickup, dropoff, or anywhere along the line between them
      const startLat = req.body?.lat ?? req.body?.start_lat ?? null;
      const startLng = req.body?.lng ?? req.body?.start_lng ?? null;
      const GEOFENCE_MILES = 15;
      const haversineMiles = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
        const toRad = (v: number) => (v * Math.PI) / 180;
        const R = 3958.7613; // earth radius in miles
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
      };
      // Distance from a point to the closest point on the line segment A->B.
      // Equirectangular projection — accurate for distances up to a few hundred miles.
      const distanceToSegmentMiles = (
        pLat: number, pLng: number,
        aLat: number, aLng: number,
        bLat: number, bLng: number,
      ): number => {
        const meanLatRad = ((aLat + bLat) / 2) * Math.PI / 180;
        const milesPerDegLat = 69.0;
        const milesPerDegLng = 69.0 * Math.cos(meanLatRad);
        const ax = aLng * milesPerDegLng, ay = aLat * milesPerDegLat;
        const bx = bLng * milesPerDegLng, by = bLat * milesPerDegLat;
        const px = pLng * milesPerDegLng, py = pLat * milesPerDegLat;
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
        let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const cx = ax + t * dx, cy = ay + t * dy;
        return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      };

      const oLat = job.origin_lat ? Number(job.origin_lat) : null;
      const oLng = job.origin_lng ? Number(job.origin_lng) : null;
      const dLat = job.destination_lat ? Number(job.destination_lat) : null;
      const dLng = job.destination_lng ? Number(job.destination_lng) : null;
      const hasJobCoords = (oLat != null && oLng != null) || (dLat != null && dLng != null);

      if (hasJobCoords) {
        if (startLat == null || startLng == null) {
          return res.status(400).json({
            code: "LOCATION_REQUIRED",
            message: "Location is required to clock in. Enable location and try again.",
          });
        }
        const driverLat = Number(startLat);
        const driverLng = Number(startLng);
        if (isNaN(driverLat) || isNaN(driverLng)) {
          return res.status(400).json({ code: "LOCATION_REQUIRED", message: "Invalid location data." });
        }
        let closest: number;
        if (oLat != null && oLng != null && dLat != null && dLng != null) {
          // Both endpoints known — accept anywhere along the pickup→dropoff line
          closest = distanceToSegmentMiles(driverLat, driverLng, oLat, oLng, dLat, dLng);
        } else if (oLat != null && oLng != null) {
          closest = haversineMiles(driverLat, driverLng, oLat, oLng);
        } else {
          closest = haversineMiles(driverLat, driverLng, dLat as number, dLng as number);
        }
        if (closest > GEOFENCE_MILES) {
          const target = (oLat != null && oLng != null && dLat != null && dLng != null) ? "job route" : "job site";
          return res.status(403).json({
            code: "OUT_OF_GEOFENCE",
            message: `You're ${closest.toFixed(1)} miles from the ${target}. Clock-in is allowed within ${GEOFENCE_MILES} miles of pickup, dropoff, or anywhere along the route.`,
            distanceMiles: Math.round(closest * 10) / 10,
            geofenceMiles: GEOFENCE_MILES,
          });
        }
      }

      const runId = crypto.randomUUID();
      const vehicleFromBody = req.body?.vehicle_id || req.body?.vehicleId || null;
      let vehicleId = vehicleFromBody;
      if (!vehicleId) {
        const vRes = await pool.query(
          `SELECT vehicle_id FROM job_assignments WHERE job_id = $1 AND driver_id = $2 AND vehicle_id IS NOT NULL AND status::text != 'rejected' LIMIT 1`,
          [req.params.id, auth.userId]
        );
        vehicleId = vRes.rows[0]?.vehicle_id || null;
      }
      await pool.query(
        `INSERT INTO job_runs (id, job_id, driver_id, vehicle_id, status, started_at, start_lat, start_lng, created_at) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, NOW())`,
        [runId, req.params.id, auth.userId, vehicleId, startedAt, startLat, startLng]
      );
      await pool.query(`UPDATE jobs SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      pushToWebsite(`/api/jobs/${req.params.id}/start`, auth, { method: "POST", body: req.body }).catch(() => {});
      const result = await pool.query(`SELECT * FROM job_runs WHERE id = $1`, [runId]);
      return res.json(addDualKeys(result.rows[0]));
    } catch (e: any) {
      console.error("Clock-in error:", e.message);
      return res.status(500).json({ message: "Failed to clock in" });
    }
  });

  app.post("/api/job-runs/:runId/clock-out", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const runRow = await pool.query(`SELECT job_id, driver_id FROM job_runs WHERE id = $1`, [req.params.runId]);
      if (runRow.rows.length === 0) return res.status(404).json({ message: "Run not found" });
      const { job_id: jobIdForEnd, driver_id: runDriverId } = runRow.rows[0];
      if (String(runDriverId) !== auth.userId) {
        const contractorCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [jobIdForEnd]);
        if (!contractorCheck.rows[0] || String(contractorCheck.rows[0].contractor_id) !== auth.userId) {
          return res.status(403).json({ message: "You do not have permission to clock out this run" });
        }
      }
      await pool.query(`UPDATE job_runs SET status = 'completed', ended_at = NOW(), updated_at = NOW() WHERE id = $1`, [req.params.runId]);
      if (jobIdForEnd) {
        pushToWebsite(`/api/jobs/${jobIdForEnd}/end`, auth, { method: "POST", body: { ...(req.body || {}), runId: req.params.runId } }).catch(() => {});
      }
      const result = await pool.query(`SELECT * FROM job_runs WHERE id = $1`, [req.params.runId]);
      return res.json(addDualKeys(result.rows[0] || { id: req.params.runId }));
    } catch (e: any) {
      console.error("Clock-out error:", e.message);
      return res.status(500).json({ message: "Failed to clock out" });
    }
  });

  app.patch("/api/job-runs/:runId", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const runRow = await pool.query(`SELECT driver_id, job_id FROM job_runs WHERE id = $1`, [req.params.runId]);
      if (runRow.rows.length === 0) return res.status(404).json({ message: "Run not found" });
      const { driver_id: runDriverId, job_id: runJobId } = runRow.rows[0];
      if (String(runDriverId) !== auth.userId) {
        const contractorCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [runJobId]);
        if (!contractorCheck.rows[0] || String(contractorCheck.rows[0].contractor_id) !== auth.userId) {
          return res.status(403).json({ message: "You do not have permission to update this run" });
        }
      }
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;
      for (const [k, v] of Object.entries(req.body)) {
        if (v !== undefined) {
          updates.push(`${camelToSnake(k)} = $${idx}`);
          values.push(v);
          idx++;
        }
      }
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(req.params.runId);
        await pool.query(`UPDATE job_runs SET ${updates.join(', ')} WHERE id = $${idx}`, values);
      }
      const result = await pool.query(`SELECT * FROM job_runs WHERE id = $1`, [req.params.runId]);
      return res.json(addDualKeys(result.rows[0] || { id: req.params.runId }));
    } catch {
      return res.status(500).json({ message: "Failed to update job run" });
    }
  });

  app.delete("/api/job-runs/:runId", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const runRow = await pool.query(`SELECT driver_id, job_id FROM job_runs WHERE id = $1`, [req.params.runId]);
      if (runRow.rows.length === 0) return res.json({ ok: true });
      const { driver_id: runDriverId, job_id: runJobId } = runRow.rows[0];
      if (String(runDriverId) !== auth.userId) {
        const contractorCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [runJobId]);
        if (!contractorCheck.rows[0] || String(contractorCheck.rows[0].contractor_id) !== auth.userId) {
          return res.status(403).json({ message: "You do not have permission to delete this run" });
        }
      }
      await pool.query(`DELETE FROM job_runs WHERE id = $1`, [req.params.runId]);
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.post("/api/job-runs/:runId/weight-tickets", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const id = crypto.randomUUID();
      const runResult = await pool.query(`SELECT job_id, driver_id FROM job_runs WHERE id = $1`, [req.params.runId]);
      if (runResult.rows.length === 0) return res.status(404).json({ message: "Run not found" });
      const { job_id: jobId, driver_id: runDriverId } = runResult.rows[0];
      if (String(runDriverId) !== auth.userId) {
        const contractorCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [jobId]);
        if (!contractorCheck.rows[0] || String(contractorCheck.rows[0].contractor_id) !== auth.userId) {
          return res.status(403).json({ message: "You do not have permission to add tickets to this run" });
        }
      }
      await pool.query(
        `INSERT INTO weight_tickets (id, job_run_id, job_id, driver_id, weight_value, notes, image_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [id, req.params.runId, jobId, auth.userId, req.body.weightValue || req.body.weight_value, req.body.notes, req.body.imageData || req.body.image_data]
      );
      const result = await pool.query(`SELECT * FROM weight_tickets WHERE id = $1`, [id]);
      return res.status(201).json(addDualKeys(result.rows[0]));
    } catch (e: any) {
      console.error("Weight ticket error:", e.message);
      return res.status(500).json({ message: "Failed to add weight ticket" });
    }
  });

  app.get("/api/jobs/:jobId/weight-tickets", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const jobRow = await pool.query(`SELECT contractor_id, driver_id FROM jobs WHERE id = $1`, [req.params.jobId]);
      if (jobRow.rows.length === 0) return res.json([]);
      const { contractor_id, driver_id } = jobRow.rows[0];
      const isParticipant = String(contractor_id) === auth.userId || String(driver_id) === auth.userId;
      if (!isParticipant) {
        const aCheck = await pool.query(
          `SELECT 1 FROM job_assignments WHERE job_id = $1 AND driver_id = $2
           AND status::text NOT IN ('rejected', 'withdrawn', 'cancelled', 'expired') LIMIT 1`,
          [req.params.jobId, auth.userId]
        );
        if (aCheck.rows.length === 0) return res.status(403).json({ message: "You do not have access to these weight tickets" });
      }
      const result = await pool.query(`SELECT * FROM weight_tickets WHERE job_id = $1 ORDER BY created_at`, [req.params.jobId]);
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.get("/api/job-runs/:runId/weight-tickets", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const runRow = await pool.query(`SELECT driver_id, job_id FROM job_runs WHERE id = $1`, [req.params.runId]);
      if (runRow.rows.length === 0) return res.json([]);
      const { driver_id: runDriverId, job_id: runJobId } = runRow.rows[0];
      if (String(runDriverId) !== auth.userId) {
        const contractorCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [runJobId]);
        if (!contractorCheck.rows[0] || String(contractorCheck.rows[0].contractor_id) !== auth.userId) {
          return res.status(403).json({ message: "You do not have access to these weight tickets" });
        }
      }
      const result = await pool.query(`SELECT * FROM weight_tickets WHERE job_run_id = $1 ORDER BY created_at`, [req.params.runId]);
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.get("/api/conversations", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT jm.job_id, j.material, j.origin_address, j.destination_address, j.status as job_status,
                j.contractor_id, j.driver_id,
                MAX(jm.created_at) as last_message_at,
                COUNT(CASE WHEN jm.read = false AND jm.sender_id != $1 THEN 1 END)::int as unread_count,
                (SELECT body FROM job_messages WHERE job_id = jm.job_id ORDER BY created_at DESC LIMIT 1) as last_message
         FROM job_messages jm
         JOIN jobs j ON jm.job_id = j.id
         WHERE (j.contractor_id = $1 OR j.driver_id = $1)
         GROUP BY jm.job_id, j.material, j.origin_address, j.destination_address, j.status, j.contractor_id, j.driver_id
         ORDER BY MAX(jm.created_at) DESC`,
        [auth.userId]
      );
      const convs = result.rows.filter((c: any) => !hiddenJobIds.has(c.job_id));
      return res.json(convs.map(addDualKeys));
    } catch (e: any) {
      console.error("GET /api/conversations error:", e.message);
      return res.json([]);
    }
  });

  app.get("/api/conversations/archived", requireAuth, async (req: Request, res: Response) => {
    return res.json([]);
  });

  app.post("/api/conversations/:jobId/archive", requireAuth, async (_req: Request, res: Response) => {
    return res.json({ ok: true });
  });

  app.post("/api/conversations/:jobId/unarchive", requireAuth, async (_req: Request, res: Response) => {
    return res.json({ ok: true });
  });

  app.post("/api/conversations/:jobId/delete", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const jobRow = await pool.query(`SELECT contractor_id, driver_id FROM jobs WHERE id = $1`, [req.params.jobId]);
      if (jobRow.rows.length > 0) {
        const { contractor_id, driver_id } = jobRow.rows[0];
        if (String(contractor_id) !== auth.userId && String(driver_id) !== auth.userId) {
          return res.status(403).json({ message: "You do not have permission to delete this conversation" });
        }
      }
      await pool.query(`DELETE FROM job_messages WHERE job_id = $1`, [req.params.jobId]);
    } catch {}
    return res.json({ ok: true });
  });

  app.get("/api/messages/unread-count", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT COUNT(*)::int as count FROM job_messages jm
         JOIN jobs j ON jm.job_id = j.id
         WHERE jm.read = false AND jm.sender_id != $1
         AND (j.contractor_id = $1 OR j.driver_id = $1)`,
        [auth.userId]
      );
      return res.json({ count: result.rows[0]?.count || 0 });
    } catch {
      return res.json({ count: 0 });
    }
  });

  app.get("/api/messages/:jobId", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const jobRow = await pool.query(`SELECT contractor_id, driver_id FROM jobs WHERE id = $1`, [req.params.jobId]);
      if (jobRow.rows.length === 0) return res.json([]);
      const { contractor_id, driver_id } = jobRow.rows[0];
      const isParticipant = String(contractor_id) === auth.userId || String(driver_id) === auth.userId;
      if (!isParticipant) {
        const aCheck = await pool.query(
          `SELECT 1 FROM job_assignments WHERE job_id = $1 AND driver_id = $2
           AND status::text NOT IN ('rejected', 'withdrawn', 'cancelled', 'expired') LIMIT 1`,
          [req.params.jobId, auth.userId]
        );
        if (aCheck.rows.length === 0) {
          return res.status(403).json({ message: "You do not have access to this conversation" });
        }
      }
      const result = await pool.query(
        `SELECT jm.*, u.full_name as sender_name FROM job_messages jm
         LEFT JOIN users u ON jm.sender_id = u.id
         WHERE jm.job_id = $1 ORDER BY jm.created_at ASC`,
        [req.params.jobId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.post("/api/messages/:jobId", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const jobRow = await pool.query(`SELECT contractor_id, driver_id FROM jobs WHERE id = $1`, [req.params.jobId]);
      if (jobRow.rows.length === 0) return res.status(404).json({ message: "Job not found" });
      const { contractor_id, driver_id } = jobRow.rows[0];
      const isParticipant = String(contractor_id) === auth.userId || String(driver_id) === auth.userId;
      if (!isParticipant) {
        const aCheck = await pool.query(
          `SELECT 1 FROM job_assignments WHERE job_id = $1 AND driver_id = $2
           AND status::text NOT IN ('rejected', 'withdrawn', 'cancelled', 'expired') LIMIT 1`,
          [req.params.jobId, auth.userId]
        );
        if (aCheck.rows.length === 0) {
          return res.status(403).json({ message: "You are not a participant in this conversation" });
        }
      }
      const id = crypto.randomUUID();
      const body = req.body.body || req.body.message || req.body.content || '';
      await pool.query(
        `INSERT INTO job_messages (id, job_id, sender_id, body, read, created_at) VALUES ($1, $2, $3, $4, false, NOW())`,
        [id, req.params.jobId, auth.userId, body]
      );
      pushToWebsite(`/api/jobs/${req.params.jobId}/messages`, auth, { method: "POST", body: req.body }).catch(() => {});
      const result = await pool.query(`SELECT * FROM job_messages WHERE id = $1`, [id]);
      return res.status(201).json(addDualKeys(result.rows[0]));
    } catch (e: any) {
      console.error("POST message error:", e.message);
      return res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.get("/api/profile", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    return res.json(addDualKeys(auth.user));
  });

  app.put("/api/profile", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });

    // Allowlist of fields a user may update on their own profile. Security-
    // sensitive columns (role, is_admin, is_suspended, suspended_*, email,
    // password hash, id) are intentionally excluded.
    const PROFILE_ALLOWLIST = new Set([
      "fullName", "full_name",
      "phone",
      "profileImageUrl", "profile_image_url",
      "bio",
      "primaryLocation", "primary_location",
      "secondaryLocation", "secondary_location",
      "truckType", "truck_type",
      "truckCapacity", "truck_capacity",
      "cdlClass", "cdl_class",
      "insuranceInfo", "insurance_info",
      "company",
      "website",
      "notificationPreferences", "notification_preferences",
      "expoPushToken", "expo_push_token",
    ]);

    const safeBody: Record<string, any> = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (PROFILE_ALLOWLIST.has(k)) {
        safeBody[k] = v;
      }
    }

    Object.assign(auth.user, safeBody);
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;
      for (const [k, v] of Object.entries(safeBody)) {
        if (v !== undefined) {
          updates.push(`${camelToSnake(k)} = $${idx}`);
          values.push(v);
          idx++;
        }
      }
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(auth.userId);
        await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, values);
      }
    } catch (e: any) {
      console.log("Profile update DB error:", e?.message);
    }
    const localToken = req.headers.authorization?.slice(7) || "";
    if (localToken) { tokenToJwt.set(localToken, auth); saveJsonMap("sessions.json", tokenToJwt); }
    return res.json(addDualKeys(auth.user));
  });

  app.put("/api/profile/status", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    const { is_connected, isConnected } = req.body;
    const newStatus = is_connected ?? isConnected ?? true;
    auth.user.isConnected = newStatus;
    auth.user.is_connected = newStatus;
    try {
      await pool.query(`UPDATE users SET is_connected = $1, updated_at = NOW() WHERE id = $2`, [newStatus, auth.userId]);
    } catch {}
    return res.json(addDualKeys(auth.user));
  });

  app.put("/api/profile/role", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    const { role } = req.body;
    if (!role) {
      return res.status(400).json({ message: "Role is required" });
    }
    // Determine which roles this account is authorized to switch between.
    // `originalRole` is set at login time from the website's user record and
    // never mutated, so it reflects the account's actual entitlements even
    // after prior view-switches. For sessions created before this field was
    // added, fall back to the stored user role.
    const baseRole = (auth as any).originalRole || auth.user.role;
    const permitted = allowedRolesForUser(String(baseRole));
    if (!permitted.includes(String(role))) {
      return res.status(403).json({ message: "You are not authorized to switch to this role." });
    }
    auth.user.role = role;
    // Dev-local sessions authenticate against the local users table, so the
    // `role` column doubles as the account's entitlement source on re-login.
    // Persisting the switched view here would collapse a compound entitlement
    // (e.g. driver_trucking_company_contractor) down to a single role and trap
    // the account after the next login. Keep the DB role as the entitlement and
    // track the active view in the session only. Website-backed sessions still
    // persist, since their entitlement comes from the upstream website.
    if (!String(auth.jwt).startsWith("dev-local:")) {
      try {
        await pool.query(`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`, [role, auth.userId]);
      } catch {}
    }
    const localToken = req.headers.authorization?.slice(7) || "";
    if (localToken) {
      tokenToJwt.set(localToken, auth);
      saveJsonMap("sessions.json", tokenToJwt);
    }
    return res.json(addDualKeys(auth.user));
  });

  app.get("/api/drivers/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const search = (req.query.q || req.query.search || '') as string;
      // Only return contact details to users who already have an operational
      // relationship (shared job) with the driver. For callers with no such
      // relationship, omit email and phone to prevent cross-tenant harvesting.
      let query = `
        SELECT
          u.id, u.full_name, u.truck_type, u.rating, u.total_jobs,
          u.profile_image_url, u.is_connected,
          CASE WHEN EXISTS (
            SELECT 1 FROM jobs j
            WHERE (j.contractor_id = $1 OR j.driver_id = $1)
              AND (j.contractor_id = u.id OR j.driver_id = u.id)
          ) THEN u.email ELSE NULL END AS email,
          CASE WHEN EXISTS (
            SELECT 1 FROM jobs j
            WHERE (j.contractor_id = $1 OR j.driver_id = $1)
              AND (j.contractor_id = u.id OR j.driver_id = u.id)
          ) THEN u.phone ELSE NULL END AS phone
        FROM users u
        WHERE (u.role LIKE '%driver%' OR u.also_driver = true)
          AND u.id != $1`;
      const params: any[] = [auth.userId];
      if (search) {
        query += ` AND (u.full_name ILIKE $2)`;
        params.push(`%${search}%`);
      }
      query += ` ORDER BY u.rating DESC LIMIT 50`;
      const result = await pool.query(query, params);
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.get("/api/vehicles", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT *, capacity AS max_capacity_tons FROM trucks WHERE (trucking_company_id = $1 OR assigned_driver_id = $1) AND archived_at IS NULL ORDER BY sort_order, created_at`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.post("/api/vehicles", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const id = crypto.randomUUID();
      const b = req.body;
      const truckType = b.truckType || b.truck_type;
      const licensePlate = b.licensePlate || b.license_plate || '';
      const vinNumber = b.vinNumber || b.vin_number || null;
      const truckNumber = b.truckNumber || b.truck_number || null;
      const capacity = b.maxCapacityTons || b.max_capacity_tons || b.capacity || null;
      const assignedDriverId = b.assignedDriverId || b.assigned_driver_id || null;
      const hasTarp = b.has_tarp || b.hasTarp || false;
      await pool.query(
        `INSERT INTO trucks (id, trucking_company_id, truck_type, make, model, year, license_plate, vin_number, truck_number, capacity, assigned_driver_id, has_tarp, is_active, created_at, updated_at)
         VALUES ($1, $2, $3::truck_type, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW(), NOW())`,
        [id, auth.userId, truckType, b.make, b.model, b.year, licensePlate, vinNumber, truckNumber, capacity, assignedDriverId, hasTarp]
      );
      const result = await pool.query(`SELECT * FROM trucks WHERE id = $1`, [id]);
      return res.status(201).json(addDualKeys(result.rows[0]));
    } catch (e: any) {
      console.error("POST vehicle error:", e.message);
      return res.status(500).json({ message: "Failed to add vehicle" });
    }
  });

  app.put("/api/vehicles/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      // Ownership check — caller must own this truck.
      const owned = await pool.query(
        `SELECT id FROM trucks WHERE id = $1 AND (trucking_company_id = $2 OR assigned_driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (owned.rows.length === 0) return res.status(404).json({ message: "Vehicle not found" });

      const fieldMap: Record<string, string> = {
        truck_type: 'truck_type',
        truckType: 'truck_type',
        make: 'make',
        model: 'model',
        year: 'year',
        license_plate: 'license_plate',
        licensePlate: 'license_plate',
        vin_number: 'vin_number',
        vinNumber: 'vin_number',
        max_capacity_tons: 'capacity',
        maxCapacityTons: 'capacity',
        capacity: 'capacity',
        truck_number: 'truck_number',
        truckNumber: 'truck_number',
        assigned_driver_id: 'assigned_driver_id',
        assignedDriverId: 'assigned_driver_id',
        is_active: 'is_active',
        isActive: 'is_active',
        has_tarp: 'has_tarp',
        hasTarp: 'has_tarp',
        color: 'color',
        sort_order: 'sort_order',
        sortOrder: 'sort_order',
        issue_notes: 'issue_notes',
        issueNotes: 'issue_notes',
      };
      const enumCols = new Set(['truck_type']);
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;
      for (const [k, v] of Object.entries(req.body)) {
        const col = fieldMap[k];
        if (col && v !== undefined) {
          const cast = enumCols.has(col) ? `::truck_type` : '';
          updates.push(`${col} = $${idx}${cast}`);
          values.push(v);
          idx++;
        }
      }
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(req.params.id);
        await pool.query(`UPDATE trucks SET ${updates.join(', ')} WHERE id = $${idx}`, values);
      }
      const result = await pool.query(`SELECT * FROM trucks WHERE id = $1`, [req.params.id]);
      return res.json(addDualKeys(result.rows[0] || {}));
    } catch (e: any) {
      console.error("PUT vehicle error:", e.message, e.detail || '');
      return res.status(500).json({ message: "Failed to update vehicle" });
    }
  });

  app.delete("/api/vehicles/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      // Ownership check — caller must own this truck.
      const owned = await pool.query(
        `SELECT id FROM trucks WHERE id = $1 AND (trucking_company_id = $2 OR assigned_driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (owned.rows.length === 0) return res.status(404).json({ message: "Vehicle not found" });
      deletedVehicleIds.add(req.params.id);
      await pool.query(`UPDATE trucks SET archived_at = NOW(), is_active = false WHERE id = $1`, [req.params.id]);
      await pool.query(`UPDATE job_assignments SET vehicle_id = NULL WHERE vehicle_id = $1`, [req.params.id]);
      await pool.query(`UPDATE driver_invitations SET assigned_truck_id = NULL WHERE assigned_truck_id = $1`, [req.params.id]);
    } catch (e: any) {
      console.error("Archive vehicle error:", e.message);
      return res.status(500).json({ message: "Failed to archive vehicle" });
    }
    return res.json({ ok: true });
  });

  app.get("/api/vehicles/archived", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT *, capacity AS max_capacity_tons FROM trucks WHERE (trucking_company_id = $1 OR assigned_driver_id = $1) AND archived_at IS NOT NULL ORDER BY archived_at DESC`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.delete("/api/vehicles/:id/permanent", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const owned = await pool.query(
        `SELECT id, archived_at FROM trucks WHERE id = $1 AND (trucking_company_id = $2 OR assigned_driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (owned.rows.length === 0) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      if (!owned.rows[0].archived_at) {
        return res.status(400).json({ message: "Archive the vehicle before deleting it permanently" });
      }
      await pool.query(`UPDATE job_assignments SET vehicle_id = NULL WHERE vehicle_id = $1`, [req.params.id]);
      await pool.query(`UPDATE driver_invitations SET assigned_truck_id = NULL WHERE assigned_truck_id = $1`, [req.params.id]);
      await pool.query(`DELETE FROM trucks WHERE id = $1`, [req.params.id]);
      deletedVehicleIds.add(req.params.id);
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Permanent delete vehicle error:", e.message);
      return res.status(500).json({ message: "Failed to delete vehicle" });
    }
  });

  app.post("/api/vehicles/:id/unarchive", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      // Ownership check — caller must own this truck.
      const owned = await pool.query(
        `SELECT id FROM trucks WHERE id = $1 AND (trucking_company_id = $2 OR assigned_driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (owned.rows.length === 0) return res.status(404).json({ message: "Vehicle not found" });
      deletedVehicleIds.delete(req.params.id);
      await pool.query(`UPDATE trucks SET archived_at = NULL, is_active = true WHERE id = $1`, [req.params.id]);
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Unarchive vehicle error:", e.message);
      return res.status(500).json({ message: "Failed to unarchive vehicle" });
    }
  });

  app.get("/api/vehicles/:vehicleId/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      // Ownership check — caller must own this truck.
      const owned = await pool.query(
        `SELECT id FROM trucks WHERE id = $1 AND (trucking_company_id = $2 OR assigned_driver_id = $2)`,
        [req.params.vehicleId, auth.userId]
      );
      if (owned.rows.length === 0) return res.status(404).json({ message: "Vehicle not found" });
      const result = await pool.query(
        `SELECT j.* FROM jobs j JOIN job_assignments ja ON j.id = ja.job_id WHERE ja.vehicle_id = $1 ORDER BY j.scheduled_date DESC`,
        [req.params.vehicleId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.get("/api/availability", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(`SELECT * FROM driver_availability WHERE driver_id = $1 ORDER BY date`, [auth.userId]);
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.post("/api/availability", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const b = req.body;
      const vehicleId = b.vehicleId || b.vehicle_id || null;
      const isAvailable = b.isAvailable ?? b.is_available ?? true;

      if (vehicleId) {
        await pool.query(
          `DELETE FROM driver_availability WHERE driver_id = $1 AND date::date = $2::date AND vehicle_id = $3`,
          [auth.userId, b.date, vehicleId]
        );

        if (!isAvailable) {
          const id = crypto.randomUUID();
          await pool.query(
            `INSERT INTO driver_availability (id, driver_id, date, start_time, end_time, is_available, vehicle_id, notes, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
            [id, auth.userId, b.date, b.startTime || b.start_time || '06:00', b.endTime || b.end_time || '18:00', false, vehicleId, b.notes]
          );
        }

        pushToWebsite("/api/me/availability", auth, { method: "POST", body: req.body }).catch(() => {});
        const result = await pool.query(
          `SELECT * FROM driver_availability WHERE driver_id = $1 AND date::date = $2::date AND vehicle_id = $3 ORDER BY created_at DESC LIMIT 1`,
          [auth.userId, b.date, vehicleId]
        );
        return res.status(201).json(result.rows[0] ? addDualKeys(result.rows[0]) : { ok: true, status: 'available' });
      }

      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO driver_availability (id, driver_id, date, start_time, end_time, is_available, vehicle_id, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [id, auth.userId, b.date, b.startTime || b.start_time || '06:00', b.endTime || b.end_time || '18:00', isAvailable, vehicleId, b.notes]
      );
      pushToWebsite("/api/me/availability", auth, { method: "POST", body: req.body }).catch(() => {});
      const result = await pool.query(`SELECT * FROM driver_availability WHERE id = $1`, [id]);
      return res.status(201).json(addDualKeys(result.rows[0]));
    } catch (e: any) {
      console.error("POST availability error:", e.message);
      return res.status(500).json({ message: "Failed to set availability" });
    }
  });

  app.get("/api/sync-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const status = await getSyncQueueStatus(auth.userId);
      return res.json(status);
    } catch {
      return res.json({ pending: 0, failed: 0 });
    }
  });

  app.post("/api/sync-status/retry", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await drainSyncQueue(auth, 200);
      const status = await getSyncQueueStatus(auth.userId);
      return res.json({ ...result, ...status });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/notifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.post("/api/notifications/mark-read", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      await pool.query(`UPDATE notifications SET is_read = true WHERE user_id = $1`, [auth.userId]);
    } catch {}
    return res.json({ ok: true });
  });

  app.get("/api/dashboard", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const userId = auth.userId;
      const role = (auth.user?.role || '').toLowerCase();
      const isContractor = role.includes('contractor') || role === 'trucking_company';
      const jobsResult = await pool.query(
        isContractor
          ? `SELECT * FROM jobs WHERE contractor_id = $1 AND status::text != 'cancelled' AND archived_at IS NULL ORDER BY created_at DESC`
          : `SELECT * FROM jobs WHERE (driver_id = $1 OR id IN (SELECT job_id FROM job_assignments WHERE driver_id = $1)) AND status::text != 'cancelled' AND archived_at IS NULL ORDER BY created_at DESC`,
        [userId]
      );
      const jobs = jobsResult.rows;

      const openJobs = jobs.filter((j: any) => j.status === 'open').length;
      const activeJobs = jobs.filter((j: any) => ['accepted', 'in_progress', 'pending'].includes(j.status)).length;
      const completedJobs = jobs.filter((j: any) => j.status === 'completed').length;

      const assignResult = await pool.query(
        `SELECT COUNT(*)::int as count FROM job_assignments ja JOIN jobs j ON ja.job_id = j.id WHERE j.contractor_id = $1 AND ja.status = 'pending'`,
        [userId]
      );
      const pendingApplications = assignResult.rows[0]?.count || 0;

      const userResult = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
      const user = userResult.rows[0];

      const invoicesResult = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0)::float as total, COALESCE(SUM(CASE WHEN status::text IN ('open', 'issued', 'payment_sent') THEN total_amount ELSE 0 END), 0)::float as awaiting FROM monthly_invoices WHERE contractor_id = $1 OR driver_id = $1`,
        [userId]
      );

      let activeFleetRuns: any[] = [];
      if (role === 'trucking_company' || role.includes('trucking')) {
        try {
          const fleetRunsResult = await pool.query(
            `SELECT jr.id as run_id, jr.job_id, jr.started_at as clock_in_time, jr.vehicle_id, jr.driver_id,
                    t.truck_number, t.make as truck_make, t.model as truck_model, t.year as truck_year,
                    j.material, j.origin_address,
                    c.full_name as contractor_name, c.company as contractor_company,
                    cp.name as project_name,
                    u.full_name as driver_name
             FROM job_runs jr
             JOIN trucks t ON jr.vehicle_id = t.id
             JOIN jobs j ON jr.job_id = j.id
             LEFT JOIN users c ON j.contractor_id = c.id
             LEFT JOIN contractor_projects cp ON j.project_id = cp.id
             LEFT JOIN users u ON jr.driver_id = u.id
             WHERE t.trucking_company_id = $1 AND jr.status::text = 'active'
             ORDER BY jr.started_at ASC`,
            [userId]
          );
          activeFleetRuns = fleetRunsResult.rows.map(r => {
            const row = addDualKeys(r);
            row.vehicleDesc = [r.truck_year, r.truck_make, r.truck_model].filter(Boolean).join(' ');
            row.driverFullName = r.driver_name || '';
            return row;
          });
        } catch (fleetErr: any) {
          console.error("Fleet runs query error:", fleetErr.message);
        }
      }

      // Build the next-7-day upcoming-jobs widget data.
      // Truck-centric view: for each day, list the user's trucks and which ones
      // are booked on which approved job (so they can drill in). Users with
      // zero trucks (e.g. pure drivers) get an empty `trucks` array and the
      // client falls back to its existing "Available / OPEN" rendering.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const horizonDays = 7;
      const lastDay = new Date(today);
      lastDay.setDate(today.getDate() + horizonDays - 1);
      const fmtDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const startDateStr = fmtDate(today);
      const endDateStr = fmtDate(lastDay);

      // The upcoming-days widget shows two very different things depending on
      // which role hat the user is currently wearing:
      //
      //   * Contractor mode  -> jobs THEY have posted, scheduled in the next
      //     7 days, with truck-needed / booked / applied counts.
      //   * Trucking / driver -> their own trucks, with which ones are booked
      //     onto approved jobs that day (existing behaviour).
      //
      // Joey reported that toggling to "Construction Co" still showed the
      // fleet-trucks view because we were unconditionally querying his
      // trucks below. Branch the widget builder on the active role.
      const isContractorOnly = role.includes('contractor') && role !== 'trucking_company';

      let userTrucks: any[] = [];
      let truckAssignments: any[] = [];
      let contractorJobsForDays: any[] = [];

      if (isContractorOnly) {
        try {
          const cjRes = await pool.query(
            `SELECT j.id,
                    j.material,
                    j.scheduled_date,
                    COALESCE(j.estimated_days, 1)::numeric AS estimated_days,
                    COALESCE(j.includes_weekends, false) AS includes_weekends,
                    COALESCE(j.includes_saturday, true)  AS includes_saturday,
                    COALESCE(j.includes_sunday, true)    AS includes_sunday,
                    j.status::text AS job_status,
                    COALESCE(j.trucks_needed, 1)::int AS trucks_needed,
                    cp.name AS project_name,
                    (SELECT COUNT(*)::int FROM job_assignments ja
                       WHERE ja.job_id = j.id AND ja.status::text = 'approved') AS trucks_assigned,
                    (SELECT COUNT(*)::int FROM job_assignments ja
                       WHERE ja.job_id = j.id) AS applications_count
               FROM jobs j
               LEFT JOIN contractor_projects cp ON j.project_id = cp.id
              WHERE j.contractor_id = $1
                AND j.archived_at IS NULL
                AND j.status::text NOT IN ('cancelled', 'completed')
                AND j.scheduled_date IS NOT NULL
                AND j.scheduled_date::date <= $3::date
                AND (
                  j.scheduled_date::date >= $2::date
                  OR (
                    COALESCE(j.estimated_days, 1)::numeric > 1
                    AND (j.scheduled_date::date
                         + (CEIL(COALESCE(j.estimated_days, 1)::numeric * 2)::int) * INTERVAL '1 day'
                        )::date >= $2::date
                  )
                )`,
            [userId, startDateStr, endDateStr]
          );
          contractorJobsForDays = cjRes.rows.map((row: any) => ({
            ...row,
            workingDates: new Set(
              getJobDateRange(
                typeof row.scheduled_date === 'string'
                  ? row.scheduled_date
                  : (row.scheduled_date as Date)?.toISOString?.() || String(row.scheduled_date),
                Number(row.estimated_days || 1),
                !!row.includes_weekends,
                row.includes_saturday !== false,
                row.includes_sunday !== false
              )
            ),
          }));
        } catch (e: any) {
          console.error("Upcoming-days contractor jobs query error:", e.message);
        }
      } else {
        try {
          const trucksRes = await pool.query(
            `SELECT id, truck_number, year, make, model
               FROM trucks
              WHERE trucking_company_id = $1 AND archived_at IS NULL
              ORDER BY NULLIF(regexp_replace(COALESCE(truck_number, ''), '[^0-9]', '', 'g'), '')::int NULLS LAST,
                       truck_number`,
            [userId]
          );
          userTrucks = trucksRes.rows;
        } catch {}
      }

      if (userTrucks.length > 0) {
        try {
          const asmtRes = await pool.query(
            `SELECT
               ja.vehicle_id, ja.job_id, ja.driver_id,
               j.scheduled_date,
               COALESCE(j.estimated_days, 1)::numeric AS estimated_days,
               COALESCE(j.includes_weekends, false) AS includes_weekends,
               COALESCE(j.includes_saturday, true)  AS includes_saturday,
               COALESCE(j.includes_sunday, true)    AS includes_sunday,
               j.material, j.status::text AS job_status, j.contractor_id,
               contractor.full_name AS contractor_name,
               contractor.company   AS contractor_company,
               cp.name AS project_name
             FROM job_assignments ja
             JOIN trucks t ON ja.vehicle_id = t.id
             JOIN jobs   j ON ja.job_id     = j.id
             LEFT JOIN users               contractor ON j.contractor_id = contractor.id
             LEFT JOIN contractor_projects cp         ON j.project_id    = cp.id
             WHERE t.trucking_company_id = $1
               AND t.archived_at IS NULL
               AND ja.status::text = 'approved'
               AND j.archived_at IS NULL
               AND j.status::text NOT IN ('cancelled', 'completed')
               AND j.scheduled_date::date <= $3::date
               AND (
                 j.scheduled_date::date >= $2::date
                 OR (
                   COALESCE(j.estimated_days, 1)::numeric > 1
                   AND (j.scheduled_date::date
                        + (CEIL(COALESCE(j.estimated_days, 1)::numeric * 2)::int) * INTERVAL '1 day'
                       )::date >= $2::date
                 )
               )`,
            [userId, startDateStr, endDateStr]
          );
          // Pre-compute the precise set of working dates for each assignment
          // using the same calendar-aware helper used elsewhere (respects
          // includes_weekends / includes_saturday / includes_sunday).
          truckAssignments = asmtRes.rows.map((row: any) => ({
            ...row,
            workingDates: new Set(
              getJobDateRange(
                typeof row.scheduled_date === 'string'
                  ? row.scheduled_date
                  : (row.scheduled_date as Date)?.toISOString?.() || String(row.scheduled_date),
                Number(row.estimated_days || 1),
                !!row.includes_weekends,
                row.includes_saturday !== false,
                row.includes_sunday !== false
              )
            ),
          }));
        } catch (e: any) {
          console.error("Upcoming-days assignments query error:", e.message);
        }
      }

      const isBusinessDay = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;
      const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const upcomingDays: any[] = [];
      for (let i = 0; i < horizonDays; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dDateStr = fmtDate(d);

        if (isContractorOnly) {
          // Contractor view: each day lists posted jobs working that day with
          // truck-needed / booked / applied counts. No fleet-trucks UI.
          const dayJobs = contractorJobsForDays.filter((j: any) =>
            j.workingDates && j.workingDates.has(dDateStr)
          );
          upcomingDays.push({
            date: dDateStr,
            dayName: dayNames[d.getDay()],
            dayNum: d.getDate(),
            isBusinessDay: isBusinessDay(d),
            status: dayJobs.length > 0 ? 'jobs' : 'available',
            trucksTotal: 0,
            trucksBooked: 0,
            trucksAvailable: 0,
            trucks: [],
            jobs: dayJobs.map((j: any) => ({
              id: j.id,
              material: j.material,
              projectName: j.project_name || '',
              trucksNeeded: j.trucks_needed || 1,
              assigned: j.trucks_assigned || 0,
              applied: j.applications_count || 0,
              status: j.job_status,
            })),
          });
          continue;
        }

        // A truck is booked on `d` only if `d` is one of the job's actual
        // working dates (which already accounts for includes_weekends /
        // includes_saturday / includes_sunday).
        const dayAssignments = truckAssignments.filter((a: any) =>
          a.workingDates && a.workingDates.has(dDateStr)
        );

        const trucksRendered = userTrucks.map((t: any) => {
          const a = dayAssignments.find((x: any) => x.vehicle_id === t.id);
          const base = {
            id: t.id,
            truckNumber: t.truck_number,
            vehicleDesc: [t.year, t.make, t.model].filter(Boolean).join(' '),
          };
          if (!a) return { ...base, booked: false };
          return {
            ...base,
            booked: true,
            jobId: a.job_id,
            jobMaterial: a.material,
            jobStatus: a.job_status,
            contractorName: a.contractor_name,
            contractorCompany: a.contractor_company,
            projectName: a.project_name,
          };
        });

        const trucksBooked = trucksRendered.filter(t => t.booked).length;
        const trucksTotal = userTrucks.length;
        const trucksAvailable = trucksTotal - trucksBooked;

        upcomingDays.push({
          date: dDateStr,
          dayName: dayNames[d.getDay()],
          dayNum: d.getDate(),
          isBusinessDay: isBusinessDay(d),
          status: trucksBooked > 0 ? 'booked' : 'available',
          trucksTotal,
          trucksBooked,
          trucksAvailable,
          trucks: trucksRendered,
          jobs: dayAssignments.map((a: any) => ({
            id: a.job_id,
            material: a.material,
            projectName: a.project_name || '',
            contractorName: a.contractor_name || '',
            trucksNeeded: 1,
            assigned: 1,
            status: a.job_status,
            assignmentStatus: 'approved',
          })),
        });
      }

      const dashboard = {
        openJobs, activeJobs, completedJobs, pendingApplications,
        totalJobs: jobs.length,
        earnings: {
          total: invoicesResult.rows[0]?.total || 0,
          awaiting: invoicesResult.rows[0]?.awaiting || 0,
          thisMonth: 0, thisWeek: 0,
        },
        location: {
          lat: user?.primary_location_lat || user?.last_known_lat,
          lng: user?.primary_location_lng || user?.last_known_lng,
          address: user?.primary_location_address || user?.address,
        },
        status: user?.is_connected ? 'online' : 'offline',
        upcomingDays,
        activeFleetRuns,
        fleetActiveRuns: activeFleetRuns,
      };

      return res.json(addDualKeys(dashboard));
    } catch (e: any) {
      console.error("Dashboard error:", e.message);
      return res.json({ openJobs: 0, activeJobs: 0, completedJobs: 0, pendingApplications: 0, totalJobs: 0, earnings: { total: 0, awaiting: 0, thisMonth: 0, thisWeek: 0 } });
    }
  });

  app.get("/api/earnings", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const period = (req.query.period as string) || "all";
      let dateFilter = "";
      if (period === "week") {
        dateFilter = `AND COALESCE(j.completed_date, j.scheduled_date) >= date_trunc('week', now())`;
      } else if (period === "month") {
        dateFilter = `AND COALESCE(j.completed_date, j.scheduled_date) >= date_trunc('month', now())`;
      }

      // The driver's earnings are the jobs they actually worked (completed or
      // currently in progress), valued from their tracked job_runs. We reuse
      // computeJobEarnings so this stays consistent with invoice math.
      const jobsRes = await pool.query(
        `SELECT j.*, c.company AS contractor_company, c.full_name AS contractor_name
         FROM jobs j
         LEFT JOIN users c ON c.id = j.contractor_id
         WHERE (j.driver_id = $1
                OR j.id IN (SELECT job_id FROM job_assignments
                            WHERE driver_id = $1 AND status::text = 'approved'))
           AND j.archived_at IS NULL
           AND j.status::text IN ('completed', 'in_progress')
           ${dateFilter}
         ORDER BY COALESCE(j.completed_date, j.scheduled_date) DESC NULLS LAST`,
        [auth.userId]
      );

      let total = 0, paid = 0, pending = 0;
      const earnings: any[] = [];
      for (const job of jobsRes.rows) {
        const calc = await computeJobEarnings(job);
        const amount = Number(calc.earnings.toFixed(2));
        const payStatus = job.payment_status || "unpaid";
        const status = job.status === "in_progress" ? "in_progress" : payStatus;
        total += amount;
        if (payStatus === "payment_received") paid += amount;
        else pending += amount;
        const dateVal = job.completed_date || job.scheduled_date;
        earnings.push(addDualKeys({
          id: job.id,
          job_id: job.id,
          material: job.material,
          contractor_company: job.contractor_company || job.contractor_name || "",
          date: dateVal ? new Date(dateVal).toISOString() : "",
          completed_date: job.completed_date ? new Date(job.completed_date).toISOString() : null,
          billed_hours: Number((calc.totalMinutes / 60).toFixed(1)),
          rate: Number(job.rate || 0),
          rate_type: job.rate_type,
          amount,
          status,
          sessions: calc.runs.length,
          total_loads: calc.totalLoads,
        }));
      }
      total = Number(total.toFixed(2));
      paid = Number(paid.toFixed(2));
      pending = Number(pending.toFixed(2));

      return res.json({
        earnings,
        stats: {
          totalEarnings: total, paidAmount: paid, pendingAmount: pending,
          total_earnings: total, paid_amount: paid, pending_amount: pending,
        },
        total, paid, pending,
      });
    } catch (e: any) {
      console.error("GET /api/earnings error:", e.message);
      return res.json({ earnings: [], stats: { totalEarnings: 0, paidAmount: 0, pendingAmount: 0 }, total: 0, paid: 0, pending: 0 });
    }
  });

  app.get("/api/contractor/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const contractorId = auth.userId;
      const projectFilter = req.query.project_id as string | undefined;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;

      let query = `SELECT j.*, cp.name as project_name,
          COALESCE((SELECT COUNT(*)::int FROM job_assignments ja WHERE ja.job_id = j.id AND ja.status::text = 'pending'), 0) as pending_applications,
          COALESCE((SELECT COUNT(*)::int FROM job_assignments ja WHERE ja.job_id = j.id AND ja.status::text = 'approved'), 0) as approved_assignments
        FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id WHERE j.contractor_id = $1 AND j.archived_at IS NULL`;
      const params: any[] = [contractorId];
      let paramIdx = 2;

      const singleDate = req.query.date as string | undefined;
      if (singleDate) {
        query += ` AND (
          j.scheduled_date::date = $${paramIdx}::date
          OR (
            j.scheduled_date::date < $${paramIdx}::date
            AND COALESCE(j.estimated_days, 1)::numeric > 1
            AND (j.scheduled_date::date + (CEIL(COALESCE(j.estimated_days, 1)::numeric * 2)::int) * INTERVAL '1 day')::date >= $${paramIdx}::date
          )
        )`;
        params.push(singleDate);
        paramIdx++;
      }
      if (projectFilter) {
        query += ` AND j.project_id = $${paramIdx}`;
        params.push(projectFilter);
        paramIdx++;
      }
      if (status) {
        const statusLower = status.toLowerCase();
        if (statusLower === 'in_progress' || statusLower === 'active') {
          query += ` AND j.status::text IN ('in_progress', 'accepted', 'pending')`;
        } else if (statusLower === 'open') {
          query += ` AND j.status::text IN ('open', 'accepted', 'pending')`;
        } else {
          query += ` AND j.status::text = $${paramIdx}`;
          params.push(statusLower);
          paramIdx++;
        }
      }
      if (search) {
        query += ` AND (j.material_type ILIKE $${paramIdx} OR j.pickup_location ILIKE $${paramIdx} OR j.dropoff_location ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
      }
      query += ` ORDER BY j.scheduled_date ASC NULLS LAST, j.created_at DESC`;

      const result = await pool.query(query, params);
      return res.json(result.rows.map(addDualKeys));
    } catch (e: any) {
      console.error("GET /api/contractor/jobs error:", e.message);
      return res.json([]);
    }
  });

  app.get("/api/driver/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT j.*, cp.name as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id
         WHERE (j.driver_id = $1 OR j.id IN (SELECT job_id FROM job_assignments WHERE driver_id = $1))
         AND j.archived_at IS NULL
         ORDER BY j.created_at DESC`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  function getJobDateRange(scheduledDate: string, estimatedDays: number, includesWeekends: boolean, includesSaturday: boolean = true, includesSunday: boolean = true): string[] {
    const startDate = new Date(scheduledDate);
    if (isNaN(startDate.getTime())) return [];
    const days = Math.max(1, Math.ceil(estimatedDays || 1));
    const dates: string[] = [];
    const current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    let added = 0;
    while (added < days) {
      const dow = current.getUTCDay();
      const isWeekendDay = dow === 0 || dow === 6;
      const dayAllowed = !isWeekendDay
        ? true
        : (includesWeekends && ((dow === 6 && includesSaturday) || (dow === 0 && includesSunday)));
      if (dayAllowed) {
        const key = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`;
        dates.push(key);
        added++;
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
  }

  async function getJobsForCalendar(auth: { jwt: string; userId: string; user: any }, role: 'driver' | 'contractor'): Promise<any[]> {
    try {
      let result;
      const userRole = (auth.user?.role || '').toLowerCase();
      if (role === 'contractor') {
        result = await pool.query(
          `SELECT j.*, cp.name as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN users u ON j.contractor_id::text = u.id::text WHERE j.contractor_id = $1 AND j.archived_at IS NULL ORDER BY j.scheduled_date DESC`,
          [auth.userId]
        );
      } else if (userRole === 'trucking_company') {
        result = await pool.query(
          `SELECT DISTINCT j.*, cp.name as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN users u ON j.contractor_id::text = u.id::text
           WHERE j.id IN (SELECT ja.job_id FROM job_assignments ja JOIN trucks t ON ja.vehicle_id = t.id WHERE t.trucking_company_id = $1 AND ja.status::text NOT IN ('withdrawn', 'rejected'))
           AND j.archived_at IS NULL
           ORDER BY j.scheduled_date DESC`,
          [auth.userId]
        );
      } else {
        result = await pool.query(
          `SELECT j.*, cp.name as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN users u ON j.contractor_id::text = u.id::text
           WHERE (j.driver_id = $1 OR j.id IN (SELECT job_id FROM job_assignments WHERE driver_id = $1 AND status::text NOT IN ('withdrawn', 'rejected')))
           AND j.archived_at IS NULL
           ORDER BY j.scheduled_date DESC`,
          [auth.userId]
        );
      }
      return result.rows.map(addDualKeys);
    } catch (e: any) {
      console.error("getJobsForCalendar error:", e.message);
    }
    return [];
  }

  app.get("/api/calendar/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const userId = auth.userId;
      const userRole = (auth.user?.role || '').toLowerCase();
      const isContractorRole = userRole.includes('contractor') && userRole !== 'trucking_company';
      const allJobs = await getJobsForCalendar(auth, isContractorRole ? 'contractor' : 'driver');
      const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const activeStatuses = new Set(['open', 'in_progress', 'accepted', 'pending']);
      const myJobs = allJobs.filter((j: any) => {
        if (isContractorRole) {
          const cId = j.contractorId || j.contractor_id;
          if (String(cId) !== String(userId)) return false;
        }
        const status = (j.status || '').toLowerCase();
        return activeStatuses.has(status);
      });
      const dailyJobs: Record<string, any[]> = {};
      const jobDateSet = new Set<string>();
      const addToDay = (dateKey: string, entry: any) => {
        const [y, m] = dateKey.split('-').map(Number);
        if (y !== year || m !== month) return;
        if (!dailyJobs[dateKey]) dailyJobs[dateKey] = [];
        dailyJobs[dateKey].push(entry);
        jobDateSet.add(dateKey);
      };
      const jobIds = myJobs.map((j: any) => j.id).filter(Boolean);
      let assignmentsByJob: Record<string, any[]> = {};
      if (jobIds.length > 0) {
        try {
          const assResult = await pool.query(
            `SELECT ja.job_id, ja.vehicle_id, ja.status, t.make, t.model, t.year, t.truck_number, t.license_plate, t.truck_type
             FROM job_assignments ja LEFT JOIN trucks t ON ja.vehicle_id = t.id
             WHERE ja.job_id = ANY($1) AND ja.status::text NOT IN ('withdrawn', 'rejected')`,
            [jobIds]
          );
          for (const row of assResult.rows) {
            if (!assignmentsByJob[row.job_id]) assignmentsByJob[row.job_id] = [];
            assignmentsByJob[row.job_id].push({
              vehicleId: row.vehicle_id,
              status: row.status,
              make: row.make,
              model: row.model,
              year: row.year,
              truckNumber: row.truck_number,
              licensePlate: row.license_plate,
              truckType: row.truck_type,
            });
          }
        } catch {}
      }

      let activeRunsByJob: Record<string, { started_at: string; vehicle_id: string }[]> = {};
      if (jobIds.length > 0) {
        try {
          const runsResult = await pool.query(
            `SELECT job_id, started_at, vehicle_id FROM job_runs WHERE job_id = ANY($1) AND status::text = 'active'`,
            [jobIds]
          );
          for (const row of runsResult.rows) {
            if (!activeRunsByJob[row.job_id]) activeRunsByJob[row.job_id] = [];
            activeRunsByJob[row.job_id].push({ started_at: row.started_at, vehicle_id: row.vehicle_id });
          }
        } catch {}
      }

      for (const job of myJobs) {
        const sd = job.scheduledDate || job.scheduled_date || job.startDate || job.start_date;
        if (!sd) continue;
        const estDays = job.estimatedDays || job.estimated_days || 1;
        const includesWeekends = job.includesWeekends ?? job.includes_weekends ?? false;
        const includesSat = (job.includesSaturday ?? job.includes_saturday) !== false;
        const includesSun = (job.includesSunday ?? job.includes_sunday) !== false;
        const jobDates = getJobDateRange(sd, estDays, includesWeekends, includesSat, includesSun);
        const vehicleAssignments = assignmentsByJob[job.id] || [];
        const activeRuns = activeRunsByJob[job.id] || [];
        const activeAssignments = vehicleAssignments.filter((a: any) => a.status !== 'rejected' && a.status !== 'withdrawn');
        const entriesToAdd: any[] = [];
        if (activeAssignments.length > 1) {
          for (const assignment of activeAssignments) {
            const truckActiveRuns = activeRuns.filter((r: any) => String(r.vehicle_id) === String(assignment.vehicleId));
            entriesToAdd.push({
              ...job,
              vehicleAssignments,
              activeRuns: truckActiveRuns,
              assignmentStatus: assignment.status === 'pending' ? 'pending' : 'approved',
              vehicle: { id: assignment.vehicleId, make: assignment.make, model: assignment.model, year: assignment.year, truckNumber: assignment.truckNumber, licensePlate: assignment.licensePlate, truckType: assignment.truckType },
            });
          }
        } else {
          const enrichedJob = { ...job, vehicleAssignments, activeRuns } as any;
          if (activeAssignments.length === 1) {
            enrichedJob.vehicle = { id: activeAssignments[0].vehicleId, make: activeAssignments[0].make, model: activeAssignments[0].model, year: activeAssignments[0].year, truckNumber: activeAssignments[0].truckNumber, licensePlate: activeAssignments[0].licensePlate, truckType: activeAssignments[0].truckType };
            enrichedJob.assignmentStatus = activeAssignments[0].status === 'pending' ? 'pending' : 'approved';
          }
          entriesToAdd.push(enrichedJob);
        }
        for (const entry of entriesToAdd) {
          jobDates.forEach((dateKey, idx) => {
            if (idx === 0) {
              addToDay(dateKey, entry);
            } else {
              addToDay(dateKey, { ...entry, isMultiDay: true, dayNumber: idx + 1, totalDays: jobDates.length });
            }
          });
        }
      }
      return res.json({ dailyJobs, jobDates: Array.from(jobDateSet).sort() });
    } catch {
      return res.json({ dailyJobs: {}, jobDates: [] });
    }
  });

  app.get("/api/contractor/calendar-capacity", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const allJobs = await getJobsForCalendar(auth, 'contractor');
      const contractorId = auth.userId;
      const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const activeStatuses = new Set(['open', 'in_progress', 'accepted', 'pending']);
      const myJobs = allJobs.filter((j: any) => {
        const cId = j.contractorId || j.contractor_id;
        const status = (j.status || '').toLowerCase();
        if (String(cId) !== String(contractorId)) return false;
        return activeStatuses.has(status);
      });

      const assignmentCounts: Record<string, { approved: number; applied: number }> = {};
      try {
        const jobIds = myJobs.map((j: any) => j.id);
        if (jobIds.length > 0) {
          const placeholders = jobIds.map((_: any, i: number) => `$${i + 1}`).join(',');
          const acResult = await pool.query(
            `SELECT job_id, 
              COUNT(*) FILTER (WHERE status::text = 'approved') as approved,
              COUNT(*) FILTER (WHERE status::text = 'pending') as pending,
              COUNT(*) FILTER (WHERE status::text NOT IN ('rejected', 'withdrawn')) as applied
            FROM job_assignments WHERE job_id IN (${placeholders}) AND status::text NOT IN ('rejected', 'withdrawn') GROUP BY job_id`,
            jobIds
          );
          for (const row of acResult.rows) {
            assignmentCounts[row.job_id] = { approved: parseInt(row.approved) || 0, pending: parseInt(row.pending) || 0, applied: parseInt(row.applied) || 0 };
          }
        }
      } catch {}

      const dailyJobs: Record<string, any[]> = {};
      const dailyCapacity: Record<string, { booked: number; pending: number; needed: number; jobCount: number }> = {};
      const addToDay = (dateKey: string, jobEntry: any) => {
        const [y, m] = dateKey.split('-').map(Number);
        if (y !== year || m !== month) return;
        if (!dailyJobs[dateKey]) dailyJobs[dateKey] = [];
        const ac = assignmentCounts[jobEntry.id] || { approved: 0, pending: 0, applied: 0 };
        dailyJobs[dateKey].push({ ...jobEntry, approved: ac.approved, pending: ac.pending, applied: ac.applied });
        const trucksNeeded = jobEntry.trucksNeeded || jobEntry.trucks_needed || 0;
        if (!dailyCapacity[dateKey]) dailyCapacity[dateKey] = { booked: 0, pending: 0, needed: 0, jobCount: 0 };
        dailyCapacity[dateKey].booked += ac.approved;
        dailyCapacity[dateKey].pending += ac.pending;
        dailyCapacity[dateKey].needed += trucksNeeded;
        dailyCapacity[dateKey].jobCount += 1;
      };
      for (const job of myJobs) {
        const sd = job.scheduledDate || job.scheduled_date || job.startDate || job.start_date;
        if (!sd) continue;
        const estDays = job.estimatedDays || job.estimated_days || 1;
        const includesWeekends = job.includesWeekends ?? job.includes_weekends ?? false;
        const includesSat = (job.includesSaturday ?? job.includes_saturday) !== false;
        const includesSun = (job.includesSunday ?? job.includes_sunday) !== false;
        const jobDates = getJobDateRange(sd, estDays, includesWeekends, includesSat, includesSun);
        jobDates.forEach((dateKey, idx) => {
          if (idx === 0) {
            addToDay(dateKey, job);
          } else {
            addToDay(dateKey, { ...job, isMultiDay: true, dayNumber: idx + 1, totalDays: jobDates.length });
          }
        });
      }
      const fleetSize = Object.values(dailyCapacity).reduce((max, cap) => Math.max(max, cap.needed), 0);
      return res.json({ fleetSize, dailyCapacity, dailyJobs });
    } catch (e: any) {
      console.error("Calendar capacity error:", e.message);
      return res.json({ fleetSize: 0, dailyCapacity: {}, dailyJobs: {} });
    }
  });

  // Compute the earnings for a single job from its completed runs.
  // Returns { earnings, totalMinutes, totalLoads, runs }.
  async function computeJobEarnings(job: any): Promise<{ earnings: number; totalMinutes: number; totalLoads: number; runs: any[] }> {
    const runsRes = await pool.query(
      `SELECT id, started_at, ended_at, actual_duration_minutes, billed_duration_minutes, loads_hauled, status
       FROM job_runs WHERE job_id = $1`,
      [job.id]
    );
    let totalMinutes = 0;
    let totalLoads = 0;
    for (const r of runsRes.rows) {
      const billed = r.billed_duration_minutes != null ? Number(r.billed_duration_minutes) : null;
      const actual = r.actual_duration_minutes != null ? Number(r.actual_duration_minutes) : null;
      let mins = 0;
      if (billed != null) mins = billed;
      else if (actual != null) mins = actual;
      else if (r.started_at && r.ended_at) {
        mins = Math.max(0, (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 60000);
      } else if (r.started_at && r.status !== 'completed') {
        mins = Math.max(0, (Date.now() - new Date(r.started_at).getTime()) / 60000);
      }
      totalMinutes += mins;
      totalLoads += Number(r.loads_hauled || 0);
    }
    const rate = Number(job.rate || 0);
    let earnings = 0;
    switch (job.rate_type) {
      case 'per_hour':
        earnings = (totalMinutes / 60) * rate;
        break;
      case 'per_load':
        earnings = totalLoads * rate;
        break;
      case 'flat':
      case 'flat_rate':
      case 'per_job':
        earnings = rate;
        break;
      default:
        earnings = (totalMinutes / 60) * rate;
    }
    return { earnings, totalMinutes, totalLoads, runs: runsRes.rows };
  }

  // Find all jobs that should be tallied under a given invoice, then recompute totals.
  // For OPEN invoices: act as a live, rolling tally of all unbilled work between the
  // contractor and driver that has any tracked time/loads. For issued/paid invoices:
  // stay locked to the explicitly-linked jobs (snapshot semantics).
  async function recomputeInvoice(invoice: any): Promise<{ jobs: any[]; total: number; jobCount: number }> {
    const isOpen = invoice.status === 'open';
    let jobsRes;
    if (isOpen) {
      jobsRes = await pool.query(
        `SELECT DISTINCT j.* FROM jobs j
         LEFT JOIN job_runs jr ON jr.job_id = j.id
         WHERE j.invoice_id = $1
            OR (j.contractor_id = $2
                AND (j.driver_id = $3 OR jr.driver_id = $3)
                AND j.status::text IN ('completed', 'in_progress', 'accepted')
                AND (j.invoice_id IS NULL OR j.invoice_id = $1))`,
        [invoice.id, invoice.contractor_id, invoice.driver_id]
      );
    } else {
      jobsRes = await pool.query(
        `SELECT DISTINCT j.* FROM jobs j WHERE j.invoice_id = $1`,
        [invoice.id]
      );
    }
    let total = 0;
    const enrichedJobs: any[] = [];
    for (const job of jobsRes.rows) {
      const calc = await computeJobEarnings(job);
      total += calc.earnings;
      enrichedJobs.push({
        ...job,
        computed_earnings: Number(calc.earnings.toFixed(2)),
        computed_total_minutes: Math.round(calc.totalMinutes),
        computed_total_loads: calc.totalLoads,
      });
    }
    return { jobs: enrichedJobs, total: Number(total.toFixed(2)), jobCount: enrichedJobs.length };
  }

  app.get("/api/invoices", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const status = req.query.status as string | undefined;
      const includeHidden = req.query.include_hidden === '1' || req.query.include_hidden === 'true';
      let query = `
        SELECT mi.*,
          c.full_name AS contractor_name, c.company AS contractor_company,
          c.email AS contractor_email, c.phone AS contractor_phone,
          c.address AS contractor_address, c.city AS contractor_city,
          c.state AS contractor_state, c.zip_code AS contractor_zip,
          d.full_name AS driver_name, d.company AS driver_company,
          d.email AS driver_email, d.phone AS driver_phone,
          d.address AS driver_address, d.city AS driver_city,
          d.state AS driver_state, d.zip_code AS driver_zip
        FROM monthly_invoices mi
        LEFT JOIN users c ON c.id = mi.contractor_id
        LEFT JOIN users d ON d.id = mi.driver_id
        WHERE (mi.contractor_id = $1 OR mi.driver_id = $1)`;
      const params: any[] = [auth.userId];
      if (!includeHidden) {
        query += ` AND mi.hidden_at IS NULL`;
      }
      if (status) {
        params.push(status.toLowerCase());
        query += ` AND mi.status::text = $${params.length}`;
      }
      query += ` ORDER BY mi.created_at DESC`;
      const result = await pool.query(query, params);

      // Recompute totals for OPEN invoices only (live tally). Issued / paid / void
      // invoices keep their stored snapshot total — that history shouldn't shift.
      const recomputed = await Promise.all(result.rows.map(async (row) => {
        if (row.status === 'open') {
          try {
            const calc = await recomputeInvoice(row);
            row.total_amount = calc.total;
            row.job_count = calc.jobCount;
          } catch (e) {
            // fall back to stored value on error
          }
        }
        return row;
      }));

      return res.json(recomputed.map(addDualKeys));
    } catch (e: any) {
      console.error("GET /api/invoices error:", e.message);
      return res.json([]);
    }
  });

  app.get("/api/invoices/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT mi.*,
          c.full_name AS contractor_name, c.company AS contractor_company,
          c.email AS contractor_email, c.phone AS contractor_phone,
          c.address AS contractor_address, c.city AS contractor_city,
          c.state AS contractor_state, c.zip_code AS contractor_zip,
          d.full_name AS driver_name, d.company AS driver_company,
          d.email AS driver_email, d.phone AS driver_phone,
          d.address AS driver_address, d.city AS driver_city,
          d.state AS driver_state, d.zip_code AS driver_zip
        FROM monthly_invoices mi
        LEFT JOIN users c ON c.id = mi.contractor_id
        LEFT JOIN users d ON d.id = mi.driver_id
        WHERE mi.id = $1 AND (mi.contractor_id = $2 OR mi.driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (result.rows.length > 0) {
        const invoice = result.rows[0];
        const calc = await recomputeInvoice(invoice);
        invoice.jobs = calc.jobs.map(addDualKeys);
        invoice.total_amount = calc.total;
        invoice.job_count = calc.jobCount;
        return res.json(addDualKeys(invoice));
      }
      return res.status(404).json({ message: "Invoice not found" });
    } catch (e: any) {
      console.error("GET /api/invoices/:id error:", e.message);
      return res.status(500).json({ message: "Failed to load invoice" });
    }
  });

  app.put("/api/invoices/:id/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const { status } = req.body;
      const owned = await pool.query(
        `SELECT id FROM monthly_invoices WHERE id = $1 AND (contractor_id = $2 OR driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (owned.rows.length === 0) return res.status(404).json({ message: "Invoice not found" });
      await pool.query(`UPDATE monthly_invoices SET status = $1, updated_at = NOW() WHERE id = $2`, [status, req.params.id]);
      pushToWebsite(`/api/invoices/${req.params.id}/status`, auth, { method: "POST", body: req.body }).catch(() => {});
      const result = await pool.query(`SELECT * FROM monthly_invoices WHERE id = $1`, [req.params.id]);
      return res.json(addDualKeys(result.rows[0] || {}));
    } catch {
      return res.status(500).json({ message: "Failed to update invoice status" });
    }
  });

  // Hide a (zero-balance) invoice from the default list.
  app.post("/api/invoices/:id/hide", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT * FROM monthly_invoices WHERE id = $1 AND (contractor_id = $2 OR driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: "Invoice not found" });
      await pool.query(`UPDATE monthly_invoices SET hidden_at = NOW(), updated_at = NOW() WHERE id = $1`, [req.params.id]);
      return res.json({ success: true });
    } catch (e: any) {
      console.error("POST /api/invoices/:id/hide error:", e.message);
      return res.status(500).json({ message: "Failed to hide invoice" });
    }
  });

  app.post("/api/invoices/:id/unhide", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT * FROM monthly_invoices WHERE id = $1 AND (contractor_id = $2 OR driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: "Invoice not found" });
      await pool.query(`UPDATE monthly_invoices SET hidden_at = NULL, updated_at = NOW() WHERE id = $1`, [req.params.id]);
      return res.json({ success: true });
    } catch (e: any) {
      console.error("POST /api/invoices/:id/unhide error:", e.message);
      return res.status(500).json({ message: "Failed to unhide invoice" });
    }
  });

  app.get("/api/projects", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const includeDeleted = req.query.include_deleted === "true";

      let query = `SELECT * FROM contractor_projects WHERE contractor_id = $1`;
      const params: any[] = [auth.userId];
      if (!includeDeleted) {
        query += ` AND deleted_at IS NULL`;
      }
      query += ` ORDER BY created_at DESC`;

      const result = await pool.query(query, params);
      const projects = result.rows;

      return res.json(projects.map(addDualKeys));
    } catch (e: any) {
      console.error("GET /api/projects error:", e.message, e.stack?.split('\n')[1]);
      return res.json([]);
    }
  });

  app.post("/api/projects", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const id = crypto.randomUUID();
      const name = req.body.name || req.body.projectName || req.body.project_name || "Untitled Project";
      const jobNumber = req.body.jobNumber || req.body.job_number || null;
      const siteAddress = req.body.siteAddress || req.body.site_address || null;
      const siteLat = req.body.siteLat || req.body.site_lat || null;
      const siteLng = req.body.siteLng || req.body.site_lng || null;
      const notes = req.body.notes || null;

      await pool.query(
        `INSERT INTO contractor_projects (id, contractor_id, name, job_number, site_address, site_lat, site_lng, notes, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW(), NOW())`,
        [id, auth.userId, name, jobNumber, siteAddress, siteLat, siteLng, notes]
      );

      const result = await pool.query(`SELECT * FROM contractor_projects WHERE id = $1`, [id]);
      const project = result.rows[0];

      return res.status(201).json(addDualKeys(project));
    } catch (e: any) {
      console.error("POST /api/projects error:", e.message);
      return res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.put("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;

      // Ownership check — only the contractor who owns this project may update it.
      const owned = await pool.query(
        `SELECT id FROM contractor_projects WHERE id = $1 AND contractor_id::text = $2 AND deleted_at IS NULL`,
        [req.params.id, auth.userId]
      );
      if (owned.rows.length === 0) return res.status(404).json({ message: "Project not found" });

      const updates: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      const fieldMap: Record<string, string> = {
        name: 'name', projectName: 'name', project_name: 'name',
        jobNumber: 'job_number', job_number: 'job_number',
        siteAddress: 'site_address', site_address: 'site_address',
        siteLat: 'site_lat', site_lat: 'site_lat',
        siteLng: 'site_lng', site_lng: 'site_lng',
        notes: 'notes', status: 'status',
      };

      for (const [bodyKey, dbCol] of Object.entries(fieldMap)) {
        if (req.body[bodyKey] !== undefined) {
          updates.push(`${dbCol} = $${paramIdx}`);
          values.push(req.body[bodyKey]);
          paramIdx++;
        }
      }

      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(req.params.id);
        await pool.query(
          `UPDATE contractor_projects SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
          values
        );
      }

      const result = await pool.query(`SELECT * FROM contractor_projects WHERE id = $1`, [req.params.id]);
      const project = result.rows[0] || { id: req.params.id, status: 'active' };

      const addressChanged =
        req.body.siteAddress !== undefined || req.body.site_address !== undefined ||
        req.body.siteLat !== undefined     || req.body.site_lat !== undefined ||
        req.body.siteLng !== undefined     || req.body.site_lng !== undefined;

      let cascaded = 0;
      if (addressChanged && project && project.site_address) {
        const role = (project.site_address_type || 'dropoff') === 'pickup' ? 'pickup' : 'dropoff';
        const addrCol = role === 'pickup' ? 'origin_address'   : 'destination_address';
        const latCol  = role === 'pickup' ? 'origin_lat'       : 'destination_lat';
        const lngCol  = role === 'pickup' ? 'origin_lng'       : 'destination_lng';
        const upd = await pool.query(
          `UPDATE jobs
              SET ${addrCol} = $1,
                  ${latCol}  = $2,
                  ${lngCol}  = $3,
                  updated_at = NOW()
            WHERE project_id = $4
              AND archived_at IS NULL
              AND status NOT IN ('completed','cancelled')`,
          [project.site_address, project.site_lat, project.site_lng, req.params.id]
        );
        cascaded = upd.rowCount || 0;
        if (cascaded > 0) {
          console.log(`PUT /api/projects/${req.params.id} cascaded address to ${cascaded} job(s) (${role})`);
        }
      }

      return res.json({ ...addDualKeys(project), cascadedJobs: cascaded });
    } catch (e: any) {
      console.error("PUT /api/projects error:", e.message);
      return res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const upd = await pool.query(
        `UPDATE contractor_projects SET deleted_at = NOW()
         WHERE id = $1 AND contractor_id::text = $2 RETURNING id`,
        [req.params.id, auth.userId]
      );
      if (upd.rowCount === 0) return res.status(404).json({ message: "Project not found" });
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.post("/api/projects/:id/restore", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const upd = await pool.query(
        `UPDATE contractor_projects SET status = 'active', deleted_at = NULL
         WHERE id = $1 AND contractor_id::text = $2 RETURNING id`,
        [req.params.id, auth.userId]
      );
      if (upd.rowCount === 0) return res.status(404).json({ message: "Project not found" });
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Failed to restore project" });
    }
  });

  app.get("/api/materials", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT * FROM contractor_materials WHERE contractor_id = $1 ORDER BY usage_count DESC, last_used_at DESC`,
        [auth.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.get("/api/saved-locations", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const user = await pool.query(`SELECT * FROM users WHERE id = $1`, [auth.userId]);
      const u = user.rows[0];
      if (!u) return res.json([]);
      const locations: any[] = [];
      if (u.primary_location_address) locations.push({ address: u.primary_location_address, lat: u.primary_location_lat, lng: u.primary_location_lng, label: 'Primary' });
      if (u.secondary_location_address) locations.push({ address: u.secondary_location_address, lat: u.secondary_location_lat, lng: u.secondary_location_lng, label: 'Secondary' });
      if (u.tertiary_location_address) locations.push({ address: u.tertiary_location_address, lat: u.tertiary_location_lat, lng: u.tertiary_location_lng, label: 'Tertiary' });
      return res.json(locations.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.post("/api/reviews", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const b = req.body;
      const jobId = b.jobId || b.job_id;
      const revieweeId = b.revieweeId || b.reviewee_id;

      // Validate the job exists, is completed, and the caller participated in it.
      const jobRow = await pool.query(
        `SELECT id, contractor_id, driver_id FROM jobs WHERE id = $1 AND status = 'completed'`,
        [jobId]
      );
      if (jobRow.rows.length === 0) {
        return res.status(400).json({ message: "Job not found or not completed" });
      }
      const job = jobRow.rows[0];
      const callerIsContractor = job.contractor_id === auth.userId;
      const callerIsDriver = job.driver_id === auth.userId;
      if (!callerIsContractor && !callerIsDriver) {
        return res.status(403).json({ message: "You did not participate in this job" });
      }
      // The reviewee must be the legitimate counterparty.
      const expectedReviewee = callerIsContractor ? job.driver_id : job.contractor_id;
      if (revieweeId !== expectedReviewee) {
        return res.status(400).json({ message: "Invalid reviewee for this job" });
      }
      // Prevent duplicate reviews.
      const existing = await pool.query(
        `SELECT id FROM reviews WHERE job_id = $1 AND reviewer_id = $2`,
        [jobId, auth.userId]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ message: "You have already reviewed this job" });
      }

      const id = crypto.randomUUID();
      // Use the server-derived role, not whatever the client sent.
      const reviewerRole = callerIsContractor ? 'contractor' : 'driver';
      await pool.query(
        `INSERT INTO reviews (id, job_id, reviewer_id, reviewee_id, rating, comment, reviewer_role, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [id, jobId, auth.userId, revieweeId, b.rating, b.comment, reviewerRole]
      );
      return res.status(201).json({ ok: true, id });
    } catch (e: any) {
      console.error("POST review error:", e.message);
      return res.status(500).json({ message: "Failed to submit review" });
    }
  });

  app.get("/api/reviews/pending", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT j.id as job_id, j.material, j.origin_address, j.destination_address, j.contractor_id, j.driver_id
         FROM jobs j WHERE j.status = 'completed'
         AND (j.contractor_id = $1 OR j.driver_id = $1)
         AND j.id NOT IN (SELECT job_id FROM reviews WHERE reviewer_id = $1)
         ORDER BY j.completed_date DESC LIMIT 10`,
        [auth.userId]
      );
      return res.json({ reviews: result.rows.map(addDualKeys), count: result.rows.length });
    } catch {
      return res.json({ reviews: [], count: 0 });
    }
  });

  app.get("/api/reviews/:userId", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT r.*, u.full_name as reviewer_name FROM reviews r LEFT JOIN users u ON r.reviewer_id = u.id WHERE r.reviewee_id = $1 ORDER BY r.created_at DESC`,
        [req.params.userId]
      );
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.get("/api/favorites/:driverId", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT * FROM driver_favorites WHERE contractor_id = $1 AND driver_id = $2`,
        [auth.userId, req.params.driverId]
      );
      return res.json({ isFavorite: result.rows.length > 0 });
    } catch {
      return res.json({ isFavorite: false });
    }
  });

  app.post("/api/favorites/:driverId", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const existing = await pool.query(
        `SELECT * FROM driver_favorites WHERE contractor_id = $1 AND driver_id = $2`,
        [auth.userId, req.params.driverId]
      );
      if (existing.rows.length > 0) {
        await pool.query(`DELETE FROM driver_favorites WHERE contractor_id = $1 AND driver_id = $2`, [auth.userId, req.params.driverId]);
        return res.json({ isFavorite: false });
      } else {
        const id = crypto.randomUUID();
        await pool.query(`INSERT INTO driver_favorites (id, contractor_id, driver_id, created_at) VALUES ($1, $2, $3, NOW())`, [id, auth.userId, req.params.driverId]);
        return res.json({ isFavorite: true });
      }
    } catch {
      return res.json({ isFavorite: false });
    }
  });

  app.get("/api/places/autocomplete", requireAuth, async (req: Request, res: Response) => {
    try {
      const input = req.query.input as string;
      if (!input || input.trim().length < 2) return res.json([]);

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Google Maps API key not configured" });

      const lat = req.query.lat as string;
      const lng = req.query.lng as string;

      // Legacy Places Autocomplete. The `origin` parameter makes Google return
      // distance_meters per prediction, which we then use to:
      //   1) hard-filter out anything beyond NEAR_LIMIT_METERS (when a bias
      //      point is present) so distant junk like "Evansville, IN" never
      //      surfaces near a Jackson, WY pin;
      //   2) sort the rest closest-first.
      // If the local filter leaves us with too few results we fall back to the
      // unfiltered set so unusual queries aren't blocked entirely.
      const NEAR_LIMIT_METERS = 350_000; // ~217 miles
      const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
      url.searchParams.set("input", input);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("components", "country:us|country:ca");
      const hasBias = lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
      if (hasBias) {
        url.searchParams.set("location", `${lat},${lng}`);
        url.searchParams.set("radius", "100000");
        url.searchParams.set("origin", `${lat},${lng}`);
      }

      const response = await fetch(url.toString());
      const data = await response.json() as any;
      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        console.error("Places API status:", data.status, data.error_message);
      }

      const raw: any[] = Array.isArray(data.predictions) ? data.predictions : [];
      const mapped = raw.map((p: any) => ({
        place_id: p.place_id,
        description: p.description,
        structured: p.structured_formatting,
        distance_meters: typeof p.distance_meters === "number" ? p.distance_meters : undefined,
      }));

      let predictions = mapped;
      if (hasBias) {
        const local = mapped.filter(p =>
          typeof p.distance_meters === "number" && p.distance_meters <= NEAR_LIMIT_METERS
        );
        // Fall back to all results if the local filter produced almost nothing.
        predictions = local.length >= 1 ? local : mapped;
        predictions.sort((a, b) => {
          const da = typeof a.distance_meters === "number" ? a.distance_meters : Number.POSITIVE_INFINITY;
          const db = typeof b.distance_meters === "number" ? b.distance_meters : Number.POSITIVE_INFINITY;
          return da - db;
        });
      }

      return res.json(predictions);
    } catch (err) {
      console.error("Places autocomplete error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/places/details", requireAuth, async (req: Request, res: Response) => {
    try {
      const placeId = req.query.place_id as string;
      if (!placeId) return res.status(400).json({ message: "place_id required" });

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Google Maps API key not configured" });

      const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      url.searchParams.set("place_id", placeId);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("fields", "geometry,formatted_address");

      const response = await fetch(url.toString());
      const data = await response.json() as any;

      if (data.result) {
        return res.json({
          address: data.result.formatted_address,
          lat: data.result.geometry?.location?.lat,
          lng: data.result.geometry?.location?.lng,
        });
      }
      return res.status(404).json({ message: "Place not found" });
    } catch (err) {
      console.error("Place details error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/places/geocode", requireAuth, async (req: Request, res: Response) => {
    try {
      const address = req.query.address as string;
      if (!address || address.trim().length < 3) return res.status(400).json({ message: "Address required" });

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Google Maps API key not configured" });

      const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
      url.searchParams.set("input", address);
      url.searchParams.set("inputtype", "textquery");
      url.searchParams.set("fields", "formatted_address,geometry,place_id");
      url.searchParams.set("key", apiKey);

      const response = await fetch(url.toString());
      const data = await response.json() as any;

      if (data.status === "OK" && data.candidates && data.candidates.length > 0) {
        const result = data.candidates[0];
        return res.json({
          address: result.formatted_address,
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
        });
      }
      return res.status(404).json({ message: "Address not found" });
    } catch (err) {
      console.error("Geocode error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/directions", requireAuth, async (req: Request, res: Response) => {
    try {
      const { origin_lat, origin_lng, dest_lat, dest_lng } = req.query;
      if (!origin_lat || !origin_lng || !dest_lat || !dest_lng) {
        return res.status(400).json({ message: "Origin and destination coordinates required" });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Google Maps API key not configured" });

      const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
      url.searchParams.set("origin", `${origin_lat},${origin_lng}`);
      url.searchParams.set("destination", `${dest_lat},${dest_lng}`);
      url.searchParams.set("key", apiKey);

      const response = await fetch(url.toString());
      const data = await response.json() as any;

      if (data.routes && data.routes.length > 0) {
        const leg = data.routes[0].legs[0];
        const durationSeconds = leg.duration.value;
        const distanceMeters = leg.distance.value;
        const distanceMiles = (distanceMeters / 1609.34).toFixed(1);
        const truckDurationSeconds = Math.round(durationSeconds * 1.4);

        return res.json({
          duration_seconds: durationSeconds,
          duration_text: leg.duration.text,
          truck_duration_seconds: truckDurationSeconds,
          truck_duration_text: formatDuration(truckDurationSeconds),
          distance_miles: parseFloat(distanceMiles),
          distance_text: leg.distance.text,
        });
      }
      return res.status(404).json({ message: "No route found" });
    } catch (err) {
      console.error("Directions error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/map-embed", async (req: Request, res: Response) => {
    try {
      const { oLat, oLng, dLat, dLng, hasOrigin, hasDest } = req.query;
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).send("Map API not configured");

      const originLat = parseFloat(oLat as string) || 0;
      const originLng = parseFloat(oLng as string) || 0;
      const destLat = parseFloat(dLat as string) || 0;
      const destLng = parseFloat(dLng as string) || 0;
      const showOrigin = hasOrigin === "true";
      const showDest = hasDest === "true";

      const centerLat = showOrigin && showDest ? (originLat + destLat) / 2 : showOrigin ? originLat : destLat;
      const centerLng = showOrigin && showDest ? (originLng + destLng) / 2 : showOrigin ? originLng : destLng;

      const html = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;}</style>
</head><body>
<div id="map"></div>
<script>
function initMap(){
  const map=new google.maps.Map(document.getElementById('map'),{
    center:{lat:${centerLat},lng:${centerLng}},zoom:11,
    mapTypeControl:false,streetViewControl:false,fullscreenControl:false,
    styles:[{elementType:'geometry',stylers:[{color:'#1d2c4d'}]},{elementType:'labels.text.fill',stylers:[{color:'#8ec3b9'}]},{elementType:'labels.text.stroke',stylers:[{color:'#1a3646'}]},{featureType:'road',elementType:'geometry',stylers:[{color:'#304a7d'}]},{featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#255d7a'}]},{featureType:'water',elementType:'geometry',stylers:[{color:'#17263c'}]}]
  });
  ${showOrigin ? `new google.maps.Marker({position:{lat:${originLat},lng:${originLng}},map,title:'Pickup',icon:{path:google.maps.SymbolPath.CIRCLE,fillColor:'#22c55e',fillOpacity:1,strokeColor:'#fff',strokeWeight:2,scale:10}});` : ""}
  ${showDest ? `new google.maps.Marker({position:{lat:${destLat},lng:${destLng}},map,title:'Dropoff',icon:{path:google.maps.SymbolPath.CIRCLE,fillColor:'#FF9900',fillOpacity:1,strokeColor:'#fff',strokeWeight:2,scale:10}});` : ""}
  ${showOrigin && showDest ? `
  const ds=new google.maps.DirectionsService();
  const dr=new google.maps.DirectionsRenderer({suppressMarkers:true,polylineOptions:{strokeColor:'#3b82f6',strokeWeight:4}});
  dr.setMap(map);
  ds.route({origin:{lat:${originLat},lng:${originLng}},destination:{lat:${destLat},lng:${destLng}},travelMode:'DRIVING'},function(r,s){
    if(s==='OK'){dr.setDirections(r);const b=new google.maps.LatLngBounds();b.extend({lat:${originLat},lng:${originLng}});b.extend({lat:${destLat},lng:${destLng}});map.fitBounds(b,60);}
  });` : ""}
}
</script>
<script src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap" async defer></script>
</body></html>`;

      res.setHeader("Content-Type", "text/html");
      return res.send(html);
    } catch (err) {
      console.error("Map embed error:", err);
      return res.status(500).send("Error loading map");
    }
  });

  app.get("/api/directions/polyline", requireAuth, async (req: Request, res: Response) => {
    try {
      const { origin_lat, origin_lng, dest_lat, dest_lng } = req.query;
      if (!origin_lat || !origin_lng || !dest_lat || !dest_lng) {
        return res.status(400).json({ message: "Origin and destination coordinates required" });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Google Maps API key not configured" });

      const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
      url.searchParams.set("origin", `${origin_lat},${origin_lng}`);
      url.searchParams.set("destination", `${dest_lat},${dest_lng}`);
      url.searchParams.set("key", apiKey);

      const response = await fetch(url.toString());
      const data = await response.json() as any;

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const encodedPolyline = route.overview_polyline?.points || "";
        const points: { lat: number; lng: number }[] = [];

        if (encodedPolyline) {
          let index = 0,
            lat = 0,
            lng = 0;
          while (index < encodedPolyline.length) {
            let b,
              shift = 0,
              result = 0;
            do {
              b = encodedPolyline.charCodeAt(index++) - 63;
              result |= (b & 0x1f) << shift;
              shift += 5;
            } while (b >= 0x20);
            lat += result & 1 ? ~(result >> 1) : result >> 1;
            shift = 0;
            result = 0;
            do {
              b = encodedPolyline.charCodeAt(index++) - 63;
              result |= (b & 0x1f) << shift;
              shift += 5;
            } while (b >= 0x20);
            lng += result & 1 ? ~(result >> 1) : result >> 1;
            points.push({ lat: lat / 1e5, lng: lng / 1e5 });
          }
        }

        return res.json({ points });
      }
      return res.json({ points: [] });
    } catch (err) {
      console.error("Polyline directions error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  startPeriodicSync(() => {
    const latestPerUser = new Map<string, { jwt: string; userId: string; user: any }>();
    for (const [, auth] of tokenToJwt) {
      latestPerUser.set(auth.userId, auth);
    }
    return Array.from(latestPerUser.values());
  }, 120000);

  const httpServer = createServer(app);
  return httpServer;
}
