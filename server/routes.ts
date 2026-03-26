import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pool } from "./db";
import { fullSync, pushToWebsite, startPeriodicSync, recordUserActivity, syncJobAssignments } from "./sync";
import { deletedVehicleIds, pauseJobSync, resumeJobSync } from "./deleted-vehicles";

const WEBSITE_API_URL = process.env.WEBSITE_API_URL || process.env.COMPANION_API_URL || "https://loadlink.replit.app";
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

const tokenToJwt = loadJsonMap<{ jwt: string; userId: string; user: any }>("sessions.json");

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
): Promise<Response> {
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

  app.post("/api/auth/social-login", async (req: Request, res: Response) => {
    try {
      const { provider, token, email: clientEmail } = req.body;
      if (!provider || !token) {
        return res.status(400).json({ message: "Provider and token are required" });
      }

      let verifiedEmail: string | null = null;

      if (provider === "google") {
        try {
          const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
          if (googleRes.ok) {
            const info = await googleRes.json();
            if (info.email_verified === "true" || info.email_verified === true) {
              verifiedEmail = info.email;
            }
          }
          if (!verifiedEmail) {
            const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (userinfoRes.ok) {
              const info = await userinfoRes.json();
              if (info.email_verified) {
                verifiedEmail = info.email;
              }
            }
          }
        } catch (e: any) {
          console.error("Google token verification failed:", e.message);
        }
      } else if (provider === "apple") {
        try {
          const parts = token.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
            if (payload.iss === "https://appleid.apple.com" && payload.email) {
              verifiedEmail = payload.email;
            }
          }
        } catch (e: any) {
          console.error("Apple token decode failed:", e.message);
        }
        if (!verifiedEmail && clientEmail) {
          verifiedEmail = clientEmail;
        }
      }

      if (!verifiedEmail) {
        return res.status(401).json({ message: "Could not verify your identity. Please try again." });
      }

      const websiteRes = await websiteFetch("/api/companion/auth/login", {
        method: "POST",
        body: { email: verifiedEmail },
      });

      const data = await websiteRes.json();

      if (!websiteRes.ok) {
        if (websiteRes.status === 404 || (data.message && data.message.toLowerCase().includes("not found"))) {
          return res.status(404).json({
            message: "No LoadLink account found with this email. Please sign up first on loadlink.replit.app",
            email: verifiedEmail,
          });
        }
        return res.status(websiteRes.status).json({
          message: data.message || data.error || "Authentication failed",
        });
      }

      const jwt = data.token;
      const user = data.user;
      if (!jwt || !user) {
        return res.status(500).json({ message: "Invalid response from auth service" });
      }

      const localToken = require("crypto").randomBytes(32).toString("hex");
      const authEntry = { jwt, userId: user.id, user };
      tokenToJwt.set(localToken, authEntry);
      saveJsonMap("sessions.json", tokenToJwt);

      const enrichedUser = addDualKeys(user);
      res.json({ token: localToken, user: enrichedUser });

      fullSync(authEntry).catch(() => {});
      return;
    } catch (err: any) {
      console.error("Social login error:", err.message);
      return res.status(500).json({ message: "Authentication service unavailable" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      for (const [existingToken, session] of tokenToJwt.entries()) {
        if (session.user?.email?.toLowerCase() === email.toLowerCase()) {
          const localToken = require("crypto").randomBytes(32).toString("hex");
          tokenToJwt.set(localToken, session);
          saveJsonMap("sessions.json", tokenToJwt);
          recordUserActivity(session.userId);
          res.json({ token: localToken, user: addDualKeys(session.user) });

          websiteFetch("/api/companion/auth/login", {
            method: "POST",
            body: { email },
          }).then(async (r) => {
            if (r.ok) {
              const d = await r.json();
              if (d.token && d.user) {
                const updated = { jwt: d.token, userId: d.user.id, user: d.user };
                tokenToJwt.set(localToken, updated);
                saveJsonMap("sessions.json", tokenToJwt);
                fullSync(updated).catch(() => {});
              }
            }
          }).catch(() => {});
          return;
        }
      }

      const websiteRes = await websiteFetch("/api/companion/auth/login", {
        method: "POST",
        body: { email },
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

      const localToken = require("crypto").randomBytes(32).toString("hex");
      const authEntry = { jwt, userId: user.id, user };
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
        const localToken = require("crypto").randomBytes(32).toString("hex");
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
      pushToWebsite("/api/push/subscribe", auth, { method: "POST", body: req.body }).catch(() => {});
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
        query += ` AND j.scheduled_date::date = $${paramIdx}::date`;
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
      await pool.query(`UPDATE jobs SET archived_at = NULL, status = 'open', cancelled_at = NULL WHERE id = $1`, [req.params.id]);
      const auth = getWebsiteAuth(req)!;
      pushToWebsite(`/api/jobs/${req.params.id}`, auth, { method: "PUT", body: { archived_at: null, status: 'open', cancelled_at: null } }).catch(() => {});
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Unarchive job error:", e.message);
      return res.status(500).json({ message: "Failed to unarchive job" });
    }
  });

  app.get("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT j.*, cp.name as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN users u ON j.contractor_id::text = u.id::text WHERE j.id = $1`,
        [req.params.id]
      );
      if (result.rows.length > 0) {
        const job = result.rows[0];
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
      const id = require("crypto").randomUUID();
      const body = { ...req.body, id, contractor_id: auth.userId, status: 'open', created_at: new Date().toISOString() };

      const columns = ['id', 'contractor_id', 'material', 'origin_address', 'destination_address', 'rate', 'rate_type',
        'truck_type', 'status', 'scheduled_date', 'project_id', 'trucks_needed', 'estimated_days', 'includes_weekends',
        'estimated_cost', 'origin_lat', 'origin_lng', 'destination_lat', 'destination_lng', 'job_type',
        'requires_weight_tickets', 'requires_tarp', 'urgent', 'created_at', 'updated_at',
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

      pushToWebsite("/api/jobs", auth, { method: "POST", body: req.body }).catch(() => {});

      return res.status(201).json(addDualKeys(job));
    } catch (e: any) {
      console.error("POST /api/jobs error:", e.message);
      return res.status(500).json({ message: "Failed to create job" });
    }
  });

  app.put("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
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
      const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
      pushToWebsite(`/api/jobs/${req.params.id}`, auth, { method: "PUT", body: req.body }).catch(() => {});
      return res.json(addDualKeys(result.rows[0] || { id: req.params.id }));
    } catch (e: any) {
      console.error("PUT /api/jobs error:", e.message);
      return res.status(500).json({ message: "Failed to update job" });
    }
  });

  app.delete("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const now = new Date().toISOString();
      await pool.query(`UPDATE jobs SET status = 'cancelled', cancelled_at = NOW(), archived_at = NOW() WHERE id = $1`, [req.params.id]);
      const auth = getWebsiteAuth(req)!;
      pushToWebsite(`/api/jobs/${req.params.id}`, auth, { method: "PUT", body: { archived_at: now, status: 'cancelled', cancelled_at: now } }).catch(() => {});
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.post("/api/jobs/:id/accept", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const { vehicleIds } = req.body || {};
      const crypto = require("crypto");

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

      const jobRow = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [req.params.id]);
      const contractorId = jobRow.rows[0]?.contractor_id;
      let autoApproved = false;
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
        if (favCheck.rows.length > 0) {
          await pool.query(
            `UPDATE job_assignments SET status = 'approved', approved_at = NOW() WHERE job_id = $1 AND driver_id = $2 AND status::text = 'pending'`,
            [req.params.id, auth.userId]
          );
          await pool.query(`UPDATE jobs SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [req.params.id]);
          autoApproved = true;
        }
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
         AND j.status::text IN ('open', 'in_progress', 'pending', 'accepted')`,
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
      const id = require("crypto").randomUUID();
      await pool.query(
        `INSERT INTO job_assignments (id, job_id, driver_id, status, counter_bid_rate, counter_bid_note, created_at)
         VALUES ($1, $2, $3, 'counter_bid', $4, $5, NOW()) ON CONFLICT DO NOTHING`,
        [id, req.params.id, auth.userId, rate, note]
      );
      pushToWebsite(`/api/jobs/${req.params.id}/counter-bid`, auth, { method: "POST", body: req.body }).catch(() => {});
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Counter bid error:", e.message);
      return res.status(500).json({ message: "Failed to submit counter bid" });
    }
  });

  app.post("/api/jobs/:id/withdraw", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      await pool.query(`DELETE FROM job_assignments WHERE job_id = $1 AND driver_id = $2`, [req.params.id, auth.userId]);
      pushToWebsite(`/api/jobs/${req.params.id}/withdraw`, auth, { method: "POST" }).catch(() => {});
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.delete("/api/jobs/:id/assignments/:assignmentId", requireAuth, async (req: Request, res: Response) => {
    try {
      await pool.query(`DELETE FROM job_assignments WHERE id = $1`, [req.params.assignmentId]);
      const auth = getWebsiteAuth(req)!;
      pushToWebsite(`/api/jobs/${req.params.id}/assignments/${req.params.assignmentId}`, auth, { method: "DELETE" }).catch(() => {});
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.post("/api/cleanup-duplicate-assignments", requireAuth, async (req: Request, res: Response) => {
    try {
      await pool.query(`DELETE FROM job_assignments WHERE id NOT IN (SELECT MIN(id) FROM job_assignments GROUP BY job_id, driver_id)`);
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.get("/api/jobs/:id/assignments", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
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
      pushToWebsite(`/api/jobs/${req.params.id}/assignments/${req.params.assignmentId}/approve`, auth, { method: "POST" }).catch(() => {});
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
      pushToWebsite(`/api/jobs/${req.params.id}/assignments/${req.params.assignmentId}/reject`, auth, { method: "POST" }).catch(() => {});
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
      const crypto = require("crypto");
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
      const { vehicleId, vehicle_id } = req.body;
      const vid = vehicleId || vehicle_id;
      await pool.query(`UPDATE job_assignments SET vehicle_id = $1 WHERE id = $2`, [vid, req.params.assignmentId]);
      pushToWebsite(`/api/assignments/${req.params.assignmentId}/vehicle`, auth, { method: "PUT", body: req.body }).catch(() => {});
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Failed to assign vehicle" });
    }
  });

  app.post("/api/jobs/:id/clock-in", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const existingRun = await pool.query(
        `SELECT id FROM job_runs WHERE job_id = $1 AND driver_id = $2 AND status::text = 'active'`,
        [req.params.id, auth.userId]
      );
      if (existingRun.rows.length > 0) {
        const result = await pool.query(`SELECT * FROM job_runs WHERE id = $1`, [existingRun.rows[0].id]);
        return res.json(addDualKeys(result.rows[0]));
      }
      const runId = require("crypto").randomUUID();
      const vehicleFromBody = req.body?.vehicle_id || req.body?.vehicleId || null;
      let vehicleId = vehicleFromBody;
      if (!vehicleId) {
        const vRes = await pool.query(
          `SELECT vehicle_id FROM job_assignments WHERE job_id = $1 AND driver_id = $2 AND vehicle_id IS NOT NULL AND status::text != 'rejected' LIMIT 1`,
          [req.params.id, auth.userId]
        );
        vehicleId = vRes.rows[0]?.vehicle_id || null;
      }
      const customTime = req.body?.custom_time || req.body?.customTime || null;
      const startedAt = customTime ? new Date(customTime) : new Date();
      const startLat = req.body?.lat || req.body?.start_lat || null;
      const startLng = req.body?.lng || req.body?.start_lng || null;
      await pool.query(
        `INSERT INTO job_runs (id, job_id, driver_id, vehicle_id, status, started_at, start_lat, start_lng, created_at) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, NOW())`,
        [runId, req.params.id, auth.userId, vehicleId, startedAt, startLat, startLng]
      );
      await pool.query(`UPDATE jobs SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      pushToWebsite(`/api/jobs/${req.params.id}/clock-in`, auth, { method: "POST", body: req.body }).catch(() => {});
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
      await pool.query(`UPDATE job_runs SET status = 'completed', ended_at = NOW(), updated_at = NOW() WHERE id = $1`, [req.params.runId]);
      pushToWebsite(`/api/job-runs/${req.params.runId}/clock-out`, auth, { method: "POST", body: req.body }).catch(() => {});
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
      pushToWebsite(`/api/job-runs/${req.params.runId}`, auth, { method: "PATCH", body: req.body }).catch(() => {});
      const result = await pool.query(`SELECT * FROM job_runs WHERE id = $1`, [req.params.runId]);
      return res.json(addDualKeys(result.rows[0] || { id: req.params.runId }));
    } catch {
      return res.status(500).json({ message: "Failed to update job run" });
    }
  });

  app.delete("/api/job-runs/:runId", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      await pool.query(`DELETE FROM job_runs WHERE id = $1`, [req.params.runId]);
      pushToWebsite(`/api/job-runs/${req.params.runId}`, auth, { method: "DELETE" }).catch(() => {});
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.post("/api/job-runs/:runId/weight-tickets", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const id = require("crypto").randomUUID();
      const runResult = await pool.query(`SELECT job_id FROM job_runs WHERE id = $1`, [req.params.runId]);
      const jobId = runResult.rows[0]?.job_id || null;
      await pool.query(
        `INSERT INTO weight_tickets (id, job_run_id, job_id, driver_id, weight_value, notes, image_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [id, req.params.runId, jobId, auth.userId, req.body.weightValue || req.body.weight_value, req.body.notes, req.body.imageData || req.body.image_data]
      );
      pushToWebsite(`/api/job-runs/${req.params.runId}/weight-tickets`, auth, { method: "POST", body: req.body }).catch(() => {});
      const result = await pool.query(`SELECT * FROM weight_tickets WHERE id = $1`, [id]);
      return res.status(201).json(addDualKeys(result.rows[0]));
    } catch (e: any) {
      console.error("Weight ticket error:", e.message);
      return res.status(500).json({ message: "Failed to add weight ticket" });
    }
  });

  app.get("/api/jobs/:jobId/weight-tickets", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(`SELECT * FROM weight_tickets WHERE job_id = $1 ORDER BY created_at`, [req.params.jobId]);
      return res.json(result.rows.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.get("/api/job-runs/:runId/weight-tickets", requireAuth, async (req: Request, res: Response) => {
    try {
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

  app.post("/api/conversations/:jobId/archive", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    pushToWebsite(`/api/conversations/${req.params.jobId}/archive`, auth, { method: "POST" }).catch(() => {});
    return res.json({ ok: true });
  });

  app.post("/api/conversations/:jobId/unarchive", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    pushToWebsite(`/api/conversations/${req.params.jobId}/unarchive`, auth, { method: "POST" }).catch(() => {});
    return res.json({ ok: true });
  });

  app.post("/api/conversations/:jobId/delete", requireAuth, async (req: Request, res: Response) => {
    try {
      await pool.query(`DELETE FROM job_messages WHERE job_id = $1`, [req.params.jobId]);
      const auth = getWebsiteAuth(req)!;
      pushToWebsite(`/api/conversations/${req.params.jobId}/delete`, auth, { method: "POST" }).catch(() => {});
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
      const id = require("crypto").randomUUID();
      const body = req.body.body || req.body.message || req.body.content || '';
      await pool.query(
        `INSERT INTO job_messages (id, job_id, sender_id, body, read, created_at) VALUES ($1, $2, $3, $4, false, NOW())`,
        [id, req.params.jobId, auth.userId, body]
      );
      pushToWebsite(`/api/messages/${req.params.jobId}`, auth, { method: "POST", body: req.body }).catch(() => {});
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
    Object.assign(auth.user, req.body);
    try {
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
        values.push(auth.userId);
        await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, values);
      }
    } catch (e: any) {
      console.log("Profile update DB error:", e?.message);
    }
    pushToWebsite("/api/users/" + auth.userId, auth, { method: "PUT", body: req.body }).catch(() => {});
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
    pushToWebsite("/api/users/" + auth.userId, auth, { method: "PUT", body: { is_connected: newStatus } }).catch(() => {});
    return res.json(addDualKeys(auth.user));
  });

  app.put("/api/profile/role", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    const { role } = req.body;
    if (role) {
      auth.user.role = role;
      try {
        await pool.query(`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`, [role, auth.userId]);
      } catch {}
      pushToWebsite("/api/users/" + auth.userId, auth, { method: "PUT", body: { role } }).catch(() => {});
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
      const search = (req.query.q || req.query.search || '') as string;
      let query = `SELECT id, full_name, email, phone, truck_type, rating, total_jobs, profile_image_url, is_connected FROM users WHERE role LIKE '%driver%'`;
      const params: any[] = [];
      if (search) {
        query += ` AND (full_name ILIKE $1 OR email ILIKE $1)`;
        params.push(`%${search}%`);
      }
      query += ` ORDER BY rating DESC LIMIT 50`;
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
      const id = require("crypto").randomUUID();
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
      pushToWebsite("/api/vehicles", auth, { method: "POST", body: req.body }).catch(() => {});
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
      pushToWebsite(`/api/vehicles/${req.params.id}`, auth, { method: "PUT", body: req.body }).catch(() => {});
      const result = await pool.query(`SELECT * FROM trucks WHERE id = $1`, [req.params.id]);
      return res.json(addDualKeys(result.rows[0] || {}));
    } catch (e: any) {
      console.error("PUT vehicle error:", e.message, e.detail || '');
      return res.status(500).json({ message: "Failed to update vehicle" });
    }
  });

  app.delete("/api/vehicles/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      deletedVehicleIds.add(req.params.id);
      const now = new Date().toISOString();
      await pool.query(`UPDATE trucks SET archived_at = NOW(), is_active = false WHERE id = $1`, [req.params.id]);
      await pool.query(`UPDATE job_assignments SET vehicle_id = NULL WHERE vehicle_id = $1`, [req.params.id]);
      await pool.query(`UPDATE driver_invitations SET assigned_truck_id = NULL WHERE assigned_truck_id = $1`, [req.params.id]);
      const auth = getWebsiteAuth(req)!;
      pushToWebsite(`/api/vehicles/${req.params.id}`, auth, { method: "PUT", body: { archived_at: now, is_active: false } })
        .catch((err) => { console.error("pushToWebsite archive vehicle error:", err.message); });
    } catch (e: any) {
      console.error("Archive vehicle error:", e.message);
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

  app.post("/api/vehicles/:id/unarchive", requireAuth, async (req: Request, res: Response) => {
    try {
      deletedVehicleIds.delete(req.params.id);
      await pool.query(`UPDATE trucks SET archived_at = NULL, is_active = true WHERE id = $1`, [req.params.id]);
      const auth = getWebsiteAuth(req)!;
      pushToWebsite(`/api/vehicles/${req.params.id}`, auth, { method: "PUT", body: { archived_at: null, is_active: true } }).catch(() => {});
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Unarchive vehicle error:", e.message);
      return res.status(500).json({ message: "Failed to unarchive vehicle" });
    }
  });

  app.get("/api/vehicles/:vehicleId/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
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
          const id = require("crypto").randomUUID();
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

      const id = require("crypto").randomUUID();
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
      pushToWebsite("/api/notifications/mark-read", auth, { method: "POST" }).catch(() => {});
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
      const result = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0)::float as total,
                COALESCE(SUM(CASE WHEN status::text = 'payment_received' THEN total_amount ELSE 0 END), 0)::float as paid,
                COALESCE(SUM(CASE WHEN status::text IN ('open', 'issued', 'payment_sent') THEN total_amount ELSE 0 END), 0)::float as pending
         FROM monthly_invoices WHERE driver_id = $1`,
        [auth.userId]
      );
      return res.json(addDualKeys(result.rows[0] || { total: 0, paid: 0, pending: 0 }));
    } catch {
      return res.json({ total: 0, paid: 0, pending: 0 });
    }
  });

  app.get("/api/contractor/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const contractorId = auth.userId;
      const projectFilter = req.query.project_id as string | undefined;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;

      let query = `SELECT j.*, cp.name as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id WHERE j.contractor_id = $1 AND j.archived_at IS NULL`;
      const params: any[] = [contractorId];
      let paramIdx = 2;

      const singleDate = req.query.date as string | undefined;
      if (singleDate) {
        query += ` AND j.scheduled_date::date = $${paramIdx}::date`;
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

  function getJobDateRange(scheduledDate: string, estimatedDays: number, includesWeekends: boolean): string[] {
    const startDate = new Date(scheduledDate);
    if (isNaN(startDate.getTime())) return [];
    const days = Math.max(1, Math.ceil(estimatedDays || 1));
    const dates: string[] = [];
    const current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    let added = 0;
    while (added < days) {
      const dow = current.getUTCDay();
      if (includesWeekends || (dow !== 0 && dow !== 6)) {
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
           WHERE j.id IN (SELECT ja.job_id FROM job_assignments ja JOIN trucks t ON ja.vehicle_id = t.id WHERE t.trucking_company_id = $1)
           AND j.archived_at IS NULL
           ORDER BY j.scheduled_date DESC`,
          [auth.userId]
        );
      } else {
        result = await pool.query(
          `SELECT j.*, cp.name as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN users u ON j.contractor_id::text = u.id::text
           WHERE (j.driver_id = $1 OR j.id IN (SELECT job_id FROM job_assignments WHERE driver_id = $1))
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
             WHERE ja.job_id = ANY($1)`,
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
        const jobDates = getJobDateRange(sd, estDays, includesWeekends);
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
              vehicle: { id: assignment.vehicleId, make: assignment.make, model: assignment.model, year: assignment.year, truckNumber: assignment.truckNumber, licensePlate: assignment.licensePlate, truckType: assignment.truckType },
            });
          }
        } else {
          const enrichedJob = { ...job, vehicleAssignments, activeRuns } as any;
          if (activeAssignments.length === 1) {
            enrichedJob.vehicle = { id: activeAssignments[0].vehicleId, make: activeAssignments[0].make, model: activeAssignments[0].model, year: activeAssignments[0].year, truckNumber: activeAssignments[0].truckNumber, licensePlate: activeAssignments[0].licensePlate, truckType: activeAssignments[0].truckType };
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
        const jobDates = getJobDateRange(sd, estDays, includesWeekends);
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

  app.get("/api/invoices", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const status = req.query.status as string | undefined;
      let query = `SELECT * FROM monthly_invoices WHERE contractor_id = $1 OR driver_id = $1`;
      const params: any[] = [auth.userId];
      if (status) {
        query += ` AND status::text = $2`;
        params.push(status.toLowerCase());
      }
      query += ` ORDER BY created_at DESC`;
      const result = await pool.query(query, params);
      return res.json(result.rows.map(addDualKeys));
    } catch (e: any) {
      console.error("GET /api/invoices error:", e.message);
      return res.json([]);
    }
  });

  app.get("/api/invoices/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(`SELECT * FROM monthly_invoices WHERE id = $1`, [req.params.id]);
      if (result.rows.length > 0) {
        const invoice = result.rows[0];
        const jobsResult = await pool.query(
          `SELECT * FROM jobs WHERE invoice_id = $1 OR (contractor_id = $2 AND status = 'completed')`,
          [req.params.id, invoice.contractor_id]
        );
        invoice.jobs = jobsResult.rows.map(addDualKeys);
        return res.json(addDualKeys(invoice));
      }
      return res.status(404).json({ message: "Invoice not found" });
    } catch {
      return res.status(500).json({ message: "Failed to load invoice" });
    }
  });

  app.put("/api/invoices/:id/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const { status } = req.body;
      await pool.query(`UPDATE monthly_invoices SET status = $1, updated_at = NOW() WHERE id = $2`, [status, req.params.id]);
      pushToWebsite(`/api/invoices/${req.params.id}/status`, auth, { method: "PUT", body: req.body }).catch(() => {});
      const result = await pool.query(`SELECT * FROM monthly_invoices WHERE id = $1`, [req.params.id]);
      return res.json(addDualKeys(result.rows[0] || {}));
    } catch {
      return res.status(500).json({ message: "Failed to update invoice status" });
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
      let projects = result.rows;

      if (projects.length === 0) {
        const jobResult = await pool.query(
          `SELECT DISTINCT project_id, material as name, contractor_id FROM jobs WHERE contractor_id = $1 AND project_id IS NOT NULL`,
          [auth.userId]
        );
        if (jobResult.rows.length > 0) {
          projects = jobResult.rows.map((r: any) => ({
            id: r.project_id,
            name: r.name || 'Untitled Project',
            contractor_id: r.contractor_id,
            status: 'active',
          }));
        }
      }

      return res.json(projects.map(addDualKeys));
    } catch (e: any) {
      console.error("GET /api/projects error:", e.message, e.stack?.split('\n')[1]);
      return res.json([]);
    }
  });

  app.post("/api/projects", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const id = require("crypto").randomUUID();
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

      pushToWebsite("/api/projects", auth, { method: "POST", body: { ...req.body, id } }).catch(() => {});

      return res.status(201).json(addDualKeys(project));
    } catch (e: any) {
      console.error("POST /api/projects error:", e.message);
      return res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.put("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
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

      pushToWebsite(`/api/projects/${req.params.id}`, auth, { method: "PUT", body: req.body }).catch(() => {});

      return res.json(addDualKeys(project));
    } catch (e: any) {
      console.error("PUT /api/projects error:", e.message);
      return res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await pool.query(
        `UPDATE contractor_projects SET deleted_at = NOW() WHERE id = $1`,
        [req.params.id]
      );
      const auth = getWebsiteAuth(req)!;
      pushToWebsite(`/api/projects/${req.params.id}`, auth, { method: "DELETE" }).catch(() => {});
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.post("/api/projects/:id/restore", requireAuth, async (req: Request, res: Response) => {
    try {
      await pool.query(
        `UPDATE contractor_projects SET status = 'active', deleted_at = NULL WHERE id = $1`,
        [req.params.id]
      );
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
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
      const id = require("crypto").randomUUID();
      const b = req.body;
      await pool.query(
        `INSERT INTO reviews (id, job_id, reviewer_id, reviewee_id, rating, comment, reviewer_role, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [id, b.jobId || b.job_id, auth.userId, b.revieweeId || b.reviewee_id, b.rating, b.comment, b.reviewerRole || b.reviewer_role || auth.user?.role]
      );
      pushToWebsite("/api/reviews", auth, { method: "POST", body: req.body }).catch(() => {});
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
        const id = require("crypto").randomUUID();
        await pool.query(`INSERT INTO driver_favorites (id, contractor_id, driver_id, created_at) VALUES ($1, $2, $3, NOW())`, [id, auth.userId, req.params.driverId]);
        pushToWebsite(`/api/favorites/${req.params.driverId}`, auth, { method: "POST" }).catch(() => {});
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

      const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
      url.searchParams.set("input", input);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("types", "geocode|establishment");
      url.searchParams.set("components", "country:us|country:ca");
      if (lat && lng) {
        url.searchParams.set("location", `${lat},${lng}`);
        url.searchParams.set("radius", "160000");
        url.searchParams.set("strictbounds", "true");
      }

      const response = await fetch(url.toString());
      const data = await response.json() as any;

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        console.error("Places API status:", data.status, data.error_message);
      }

      const predictions = (data.predictions || []).map((p: any) => ({
        place_id: p.place_id,
        description: p.description,
        structured: p.structured_formatting,
      }));

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
    const seen = new Set<string>();
    const auths: { jwt: string; userId: string; user: any }[] = [];
    for (const [, auth] of tokenToJwt) {
      if (!seen.has(auth.userId)) {
        seen.add(auth.userId);
        auths.push(auth);
      }
    }
    return auths;
  }, 120000);

  const httpServer = createServer(app);
  return httpServer;
}
