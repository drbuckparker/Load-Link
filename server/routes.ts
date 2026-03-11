import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";

const COMPANION_API_URL = process.env.COMPANION_API_URL || "https://loadlink.replit.app";
const COMPANION_API_KEY = process.env.COMPANION_API_KEY || "";

const tokenToJwt = new Map<string, { jwt: string; userId: string; user: any }>();

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

function getCompanionAuth(req: Request): { jwt: string; userId: string; user: any } | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return tokenToJwt.get(token) || null;
  }
  return null;
}

async function companionFetch(
  path: string,
  options: {
    method?: string;
    body?: any;
    jwt?: string;
    query?: Record<string, string>;
  } = {}
): Promise<Response> {
  const url = new URL(path, COMPANION_API_URL);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, v);
      }
    }
  }

  const headers: Record<string, string> = {
    "X-API-Key": COMPANION_API_KEY,
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

async function proxyToCompanion(
  req: Request,
  res: Response,
  overridePath?: string,
  overrideOptions?: { method?: string; body?: any }
) {
  const auth = getCompanionAuth(req);
  if (!auth) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const targetPath = overridePath || req.path;
  const method = overrideOptions?.method || req.method;
  const body = overrideOptions?.body || (method !== "GET" ? req.body : undefined);

  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === "string") query[k] = v;
  }

  try {
    const companionRes = await companionFetch(targetPath, {
      method,
      body,
      jwt: auth.jwt,
      query,
    });

    const contentType = companionRes.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      const text = await companionRes.text();
      res.setHeader("Content-Type", "text/html");
      return res.status(companionRes.status).send(text);
    }

    if (!contentType.includes("application/json")) {
      const text = await companionRes.text();
      return res.status(companionRes.status).send(text);
    }

    const data = await companionRes.json();
    const enriched = addDualKeys(data);
    return res.status(companionRes.status).json(enriched);
  } catch (err: any) {
    console.error(`Proxy error ${method} ${targetPath}:`, err.message);
    return res.status(502).json({ message: "Failed to reach companion service" });
  }
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
    const auth = getCompanionAuth(req);
    if (auth) {
      (req as any).userId = auth.userId;
      (req as any).companionJwt = auth.jwt;
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

      const companionRes = await companionFetch("/api/companion/auth/login", {
        method: "POST",
        body: { email },
      });

      const data = await companionRes.json();

      if (!companionRes.ok) {
        return res.status(companionRes.status).json({
          message: data.message || data.error || "Invalid credentials",
        });
      }

      const jwt = data.token;
      const user = data.user;

      if (!jwt || !user) {
        return res.status(500).json({ message: "Invalid response from auth service" });
      }

      const localToken = require("crypto").randomBytes(32).toString("hex");
      tokenToJwt.set(localToken, { jwt, userId: user.id, user });

      const enrichedUser = addDualKeys(user);
      return res.json({ token: localToken, user: enrichedUser });
    } catch (err: any) {
      console.error("Login error:", err.message);
      return res.status(500).json({ message: "Authentication service unavailable" });
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const companionRes = await companionFetch("/api/companion/auth/register", {
        method: "POST",
        body: req.body,
      });

      const data = await companionRes.json();

      if (!companionRes.ok) {
        return res.status(companionRes.status).json(data);
      }

      const jwt = data.token;
      const user = data.user;

      if (jwt && user) {
        const localToken = require("crypto").randomBytes(32).toString("hex");
        tokenToJwt.set(localToken, { jwt, userId: user.id, user });
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
    }
    return res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, "/api/auth/me");
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const companionRes = await companionFetch("/api/auth/forgot-password", {
        method: "POST",
        body: req.body,
      });
      const data = await companionRes.json();
      return res.status(companionRes.status).json(data);
    } catch {
      return res.json({ message: "If an account exists with that email, a reset link has been sent." });
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const companionRes = await companionFetch("/api/auth/reset-password", {
        method: "POST",
        body: req.body,
      });
      const data = await companionRes.json();
      return res.status(companionRes.status).json(data);
    } catch {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/auth/set-password", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, "/api/auth/set-password");
  });

  app.post("/api/push/register", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, "/api/push/subscribe");
  });

  app.get("/api/jobs", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.get("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/jobs/${req.params.id}`);
  });

  app.post("/api/jobs", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.put("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/jobs/${req.params.id}`);
  });

  app.delete("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/jobs/${req.params.id}`);
  });

  app.post("/api/jobs/:id/accept", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/jobs/${req.params.id}/accept`);
  });

  app.get("/api/jobs/:id/vehicle-conflicts", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/jobs/${req.params.id}/vehicle-conflicts`);
  });

  app.post("/api/jobs/:id/counter-bid", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/jobs/${req.params.id}/counter-bid`);
  });

  app.post("/api/jobs/:id/withdraw", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/jobs/${req.params.id}/withdraw`);
  });

  app.delete("/api/jobs/:id/assignments/:assignmentId", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/jobs/${req.params.id}/assignments/${req.params.assignmentId}`);
  });

  app.post("/api/cleanup-duplicate-assignments", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.get("/api/jobs/:id/assignments", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/jobs/${req.params.id}/assignments`);
  });

  app.post("/api/jobs/:id/assignments/:assignmentId/approve", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/jobs/${req.params.id}/assignments/${req.params.assignmentId}/approve`);
  });

  app.post("/api/jobs/:id/assignments/:assignmentId/reject", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/jobs/${req.params.id}/assignments/${req.params.assignmentId}/reject`);
  });

  app.put("/api/assignments/:assignmentId/vehicle", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/assignments/${req.params.assignmentId}/vehicle`);
  });

  app.post("/api/jobs/:id/clock-in", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/jobs/${req.params.id}/clock-in`);
  });

  app.post("/api/job-runs/:runId/clock-out", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/job-runs/${req.params.runId}/clock-out`);
  });

  app.patch("/api/job-runs/:runId", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/job-runs/${req.params.runId}`);
  });

  app.delete("/api/job-runs/:runId", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/job-runs/${req.params.runId}`);
  });

  app.post("/api/job-runs/:runId/weight-tickets", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/job-runs/${req.params.runId}/weight-tickets`);
  });

  app.get("/api/jobs/:jobId/weight-tickets", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/jobs/${req.params.jobId}/weight-tickets`);
  });

  app.get("/api/job-runs/:runId/weight-tickets", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/job-runs/${req.params.runId}/weight-tickets`);
  });

  app.get("/api/conversations", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.get("/api/conversations/archived", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.post("/api/conversations/:jobId/archive", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/conversations/${req.params.jobId}/archive`);
  });

  app.post("/api/conversations/:jobId/unarchive", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/conversations/${req.params.jobId}/unarchive`);
  });

  app.post("/api/conversations/:jobId/delete", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/conversations/${req.params.jobId}/delete`);
  });

  app.get("/api/messages/unread-count", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, "/api/notifications/unread-count");
  });

  app.get("/api/messages/:jobId", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/messages/${req.params.jobId}`);
  });

  app.post("/api/messages/:jobId", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/messages/${req.params.jobId}`);
  });

  app.get("/api/profile", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, "/api/auth/me");
  });

  app.put("/api/profile", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.put("/api/profile/status", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.put("/api/profile/role", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.get("/api/drivers/search", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.get("/api/vehicles", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.post("/api/vehicles", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.put("/api/vehicles/:id", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/vehicles/${req.params.id}`);
  });

  app.delete("/api/vehicles/:id", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/vehicles/${req.params.id}`);
  });

  app.get("/api/vehicles/:vehicleId/jobs", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/vehicles/${req.params.vehicleId}/jobs`);
  });

  app.get("/api/availability", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, "/api/me/availability");
  });

  app.post("/api/availability", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, "/api/me/availability");
  });

  app.get("/api/notifications", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.post("/api/notifications/mark-read", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.get("/api/dashboard", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.get("/api/earnings", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, "/api/driver/earnings");
  });

  app.get("/api/contractor/jobs", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.get("/api/driver/jobs", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.get("/api/calendar/jobs", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.get("/api/contractor/calendar-capacity", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, "/api/truck-calendar");
  });

  app.get("/api/invoices", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.get("/api/invoices/:id", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/invoices/${req.params.id}`);
  });

  app.put("/api/invoices/:id/status", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/invoices/${req.params.id}/status`);
  });

  app.get("/api/projects", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, "/api/contractor-projects");
  });

  app.post("/api/projects", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, "/api/contractor-projects");
  });

  app.put("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/contractor-projects/${req.params.id}`);
  });

  app.delete("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/contractor-projects/${req.params.id}`);
  });

  app.post("/api/projects/:id/restore", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/contractor-projects/${req.params.id}/restore`);
  });

  app.get("/api/materials", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, "/api/contractor-materials");
  });

  app.get("/api/saved-locations", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.post("/api/reviews", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.get("/api/reviews/pending", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res);
  });

  app.get("/api/reviews/:userId", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/reviews/${req.params.userId}`);
  });

  app.get("/api/favorites/:driverId", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/favorites/${req.params.driverId}`);
  });

  app.post("/api/favorites/:driverId", requireAuth, async (req: Request, res: Response) => {
    return proxyToCompanion(req, res, `/api/favorites/${req.params.driverId}`);
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
        url.searchParams.set("radius", "80000");
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
