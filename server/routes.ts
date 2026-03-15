import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// This mobile app is the companion to the main LoadLink WEBSITE.
// WEBSITE_API_URL / WEBSITE_API_KEY point to the WEBSITE (the original/source of truth).
// "websiteFetch" calls the WEBSITE API. "proxyToWebsite" forwards mobile requests to it.
const WEBSITE_API_URL = process.env.WEBSITE_API_URL || process.env.COMPANION_API_URL || "https://loadlink.replit.app";
const WEBSITE_API_KEY = process.env.WEBSITE_API_KEY || process.env.COMPANION_API_KEY || "";

const DATA_DIR = join(process.cwd(), ".data");
try { mkdirSync(DATA_DIR, { recursive: true }); } catch {}

function loadJsonMap<T>(filename: string): Map<string, T> {
  try {
    const raw = readFileSync(join(DATA_DIR, filename), "utf-8");
    const entries: [string, T][] = JSON.parse(raw);
    return new Map(entries);
  } catch { return new Map(); }
}

function saveJsonMap<T>(filename: string, map: Map<string, T>) {
  try {
    writeFileSync(join(DATA_DIR, filename), JSON.stringify([...map.entries()]), "utf-8");
  } catch {}
}

const tokenToJwt = loadJsonMap<{ jwt: string; userId: string; user: any }>("sessions.json");

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

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function addDualKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(addDualKeys);
  if (obj === null || typeof obj !== "object") return obj;
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

interface CacheEntry {
  data: any;
  status: number;
  timestamp: number;
}
const responseCache = new Map<string, CacheEntry>();

function getCached(key: string, ttlMs: number): CacheEntry | null {
  const entry = responseCache.get(key);
  if (entry && Date.now() - entry.timestamp < ttlMs) return entry;
  if (entry) responseCache.delete(key);
  return null;
}

function setCache(key: string, data: any, status: number) {
  responseCache.set(key, { data, status, timestamp: Date.now() });
  if (responseCache.size > 500) {
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
}

function invalidateCache(pattern: string) {
  for (const key of responseCache.keys()) {
    if (key.includes(pattern)) responseCache.delete(key);
  }
  if (pattern.includes('/api/jobs') || pattern.includes('/api/contractor/jobs') || pattern.includes('/api/driver/jobs')) {
    for (const key of responseCache.keys()) {
      if (key.includes('_raw_jobs')) responseCache.delete(key);
    }
  }
}

const CACHE_TTLS: Record<string, number> = {
  '/api/messages/unread-count': 15_000,
  '/api/dashboard': 30_000,
  '/api/notifications': 30_000,
  '/api/conversations': 30_000,
  '/api/conversations/archived': 60_000,
  '/api/reviews/pending': 60_000,
  '/api/invoices': 60_000,
  '/api/contractor/jobs': 20_000,
  '/api/jobs': 20_000,
  '/api/driver/jobs': 20_000,
  '/api/calendar/jobs': 30_000,
  '/api/vehicles': 60_000,
  '/api/availability': 60_000,
  '/api/saved-locations': 60_000,
  '/api/materials': 120_000,
  '/api/truck-calendar': 60_000,
};

function getCacheTtl(path: string): number {
  for (const [pattern, ttl] of Object.entries(CACHE_TTLS)) {
    if (path === pattern || path.startsWith(pattern + '/') || path.startsWith(pattern + '?')) return ttl;
  }
  if (path.match(/^\/api\/jobs\/[^/]+$/)) return 15_000;
  return 0;
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

const _jwtRefreshInProgress = new Map<string, Promise<string | null>>();

async function refreshWebsiteJwt(localToken: string, auth: { jwt: string; userId: string; user: any }): Promise<string | null> {
  const existing = _jwtRefreshInProgress.get(localToken);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const email = auth.user?.email;
      if (!email) return null;
      const refreshRes = await websiteFetch("/api/companion/auth/login", {
        method: "POST",
        body: { email },
      });
      if (!refreshRes.ok) return null;
      const data = await refreshRes.json();
      if (data.token) {
        const updated = { ...auth, jwt: data.token, user: data.user || auth.user };
        tokenToJwt.set(localToken, updated);
        saveJsonMap("sessions.json", tokenToJwt);
        console.log("Refreshed website JWT for", email);
        return data.token;
      }
    } catch (e: any) {
      console.error("JWT refresh failed:", e.message);
    }
    return null;
  })();

  _jwtRefreshInProgress.set(localToken, promise);
  promise.finally(() => _jwtRefreshInProgress.delete(localToken));
  return promise;
}

async function proxyToWebsite(
  req: Request,
  res: Response,
  overridePath?: string,
  overrideOptions?: { method?: string; body?: any } | ((data: any) => any),
) {
  const transform = typeof overrideOptions === 'function' ? overrideOptions : undefined;
  const opts = typeof overrideOptions === 'function' ? undefined : overrideOptions;
  const auth = getWebsiteAuth(req);
  if (!auth) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const localToken = req.headers.authorization?.slice(7) || "";
  const targetPath = overridePath || req.path;
  const method = opts?.method || req.method;
  const body = opts?.body || (method !== "GET" ? req.body : undefined);

  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === "string") query[k] = v;
  }

  const queryStr = Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : '';
  const cacheKey = `${auth.userId}:${targetPath}${queryStr}`;
  const ttl = method === 'GET' ? getCacheTtl(targetPath) : 0;

  if (ttl > 0) {
    const cached = getCached(cacheKey, ttl);
    if (cached) {
      return res.status(cached.status).json(cached.data);
    }
  }

  async function doFetch(jwt: string) {
    return websiteFetch(targetPath, { method, body, jwt, query });
  }

  try {
    let websiteRes = await doFetch(auth.jwt);

    if (websiteRes.status === 401 && localToken) {
      const newJwt = await refreshWebsiteJwt(localToken, auth);
      if (newJwt) {
        websiteRes = await doFetch(newJwt);
      }
    }

    const contentType = websiteRes.headers.get("content-type") || "";

    if (contentType.includes("text/html") || !contentType.includes("application/json")) {
      const text = await websiteRes.text();
      const status = websiteRes.status >= 400 ? websiteRes.status : 502;
      console.error(`Proxy ${method} ${targetPath} returned non-JSON (${contentType}): ${text.slice(0, 200)}`);
      return res.status(status).json({ message: "The LoadLink service is temporarily unavailable. Please try again." });
    }

    let data = await websiteRes.json();
    if (websiteRes.status >= 400) {
      console.error(`Proxy ${method} ${targetPath} → ${websiteRes.status}:`, JSON.stringify(data));
    }
    if (transform && websiteRes.status < 400) {
      data = await transform(data);
    }
    const enriched = addDualKeys(data);

    if (ttl > 0 && websiteRes.status < 500) {
      setCache(cacheKey, enriched, websiteRes.status);
    }

    return res.status(websiteRes.status).json(enriched);
  } catch (err: any) {
    console.error(`Proxy error ${method} ${targetPath}:`, err.message);
    if (ttl > 0) {
      const stale = responseCache.get(cacheKey);
      if (stale) return res.status(stale.status).json(stale.data);
    }
    return res.status(502).json({ message: "Failed to reach website API" });
  }
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min`;
  if (hours > 0) return `${hours} hr`;
  return `${minutes} min`;
}

let _prewarmFetchAllJobs: ((auth: { jwt: string; userId: string; user: any }) => Promise<any[]>) | null = null;
const _prewarmInFlight = new Map<string, Promise<any>>();

function getOrFetchEndpoint(cacheKey: string, ep: string, jwt: string): Promise<any> {
  const ttl = getCacheTtl(ep) || 30_000;
  const cached = getCached(cacheKey, ttl);
  if (cached) return Promise.resolve(cached.data);

  const existing = _prewarmInFlight.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const r = await websiteFetch(ep, { jwt });
      if (r.ok) {
        const data = addDualKeys(await r.json());
        setCache(cacheKey, data, r.status);
        return data;
      }
    } catch {}
    return null;
  })();

  _prewarmInFlight.set(cacheKey, promise);
  promise.finally(() => _prewarmInFlight.delete(cacheKey));
  return promise;
}

async function prewarmCache(auth: { jwt: string; userId: string; user: any }) {
  const t0 = Date.now();
  const endpoints = ['/api/dashboard', '/api/notifications', '/api/conversations'];
  const tasks: Promise<void>[] = endpoints.map(async (ep) => {
    const cacheKey = `${auth.userId}:${ep}`;
    await getOrFetchEndpoint(cacheKey, ep, auth.jwt);
  });
  if (_prewarmFetchAllJobs) {
    tasks.push(_prewarmFetchAllJobs(auth).then(() => {}));
  } else {
    tasks.push((async () => {
      const rawKey = `${auth.userId}:/api/_raw_jobs`;
      if (getCached(rawKey, 20_000)) return;
      try {
        const r = await websiteFetch("/api/jobs", { jwt: auth.jwt });
        if (r.ok) {
          const allJobs = await r.json();
          const jobs = (Array.isArray(allJobs) ? allJobs : []).filter((j: any) => !hiddenJobIds.has(j.id));
          const result = jobs.map(addDualKeys);
          setCache(rawKey, result, 200);
        }
      } catch {}
    })());
  }
  await Promise.allSettled(tasks);
  console.log(`Prewarm completed in ${Date.now() - t0}ms (${tasks.length} endpoints)`);
}

export async function registerRoutes(app: Express): Promise<Server> {
  function requireAuth(req: Request, res: Response, next: Function) {
    const auth = getWebsiteAuth(req);
    if (auth) {
      (req as any).userId = auth.userId;
      (req as any).websiteJwt = auth.jwt;
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

      prewarmCache(authEntry).catch(() => {});
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

      prewarmCache(authEntry).catch(() => {});
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
    return proxyToWebsite(req, res, "/api/auth/set-password");
  });

  app.post("/api/push/register", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, "/api/push/subscribe");
  });

  app.get("/api/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const allJobs = await fetchAllJobsCached(auth);
      const startDate = req.query.start_date as string | undefined;
      const endDate = req.query.end_date as string | undefined;
      const status = req.query.status as string | undefined;
      let jobs = allJobs;
      if (startDate) {
        const start = new Date(startDate).getTime();
        jobs = jobs.filter((j: any) => {
          const jDate = new Date(j.startDate || j.start_date || j.createdAt || j.created_at).getTime();
          return jDate >= start;
        });
      }
      if (endDate) {
        const end = new Date(endDate).getTime();
        jobs = jobs.filter((j: any) => {
          const jDate = new Date(j.startDate || j.start_date || j.createdAt || j.created_at).getTime();
          return jDate <= end;
        });
      }
      if (status) {
        jobs = jobs.filter((j: any) => (j.status || '').toLowerCase() === status.toLowerCase());
      }
      return res.json(jobs);
    } catch {
      return res.json([]);
    }
  });

  app.get("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/jobs/${req.params.id}`);
  });

  app.post("/api/jobs", requireAuth, async (req: Request, res: Response) => {
    const body = { ...req.body };
    if (body.projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.projectId)) {
      console.log("Stripping local projectId:", body.projectId);
      delete body.projectId;
    }
    if (body.estimatedCost) {
      body.estimatedCost = String(parseFloat(parseFloat(body.estimatedCost).toFixed(2)));
    }
    invalidateCache('/api/jobs');
    invalidateCache('/api/contractor/jobs');
    invalidateCache('/api/dashboard');
    invalidateCache('/api/calendar');

    const auth = getWebsiteAuth(req);
    const userRole = auth?.user?.role || '';
    if (userRole && !userRole.includes('driver') && !userRole.includes('contractor')) {
      try {
        await websiteFetch("/api/users/" + auth!.userId, {
          method: "PUT",
          body: { role: "contractor" },
          jwt: auth!.jwt,
        });
        auth!.user.role = "contractor";
        const localToken = req.headers.authorization?.slice(7) || "";
        if (localToken) {
          tokenToJwt.set(localToken, auth!);
          saveJsonMap("sessions.json", tokenToJwt);
        }
        const newJwt = await refreshWebsiteJwt(localToken, auth!);
        if (newJwt) {
          auth!.jwt = newJwt;
        }
      } catch (e: any) {
        console.log("Role update attempt:", e.message);
      }
    }

    return proxyToWebsite(req, res, undefined, { method: 'POST', body });
  });

  app.put("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/jobs');
    invalidateCache('/api/contractor/jobs');
    invalidateCache('/api/dashboard');
    return proxyToWebsite(req, res, `/api/jobs/${req.params.id}`);
  });

  app.delete("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    hiddenJobIds.add(req.params.id);
    invalidateCache('/api/jobs');
    invalidateCache('/api/contractor/jobs');
    invalidateCache('/api/dashboard');
    await proxyToWebsite(req, res, `/api/jobs/${req.params.id}`);
  });

  app.post("/api/jobs/:id/accept", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/jobs');
    invalidateCache('/api/contractor/jobs');
    invalidateCache('/api/driver/jobs');
    invalidateCache('/api/dashboard');
    return proxyToWebsite(req, res, `/api/jobs/${req.params.id}/accept`);
  });

  app.get("/api/jobs/:id/vehicle-conflicts", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/jobs/${req.params.id}/vehicle-conflicts`);
  });

  app.post("/api/jobs/:id/counter-bid", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/jobs');
    return proxyToWebsite(req, res, `/api/jobs/${req.params.id}/counter-bid`);
  });

  app.post("/api/jobs/:id/withdraw", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/jobs');
    invalidateCache('/api/dashboard');
    return proxyToWebsite(req, res, `/api/jobs/${req.params.id}/withdraw`);
  });

  app.delete("/api/jobs/:id/assignments/:assignmentId", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/jobs');
    return proxyToWebsite(req, res, `/api/jobs/${req.params.id}/assignments/${req.params.assignmentId}`);
  });

  app.post("/api/cleanup-duplicate-assignments", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/jobs');
    return proxyToWebsite(req, res);
  });

  app.get("/api/jobs/:id/assignments", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/jobs/${req.params.id}/assignments`);
  });

  app.post("/api/jobs/:id/assignments/:assignmentId/approve", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/jobs');
    invalidateCache('/api/dashboard');
    return proxyToWebsite(req, res, `/api/jobs/${req.params.id}/assignments/${req.params.assignmentId}/approve`);
  });

  app.post("/api/jobs/:id/assignments/:assignmentId/reject", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/jobs');
    invalidateCache('/api/dashboard');
    return proxyToWebsite(req, res, `/api/jobs/${req.params.id}/assignments/${req.params.assignmentId}/reject`);
  });

  app.put("/api/assignments/:assignmentId/vehicle", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/vehicles');
    return proxyToWebsite(req, res, `/api/assignments/${req.params.assignmentId}/vehicle`);
  });

  app.post("/api/jobs/:id/clock-in", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/jobs');
    invalidateCache('/api/dashboard');
    return proxyToWebsite(req, res, `/api/jobs/${req.params.id}/clock-in`);
  });

  app.post("/api/job-runs/:runId/clock-out", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/jobs');
    invalidateCache('/api/dashboard');
    invalidateCache('/api/invoices');
    return proxyToWebsite(req, res, `/api/job-runs/${req.params.runId}/clock-out`);
  });

  app.patch("/api/job-runs/:runId", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/job-runs/${req.params.runId}`);
  });

  app.delete("/api/job-runs/:runId", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/job-runs/${req.params.runId}`);
  });

  app.post("/api/job-runs/:runId/weight-tickets", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/job-runs/${req.params.runId}/weight-tickets`);
  });

  app.get("/api/jobs/:jobId/weight-tickets", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/jobs/${req.params.jobId}/weight-tickets`);
  });

  app.get("/api/job-runs/:runId/weight-tickets", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/job-runs/${req.params.runId}/weight-tickets`);
  });

  app.get("/api/conversations", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, undefined, (data: any) => {
      if (Array.isArray(data)) return data.filter((c: any) => !hiddenJobIds.has(c.job_id || c.jobId));
      return data;
    });
  });

  app.get("/api/conversations/archived", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, undefined, (data: any) => {
      if (Array.isArray(data)) return data.filter((c: any) => !hiddenJobIds.has(c.job_id || c.jobId));
      return data;
    });
  });

  app.post("/api/conversations/:jobId/archive", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/conversations');
    invalidateCache('/api/messages');
    return proxyToWebsite(req, res, `/api/conversations/${req.params.jobId}/archive`);
  });

  app.post("/api/conversations/:jobId/unarchive", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/conversations');
    invalidateCache('/api/messages');
    return proxyToWebsite(req, res, `/api/conversations/${req.params.jobId}/unarchive`);
  });

  app.post("/api/conversations/:jobId/delete", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/conversations');
    invalidateCache('/api/messages');
    return proxyToWebsite(req, res, `/api/conversations/${req.params.jobId}/delete`);
  });

  app.get("/api/messages/unread-count", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req);
      if (!auth) return res.status(401).json({ message: "Not authenticated" });

      const cacheKey = `${auth.userId}:/api/messages/unread-count`;
      const cached = getCached(cacheKey, 15_000);
      if (cached) return res.status(cached.status).json(cached.data);

      const convsRes = await websiteFetch("/api/conversations", { method: "GET", jwt: auth.jwt });
      if (!convsRes.ok) {
        return proxyToWebsite(req, res, "/api/notifications/unread-count");
      }
      const convs = await convsRes.json();
      if (!Array.isArray(convs)) {
        return proxyToWebsite(req, res, "/api/notifications/unread-count");
      }
      const count = convs
        .filter((c: any) => !hiddenJobIds.has(c.job_id || c.jobId))
        .reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0);
      const result = { count };
      setCache(cacheKey, result, 200);
      return res.json(result);
    } catch {
      return proxyToWebsite(req, res, "/api/notifications/unread-count");
    }
  });

  app.get("/api/messages/:jobId", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/messages/${req.params.jobId}`);
  });

  app.post("/api/messages/:jobId", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/messages');
    invalidateCache('/api/conversations');
    return proxyToWebsite(req, res, `/api/messages/${req.params.jobId}`);
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
    return res.json(addDualKeys(auth.user));
  });

  app.put("/api/profile/status", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    const { is_connected, isConnected } = req.body;
    auth.user.isConnected = is_connected ?? isConnected ?? true;
    auth.user.is_connected = auth.user.isConnected;
    return res.json(addDualKeys(auth.user));
  });

  app.put("/api/profile/role", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    const { role } = req.body;
    if (role) {
      auth.user.role = role;
      try {
        await websiteFetch("/api/users/" + auth.userId, {
          method: "PUT",
          body: { role },
          jwt: auth.jwt,
        });
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
    return proxyToWebsite(req, res);
  });

  app.get("/api/vehicles", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res);
  });

  app.post("/api/vehicles", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/vehicles');
    return proxyToWebsite(req, res);
  });

  app.put("/api/vehicles/:id", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/vehicles');
    return proxyToWebsite(req, res, `/api/vehicles/${req.params.id}`);
  });

  app.delete("/api/vehicles/:id", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/vehicles');
    return proxyToWebsite(req, res, `/api/vehicles/${req.params.id}`);
  });

  app.get("/api/vehicles/:vehicleId/jobs", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/vehicles/${req.params.vehicleId}/jobs`);
  });

  app.get("/api/availability", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, "/api/me/availability");
  });

  app.post("/api/availability", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, "/api/me/availability");
  });

  app.get("/api/notifications", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    const cacheKey = `${auth.userId}:/api/notifications`;
    try {
      const data = await getOrFetchEndpoint(cacheKey, '/api/notifications', auth.jwt);
      if (data) return res.json(data);
    } catch {}
    return proxyToWebsite(req, res);
  });

  app.post("/api/notifications/mark-read", requireAuth, async (req: Request, res: Response) => {
    invalidateCache('/api/notifications');
    return proxyToWebsite(req, res);
  });

  app.get("/api/dashboard", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    const cacheKey = `${auth.userId}:/api/dashboard`;
    try {
      const data = await getOrFetchEndpoint(cacheKey, '/api/dashboard', auth.jwt);
      if (data) return res.json(data);
    } catch {}
    return proxyToWebsite(req, res);
  });

  app.get("/api/earnings", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, "/api/driver/earnings");
  });

  app.get("/api/contractor/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      let jobs = await fetchAllJobsCached(auth);
      const contractorId = auth.userId;
      jobs = jobs.filter((j: any) => {
        const cId = j.contractorId || j.contractor_id;
        return cId === contractorId;
      });
      const projectFilter = req.query.project_id as string | undefined;
      if (projectFilter) {
        jobs = jobs.filter((j: any) => {
          const pId = j.projectId || j.project_id;
          return pId === projectFilter;
        });
      }
      return res.json(jobs);
    } catch {
      return res.json([]);
    }
  });

  const _jobsFetchInProgress = new Map<string, Promise<any[]>>();

  async function fetchAllJobsCached(auth: { jwt: string; userId: string; user: any }): Promise<any[]> {
    const cacheKey = `${auth.userId}:/api/_raw_jobs`;
    const cached = getCached(cacheKey, 20_000);
    if (cached) return cached.data;

    const existing = _jobsFetchInProgress.get(cacheKey);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const jobsRes = await websiteFetch("/api/jobs", { jwt: auth.jwt });
        if (!jobsRes.ok) return [];
        const allJobs = await jobsRes.json();
        const jobs = (Array.isArray(allJobs) ? allJobs : []).filter((j: any) => !hiddenJobIds.has(j.id));
        const result = jobs.map(addDualKeys);
        setCache(cacheKey, result, 200);
        return result;
      } catch {
        return [];
      }
    })();

    _jobsFetchInProgress.set(cacheKey, promise);
    promise.finally(() => _jobsFetchInProgress.delete(cacheKey));
    return promise;
  }

  _prewarmFetchAllJobs = fetchAllJobsCached;

  app.get("/api/driver/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const jobs = await fetchAllJobsCached(auth);
      return res.json(jobs);
    } catch {
      return res.json([]);
    }
  });

  app.get("/api/calendar/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const jobs = await fetchAllJobsCached(auth);
      return res.json(jobs);
    } catch {
      return res.json([]);
    }
  });

  app.get("/api/contractor/calendar-capacity", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, "/api/truck-calendar");
  });

  app.get("/api/invoices", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res);
  });

  app.get("/api/invoices/:id", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/invoices/${req.params.id}`);
  });

  app.put("/api/invoices/:id/status", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/invoices/${req.params.id}/status`);
  });

  const localProjects = loadJsonMap<any>("projects.json");

  app.get("/api/projects", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const includeDeleted = req.query.include_deleted === "true";
      const jobsRes = await websiteFetch("/api/jobs", { jwt: auth.jwt });
      const allJobs = jobsRes.ok ? await jobsRes.json() : [];
      const projectMap = new Map<string, any>();
      for (const j of (Array.isArray(allJobs) ? allJobs : []).filter((j: any) => !hiddenJobIds.has(j.id))) {
        const cId = j.contractorId || j.contractor_id;
        if (j.projectId && j.projectName && cId === auth.userId) {
          if (!projectMap.has(j.projectId)) {
            projectMap.set(j.projectId, {
              id: j.projectId,
              name: j.projectName,
              contractorId: cId,
              status: "active",
            });
          }
        }
      }
      for (const [id, proj] of localProjects) {
        if (proj.contractorId === auth.userId) {
          projectMap.set(id, proj);
        }
      }
      let results = [...projectMap.values()];
      if (!includeDeleted) {
        results = results.filter((p: any) => p.status !== "deleted");
      }
      return res.json(results.map(addDualKeys));
    } catch {
      return res.json([]);
    }
  });

  app.post("/api/projects", requireAuth, async (req: Request, res: Response) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const auth = getWebsiteAuth(req)!;
    const project = {
      id,
      name: req.body.name || req.body.projectName || "Untitled Project",
      jobNumber: req.body.jobNumber || req.body.job_number || null,
      siteAddress: req.body.siteAddress || req.body.site_address || null,
      siteLat: req.body.siteLat || req.body.site_lat || null,
      siteLng: req.body.siteLng || req.body.site_lng || null,
      notes: req.body.notes || null,
      contractorId: auth.userId,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    localProjects.set(id, project);
    saveJsonMap("projects.json", localProjects);
    return res.status(201).json(addDualKeys(project));
  });

  app.put("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    const existing = localProjects.get(req.params.id) || {
      id: req.params.id,
      contractorId: auth.userId,
      status: "active",
    };
    const updated = { ...existing, ...req.body, id: req.params.id };
    localProjects.set(req.params.id, updated);
    saveJsonMap("projects.json", localProjects);
    return res.json(addDualKeys(updated));
  });

  app.delete("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    const existing = localProjects.get(req.params.id);
    if (existing) {
      existing.status = "deleted";
      localProjects.set(req.params.id, existing);
      saveJsonMap("projects.json", localProjects);
    }
    return res.json({ ok: true });
  });

  app.post("/api/projects/:id/restore", requireAuth, async (req: Request, res: Response) => {
    const existing = localProjects.get(req.params.id);
    if (existing) {
      existing.status = "active";
      localProjects.set(req.params.id, existing);
      saveJsonMap("projects.json", localProjects);
    }
    return res.json({ ok: true });
  });

  app.get("/api/materials", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, "/api/contractor-materials");
  });

  app.get("/api/saved-locations", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, undefined, async (data: any) => {
      if (!Array.isArray(data)) return data;
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return data;

      const enriched = await Promise.all(data.map(async (loc: any) => {
        const addr = loc.address || '';
        if (!/^Dropped Pin/i.test(addr) || loc.label) return loc;
        const coordMatch = addr.match(/\(([^,]+),?\s*([^)]+)\)/);
        if (!coordMatch) return loc;
        const lat = coordMatch[1].trim();
        const lng = coordMatch[2].trim();
        try {
          const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&result_type=street_address|route|locality`;
          const geoRes = await fetch(geoUrl);
          const geoData = await geoRes.json() as any;
          if (geoData.status === 'OK' && geoData.results?.[0]) {
            return { ...loc, nearbyAddress: geoData.results[0].formatted_address };
          }
        } catch {}
        return loc;
      }));
      return enriched;
    });
  });

  app.post("/api/reviews", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res);
  });

  app.get("/api/reviews/pending", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res);
  });

  app.get("/api/reviews/:userId", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/reviews/${req.params.userId}`);
  });

  app.get("/api/favorites/:driverId", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/favorites/${req.params.driverId}`);
  });

  app.post("/api/favorites/:driverId", requireAuth, async (req: Request, res: Response) => {
    return proxyToWebsite(req, res, `/api/favorites/${req.params.driverId}`);
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

  const httpServer = createServer(app);
  return httpServer;
}
