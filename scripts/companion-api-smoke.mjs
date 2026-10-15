// Hits the companion API the mobile app calls, using the demo accounts in
// MAESTRO_* secrets. Prints status codes only. Never prints passwords, tokens,
// or emails.
//
// Writes are limited to a project named E2E-TEST-<timestamp>, then deleted.
// Does not post jobs (that pushes nearby drivers), send email/SMS, clock in,
// accept a load, or call Google (directions, places, geocode).

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BASE = process.env.COMPANION_API_BASE || "https://loadlinkmobile.replit.app";

const ROLES = [
  ["driver", "MAESTRO_DRIVER_EMAIL", "MAESTRO_DRIVER_PASSWORD"],
  ["contractor", "MAESTRO_CONTRACTOR_EMAIL", "MAESTRO_CONTRACTOR_PASSWORD"],
  ["trucking-company", "MAESTRO_TRUCKING_COMPANY_EMAIL", "MAESTRO_TRUCKING_COMPANY_PASSWORD"],
  ["foreman", "MAESTRO_FOREMAN_EMAIL", "MAESTRO_FOREMAN_PASSWORD"],
];

const READS = [
  "/api/auth/me",
  "/api/profile",
  "/api/dashboard",
  "/api/messages/unread-count",
  "/api/notifications",
  "/api/conversations",
  "/api/conversations/archived",
  "/api/jobs",
  "/api/jobs/archived",
  "/api/driver/jobs",
  "/api/contractor/jobs",
  "/api/calendar/jobs",
  "/api/contractor/calendar-capacity",
  "/api/availability",
  "/api/earnings",
  "/api/invoices",
  "/api/vehicles",
  "/api/vehicles/archived",
  "/api/my-drivers",
  "/api/projects",
  "/api/materials",
  "/api/saved-locations",
  "/api/reviews/pending",
  "/api/sync-status",
  "/api/favorites",
  "/api/invitations/pending",
];

function scrub(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/"(token|jwt|password|authorization|apiKey|api_key)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"')
    .slice(0, 180);
}

async function request(path, { method = "GET", token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(new URL(path, BASE), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    return { status: 0, json: null, text: scrub(err && err.message ? err.message : err) };
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text: scrub(json?.message || json?.error || text) };
}

function classify(status) {
  if (status >= 200 && status < 300) return "pass";
  return "fail";
}

const rows = [];

function record(role, method, path, status, note) {
  const result = classify(status);
  rows.push({ role, method, path, status, result, note: note ? scrub(note) : "" });
  const label = result === "pass" ? "PASS" : "FAIL";
  console.log(`${label}\t${status}\t${role}\t${method} ${path}${note ? `\t${scrub(note)}` : ""}`);
}

let failed = false;

for (const [role, emailKey, passwordKey] of ROLES) {
  const email = process.env[emailKey];
  const password = process.env[passwordKey];
  if (!email || !password) {
    record(role, "POST", "/api/auth/login", 0, `missing ${emailKey} or ${passwordKey}`);
    failed = true;
    continue;
  }

  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  const token = login.json && typeof login.json.token === "string" ? login.json.token : "";
  record(role, "POST", "/api/auth/login", login.status, token ? "" : login.text);
  if (!token) {
    failed = true;
    continue;
  }

  const privacy = login.json?.user || {};
  const privacyKeys = Object.keys(privacy).filter((key) => /privacy/i.test(key));
  record(
    role,
    "GET",
    "privacy-fields",
    200,
    privacyKeys.length ? `present: ${privacyKeys.join(",")}` : "login payload has no privacy fields; the app has no consent screen",
  );

  let firstJobId = "";
  for (const path of READS) {
    const res = await request(path, { token });
    record(role, "GET", path, res.status, res.status >= 400 ? res.text : "");
    if (classify(res.status) === "fail") failed = true;
    if (!firstJobId && path === "/api/jobs" && Array.isArray(res.json)) {
      const job = res.json.find((item) => item && (item.id || item.job_id));
      if (job) firstJobId = String(job.id || job.job_id);
    }
    if (!firstJobId && path === "/api/jobs" && res.json && Array.isArray(res.json.jobs)) {
      const job = res.json.jobs.find((item) => item && (item.id || item.job_id));
      if (job) firstJobId = String(job.id || job.job_id);
    }
  }

  if (firstJobId) {
    for (const path of [
      `/api/jobs/${encodeURIComponent(firstJobId)}`,
      `/api/jobs/${encodeURIComponent(firstJobId)}/assignments`,
      `/api/messages/${encodeURIComponent(firstJobId)}`,
    ]) {
      const res = await request(path, { token });
      record(role, "GET", path.replace(firstJobId, ":id"), res.status, res.status >= 400 ? res.text : "");
      if (classify(res.status) === "fail") failed = true;
    }
  } else {
    record(role, "GET", "/api/jobs/:id", 204, "no job in the list to open");
  }

  const stamp = Date.now();
  const name = `E2E-TEST-${stamp}`;
  const created = await request("/api/projects", {
    method: "POST",
    token,
    body: { name, notes: "Maestro companion smoke. Deleted at the end of this run." },
  });
  const projectId = created.json && (created.json.id || created.json.project_id);
  record(role, "POST", "/api/projects", created.status, created.status >= 300 ? created.text : name);
  if (classify(created.status) === "fail") failed = true;

  const listed = await request("/api/projects", { token });
  const projects = Array.isArray(listed.json) ? listed.json : listed.json?.projects || [];
  const leftovers = projects.filter((item) => String(item?.name || item?.project_name || "").startsWith("E2E-TEST-"));
  const ids = new Set(leftovers.map((item) => String(item.id || item.project_id)).filter(Boolean));
  if (projectId) ids.add(String(projectId));

  for (const id of ids) {
    const removed = await request(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE", token });
    record(role, "DELETE", "/api/projects/:id", removed.status, removed.status >= 300 ? removed.text : "deleted E2E-TEST project");
    if (classify(removed.status) === "fail") failed = true;
  }

  const after = await request("/api/projects", { token });
  const still = (Array.isArray(after.json) ? after.json : after.json?.projects || []).filter((item) =>
    String(item?.name || "").startsWith("E2E-TEST-"),
  );
  if (still.length) {
    record(role, "GET", "/api/projects", after.status, `${still.length} E2E-TEST project(s) still listed`);
    failed = true;
  }
}

const reportPath = process.env.API_SMOKE_REPORT || "api-smoke-report.json";
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify({ base: BASE, rows }, null, 2));
const fails = rows.filter((row) => row.result === "fail");
console.log(`\n${rows.length} checks, ${fails.length} failed`);
if (failed || fails.length) process.exit(1);
