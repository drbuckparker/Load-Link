import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { pool } from "./db";
import { fullSync, pushToWebsite, startPeriodicSync, recordUserActivity, syncJobAssignments, drainSyncQueue, getSyncQueueStatus, backfillUserEntities } from "./sync";
import { deletedVehicleIds, pauseJobSync, resumeJobSync } from "./deleted-vehicles";
import { buildExpoPushMessage, buildNewJobNearbyPush, buildJobAwardedPush, type ExpoPushMessage } from "./push-payload";
import { apnsConfigured, sendApnsPush } from "./apns";
import { getVisibilityFeatures, jobVisibilityPredicate, canViewPrivateJob } from "./visibility";

const WEBSITE_API_URL = process.env.WEBSITE_API_URL || process.env.COMPANION_API_URL || "https://loadlinklive.com";
const WEBSITE_API_KEY = process.env.WEBSITE_API_KEY || process.env.COMPANION_API_KEY || "";

const DATA_DIR = join(process.cwd(), ".data");
try { mkdirSync(DATA_DIR, { recursive: true }); } catch {}

// Deliver ONE push. iOS devices that registered a raw APNs device token get
// the push sent DIRECTLY to Apple (the Expo Launch project has no APNs
// credentials uploaded, so Expo's push service drops every iOS push with
// InvalidCredentials). Everyone else (Android, older app builds that only
// registered an Expo token) goes through Expo as before.
async function deliverPush(
  tokens: { expoToken?: string | null; apnsToken?: string | null },
  msg: ExpoPushMessage,
  label: string
): Promise<boolean> {
  if (tokens.apnsToken && apnsConfigured()) {
    const r = await sendApnsPush(tokens.apnsToken, msg);
    if (r.ok) return true;
    console.error(`${label} APNs send failed (${r.status || ''} ${r.reason || ''}) — falling back to Expo`);
  }
  if (!tokens.expoToken) return false;
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...msg, to: tokens.expoToken }),
    });
    const tickets = await res.json().catch(() => null);
    const t = Array.isArray(tickets?.data) ? tickets.data[0] : tickets?.data;
    if (t?.status === 'error') {
      console.error(`${label} Expo push ticket error:`, JSON.stringify(t));
      return false;
    }
    return res.ok && t?.status === 'ok';
  } catch (e: any) {
    console.error(`${label} Expo push send error:`, e.message);
    return false;
  }
}

async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>,
  sound: string = 'default',
  collapseId?: string,
): Promise<boolean> {
  try {
    const result = await pool.query(`SELECT expo_push_token, apns_device_token FROM users WHERE id::text = $1 LIMIT 1`, [userId]);
    const row = result.rows[0];
    if (!row || (!row.expo_push_token && !row.apns_device_token)) return false;
    // buildExpoPushMessage guarantees an explicit iOS sound (omitting it makes
    // APNs deliver silently) and an interruptionLevel; channelId/priority
    // cover Android via the client-created 'default' channel.
    const message = buildExpoPushMessage({ to: row.expo_push_token || '', title, body, data, sound, collapseId });
    return await deliverPush({ expoToken: row.expo_push_token, apnsToken: row.apns_device_token }, message, 'Push');
  } catch (e: any) {
    console.error('Push notification error:', e.message);
    return false;
  }
}

// Tell a driver they got the job (assignment approved / auto-approved): push
// with the cash-register sound (dedicated 'job-awarded' Android channel —
// channel sounds are immutable, so the horn channel can't be reused) PLUS an
// in-app notification row for the bell/inbox. Fire-and-forget.
async function notifyDriverJobAwarded(driverId: string, jobId: string, jobMaterial?: string | null) {
  try {
    const title = 'You Got the Job!';
    const body = `Your application${jobMaterial ? ` for the ${jobMaterial} job` : ''} was approved. Check the schedule for details.`;
    try {
      await pool.query(
        `INSERT INTO notifications (id, user_id, type, title, message, job_id, is_read, created_at)
         VALUES ($1, $2, 'new_load', $3, $4, $5, false, NOW())`,
        [crypto.randomUUID(), driverId, title, body, jobId]
      );
    } catch (e: any) {
      console.error('Job-awarded notification insert error:', e.message);
    }
    const tokenRow = await pool.query(`SELECT expo_push_token, apns_device_token FROM users WHERE id::text = $1 LIMIT 1`, [driverId]);
    const tokRow = tokenRow.rows[0];
    if (!tokRow || (!tokRow.expo_push_token && !tokRow.apns_device_token)) return;
    // iOS app-icon badge = the driver's unread count (including this alert).
    let badge: number | undefined;
    try {
      const c = await pool.query(
        `SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id::text = $1 AND is_read = false`,
        [driverId]
      );
      badge = Number(c.rows[0]?.unread) || undefined;
    } catch {}
    const message = buildJobAwardedPush({ to: tokRow.expo_push_token || '', title, body, jobId, badge });
    await deliverPush({ expoToken: tokRow.expo_push_token, apnsToken: tokRow.apns_device_token }, message, 'Job-awarded');
  } catch (e: any) {
    console.error('Job-awarded push error:', e.message);
  }
}

// After a driver thumbs-up/down on a sent broker assignment: tell the broker.
// Thumbs up -> running tally push ("3 of 14 trucks confirmed" / "All trucks
// confirmed"); thumbs down -> immediate reassign alert. Counts come from the
// upstream broker jobs API (authoritative for sent/confirmed), using the
// broker's latest persisted session JWT; without one we still send the basic
// per-truck alert, just without day totals.
async function notifyBrokerAssignmentResponse(assignmentId: string, driverId: string, action: "confirm" | "decline") {
  const info = await pool.query(
    `SELECT ja.job_id, j.contractor_id AS broker_id, j.material, j.scheduled_date,
            bu.role::text AS poster_role, du.full_name AS driver_name
       FROM job_assignments ja
       JOIN jobs j ON j.id = ja.job_id
       JOIN users bu ON bu.id::text = j.contractor_id::text
       LEFT JOIN users du ON du.id::text = $2
      WHERE ja.id = $1`,
    [assignmentId, driverId]
  );
  const row = info.rows[0];
  if (!row || String(row.poster_role) !== "broker") return;
  const brokerId = String(row.broker_id);
  const driverName = row.driver_name || "A driver";
  const rawDate = row.scheduled_date instanceof Date
    ? row.scheduled_date.toISOString()
    : String(row.scheduled_date || "");
  const dateKey = rawDate.slice(0, 10);
  const dayLabel = dateKey
    ? new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    : "";

  let title: string;
  let body: string;
  if (action === "decline") {
    title = "Truck declined — reassign needed";
    body = `${driverName} declined the ${row.material || "job"}${dayLabel ? ` on ${dayLabel}` : ""}. The spot is open — assign another truck and send it out.`;
  } else {
    title = "Truck confirmed";
    body = `${driverName} confirmed the ${row.material || "job"}${dayLabel ? ` for ${dayLabel}` : ""}.`;
    // Day-wide tally via upstream broker jobs (needs the broker's user JWT).
    let jwt: string | null = null;
    for (const [, a] of tokenToJwt) {
      if (a.userId === brokerId && a.jwt && !a.jwt.startsWith("dev-local:")) jwt = a.jwt;
    }
    if (jwt && dateKey) {
      try {
        const jr = await websiteFetch("/api/broker/jobs", { method: "GET", jwt });
        if (jr.ok) {
          const jobs = await jr.json().catch(() => []);
          let confirmed = 0;
          let totalOut = 0;
          for (const job of Array.isArray(jobs) ? jobs : []) {
            const jd = String(job.scheduledDate || job.scheduled_date || "").slice(0, 10);
            if (jd !== dateKey) continue;
            const s = job.assignmentStats || {};
            confirmed += Number(s.confirmed) || 0;
            totalOut += (Number(s.confirmed) || 0) + (Number(s.sent) || 0);
          }
          if (totalOut > 0) {
            if (confirmed >= totalOut) {
              title = "All trucks confirmed";
              body = `All ${totalOut} truck${totalOut === 1 ? "" : "s"} confirmed${dayLabel ? ` for ${dayLabel}` : ""}.`;
            } else {
              body = `${driverName} confirmed. ${confirmed} of ${totalOut} trucks confirmed${dayLabel ? ` for ${dayLabel}` : ""}.`;
            }
          }
        }
      } catch (e: any) {
        console.error("Broker tally fetch error:", e.message);
      }
    }
  }

  try {
    await pool.query(
      `INSERT INTO notifications (id, user_id, type, title, message, job_id, is_read, created_at)
       VALUES ($1, $2, 'new_load', $3, $4, $5, false, NOW())`,
      [crypto.randomUUID(), brokerId, title, body, row.job_id]
    );
  } catch (e: any) {
    console.error("Broker confirm notification insert error:", e.message);
  }
  await sendPushNotification(brokerId, title, body, {
    type: action === "decline" ? "broker_truck_declined" : "broker_truck_confirmed",
    jobId: String(row.job_id),
    date: dateKey,
  });
}

// Alert drivers with a truck horn when a new job is posted within their area so
// they can apply as soon as possible. "Their area" = the job's pickup location
// falling within a driver's search_radius_miles of any of their saved locations
// (primary/secondary/tertiary) or their last known GPS position. Sends a push
// (custom truckhorn.wav sound, data.type 'new_job' so the app plays the horn in
// the foreground) AND inserts an in-app notification row so it shows in the bell/
// inbox. Fire-and-forget: never blocks or fails the job-post response.
async function notifyNearbyDriversOfNewJob(job: any) {
  try {
    const jobLat = job?.origin_lat != null ? Number(job.origin_lat) : NaN;
    const jobLng = job?.origin_lng != null ? Number(job.origin_lng) : NaN;
    if (!Number.isFinite(jobLat) || !Number.isFinite(jobLng)) return;

    // Private jobs (website "Private Projects" feature) must not broadcast
    // "new job nearby" alerts. Re-check from the DB since callers pass rows
    // with varying column sets. Public-overflow openings DO broadcast.
    const visFeats = await getVisibilityFeatures(pool);
    if (visFeats.jobsVisibility && job?.id) {
      const cols = visFeats.publicPositionsRemaining
        ? `visibility::text AS vis, COALESCE(public_positions_remaining, 0)::int AS ppr`
        : `visibility::text AS vis, 0 AS ppr`;
      const vr = await pool.query(
        `SELECT ${cols},
                EXISTS (SELECT 1 FROM users _vo WHERE _vo.id::text = jobs.contractor_id::text AND _vo.role::text = 'broker') AS owner_is_broker
         FROM jobs WHERE id = $1`, [String(job.id)]);
      const row = vr.rows[0];
      // Fail closed: broker jobs with NULL visibility are private-by-default
      // (the default-private sweep may not have classified them yet).
      if (row && (row.vis === 'private' || (row.vis == null && row.owner_is_broker)) && Number(row.ppr) <= 0) {
        console.log(`[JobWatcher] Job ${job.id} is private — skipping nearby-driver broadcast`);
        return;
      }
    }

    const drivers = await pool.query(
      `SELECT id::text AS id, expo_push_token, apns_device_token,
              COALESCE(search_radius_miles, 50) AS radius,
              primary_location_lat, primary_location_lng,
              secondary_location_lat, secondary_location_lng,
              tertiary_location_lat, tertiary_location_lng,
              last_known_lat, last_known_lng
       FROM users
       WHERE (role ILIKE '%driver%' OR role ILIKE '%trucking_company%' OR also_driver = true)
         AND id::text <> $1`,
      [String(job.contractor_id)]
    );
    if (drivers.rows.length === 0) return;

    const R = 3958.7613; // earth radius in miles
    const toRad = (v: number) => (v * Math.PI) / 180;
    const milesBetween = (aLat: number, aLng: number, bLat: number, bLng: number) => {
      const dLat = toRad(bLat - aLat);
      const dLng = toRad(bLng - aLng);
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.asin(Math.sqrt(s));
    };

    const material = (job.material || 'load').toString();
    const origin = (job.origin_address || 'a nearby location').toString();
    const title = 'New Job Alert';
    const body = `A ${material} haul was posted near ${origin}. Tap to apply.`;

    const recipients: { id: string; token: string | null; apnsToken: string | null }[] = [];
    const rowValues: any[] = [];
    for (const d of drivers.rows) {
      const pairs: [any, any][] = [
        [d.primary_location_lat, d.primary_location_lng],
        [d.secondary_location_lat, d.secondary_location_lng],
        [d.tertiary_location_lat, d.tertiary_location_lng],
        [d.last_known_lat, d.last_known_lng],
      ];
      let nearest = Infinity;
      for (const [la, ln] of pairs) {
        const dLat = la != null ? Number(la) : NaN;
        const dLng = ln != null ? Number(ln) : NaN;
        if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) continue;
        if (dLat === 0 && dLng === 0) continue;
        nearest = Math.min(nearest, milesBetween(dLat, dLng, jobLat, jobLng));
      }
      const radius = Number(d.radius) || 50;
      if (nearest <= radius) {
        // iOS plays the bundled truckhorn.wav (shipped via the expo-notifications
        // plugin's "sounds" list — builds made before that plugin was added fall
        // back to SILENT for unknown sound names, so a new native build is
        // required for the horn). Android uses the MAX-importance 'job-alerts'
        // channel (heads-up + vibrate + horn). timeSensitive so job alerts can
        // break through Focus when entitled; downgraded to 'active' otherwise.
        // Bell/inbox row for EVERY nearby user; push only for those who have
        // a registered push token (no token must not block the bell badge).
        recipients.push({ id: String(d.id), token: d.expo_push_token || null, apnsToken: d.apns_device_token || null });
        rowValues.push(d.id);
      }
    }

    if (rowValues.length === 0) return;

    // In-app notification rows for the bell/inbox (reuses 'new_load' — the shared
    // notification_type enum's value for a new job posting).
    try {
      const placeholders: string[] = [];
      const params: any[] = [];
      rowValues.forEach((driverId, i) => {
        const base = i * 5;
        placeholders.push(`($${base + 1}, $${base + 2}, 'new_load', $${base + 3}, $${base + 4}, $${base + 5}, false, NOW())`);
        params.push(crypto.randomUUID(), driverId, title, body, String(job.id));
      });
      await pool.query(
        `INSERT INTO notifications (id, user_id, type, title, message, job_id, is_read, created_at) VALUES ${placeholders.join(', ')}`,
        params
      );
    } catch (e: any) {
      console.error('New-job driver notification insert error:', e.message);
    }

    // Build pushes AFTER the rows are inserted so each recipient's iOS app-icon
    // badge reflects their true unread count (including this alert).
    const pushRecipients = recipients.filter((r) => r.token || r.apnsToken);
    if (pushRecipients.length === 0) return;
    const unreadByUser = new Map<string, number>();
    try {
      const counts = await pool.query(
        `SELECT user_id::text AS user_id, COUNT(*)::int AS unread
         FROM notifications
         WHERE is_read = false AND user_id::text = ANY($1)
         GROUP BY user_id`,
        [pushRecipients.map((r) => r.id)]
      );
      for (const row of counts.rows) unreadByUser.set(row.user_id, Number(row.unread));
    } catch (e: any) {
      console.error('New-job unread count error:', e.message);
    }

    // Send per-recipient via deliverPush: devices with a raw APNs token go
    // straight to Apple (Expo Launch project lacks APNs credentials on Expo's
    // side), the rest go through Expo. Small parallel batches keep this fast
    // without hammering either service.
    const BATCH = 20;
    for (let i = 0; i < pushRecipients.length; i += BATCH) {
      await Promise.all(
        pushRecipients.slice(i, i + BATCH).map((r) => {
          const msg = buildNewJobNearbyPush({
            to: r.token || '',
            title,
            body,
            jobId: String(job.id),
            badge: unreadByUser.get(r.id),
          });
          return deliverPush({ expoToken: r.token, apnsToken: r.apnsToken }, msg, 'New-job');
        })
      );
    }
  } catch (e: any) {
    console.error('notifyNearbyDriversOfNewJob error:', e.message);
  }
}

function loadJsonMap<T>(filename: string): Map<string, T> {
  try {
    const raw = readFileSync(join(DATA_DIR, filename), "utf-8");
    const entries: [string, T][] = JSON.parse(raw);
    return new Map(entries);
  } catch { return new Map(); }
}

// ---- New-job watcher -------------------------------------------------------
// Jobs posted on the WEBSITE are written straight into the shared DB and never
// pass through this server's POST /api/jobs, so drivers got no push for them.
// Poll for newly created open jobs and alert nearby drivers, deduping across
// restarts via .data/notified_jobs.json. POST /api/jobs also records its job id
// here so companion-posted jobs aren't double-notified by the watcher.
const NOTIFIED_JOBS_FILE = "notified_jobs.json";
const _jobWatcherState: { watermark: string | null; ids: string[] } = (() => {
  try {
    const parsed = JSON.parse(readFileSync(join(DATA_DIR, NOTIFIED_JOBS_FILE), "utf-8"));
    // Back-compat: older format was a bare array of ids.
    if (Array.isArray(parsed)) return { watermark: null, ids: parsed };
    return { watermark: parsed.watermark ?? null, ids: parsed.ids ?? [] };
  } catch { return { watermark: null, ids: [] }; }
})();
const notifiedJobIds = new Set<string>(_jobWatcherState.ids);
let jobWatcherWatermark: string | null = _jobWatcherState.watermark;
function saveJobWatcherState() {
  // Bound the dedupe set in memory and on disk — only recent ids matter.
  if (notifiedJobIds.size > 500) {
    const ids = [...notifiedJobIds];
    notifiedJobIds.clear();
    for (const id of ids.slice(ids.length - 500)) notifiedJobIds.add(id);
  }
  try {
    writeFileSync(
      join(DATA_DIR, NOTIFIED_JOBS_FILE),
      JSON.stringify({ watermark: jobWatcherWatermark, ids: [...notifiedJobIds] }),
      "utf-8"
    );
  } catch {}
}
function markJobNotified(id: string) {
  notifiedJobIds.add(id);
  saveJobWatcherState();
}
// Cross-instance dedupe: the watcher runs in EVERY server instance (dev
// workspace, each deployed instance) against the same shared DB, and the local
// .data file is per-instance — so file-only dedupe caused N duplicate alerts
// per job. A DB insert with ON CONFLICT DO NOTHING lets exactly one instance
// win the claim; everyone else skips.
async function claimJobNotification(id: string): Promise<boolean> {
  try {
    const r = await pool.query(
      `INSERT INTO companion_notified_jobs (job_id) VALUES ($1) ON CONFLICT (job_id) DO NOTHING RETURNING job_id`,
      [id]
    );
    return r.rowCount === 1;
  } catch (e: any) {
    console.error('[JobWatcher] claim error:', e.message);
    // On DB error, fall back to local dedupe only (better one duplicate than
    // silently never alerting).
    return !notifiedJobIds.has(id);
  }
}
// How far back to look for missed jobs after downtime; older jobs are stale
// enough that a late push would be noise rather than help.
const JOB_WATCHER_MAX_CATCHUP_HOURS = 12;
async function pollForNewWebsiteJobs(seedOnly = false) {
  try {
    const since = jobWatcherWatermark
      ? `GREATEST($1::timestamptz, NOW() - INTERVAL '${JOB_WATCHER_MAX_CATCHUP_HOURS} hours')`
      : `NOW() - INTERVAL '15 minutes'`;
    const params = jobWatcherWatermark ? [jobWatcherWatermark] : [];
    const recent = await pool.query(
      `SELECT id, contractor_id, material, origin_lat, origin_lng, origin_address, created_at
       FROM jobs
       WHERE created_at > ${since}
         AND status = 'open'
         AND archived_at IS NULL
         AND id NOT LIKE 'demo-%'
       ORDER BY created_at ASC`,
      params
    );
    for (const job of recent.rows) {
      const id = String(job.id);
      const created = new Date(job.created_at).toISOString();
      if (!jobWatcherWatermark || created > jobWatcherWatermark) jobWatcherWatermark = created;
      if (notifiedJobIds.has(id) || hiddenJobIds.has(id)) continue;
      notifiedJobIds.add(id);
      if (!seedOnly) {
        // DB-level claim so only ONE server instance alerts for this job.
        if (!(await claimJobNotification(id))) continue;
        console.log(`[JobWatcher] New job ${id} detected — notifying nearby drivers`);
        notifyNearbyDriversOfNewJob(job).catch(() => {});
      }
    }
    saveJobWatcherState();
  } catch (e: any) {
    console.error("[JobWatcher] poll error:", e.message);
  }
}
function startNewJobWatcher() {
  // First-ever run (no watermark on disk): seed silently so a fresh deploy
  // doesn't blast alerts for jobs that predate it. With a persisted watermark,
  // the first pass alerts normally, so jobs posted during a restart or short
  // downtime are caught up instead of dropped.
  const firstEverRun = jobWatcherWatermark === null;
  // Keep the shared dedupe table small — claims older than the catch-up
  // window can never be re-alerted anyway.
  pool.query(`DELETE FROM companion_notified_jobs WHERE notified_at < NOW() - INTERVAL '7 days'`).catch(() => {});
  pollForNewWebsiteJobs(firstEverRun).finally(() => {
    setInterval(() => pollForNewWebsiteJobs(false), 60000);
  });
}
// ----------------------------------------------------------------------------

// Re-acquire a fresh upstream JWT for a broker whose session is gone at
// scheduled-send fire time. Looks up the account's email in the shared DB and
// uses the email-only companion login (trusted via X-API-Key) — the same
// upstream endpoint the interactive login fallback uses. Returns null when
// the account can't be found or the website refuses the login.
async function reacquireBrokerJwt(brokerId: string): Promise<string | null> {
  try {
    const r = await pool.query(
      `SELECT email, is_suspended FROM users WHERE id::text = $1 LIMIT 1`,
      [brokerId]
    );
    const dbUser = r.rows[0];
    if (!dbUser?.email || dbUser.is_suspended) return null;
    const loginRes = await websiteFetch("/api/companion/auth/login", {
      method: "POST",
      body: { email: dbUser.email },
    });
    if (!loginRes.ok) {
      console.error(`[BrokerSend] re-auth refused for broker ${brokerId}: ${loginRes.status}`);
      return null;
    }
    const data = await loginRes.json().catch(() => null);
    const jwt = data?.token || data?.jwt || null;
    return typeof jwt === "string" && jwt.length > 0 ? jwt : null;
  } catch (e: any) {
    console.error(`[BrokerSend] re-auth error for broker ${brokerId}:`, e.message);
    return null;
  }
}

// Durable outbox for the phone alert that accompanies a broker's "send
// instructions" action. The website owns assignment state and creates the
// in-app notification; the companion owns phone delivery. A primary key on
// assignment_id prevents retries, overlapping workers, or repeated send-all
// taps from producing duplicate pushes.
async function ensureBrokerInstructionPushOutbox() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS broker_assignment_push_deliveries (
      assignment_id text PRIMARY KEY,
      driver_id text NOT NULL,
      job_id text NOT NULL,
      claimed_at timestamptz,
      attempted_at timestamptz,
      delivered_at timestamptz,
      attempts integer NOT NULL DEFAULT 0,
      error text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    ALTER TABLE broker_assignment_push_deliveries
      ADD COLUMN IF NOT EXISTS attempted_at timestamptz
  `);
  await pool.query(`
    ALTER TABLE broker_assignment_push_deliveries
      ADD COLUMN IF NOT EXISTS ready_at timestamptz
  `);
  await pool.query(`
    UPDATE broker_assignment_push_deliveries o
       SET ready_at = COALESCE(o.attempted_at, NOW())
      FROM job_assignments ja
     WHERE o.assignment_id = ja.id::text
       AND ja.sent_at IS NOT NULL
       AND o.ready_at IS NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bapd_pending
      ON broker_assignment_push_deliveries (delivered_at, claimed_at)
  `);
}

async function enqueueHeldBrokerAssignments(
  jobId: string,
  brokerId: string,
  jwt: string,
  assignmentId?: string,
): Promise<void> {
  const upstream = await websiteFetch(
    `/api/broker/jobs/${encodeURIComponent(jobId)}/assignments`,
    { method: "GET", jwt }
  );
  if (upstream.ok) {
    const list = await upstream.json().catch(() => []);
    const held = (Array.isArray(list) ? list : []).filter((a: any) => {
      const id = String(a.id || a.assignmentId || a.assignment_id || "");
      const status = String(a.status || "").toLowerCase();
      const sentAt = Object.prototype.hasOwnProperty.call(a, "sentAt") ? a.sentAt : a.sent_at;
      return (!assignmentId || id === assignmentId) &&
        ["pending", "accepted", "approved", "assigned"].includes(status) &&
        !sentAt;
    });
    if (assignmentId && held.length === 0) {
      const error: any = new Error("Assignment is not held on this broker job");
      error.status = 409;
      throw error;
    }
    for (const a of held) {
      const id = String(a.id || a.assignmentId || a.assignment_id);
      const driverId = String(a.driverId || a.driver_id || a.driver?.id || "");
      if (!id || !driverId) continue;
      await pool.query(
        `INSERT INTO broker_assignment_push_deliveries (assignment_id, driver_id, job_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (assignment_id) DO NOTHING`,
        [id, driverId, jobId]
      );
    }
    return;
  }
  const error: any = new Error("Could not verify held assignments");
  error.status = upstream.status || 502;
  throw error;
}

async function reconcileDormantBrokerInstructionPushes(
  jobId?: string,
  assignmentId?: string,
): Promise<void> {
  const params: any[] = [];
  const filters: string[] = [];
  if (jobId) {
    params.push(jobId);
    filters.push(`AND o.job_id = $${params.length}`);
  }
  if (assignmentId) {
    params.push(assignmentId);
    filters.push(`AND o.assignment_id = $${params.length}`);
  }
  const dormant = await pool.query(
    `SELECT o.assignment_id, o.driver_id, o.job_id, j.contractor_id::text AS broker_id
       FROM broker_assignment_push_deliveries o
       JOIN jobs j ON j.id::text = o.job_id
      WHERE o.delivered_at IS NULL
        AND o.ready_at IS NULL
        ${filters.join("\n        ")}
      ORDER BY o.created_at ASC
      LIMIT 100`,
    params
  );
  const byJob = new Map<string, any[]>();
  for (const row of dormant.rows) {
    const key = String(row.job_id);
    if (!byJob.has(key)) byJob.set(key, []);
    byJob.get(key)!.push(row);
  }
  for (const [pendingJobId, rows] of byJob) {
    const brokerId = String(rows[0]?.broker_id || "");
    const jwt = brokerId ? await reacquireBrokerJwt(brokerId) : null;
    if (!jwt) continue;
    try {
      const response = await websiteFetch(
        `/api/broker/jobs/${encodeURIComponent(pendingJobId)}/assignments`,
        { method: "GET", jwt }
      );
      if (!response.ok) continue;
      const assignments = await response.json().catch(() => []);
      if (!Array.isArray(assignments)) continue;
      for (const row of rows) {
        const assignment = assignments.find((a: any) =>
          String(a.id || a.assignmentId || a.assignment_id || "") === String(row.assignment_id));
        if (!assignment) continue;
        const sentAt = Object.prototype.hasOwnProperty.call(assignment, "sentAt")
          ? assignment.sentAt
          : assignment.sent_at;
        if (!sentAt) continue;
        await pool.query(
          `UPDATE broker_assignment_push_deliveries
              SET ready_at = NOW()
            WHERE assignment_id = $1
              AND delivered_at IS NULL
              AND ready_at IS NULL`,
          [String(row.assignment_id)]
        );
      }
    } catch (e: any) {
      console.error(`[BrokerSend] dormant outbox reconciliation failed for ${pendingJobId}:`, e.message);
    }
  }
}

async function deliverPendingBrokerInstructionPushes(jobId?: string, assignmentId?: string): Promise<number> {
  const params: any[] = [];
  const filters: string[] = [];
  if (jobId) {
    params.push(jobId);
    filters.push(`AND o2.job_id = $${params.length}`);
  }
  if (assignmentId) {
    params.push(assignmentId);
    filters.push(`AND o2.assignment_id = $${params.length}`);
  }
  // These rows are queued only after an assignment was verified as held, and
  // this delivery pass runs only after the authoritative send action succeeds.
  // Do not join the companion's local assignment mirror: broker assignments
  // may never be copied there.
  // Claims are a recoverable lease so a server restart cannot permanently lose a push.
  // Provider collapse IDs coalesce a replay of the same assignment if a crash
  // occurs after provider acceptance but before delivered_at is persisted.
  const claimed = await pool.query(
    `UPDATE broker_assignment_push_deliveries o
        SET claimed_at = NOW(), attempted_at = NOW(), attempts = attempts + 1, error = NULL
      WHERE o.assignment_id IN (
        SELECT o2.assignment_id
          FROM broker_assignment_push_deliveries o2
         WHERE o2.delivered_at IS NULL
           AND o2.ready_at IS NOT NULL
           AND o2.attempts < 3
           AND (o2.claimed_at IS NULL OR o2.claimed_at < NOW() - INTERVAL '5 minutes')
            ${filters.join("\n            ")}
         ORDER BY o2.created_at ASC
         LIMIT 50
         FOR UPDATE OF o2 SKIP LOCKED
      )
      RETURNING o.assignment_id, o.driver_id, o.job_id`,
    params
  );

  let delivered = 0;
  for (const row of claimed.rows) {
    try {
      const info = await pool.query(
        `SELECT j.material, j.scheduled_date, u.company AS broker_company, u.full_name AS broker_name
           FROM jobs j
           LEFT JOIN users u ON u.id::text = j.contractor_id::text
          WHERE j.id::text = $1 LIMIT 1`,
        [String(row.job_id)]
      );
      const j = info.rows[0] || {};
      const rawDate = j.scheduled_date instanceof Date
        ? j.scheduled_date.toISOString()
        : String(j.scheduled_date || "");
      const dateKey = rawDate.slice(0, 10);
      const dayLabel = dateKey
        ? new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-US", {
            weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
          })
        : "your upcoming job";
      const brokerLabel = j.broker_company || j.broker_name || "Your broker";
      const title = "Job instructions ready — confirm";
      const body = `${brokerLabel} sent instructions for ${j.material || "your job"} on ${dayLabel}. Tap to confirm or decline.`;
      const ok = await sendPushNotification(String(row.driver_id), title, body, {
        type: "broker_assignment",
        jobId: String(row.job_id),
        assignmentId: String(row.assignment_id),
      }, "default", `broker-assignment-${String(row.assignment_id)}`);
      if (ok) {
        await pool.query(
          `UPDATE broker_assignment_push_deliveries
              SET delivered_at = NOW(), claimed_at = NULL, error = NULL
            WHERE assignment_id = $1`,
          [String(row.assignment_id)]
        );
        delivered++;
      } else {
        await pool.query(
          `UPDATE broker_assignment_push_deliveries
              SET claimed_at = NULL,
                  error = 'No registered device token or push provider rejected delivery'
            WHERE assignment_id = $1`,
          [String(row.assignment_id)]
        );
      }
    } catch (e: any) {
      await pool.query(
        `UPDATE broker_assignment_push_deliveries
            SET claimed_at = NULL, error = $2
          WHERE assignment_id = $1`,
        [String(row.assignment_id), String(e?.message || e).slice(0, 500)]
      ).catch(() => {});
    }
  }
  return delivered;
}

async function sendBrokerJobInstructions(
  jobId: string,
  brokerId: string,
  jwt: string,
  assignmentId?: string,
) {
  await enqueueHeldBrokerAssignments(jobId, brokerId, jwt, assignmentId);
  const response = await websiteFetch(
    `/api/broker/jobs/${jobId}/${assignmentId ? "send" : "send-all"}`,
    {
      method: "POST",
      body: assignmentId ? { assignmentId } : {},
      jwt,
    }
  );
  if (response.ok) {
    await pool.query(
      `UPDATE broker_assignment_push_deliveries
          SET ready_at = NOW()
        WHERE job_id = $1
          AND ($2::text IS NULL OR assignment_id = $2)
          AND delivered_at IS NULL`,
      [jobId, assignmentId || null]
    );
    await deliverPendingBrokerInstructionPushes(jobId, assignmentId).catch((e: any) =>
      console.error(`[BrokerSend] driver push error for job ${jobId}:`, e.message)
    );
  }
  return response;
}

async function sendBrokerAssignmentChangePush(
  driverId: string,
  jobId: string,
  change: "removed" | "reassigned",
): Promise<void> {
  const result = await pool.query(
    `SELECT material, scheduled_date, origin_address, destination_address
       FROM jobs
      WHERE id::text = $1
      LIMIT 1`,
    [jobId]
  );
  const job = result.rows[0] || {};
  const rawDate = job.scheduled_date instanceof Date
    ? job.scheduled_date.toISOString()
    : String(job.scheduled_date || "");
  const dateKey = rawDate.slice(0, 10);
  const dayLabel = dateKey
    ? new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
      })
    : "an upcoming date";
  const material = job.material || "job";
  const pickup = String(job.origin_address || "").trim();
  const destination = String(job.destination_address || "").trim();
  const route = [
    pickup ? `Pickup: ${pickup}.` : "",
    destination ? `Deliver to: ${destination}.` : "",
  ].filter(Boolean).join(" ");
  const title = change === "reassigned"
    ? "You have been reassigned"
    : "You have been removed from this job";
  const body = change === "reassigned"
    ? `New instructions: ${material} on ${dayLabel}. ${route}`.trim()
    : `You are no longer assigned to ${material} on ${dayLabel}. ${route}`.trim();
  await sendPushNotification(driverId, title, body, {
    type: change === "reassigned" ? "broker_assignment_reassigned" : "broker_assignment_removed",
    jobId,
  }, "default", `${change}-broker-assignment-${jobId}-${driverId}`);
}

// Fires broker "send instructions at HH:MM" schedules: when one comes due,
// send-all the held assignments on every job that broker has on that date.
// Recover rows stuck in 'processing' after a crash/redeploy mid-send: the
// claiming instance died, so they would otherwise never fire, never show as
// failed, and the 30-day sweep would skip them forever. Anything claimed more
// than 5 minutes ago is presumed orphaned (a live pass finishes a row in
// seconds; FOR UPDATE SKIP LOCKED plus the age threshold keeps this from
// racing an instance that is actively working). Retries respect the existing
// attempts counter: under the cap the row goes back to 'pending' (send-all is
// idempotent per job — already-sent assignments are naturally skipped, so a
// partial fire before the crash cannot double-send); at the cap it is marked
// 'failed' with a clear error.
async function recoverStuckBrokerScheduledSends() {
  try {
    const r = await pool.query(
      `UPDATE broker_scheduled_sends b
       SET status = CASE WHEN b.attempts < 5 THEN 'pending' ELSE 'failed' END,
           attempts = b.attempts + 1,
           claimed_at = NULL,
           error = CASE WHEN b.attempts < 5
             THEN 'Recovered: send interrupted mid-processing (server restart); will retry'
             ELSE 'Send interrupted mid-processing (server restart); gave up after retries' END
       WHERE b.id IN (
         SELECT id FROM broker_scheduled_sends
         WHERE status = 'processing'
           AND COALESCE(claimed_at, send_at) < NOW() - INTERVAL '5 minutes'
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, status`
    );
    for (const row of r.rows) {
      console.log(`[BrokerSend] schedule ${row.id}: recovered stuck 'processing' row -> ${row.status}`);
    }
  } catch (e: any) {
    console.error("[BrokerSend] stuck-row recovery error:", e?.message || e);
  }
}

async function processDueBrokerScheduledSends() {
  let due: any[] = [];
  try {
    // Atomically claim due rows so overlapping runs (or multiple instances)
    // never fire the same schedule twice.
    const r = await pool.query(
      `UPDATE broker_scheduled_sends SET status = 'processing', claimed_at = NOW()
       WHERE id IN (
         SELECT id FROM broker_scheduled_sends
         WHERE status = 'pending' AND send_at <= NOW()
         ORDER BY send_at ASC LIMIT 20
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, broker_id, date, tz_offset_min, attempts`
    );
    due = r.rows;
  } catch { return; }
  for (const row of due) {
    const dateKey = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
    const tzOffsetMin = Number(row.tz_offset_min) || 0;
    // Same day-bucketing as the app: timestamped job dates are shifted into
    // the broker's local timezone before taking the YYYY-MM-DD key.
    const jobDayKey = (raw: string): string => {
      if (!raw) return "";
      if (!raw.includes("T")) return raw.slice(0, 10);
      const d = new Date(raw);
      if (isNaN(d.getTime())) return raw.slice(0, 10);
      return new Date(d.getTime() - tzOffsetMin * 60_000).toISOString().slice(0, 10);
    };
    // Latest real (non-dev) session for this broker.
    let jwt: string | null = null;
    for (const [, auth] of tokenToJwt) {
      if (auth.userId === row.broker_id && auth.jwt && !auth.jwt.startsWith("dev-local:")) jwt = auth.jwt;
    }
    if (!jwt) {
      // No live session (server restarted, session evicted, or JWT expired).
      // Re-acquire one via the email-only companion login (API-key trust) —
      // the same upstream endpoint the app-startup login fallback uses. This
      // acts on the broker's behalf without a password because the schedule
      // itself was created from an authenticated session.
      jwt = await reacquireBrokerJwt(String(row.broker_id));
      if (jwt) {
        console.log(`[BrokerSend] schedule ${row.id}: re-authenticated broker ${row.broker_id} for scheduled send`);
      }
    }
    if (!jwt) {
      await pool.query(
        `UPDATE broker_scheduled_sends SET status = 'failed', error = 'No active login session at send time and re-auth failed' WHERE id = $1 AND status = 'processing'`,
        [row.id]
      ).catch(() => {});
      continue;
    }
    try {
      const jr = await websiteFetch("/api/broker/jobs", { method: "GET", jwt });
      if (!jr.ok) throw new Error(`jobs fetch ${jr.status}`);
      const jobs = await jr.json().catch(() => []);
      let sentJobs = 0;
      const failedJobs: string[] = [];
      for (const job of Array.isArray(jobs) ? jobs : []) {
        const jobDate = jobDayKey(String(job.scheduledDate || job.scheduled_date || ""));
        if (jobDate !== dateKey) continue;
        const held = (job.assignmentStats?.held || 0) > 0 ||
          (Array.isArray(job.assignments) && job.assignments.some(
            (a: any) => (a.sentAt ?? a.sent_at) == null && a.status !== "declined" && a.status !== "withdrawn"
          ));
        if (!held) continue;
        const sr = await sendBrokerJobInstructions(String(job.id), String(row.broker_id), jwt);
        if (sr.ok) sentJobs++;
        else {
          failedJobs.push(String(job.id));
          console.error(`[BrokerSend] send-all failed for job ${job.id}: ${sr.status}`);
        }
      }
      if (failedJobs.length > 0 && Number(row.attempts) < 5) {
        // Leave it pending so the next pass retries the jobs still holding
        // unsent assignments (already-sent jobs are naturally skipped).
        await pool.query(
          `UPDATE broker_scheduled_sends SET status = 'pending', sent_jobs = $2,
             attempts = attempts + 1, error = $3 WHERE id = $1 AND status = 'processing'`,
          [row.id, sentJobs, `Retrying ${failedJobs.length} job(s): ${failedJobs.join(",").slice(0, 400)}`]
        );
      } else if (failedJobs.length > 0) {
        await pool.query(
          `UPDATE broker_scheduled_sends SET status = 'failed', sent_jobs = $2,
             error = $3 WHERE id = $1 AND status = 'processing'`,
          [row.id, sentJobs, `Gave up after retries; failed job(s): ${failedJobs.join(",").slice(0, 400)}`]
        );
      } else {
        await pool.query(
          `UPDATE broker_scheduled_sends SET status = 'sent', sent_jobs = $2, error = NULL WHERE id = $1 AND status = 'processing'`,
          [row.id, sentJobs]
        );
      }
      console.log(`[BrokerSend] schedule ${row.id}: sent instructions on ${sentJobs} job(s) for ${dateKey}${failedJobs.length ? `, ${failedJobs.length} failed (will retry)` : ""}`);
    } catch (e: any) {
      console.error("[BrokerSend] error:", e.message);
      await pool.query(
        `UPDATE broker_scheduled_sends SET status = 'failed', error = $2 WHERE id = $1 AND status = 'processing'`,
        [row.id, String(e.message || e).slice(0, 500)]
      ).catch(() => {});
    }
  }
}

// Keep the scheduled-send history bounded: sent/failed rows are only shown
// for 7 days, so anything older than 30 days is pure dead weight in the Day
// Plan query. Pending rows are NEVER swept — they still need to fire.
function sweepOldBrokerScheduledSends() {
  pool.query(
    `DELETE FROM broker_scheduled_sends
     WHERE status IN ('sent', 'failed')
       AND send_at < NOW() - INTERVAL '30 days'`
  ).then((r) => {
    if (r.rowCount) console.log(`[BrokerSend] swept ${r.rowCount} old sent/failed schedule row(s)`);
  }).catch(() => {});
}

function startBrokerScheduledSendWorker() {
  ensureBrokerInstructionPushOutbox()
    .then(() => reconcileDormantBrokerInstructionPushes())
    .then(() => deliverPendingBrokerInstructionPushes())
    .catch((e) => console.error("[BrokerSend] instruction push outbox init error:", e?.message || e));
  sweepOldBrokerScheduledSends();
  // Idempotent migration: older deployments' table predates claimed_at, and
  // the claim/recovery queries below reference it.
  pool.query(`ALTER TABLE broker_scheduled_sends ADD COLUMN IF NOT EXISTS claimed_at timestamptz`)
    .catch((e) => console.error("[BrokerSend] claimed_at migration error:", e?.message || e))
    // Startup recovery of rows orphaned in 'processing' by a crash (after the
    // migration so claimed_at is guaranteed to exist).
    .then(() => recoverStuckBrokerScheduledSends())
    .catch(() => {});
  setInterval(() => { recoverStuckBrokerScheduledSends().catch(() => {}); }, 5 * 60 * 1000);
  setInterval(() => { processDueBrokerScheduledSends().catch(() => {}); }, 60000);
  setInterval(() => {
    reconcileDormantBrokerInstructionPushes()
      .then(() => deliverPendingBrokerInstructionPushes())
      .catch(() => {});
  }, 60000);
  // Daily sweep so long-lived deployed instances stay bounded, not just fresh
  // restarts.
  setInterval(sweepOldBrokerScheduledSends, 24 * 60 * 60 * 1000);
}

function saveJsonMap<T>(filename: string, map: Map<string, T>) {
  try {
    if (map.size > 200) {
      const entries = [...map.entries()];
      const trimmed = entries.slice(entries.length - 200);
      map.clear();
      for (const [k, v] of trimmed) map.set(k, v);
    }
    // Sessions can carry a user object with a multi-MB base64 profile image;
    // persisting that bloats the file to 100s of MB and overflows jsonb.
    // Strip oversized string fields — /api/auth/me re-hydrates the user from
    // the users table anyway, so nothing user-visible is lost.
    const entries = [...map.entries()].map(([k, v]) =>
      filename === "sessions.json" ? [k, slimSessionEntry(v)] : [k, v],
    );
    writeFileSync(join(DATA_DIR, filename), JSON.stringify(entries), "utf-8");
  } catch {}
  // Sessions must survive deploy restarts (the deployed filesystem is
  // ephemeral, so the JSON file alone gets wiped on every cold start and
  // every signed-in user is logged out). Mirror the whole map to the DB.
  if (filename === "sessions.json") {
    void syncSessionsToDb(map as Map<string, any>);
  }
}

const tokenToJwt = loadJsonMap<{ jwt: string; userId: string; user: any; originalRole?: string }>("sessions.json");

// --- DB-backed session persistence (survives deploys/restarts) ---
function slimSessionEntry(v: any): any {
  try {
    const user = v?.user;
    if (!user || typeof user !== "object") return v;
    let slim: any = null;
    for (const [k, val] of Object.entries(user)) {
      if (typeof val === "string" && val.length > 100_000) {
        if (!slim) slim = { ...user };
        delete slim[k];
      }
    }
    return slim ? { ...v, user: slim } : v;
  } catch {
    return v;
  }
}

let sessionDbReady = false;
// Single-flight chain so overlapping saves can't interleave their DB writes.
let sessionDbChain: Promise<void> = Promise.resolve();
function queueSessionDbOp(op: () => Promise<void>) {
  sessionDbChain = sessionDbChain.then(op).catch((e: any) => {
    console.error("[Sessions] DB op failed:", e?.message);
  });
  return sessionDbChain;
}

// Upsert-only: NEVER delete rows this instance doesn't know about — with
// multiple deployed instances, another instance's freshly minted sessions
// wouldn't be in this instance's memory yet, and a global "delete missing"
// would log those users out. Explicit deletes happen only on logout/account
// deletion via deleteSessionsFromDb().
async function syncSessionsToDb(map: Map<string, any>) {
  if (!sessionDbReady) return;
  const obj: Record<string, any> = {};
  for (const [k, v] of map.entries()) obj[k] = slimSessionEntry(v);
  await queueSessionDbOp(async () => {
    await pool.query(
      `INSERT INTO companion_sessions (token, entry, updated_at)
       SELECT key, value, NOW() FROM jsonb_each($1::jsonb)
       ON CONFLICT (token) DO UPDATE SET entry = EXCLUDED.entry, updated_at = NOW()`,
      [JSON.stringify(obj)],
    );
  });
}

function deleteSessionsFromDb(tokens: string[]) {
  if (!sessionDbReady || tokens.length === 0) return;
  void queueSessionDbOp(async () => {
    await pool.query(`DELETE FROM companion_sessions WHERE token = ANY($1::text[])`, [tokens]);
  });
}

// Cross-instance revocation: a logout/account-deletion on one instance only
// deletes DB rows — sibling instances still hold the token in memory. Every
// 60s each instance evicts in-memory sessions whose DB row is gone, so a
// revoked token stops working everywhere within a minute.
function startSessionRevocationSweep() {
  setInterval(() => {
    if (!sessionDbReady || tokenToJwt.size === 0) return;
    void queueSessionDbOp(async () => {
      const tokens = [...tokenToJwt.keys()];
      const { rows } = await pool.query(
        `SELECT t AS token FROM unnest($1::text[]) AS t
         WHERE NOT EXISTS (SELECT 1 FROM companion_sessions cs WHERE cs.token = t)`,
        [tokens],
      );
      if (rows.length === 0) return;
      for (const r of rows) tokenToJwt.delete(r.token);
      console.log(`[Sessions] Evicted ${rows.length} revoked session(s) from memory`);
      // Rewrite the local file only; skip the DB mirror (nothing to add).
      try {
        const entries = [...tokenToJwt.entries()].map(([k, v]) => [k, slimSessionEntry(v)]);
        writeFileSync(join(DATA_DIR, "sessions.json"), JSON.stringify(entries), "utf-8");
      } catch {}
    });
  }, 60_000);
}

async function initSessionDb() {
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS companion_sessions (
         token TEXT PRIMARY KEY,
         entry JSONB NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
    );
    // Expire long-dead sessions so upsert-only persistence can't grow forever.
    await pool.query(`DELETE FROM companion_sessions WHERE updated_at < NOW() - INTERVAL '90 days'`);
    const { rows } = await pool.query(`SELECT token, entry FROM companion_sessions`);
    let restored = 0;
    for (const row of rows) {
      if (!tokenToJwt.has(row.token)) {
        tokenToJwt.set(row.token, row.entry);
        restored++;
      }
    }
    sessionDbReady = true;
    // Push any file-only sessions up so both stores agree.
    await syncSessionsToDb(tokenToJwt);
    startSessionRevocationSweep();
    console.log(`[Sessions] DB persistence ready (${rows.length} in DB, ${restored} restored to memory)`);
  } catch (e: any) {
    console.error("[Sessions] DB init failed (sessions won't survive restarts):", e?.message);
  }
}
void initSessionDb();

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

// Accounting-sync (QuickBooks/Xero) details are payee-only: the invoice payee
// is the driver/contractor who issues the invoice (driver_id side). Strip the
// qbo_*/xero_* fields from responses when the viewer isn't the payee.
const ACCOUNTING_SYNC_FIELDS = [
  "qbo_invoice_id", "qbo_sync_status", "qbo_synced_at", "qbo_sync_error",
  "xero_invoice_id", "xero_sync_status", "xero_synced_at", "xero_sync_error",
];
function stripAccountingSyncUnlessPayee(row: any, viewerId: string | number): any {
  if (row && String(row.driver_id) !== String(viewerId)) {
    for (const f of ACCOUNTING_SYNC_FIELDS) delete row[f];
  }
  return row;
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

// Returns the user object for client responses, augmented with `accountRole` —
// the account's *entitlement* (the originalRole captured at login). This is
// stable even when the in-memory session `role` reflects a temporary
// active-view switch. The client uses `role` for the active view and
// `accountRole` for the account type shown in Settings, so toggling the
// home-page view no longer rewrites what Settings displays.
function userPayload(user: any, originalRole?: string): any {
  // Never expose the password hash — session users can carry the full DB row
  // (dev-local login and hydrateUserFromDb both source from SELECT *).
  const { password, ...safe } = user || {};
  return addDualKeys({ ...safe, accountRole: originalRole || user?.role });
}

// The website's companion login response only includes a minimal user object
// (id, email, fullName, role, truckType) — no phone, company, address, etc.
// The shared users table is the source of truth for profile fields, so merge
// the DB row into the session user or saved fields "disappear" after every
// (silent) re-login. Excludes: password (sensitive) and role (session-scoped
// view switching must not be clobbered by a lazy hydration).
const USER_HYDRATE_EXCLUDE = new Set(["password", "role"]);
async function hydrateUserFromDb(user: any): Promise<any> {
  if (!user?.id) return user;
  try {
    const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [user.id]);
    if (rows.length > 0) {
      for (const [k, v] of Object.entries(rows[0])) {
        if (USER_HYDRATE_EXCLUDE.has(k)) continue;
        if (v !== null && v !== undefined) user[k] = v;
      }
    }
  } catch (e: any) {
    console.log("hydrateUserFromDb error:", e?.message);
  }
  return user;
}

function getWebsiteAuth(req: Request): { jwt: string; userId: string; user: any; originalRole?: string } | null {
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


// Hourly billing rule: a 1-hour minimum, then rounded into 15-minute segments
// (a segment counts once you're 5+ minutes into it). Mirrors getBilledMinutes()
// in app/job/[id].tsx so the app display, the persisted billed minutes, and the
// invoice totals all agree.
function billedMinutesFrom(actualMinutes: number): number {
  if (actualMinutes <= 60) return 60;
  const overFirst = actualMinutes - 60;
  const fullSegments = Math.floor(overFirst / 15);
  const remainder = overFirst % 15;
  const billedSegments = remainder >= 5 ? fullSegments + 1 : fullSegments;
  return 60 + billedSegments * 15;
}

// ---------------------------------------------------------------------------
// Road-mile distance helpers (Google Directions API).
//
// The clock-in/clock-out geofence is measured in ROAD miles, not straight-line
// ("as the crow flies") miles: a driver 12 air miles away across a river or
// mountain can easily be 40+ road miles from the site, and contractors care
// about the real driving distance. Straight-line math is kept only as (a) a
// cheap shortcut when the driver is obviously on-site, and (b) a fallback if
// the Directions API is unreachable — an API outage must never block clock-in.
// ---------------------------------------------------------------------------

function haversineMilesFn(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 3958.7613; // earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Straight-line distance (miles) from a point to the closest point on the
// pickup->dropoff segment. Equirectangular projection — fine for short-haul.
function segmentDistanceMilesFn(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
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
}

// Lat/lng of the closest point on the pickup->dropoff segment to the driver —
// used as an extra Directions target so a driver mid-route isn't measured
// against the (far) endpoints.
function closestPointOnSegment(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): { lat: number; lng: number } {
  const meanLatRad = ((aLat + bLat) / 2) * Math.PI / 180;
  const mpdLat = 69.0;
  const mpdLng = 69.0 * Math.cos(meanLatRad);
  const ax = aLng * mpdLng, ay = aLat * mpdLat;
  const bx = bLng * mpdLng, by = bLat * mpdLat;
  const px = pLng * mpdLng, py = pLat * mpdLat;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { lat: aLat, lng: aLng };
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return { lat: (ay + t * dy) / mpdLat, lng: (ax + t * dx) / mpdLng };
}

// Cache road distances by rounded endpoints (4 decimals ≈ 11 m). Clock-out
// locations never move, so entries stay valid; cap size to bound memory.
const roadMilesCache = new Map<string, number | null>();
const ROAD_CACHE_MAX = 2000;

async function getRoadMiles(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): Promise<number | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const key = `${fromLat.toFixed(4)},${fromLng.toFixed(4)}|${toLat.toFixed(4)},${toLng.toFixed(4)}`;
  if (roadMilesCache.has(key)) return roadMilesCache.get(key) ?? null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", `${fromLat},${fromLng}`);
    url.searchParams.set("destination", `${toLat},${toLng}`);
    url.searchParams.set("key", apiKey);
    const response = await fetch(url.toString());
    const data = await response.json() as any;
    let miles: number | null = null;
    if (data.routes && data.routes.length > 0 && data.routes[0].legs?.[0]?.distance?.value != null) {
      miles = data.routes[0].legs[0].distance.value / 1609.34;
    } else if (data.status === "ZERO_RESULTS") {
      // No drivable route (e.g. across water with no road) — cache the miss so
      // we don't re-query; caller falls back to straight-line.
      miles = null;
    } else {
      // Real API failure (quota, denied, network) — do NOT cache.
      return null;
    }
    if (roadMilesCache.size >= ROAD_CACHE_MAX) {
      const firstKey = roadMilesCache.keys().next().value;
      if (firstKey !== undefined) roadMilesCache.delete(firstKey);
    }
    roadMilesCache.set(key, miles);
    return miles;
  } catch (e) {
    return null;
  }
}

// Minimum ROAD miles from the driver to the job area: pickup, dropoff, or the
// closest point along the route between them. Returns null if no road distance
// could be computed (caller should fall back to straight-line).
async function roadMilesToJobArea(
  pLat: number, pLng: number,
  oLat: number | null, oLng: number | null,
  dLat: number | null, dLng: number | null,
): Promise<number | null> {
  const targets: Array<{ lat: number; lng: number }> = [];
  if (oLat != null && oLng != null) targets.push({ lat: oLat, lng: oLng });
  if (dLat != null && dLng != null) targets.push({ lat: dLat, lng: dLng });
  if (oLat != null && oLng != null && dLat != null && dLng != null) {
    const mid = closestPointOnSegment(pLat, pLng, oLat, oLng, dLat, dLng);
    // Only add the on-route point if it isn't basically one of the endpoints.
    if (haversineMilesFn(mid.lat, mid.lng, oLat, oLng) > 0.5 &&
        haversineMilesFn(mid.lat, mid.lng, dLat, dLng) > 0.5) {
      targets.push(mid);
    }
  }
  if (targets.length === 0) return null;
  const results = await Promise.all(targets.map(t => getRoadMiles(pLat, pLng, t.lat, t.lng)));
  const valid = results.filter((m): m is number => m != null);
  if (valid.length === 0) return null;
  return Math.min(...valid);
}

// Companion-only "Haul Both Ways" job fields. These columns exist only in the
// shared DB (added by the companion) — the website's strict PUT/POST validation
// rejects unknown keys with a 400, so they must be stripped from every
// pushToWebsite body. Includes both camelCase and snake_case spellings.
const COMPANION_ONLY_JOB_KEYS = new Set([
  'haulBothWays', 'haul_both_ways',
  'returnMaterial', 'return_material',
  'returnAmount', 'return_amount',
  'returnAmountUnit', 'return_amount_unit',
  'returnOriginAddress', 'return_origin_address',
  'returnOriginLat', 'return_origin_lat',
  'returnOriginLng', 'return_origin_lng',
  'returnDestinationAddress', 'return_destination_address',
  'returnDestinationLat', 'return_destination_lat',
  'returnDestinationLng', 'return_destination_lng',
]);

// Straight-line miles from a point to a job "leg" (pickup, dropoff, or the
// segment between them), tolerating a missing endpoint.
function airMilesToLeg(
  pLat: number, pLng: number,
  oLat: number | null, oLng: number | null,
  dLat: number | null, dLng: number | null,
): number | null {
  if (oLat != null && oLng != null && dLat != null && dLng != null) {
    return segmentDistanceMilesFn(pLat, pLng, oLat, oLng, dLat, dLng);
  }
  if (oLat != null && oLng != null) return haversineMilesFn(pLat, pLng, oLat, oLng);
  if (dLat != null && dLng != null) return haversineMilesFn(pLat, pLng, dLat, dLng);
  return null;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Routes and scheduled workers share this durable outbox. Initialize it
  // before the server begins accepting instruction-send requests.
  await ensureBrokerInstructionPushOutbox();
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

  // Companion-side login throttling: the local password fallback below means
  // upstream (website) rate limits alone no longer bound brute-force attempts,
  // so enforce our own per-email+IP failure limit.
  const loginFailures = new Map<string, { count: number; windowStart: number }>();
  const LOGIN_FAILURE_LIMIT = 10;
  const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
  function loginThrottleKey(req: Request, email: string): string {
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    return `${String(email).toLowerCase()}|${ip}`;
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

      const throttleKey = loginThrottleKey(req, email);
      const now = Date.now();
      const fail = loginFailures.get(throttleKey);
      if (fail && now - fail.windowStart < LOGIN_FAILURE_WINDOW_MS && fail.count >= LOGIN_FAILURE_LIMIT) {
        return res.status(429).json({ message: "Too many login attempts. Please try again later." });
      }
      // Track failed attempts (any 401 outcome) when the response finishes.
      res.on("finish", () => {
        if (res.statusCode === 401) {
          const cur = loginFailures.get(throttleKey);
          if (!cur || now - cur.windowStart >= LOGIN_FAILURE_WINDOW_MS) {
            loginFailures.set(throttleKey, { count: 1, windowStart: now });
          } else {
            cur.count += 1;
          }
          if (loginFailures.size > 5000) loginFailures.clear();
        } else if (res.statusCode < 400) {
          loginFailures.delete(throttleKey);
        }
      });

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
            const { password: _pw, ...safeDbUser } = dbUser;
            const localToken = crypto.randomBytes(32).toString("hex");
            const authEntry = {
              jwt: `dev-local:${dbUser.id}`,
              userId: dbUser.id,
              user: safeDbUser,
              originalRole: dbUser.role as string,
            };
            tokenToJwt.set(localToken, authEntry);
            saveJsonMap("sessions.json", tokenToJwt);
            return res.json({ token: localToken, user: userPayload(safeDbUser, authEntry.originalRole) });
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

      let data = await websiteRes.json();

      if (!websiteRes.ok) {
        // Fallback: the website refuses password verification for accounts it
        // considers Replit-auth (e.g. the demo account), even when the shared
        // users table holds a valid bcrypt password. Verify the password
        // ourselves against that same shared-DB hash — an equivalent credential
        // check — and only then mint a session via the email-only companion
        // login (API-key trust). Wrong passwords still fail here.
        let recovered = false;
        // Narrow trigger: only a plain 401 credential refusal qualifies —
        // either the website's "Sign in with Replit" refusal (demo account)
        // or "Invalid credentials" for an account whose shared-DB bcrypt hash
        // DOES match the submitted password (the website doesn't check the
        // shared users.password for accounts created via one-tap sign-in).
        // Lockouts, rate limits, 403/423/429/5xx and any other denial pass
        // through untouched so the companion never converts an upstream
        // denial into a successful login.
        const upstreamMsg = String(data?.message || data?.error || "");
        const isCredentialRefusal401 =
          websiteRes.status === 401 &&
          (/sign in with replit/i.test(upstreamMsg) ||
            /invalid credentials/i.test(upstreamMsg));
        if (isCredentialRefusal401) try {
          const localRes = await pool.query(
            `SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1`,
            [email],
          );
          const dbUser = localRes.rows[0];
          if (dbUser?.password && (await bcrypt.compare(password, dbUser.password))) {
            const retryRes = await websiteFetch("/api/companion/auth/login", {
              method: "POST",
              body: { email },
            });
            if (retryRes.ok) {
              data = await retryRes.json();
              recovered = true;
              console.log(`[Login] Local password verification fallback used for ${email}`);
            } else if (dbUser.login_provider === "replit_auth" && !dbUser.is_suspended) {
              // The website refuses even the email-only companion login for
              // some accounts (observed for a subset of Sign-in-with-Replit
              // accounts). The password already matched the shared-DB bcrypt
              // hash — the same credential store the website uses — so mint a
              // companion-local session that runs off the shared DB directly.
              // Guarded to non-suspended replit_auth accounts only: those are
              // the known website misbehavior class; email/password accounts
              // denied upstream stay denied. Downstream website proxy calls
              // degrade gracefully for "dev-local:" sessions, and role
              // switches on them are never persisted.
              const { password: _pw2, ...safeDbUser } = dbUser;
              const localToken = crypto.randomBytes(32).toString("hex");
              const authEntry = {
                jwt: `dev-local:${dbUser.id}`,
                userId: dbUser.id,
                user: safeDbUser,
                originalRole: dbUser.role as string,
              };
              tokenToJwt.set(localToken, authEntry);
              saveJsonMap("sessions.json", tokenToJwt);
              console.log(`[Login] Companion-local session minted for ${email} (website refused email-only login)`);
              return res.json({ token: localToken, user: userPayload(safeDbUser, authEntry.originalRole) });
            }
          }
        } catch (fbErr: any) {
          console.error("[Login] Local password fallback failed:", fbErr.message);
        }
        if (!recovered) {
          return res.status(websiteRes.status).json({
            message: data.message || data.error || "Invalid credentials",
          });
        }
      }

      const jwt = data.token;
      const user = data.user;

      if (!jwt || !user) {
        return res.status(500).json({ message: "Invalid response from auth service" });
      }

      await hydrateUserFromDb(user);

      // The website's login response can misreport the role (e.g. it returns
      // 'trucking_company' for the compound demo account, and 'contractor'
      // for some trucking_company users). users.role in the shared DB is the
      // authoritative entitlement — role switches are session-only and never
      // persisted — so prefer it when present.
      try {
        const roleRes = await pool.query(`SELECT role FROM users WHERE id = $1`, [user.id]);
        const dbRole = roleRes.rows[0]?.role;
        if (dbRole && dbRole !== user.role) {
          console.log(`[Login] Using DB role '${dbRole}' over website-reported '${user.role}' for ${email}`);
          user.role = dbRole;
          // The website gates /api/broker/* etc. on ITS OWN user record, so a
          // DB-vs-website role mismatch means role-gated endpoints 403 upstream
          // while the app shows the role — jobs "disappear". Heal the drift by
          // pushing the authoritative DB role upstream (PUT /api/users/:id is
          // the accepted endpoint; do NOT use POST /api/auth/switch-role).
          // Skip compound roles the website may reject — pushing one component
          // could collapse the entitlement.
          // Awaited (bounded) so the website record is already fixed before the
          // client's first post-login /api/broker/* request — otherwise the
          // first screen can still 403 upstream and come up blank.
          const isCompoundRole = allowedRolesForUser(String(dbRole)).length > 1;
          if (isCompoundRole) {
            console.log(`[RoleSync] Skipping upstream push of compound role '${dbRole}' at login for ${email}`);
          } else {
            try {
              const ur = await Promise.race([
                websiteFetch(`/api/users/${user.id}`, {
                  method: "PUT",
                  body: { role: dbRole },
                  jwt,
                }),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error("timed out after 5000ms")), 5000),
                ),
              ]);
              if (ur.ok) {
                console.log(`[RoleSync] Healed login role drift: pushed '${dbRole}' to website for ${email}`);
              } else {
                console.error(`[RoleSync] Failed to push role '${dbRole}' to website at login for ${email}: ${ur.status}`);
              }
            } catch (e: any) {
              console.error(`[RoleSync] Error pushing role to website at login:`, e.message);
            }
          }
        }
      } catch {}

      const localToken = crypto.randomBytes(32).toString("hex");
      const authEntry = { jwt, userId: user.id, user, originalRole: user.role as string };
      tokenToJwt.set(localToken, authEntry);
      saveJsonMap("sessions.json", tokenToJwt);

      const enrichedUser = userPayload(user, authEntry.originalRole);
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
        const authEntry = { jwt, userId: user.id, user, originalRole: user.role as string };
        tokenToJwt.set(localToken, authEntry);
        saveJsonMap("sessions.json", tokenToJwt);
        return res.json({ token: localToken, user: userPayload(user, authEntry.originalRole) });
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
      const token = authHeader.slice(7);
      tokenToJwt.delete(token);
      saveJsonMap("sessions.json", tokenToJwt);
      deleteSessionsFromDb([token]);
    }
    return res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req);
    if (!auth) return res.status(401).json({ message: "Not authenticated" });
    // Lazy hydration also repairs pre-existing sessions minted before login
    // started merging the DB row into the session user.
    await hydrateUserFromDb(auth.user);
    return res.json({ user: userPayload(auth.user, auth.originalRole) });
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
      const removedTokens: string[] = [];
      for (const [token, session] of tokenToJwt.entries()) {
        if (session.userId === userId) {
          tokenToJwt.delete(token);
          removedTokens.push(token);
        }
      }
      if (removedTokens.length) {
        saveJsonMap("sessions.json", tokenToJwt);
        deleteSessionsFromDb(removedTokens);
      }
      // Other instances may still hold this user's sessions in memory, so also
      // clear by userId in the DB (their in-memory copies die at next restart,
      // and upstream JWT rejection covers the interim).
      void queueSessionDbOp(async () => {
        await pool.query(`DELETE FROM companion_sessions WHERE entry->>'userId' = $1`, [userId]);
      });

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
      const { token, expoPushToken, expo_push_token, deviceToken, device_token } = req.body;
      const pushToken = token || expoPushToken || expo_push_token;
      if (pushToken) {
        await pool.query(`UPDATE users SET expo_push_token = $1 WHERE id = $2`, [pushToken, auth.userId]);
      }
      // Raw APNs device token (iOS only) — lets the server push directly to
      // Apple, bypassing Expo's push service (which lacks APNs credentials
      // for the Expo Launch project).
      const apnsToken = deviceToken || device_token;
      const updateId = req.body.updateId || req.body.update_id || null;
      if (apnsToken && typeof apnsToken === 'string' && /^[0-9a-fA-F]{32,200}$/.test(apnsToken)) {
        await pool.query(`UPDATE users SET apns_device_token = $1 WHERE id = $2`, [apnsToken, auth.userId]);
        console.log(`[PushRegister] user=${auth.userId} apnsToken=SAVED len=${apnsToken.length} update=${updateId}`);
      } else {
        console.log(`[PushRegister] user=${auth.userId} apnsToken=${apnsToken ? `REJECTED(len=${String(apnsToken).length})` : 'MISSING'} update=${updateId} tokenError=${req.body.deviceTokenError || 'none'}`);
      }
    } catch (e) {
      console.log(`[PushRegister] error: ${e}`);
    }
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

      let query = `SELECT j.*, COALESCE(cp.name, bcp.name) as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text WHERE j.archived_at IS NULL`;
      const params: any[] = [];
      let paramIdx = 1;

      // Private jobs (website "Private Projects" feature): only owner,
      // assigned/applied drivers, invitees, or jobs with public overflow
      // openings are listable. No-op until the visibility column exists.
      const visFeats = await getVisibilityFeatures(pool);
      if (visFeats.jobsVisibility) {
        query += jobVisibilityPredicate(visFeats, paramIdx);
        params.push(auth.userId);
        paramIdx++;
      }

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
      const projectIdFilter = req.query.project_id as string | undefined;
      if (projectIdFilter) {
        query += ` AND j.project_id = $${paramIdx}`;
        params.push(projectIdFilter);
        paramIdx++;
      }
      if (search) {
        query += ` AND (j.material_type ILIKE $${paramIdx} OR j.pickup_location ILIKE $${paramIdx} OR j.dropoff_location ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
      }
      const truckType = req.query.truck_type as string | undefined;
      if (truckType) {
        query += ` AND j.truck_type::text = $${paramIdx}`;
        params.push(truckType);
        paramIdx++;
      }
      // Hide jobs from Find Jobs when they're no longer truly available to apply to.
      // Conditions for hiding:
      //   a) Fully crewed: approved trucks >= trucks_needed — hidden from everyone
      //      EXCEPT the poster. The poster's own postings stay visible (their
      //      project view relies on this route); other viewers see a fully-staffed
      //      job as no longer "available", so it drops out of Find Jobs.
      //   b) (caller-only) Caller is already an approved truck on this job — it lives
      //      on their calendar now, not in Find Jobs.
      //   c) (caller-only) Application cap hit: (pending+approved) >= cap AND caller
      //      hasn't applied. Cap by trucks_needed: 1 -> 5, 2 -> 8, 3+ -> 3 * needed.
      // EXCEPTION: conditions (b) and (c) never apply to the contractor who posted the
      // job — they still see their own NOT-YET-FULL postings as a "this is live"
      // confirmation. Only (a) — truly full — hides a poster's own job.
      query += ` AND NOT (
        j.status::text IN ('open', 'accepted', 'pending')
        AND (
          ((SELECT COUNT(*) FROM job_assignments ja
            WHERE ja.job_id = j.id AND ja.status::text = 'approved')
          >= COALESCE(j.trucks_needed, 1)
          -- Never hide the caller's OWN postings (project view relies on this)
          AND j.contractor_id::text != $${paramIdx})
          OR (
            j.contractor_id::text != $${paramIdx}
            AND (
              EXISTS (
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
          )
        )
      )`;
      params.push(auth.userId);
      paramIdx++;
      query += ` ORDER BY j.scheduled_date ASC NULLS LAST, j.created_at DESC`;

      const result = await pool.query(query, params);
      const rows = result.rows.map(addDualKeys);

      // Broker confirm/decline: flag jobs where the caller has a SENT, still-
      // pending broker assignment awaiting their thumbs up/down. Held
      // (sent_at NULL) assignments never reach this list — the visibility
      // predicate above already excludes those jobs entirely.
      try {
        const pend = await pool.query(
          `SELECT ja.id, ja.job_id, ja.sent_at
           FROM job_assignments ja
           JOIN jobs bj ON bj.id = ja.job_id
           JOIN users bu ON bu.id::text = bj.contractor_id::text AND bu.role::text = 'broker'
           WHERE ja.driver_id::text = $1
             AND ja.status::text = 'pending'
             AND ja.sent_at IS NOT NULL`,
          [auth.userId]
        );
        if (pend.rows.length > 0) {
          const byJob = new Map(pend.rows.map((r: any) => [String(r.job_id), r]));
          for (const row of rows) {
            const m = byJob.get(String(row.id));
            if (m) {
              row.needsConfirmation = true;
              row.needs_confirmation = true;
              row.assignmentId = m.id;
              row.assignment_id = m.id;
              row.assignmentSentAt = m.sent_at;
              row.assignment_sent_at = m.sent_at;
            }
          }
        }
      } catch (e: any) {
        console.error("GET /api/jobs broker-confirm annotate error:", e.message);
      }

      return res.json(rows);
    } catch (e: any) {
      console.error("GET /api/jobs local error:", e.message);
      return res.json([]);
    }
  });

  app.get("/api/jobs/archived", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const result = await pool.query(
        `SELECT j.*, COALESCE(cp.name, bcp.name) as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text
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

  // Broker privacy toggle: flip a posted job between private (roster-only)
  // and public (open marketplace applications). Owner-only.
  app.post("/api/jobs/:id/visibility", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const vis = String(req.body?.visibility || "");
      if (vis !== "public" && vis !== "private") {
        return res.status(400).json({ message: "visibility must be 'public' or 'private'" });
      }
      // Broker-only: privacy is a broker roster feature. Ordinary contractor
      // jobs are public marketplace posts and must stay that way — otherwise
      // any contractor could hide a job the marketplace already relies on.
      // The DB trigger blocks broker jobs going public unless this session
      // authorizes it (SET LOCAL) — this endpoint is the only writer that may.
      const client = await pool.connect();
      let upd;
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL app.allow_visibility_change = '1'");
        upd = await client.query(
          `UPDATE jobs SET visibility = $1, updated_at = NOW()
           WHERE id = $2 AND contractor_id::text = $3
             AND EXISTS (SELECT 1 FROM users u WHERE u.id::text = $3::text AND u.role::text = 'broker')
           RETURNING id, visibility`,
          [vis, req.params.id, auth.userId]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      if (upd.rowCount === 0) return res.status(404).json({ message: "Job not found" });
      return res.json({ ok: true, visibility: upd.rows[0].visibility });
    } catch (e: any) {
      console.error("Job visibility error:", e.message);
      return res.status(500).json({ message: "Failed to update job visibility" });
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
        `SELECT j.*, COALESCE(cp.name, bcp.name) as project_name,
                (cp.id IS NOT NULL) AS is_contractor_project,
                u.company as contractor_name,
                u.company as contractor_company,
                u.full_name as contractor_full_name,
                u.phone as contractor_phone,
                u.email as contractor_email,
                d.full_name as driver_name,
                COALESCE(NULLIF(dtc.company, ''), NULLIF(d.company, '')) as driver_company,
                (SELECT bjc.client_name FROM broker_job_clients bjc
                  WHERE bjc.job_id::text = j.id::text LIMIT 1) as client_name,
                (SELECT bjc.client_email FROM broker_job_clients bjc
                  WHERE bjc.job_id::text = j.id::text LIMIT 1) as client_email,
                (SELECT bjc.client_key FROM broker_job_clients bjc
                  WHERE bjc.job_id::text = j.id::text LIMIT 1) as client_key
         FROM jobs j
         LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text
         LEFT JOIN users u ON j.contractor_id::text = u.id::text
         LEFT JOIN users d ON j.driver_id::text = d.id::text
         LEFT JOIN users dtc ON d.trucking_company_id::text = dtc.id::text
         WHERE j.id = $1`,
        [req.params.id]
      );
      if (result.rows.length > 0) {
        const job = result.rows[0];
        // Client name is intentionally visible to everyone who can see the
        // job (broker's request): drivers need to know who they're hauling
        // for to find the right job.
        const isParticipant = (
          String(job.contractor_id) === auth.userId ||
          String(job.driver_id) === auth.userId
        );
        let hasAssignment = false;
        if (!isParticipant) {
          // Broker "send-later" rule: a HELD assignment (sent_at NULL) on a
          // broker-posted job grants NO visibility until the broker sends it.
          const aCheck = await pool.query(
            `SELECT 1 FROM job_assignments ja WHERE ja.job_id = $1 AND ja.driver_id = $2
             AND ja.status::text NOT IN ('rejected', 'withdrawn', 'cancelled', 'expired')
             AND (ja.sent_at IS NOT NULL OR NOT EXISTS (
               SELECT 1 FROM users _bu WHERE _bu.id::text = $3 AND _bu.role::text = 'broker'))
             LIMIT 1`,
            [req.params.id, auth.userId, String(job.contractor_id)]
          );
          hasAssignment = aCheck.rows.length > 0;
        }
        const canSeeDetails = isParticipant || hasAssignment;

        // Private-job gate (website "Private Projects" feature). No-op until
        // the visibility column exists in the shared schema.
        const visFeats = await getVisibilityFeatures(pool);
        const allowedPrivate = await canViewPrivateJob(
          pool, visFeats, job, auth.userId, canSeeDetails
        );
        if (!allowedPrivate) {
          return res.status(403).json({ message: "This project is private." });
        }

        if (canSeeDetails) {
          const assignResult = await pool.query(
            `SELECT ja.*, t.make as vehicle_make, t.model as vehicle_model, t.year as vehicle_year,
                    t.truck_number as vehicle_truck_number, t.license_plate as vehicle_license_plate,
                    t.truck_type as vehicle_truck_type, t.capacity as vehicle_capacity, t.has_tarp as vehicle_has_tarp,
                    du.full_name as driver_full_name,
                    COALESCE(NULLIF(dutc.company, ''), NULLIF(du.company, '')) as driver_company
             FROM job_assignments ja
             LEFT JOIN trucks t ON ja.vehicle_id = t.id
             LEFT JOIN users du ON ja.driver_id::text = du.id::text
             LEFT JOIN users dutc ON du.trucking_company_id::text = dutc.id::text
             WHERE ja.job_id = $1
             ORDER BY (ja.status::text = 'approved') DESC, ja.approved_at DESC NULLS LAST, ja.created_at DESC`, [req.params.id]);
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

          // When the job has no directly-assigned driver_id (the common case —
          // haulers apply via job_assignments), resolve the "driver" for display
          // from the best assignment: prefer an approved one, else the most
          // recent still-active application.
          if (!job.driver_name || !job.driver_company) {
            const activeAssigns = assignResult.rows.filter(
              (r: any) => !['rejected', 'withdrawn', 'cancelled', 'expired'].includes(String(r.status))
            );
            const primary =
              activeAssigns.find((r: any) => String(r.status) === 'approved') ||
              activeAssigns[0] ||
              null;
            if (primary) {
              if (!job.driver_name) job.driver_name = primary.driver_full_name || null;
              if (!job.driver_company) job.driver_company = primary.driver_company || null;
            }
          }
        } else {
          job.assignments = [];
          job.jobRuns = [];
          job.job_runs = [];
          job.runs = [];
          job.weightTickets = [];
          job.weight_tickets = [];
          // Poster contact details (personal name, phone, email) are PII and
          // only meant for participants/applicants who need to coordinate
          // payment. A non-applicant browsing the job still sees the company
          // name (contractor_name), but not the personal contact info.
          delete job.contractor_full_name;
          delete job.contractor_phone;
          delete job.contractor_email;
        }

        // Broker jobs: non-poster viewers must never see HELD (unsent)
        // assignments in the roster list, and a driver with their own SENT,
        // still-pending assignment gets the confirm/decline flags.
        try {
          const brokerCheck = await pool.query(
            `SELECT 1 FROM users WHERE id::text = $1 AND role::text = 'broker' LIMIT 1`,
            [String(job.contractor_id)]
          );
          if (brokerCheck.rows.length > 0) {
            if (String(job.contractor_id) !== auth.userId && Array.isArray(job.assignments)) {
              job.assignments = job.assignments.filter((a: any) => a.sent_at || a.sentAt);
            }
            const mine = await pool.query(
              `SELECT id, sent_at FROM job_assignments
               WHERE job_id = $1 AND driver_id::text = $2
                 AND status::text = 'pending' AND sent_at IS NOT NULL LIMIT 1`,
              [req.params.id, auth.userId]
            );
            if (mine.rows.length > 0) {
              job.needsConfirmation = true;
              job.needs_confirmation = true;
              job.assignmentId = mine.rows[0].id;
              job.assignment_id = mine.rows[0].id;
              job.assignmentSentAt = mine.rows[0].sent_at;
              job.assignment_sent_at = mine.rows[0].sent_at;
            }
          }
        } catch (e: any) {
          console.error("GET /api/jobs/:id broker annotate error:", e.message);
        }

        // Client name is driver-visible by product choice, but the client's
        // email and internal key are only needed by the broker editing the job.
        if (String(job.contractor_id) !== auth.userId) {
          delete job.client_email;
          delete job.client_key;
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

      // Broker job posting goes through the website API: the website owns the
      // billing split (it strips billRate/billRateType/client* off the job row,
      // writes broker_job_billing, and forces private visibility). The job
      // lands in the shared DB via the website's write, so it shows up locally
      // without any insert here. Never write billing fields into jobs locally.
      const posterRole = String(auth.originalRole || auth.user?.role || "");
      if (posterRole === "broker") {
        if (!auth.jwt || auth.jwt.startsWith("dev-local:")) {
          return res.status(400).json({ message: "Broker job posting requires a live website account." });
        }
        const r = await websiteFetch("/api/jobs", { method: "POST", body: req.body, jwt: auth.jwt });
        const text = await r.text();
        let data: any; try { data = JSON.parse(text); } catch { data = { message: text }; }
        // The website strips client fields off the job row (it only keeps the
        // billing split), so persist the job→client link companion-side. The
        // client key resolves to a manual client id when the name/email
        // matches one, else we keep just the name/email for display.
        // Broker jobs are private by default — mark it immediately so the job
        // never has a public window before the ~60s sync backstop catches it.
        // (Row may not exist locally yet; the sync-side default covers that.)
        if (r.ok && data?.id) {
          try {
            await pool.query(`UPDATE jobs SET visibility = 'private' WHERE id = $1 AND visibility IS NULL`, [String(data.id)]);
          } catch {}
        }
        if (r.ok && data?.id && (req.body.clientName || req.body.clientEmail)) {
          try {
            const cName = String(req.body.clientName || "").trim();
            const cEmail = String(req.body.clientEmail || "").trim().toLowerCase();
            let clientKey = "";
            const m = await pool.query(
              `SELECT id FROM broker_manual_clients WHERE broker_id = $1
                 AND (($2 <> '' AND lower(name) = lower($2)) OR ($3 <> '' AND lower(email) = $3))
               LIMIT 1`,
              [auth.userId, cName, cEmail]
            );
            if (m.rows[0]) clientKey = `manual-${m.rows[0].id}`;
            await pool.query(
              `INSERT INTO broker_job_clients (job_id, broker_id, client_key, client_name, client_email)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (job_id) DO UPDATE SET client_key = $3, client_name = $4, client_email = $5`,
              [String(data.id), auth.userId, clientKey, cName, cEmail]
            );
          } catch (e: any) {
            console.error("[JobClientLink] save failed:", e.message);
          }
        }
        return res.status(r.status).json(addDualKeys(data));
      }

      const id = crypto.randomUUID();
      const body = { ...req.body, id, contractor_id: auth.userId, status: 'open', created_at: new Date().toISOString() };

      const columns = ['id', 'contractor_id', 'material', 'origin_address', 'destination_address', 'rate', 'rate_type',
        'truck_type', 'status', 'scheduled_date', 'project_id', 'trucks_needed', 'estimated_days', 'includes_weekends', 'includes_saturday', 'includes_sunday',
        'estimated_cost', 'origin_lat', 'origin_lng', 'destination_lat', 'destination_lng', 'job_type',
        'requires_weight_tickets', 'requires_tarp', 'urgent', 'paperwork_description', 'created_at', 'updated_at',
        'capacity_needed', 'total_tons_needed', 'total_amount_unit', 'pickup_time', 'estimated_trips',
        'haul_both_ways', 'return_material', 'return_amount', 'return_amount_unit',
        'return_origin_address', 'return_origin_lat', 'return_origin_lng',
        'return_destination_address', 'return_destination_lat', 'return_destination_lng'];

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

      // Strip companion-only "Haul Both Ways" fields before pushing upstream —
      // the website's validation rejects unknown keys with a 400, which would
      // make the whole push fail and leave the job unregistered upstream.
      const pushBody: Record<string, any> = { ...req.body, id };
      for (const k of Object.keys(pushBody)) {
        if (COMPANION_ONLY_JOB_KEYS.has(k)) delete pushBody[k];
      }
      console.log(`POST /api/jobs pushing to website with projectId=${pushBody.projectId || pushBody.project_id || 'none'}, id=${id}`);
      pushToWebsite("/api/jobs", auth, { method: "POST", body: pushBody }).catch(() => {});

      // Truck-horn alert to drivers whose area covers this job's pickup location.
      // Record the id locally AND claim it in the shared DB so no other server
      // instance's watcher sends a duplicate alert.
      // MUST be awaited before responding: on autoscale deployments the
      // instance is frozen the moment the response is sent, so fire-and-forget
      // work after res.json() silently never runs (no rows, no pushes).
      const notifyId = String(job.id || id);
      markJobNotified(notifyId);
      try {
        if (await claimJobNotification(notifyId)) {
          await notifyNearbyDriversOfNewJob(job);
        }
      } catch (e: any) {
        console.error('POST /api/jobs notify error:', e.message);
      }

      return res.status(201).json(addDualKeys(job));
    } catch (e: any) {
      console.error("POST /api/jobs error:", e.message);
      return res.status(500).json({ message: "Failed to create job" });
    }
  });

  // ---------------------------------------------------------------------
  // Broker feature (Task #26): these operations proxy straight to the
  // website API — it owns confirm/decline state, roster invitations, and
  // the pay-rate/bill-rate split (broker_job_billing never gets queried
  // from driver context here). Auth: user's website JWT + X-API-Key
  // (verified: the website accepts Bearer auth on these routes and does
  // not require the cookie-session CSRF token on the API-key path).
  // A 401 passes through so the app's silent re-login retry kicks in.
  // ---------------------------------------------------------------------
  async function proxyToWebsite(req: Request, res: Response) {
    const auth = getWebsiteAuth(req)!;
    if (!auth.jwt || auth.jwt.startsWith("dev-local:")) {
      return res.status(400).json({ message: "This feature requires a live website account." });
    }
    try {
      const r = await websiteFetch(req.originalUrl, {
        method: req.method,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : (req.body ?? {}),
        jwt: auth.jwt,
      });
      const text = await r.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { message: text }; }
      return res.status(r.status).json(addDualKeys(data));
    } catch (e: any) {
      console.error(`[WebsiteProxy] ${req.method} ${req.originalUrl} error:`, e.message);
      return res.status(502).json({ message: "Website request failed" });
    }
  }

  // A registered client's projects, for the broker's Post Job form. Local DB
  // read (contractor_projects is synced/shared), but gated on the requester
  // actually having that client in their website client list — prevents any
  // authenticated user from harvesting another company's project list.
  // Registered BEFORE the /api/broker/.* wildcard so it wins over the proxy.
  // Broker-role gate for companion-local /api/broker/* handlers. The proxy
  // wildcard relies on upstream enforcement, but local handlers registered
  // before it must enforce the role themselves.
  async function requireBrokerRole(req: Request, res: Response, next: Function) {
    try {
      const auth = getWebsiteAuth(req)!;
      const r = await pool.query(
        `SELECT 1 FROM users WHERE id::text = $1 AND role::text = 'broker' LIMIT 1`,
        [auth.userId]
      );
      if (!r.rows[0]) return res.status(403).json({ message: "Broker access required" });
      next();
    } catch (e: any) {
      console.error("requireBrokerRole error:", e.message);
      return res.status(500).json({ message: "Authorization check failed" });
    }
  }

  // Merged client list: upstream registered clients + companion-local manual
  // clients (added by the broker without a LoadLink invite). Registered BEFORE
  // the /api/broker/.* wildcard so it wins over the proxy.
  app.get("/api/broker/clients", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    try {
      let upstream: any[] = [];
      if (auth.jwt && !auth.jwt.startsWith("dev-local:")) {
        const cr = await websiteFetch("/api/broker/clients", { method: "GET", jwt: auth.jwt });
        if (cr.ok) {
          const data = await cr.json().catch(() => []);
          if (Array.isArray(data)) upstream = data;
        }
      }
      const local = await pool.query(
        `SELECT * FROM broker_manual_clients WHERE broker_id = $1 ORDER BY created_at DESC`,
        [auth.userId]
      );
      // Active-job counts come from the companion-side job→client links
      // (the website strips client fields off broker jobs entirely).
      const countMap = new Map<string, number>();
      try {
        const counts = await pool.query(
          `SELECT l.client_key, COUNT(*)::int AS n
             FROM broker_job_clients l
             JOIN jobs j ON j.id::text = l.job_id
            WHERE l.broker_id = $1 AND l.client_key <> ''
              AND j.archived_at IS NULL
              AND j.status::text NOT IN ('cancelled', 'completed')
            GROUP BY l.client_key`,
          [auth.userId]
        );
        for (const row of counts.rows) countMap.set(String(row.client_key), Number(row.n));
      } catch (e: any) {
        console.error("[BrokerClients] job counts failed:", e.message);
      }
      // Companion-side archive flags (works for manual AND registered clients).
      const archivedSet = new Set<string>();
      try {
        const arch = await pool.query(
          `SELECT client_key FROM broker_archived_clients WHERE broker_id = $1`,
          [auth.userId]
        );
        for (const row of arch.rows) archivedSet.add(String(row.client_key));
      } catch (e: any) {
        console.error("[BrokerClients] archived flags failed:", e.message);
      }
      const manual = local.rows.map((r: any) => {
        const key = `manual-${r.id}`;
        const n = countMap.get(key) || 0;
        return {
          archived: archivedSet.has(key),
          clientUserId: key,
          client_user_id: key,
          name: r.name,
          email: r.email || "",
          phone: r.phone || "",
          contactName: r.contact_name || "",
          contact_name: r.contact_name || "",
          address: r.address || "",
          notes: r.notes || "",
          status: "active",
          isManual: true,
          is_manual: true,
          activeJobs: n,
          activeJobsCount: n,
          active_jobs_count: n,
        };
      });
      const upstreamWithCounts = upstream.map((c: any) => {
        const key = String(c.clientUserId || c.client_user_id || c.invitationId || c.invitation_id || c.id || c.email || "");
        const n = countMap.get(key);
        const base = n === undefined ? c : { ...c, activeJobsCount: n, active_jobs_count: n };
        return { ...base, archived: archivedSet.has(key) };
      });
      return res.json([...manual, ...upstreamWithCounts]);
    } catch (e: any) {
      console.error("GET /api/broker/clients error:", e.message);
      return res.status(500).json({ message: "Failed to load clients" });
    }
  });

  // Broker jobs (pre-wildcard): upstream jobs enriched with the companion-side
  // job→client link — the website strips clientName/clientEmail off broker
  // jobs, so without this merge no job can be tied back to a client in the app.
  app.get("/api/broker/jobs", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    try {
      if (!auth.jwt || auth.jwt.startsWith("dev-local:")) return res.json([]);
      const includeAssignmentDetails = String(req.query.include_assignments ?? "true") !== "false";
      const forwardedParams = new URL(req.originalUrl, "http://localhost").searchParams;
      forwardedParams.delete("include_assignments");
      const qs = forwardedParams.size ? `?${forwardedParams.toString()}` : "";
      const jr = await websiteFetch(`/api/broker/jobs${qs}`, { method: "GET", jwt: auth.jwt });
      if (!jr.ok) {
        const text = await jr.text();
        let data: any; try { data = JSON.parse(text); } catch { data = { message: text }; }
        return res.status(jr.status).json(data);
      }
      const jobs = await jr.json().catch(() => []);
      if (!Array.isArray(jobs)) return res.json(addDualKeys(jobs));
      // The broker jobs list only includes assignment counts. Fetch the actual
      // authoritative rows for jobs that have trucks so the assignment sheet
      // can keep saved trucks checked and expose the Remove action immediately.
      const upstreamAssignMap = new Map<string, any[]>();
      const assignmentCutoff = new Date();
      assignmentCutoff.setUTCDate(assignmentCutoff.getUTCDate() - 7);
      const assignmentCutoffKey = assignmentCutoff.toISOString().slice(0, 10);
      const jobsWithAssignments = includeAssignmentDetails ? jobs.filter((j: any) => {
        const stats = j.assignmentStats || {};
        const status = String(j.status || "").toLowerCase();
        const dateKey = String(j.scheduledDate || j.scheduled_date || "").slice(0, 10);
        return (Number(stats.assigned ?? stats.assignedCount) || 0) > 0 &&
          !["completed", "cancelled", "canceled", "expired"].includes(status) &&
          (!dateKey || dateKey >= assignmentCutoffKey);
      }) : [];
      for (let i = 0; i < jobsWithAssignments.length; i += 8) {
        await Promise.all(jobsWithAssignments.slice(i, i + 8).map(async (j: any) => {
          const jobId = String(j.id || "");
          if (!jobId) return;
          try {
            const ar = await websiteFetch(`/api/broker/jobs/${encodeURIComponent(jobId)}/assignments`, {
              method: "GET",
              jwt: auth.jwt,
            });
            if (!ar.ok) return;
            const rows = await ar.json().catch(() => []);
            if (!Array.isArray(rows)) return;
            upstreamAssignMap.set(jobId, rows.map((a: any) => {
              const truck = a.truck && Object.keys(a.truck).length > 0 ? a.truck : null;
              return {
                ...a,
                id: String(a.id || a.assignmentId || a.assignment_id || ""),
                driverId: String(a.driverId || a.driver_id || a.driver?.id || ""),
                driver_id: String(a.driverId || a.driver_id || a.driver?.id || ""),
                driverName: a.driverName || a.driver_name || a.driver?.fullName,
                driver_name: a.driverName || a.driver_name || a.driver?.fullName,
                vehicleId: a.vehicleId || a.vehicle_id || truck?.id,
                vehicle_id: a.vehicleId || a.vehicle_id || truck?.id,
                ...(truck ? { truck } : {}),
                sentAt: Object.prototype.hasOwnProperty.call(a, "sentAt") ? a.sentAt : a.sent_at,
                sent_at: Object.prototype.hasOwnProperty.call(a, "sentAt") ? a.sentAt : a.sent_at,
              };
            }));
          } catch (e: any) {
            console.error(`[broker/jobs] assignment detail fetch failed for ${jobId}:`, e.message);
          }
        }));
      }
      const links = await pool.query(
        `SELECT job_id, client_key, client_name, client_email FROM broker_job_clients WHERE broker_id = $1`,
        [auth.userId]
      );
      const linkMap = new Map(links.rows.map((l: any) => [String(l.job_id), l]));
      // The website strips project info off broker jobs, but the local jobs
      // table keeps project_id; resolve names from both project tables so the
      // app can show "which project is this job under".
      const projRows = await pool.query(
        `SELECT j.id, j.project_id, COALESCE(cp.name, bp.name) AS project_name,
                bp.client_user_id AS project_client_user_id
         FROM jobs j
         LEFT JOIN contractor_projects cp ON cp.id::text = j.project_id::text
         LEFT JOIN broker_client_projects bp ON bp.id::text = j.project_id::text
         WHERE j.contractor_id = $1 AND j.project_id IS NOT NULL`,
        [auth.userId]
      );
      const projMap = new Map(projRows.rows.map((r: any) => [String(r.id), r]));
      // The website also omits the assignments array from its broker jobs
      // list, so the assign sheet can't tell which trucks are already on a
      // job (they'd wrongly show as just "unavailable"). Merge them in from
      // the local job_assignments table.
      const assignRows = includeAssignmentDetails
        ? await pool.query(
            `SELECT ja.id, ja.job_id, ja.driver_id, ja.vehicle_id, ja.fleet_truck_id,
                    ja.status, ja.sent_at,
                    COALESCE(d.company, d.full_name, d.email, 'Driver') AS driver_name,
                    v.id AS resolved_truck_id, v.truck_number, v.year AS truck_year,
                    v.make AS truck_make, v.model AS truck_model,
                    v.license_plate AS truck_license_plate, v.truck_type AS truck_type
               FROM job_assignments ja
               JOIN jobs j ON j.id = ja.job_id
               LEFT JOIN users d ON d.id::text = ja.driver_id::text
               LEFT JOIN driver_vehicles v
                 ON v.id::text = COALESCE(ja.vehicle_id::text, ja.fleet_truck_id::text)
              WHERE j.contractor_id = $1`,
            [auth.userId]
          )
        : { rows: [] };
      const assignMap = new Map<string, any[]>();
      for (const a of assignRows.rows) {
        const key = String(a.job_id);
        if (!assignMap.has(key)) assignMap.set(key, []);
        assignMap.get(key)!.push({
          id: a.id,
          driverId: String(a.driver_id),
          driver_id: String(a.driver_id),
          driverName: a.driver_name,
          driver_name: a.driver_name,
          vehicleId: a.vehicle_id ? String(a.vehicle_id) : undefined,
          vehicle_id: a.vehicle_id ? String(a.vehicle_id) : undefined,
          fleetTruckId: a.fleet_truck_id ? String(a.fleet_truck_id) : undefined,
          fleet_truck_id: a.fleet_truck_id ? String(a.fleet_truck_id) : undefined,
          truck: a.resolved_truck_id ? {
            id: String(a.resolved_truck_id),
            truckNumber: a.truck_number,
            year: a.truck_year,
            make: a.truck_make,
            model: a.truck_model,
            licensePlate: a.truck_license_plate,
            truckType: a.truck_type,
          } : undefined,
          status: a.status,
          sentAt: a.sent_at,
          sent_at: a.sent_at,
        });
      }
      const merged = jobs.map((j: any) => {
        const l = linkMap.get(String(j.id));
        const p = projMap.get(String(j.id));
        const localAssigns = assignMap.get(String(j.id)) || [];
        const upstreamAssigns = [
          ...(Array.isArray(j.assignments) ? j.assignments : []),
          ...(upstreamAssignMap.get(String(j.id)) || []),
        ];
        const assignmentById = new Map<string, any>();
        const mergeAssignment = (a: any, existing: any = {}, authoritative = false) => {
          const id = String(a.id || a.assignmentId || a.assignment_id || "");
          if (!id) return;
          const authoritativeSentAt = Object.prototype.hasOwnProperty.call(a, "sentAt")
            ? a.sentAt
            : Object.prototype.hasOwnProperty.call(a, "sent_at")
              ? a.sent_at
              : existing.sentAt ?? existing.sent_at ?? null;
          const sentAt = authoritative
            ? authoritativeSentAt
            : a.sentAt ?? a.sent_at ?? existing.sentAt ?? existing.sent_at ?? null;
          assignmentById.set(id, {
            ...existing,
            ...a,
            id,
            driverId: String(a.driverId || a.driver_id || existing.driverId || existing.driver_id || ""),
            driver_id: String(a.driverId || a.driver_id || existing.driverId || existing.driver_id || ""),
            vehicleId: a.vehicleId || a.vehicle_id || existing.vehicleId || existing.vehicle_id,
            vehicle_id: a.vehicleId || a.vehicle_id || existing.vehicleId || existing.vehicle_id,
            fleetTruckId: a.fleetTruckId || a.fleet_truck_id || existing.fleetTruckId || existing.fleet_truck_id,
            fleet_truck_id: a.fleetTruckId || a.fleet_truck_id || existing.fleetTruckId || existing.fleet_truck_id,
            sentAt,
            sent_at: sentAt,
          });
        };
        // Local rows fill fields the website omits (truck/name), but upstream
        // state wins when both sources contain the same assignment.
        for (const a of localAssigns) mergeAssignment(a);
        for (const a of upstreamAssigns) {
          const id = String(a.id || a.assignmentId || a.assignment_id || "");
          mergeAssignment(a, assignmentById.get(id), true);
        }
        const assignments = Array.from(assignmentById.values());
        if (!l && !p && assignments.length === 0) return j;
        return {
          ...j,
          ...(assignments.length > 0 ? { assignments } : {}),
          ...(l ? {
            clientName: l.client_name || j.clientName,
            clientEmail: l.client_email || j.clientEmail,
            clientUserId: l.client_key || j.clientUserId,
          } : {}),
          ...(p ? {
            projectId: j.projectId || p.project_id,
            projectName: j.projectName || p.project_name || undefined,
            // A broker project belongs to exactly one client. Prefer that
            // durable relationship when a canceled sibling job left this
            // job's direct broker_job_clients link missing or stale.
            clientUserId: p.project_client_user_id || l?.client_key || j.clientUserId,
          } : {}),
        };
      });
      return res.json(addDualKeys(merged));
    } catch (e: any) {
      console.error("GET /api/broker/jobs error:", e.message);
      return res.status(500).json({ message: "Failed to load jobs" });
    }
  });

  // Merged roster (pre-wildcard): upstream broker roster, plus auto-enrollment
  // of the broker's OWN account drivers (users under this account and drivers
  // assigned to its trucks). The website only allows assigning roster members
  // ("That truck is not on your roster") and has no roster-add endpoint — the
  // only entry path is /api/broker/roster/invite, which auto-links existing
  // LoadLink accounts by email. So any own-account driver missing from the
  // roster gets auto-invited here; they show as PENDING until they accept.
  app.get("/api/broker/roster", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    try {
      if (!auth.jwt || auth.jwt.startsWith("dev-local:")) return res.json([]);
      const fetchRoster = async (): Promise<any[] | null> => {
        const rr = await websiteFetch("/api/broker/roster", { method: "GET", jwt: auth.jwt });
        if (!rr.ok) return null;
        const data = await rr.json().catch(() => null);
        return Array.isArray(data) ? data : null;
      };
      let roster = await fetchRoster();
      if (roster === null) return res.status(502).json({ message: "Failed to load roster" });

      // Note: the broker's own account IS eligible when they've put themselves
      // down as a truck's assigned driver (self-invites are auto-accepted below).
      const own = await pool.query(
        `SELECT DISTINCT u.id, u.email, u.full_name FROM users u
         WHERE u.email IS NOT NULL AND (
           (u.id::text <> $1 AND u.trucking_company_id::text = $1)
           OR u.id::text IN (
             SELECT assigned_driver_id::text FROM trucks
             WHERE trucking_company_id::text = $1 AND assigned_driver_id IS NOT NULL AND archived_at IS NULL
           )
         )`,
        [String(auth.userId)]
      );
      const rosterIds = new Set(roster.map((r: any) => String(r.driverId || r.driver_id || "")).filter(Boolean));
      const rosterEmails = new Set(
        roster.map((r: any) => String(r.driverEmail || r.driver_email || r.email || "").toLowerCase()).filter(Boolean)
      );
      let invitedAny = false;
      let invitedSelf = false;
      for (const u of own.rows) {
        const email = String(u.email || "").toLowerCase();
        if (!email || rosterIds.has(String(u.id)) || rosterEmails.has(email)) continue;
        try {
          const ir = await websiteFetch("/api/broker/roster/invite", {
            method: "POST",
            body: { email: u.email, name: u.full_name || u.email },
            jwt: auth.jwt,
          });
          if (ir.ok) {
            invitedAny = true;
            if (String(u.id) === String(auth.userId)) invitedSelf = true;
          } else console.error(`[RosterAutoInvite] invite for ${u.id} failed: ${ir.status}`);
        } catch (e: any) {
          console.error("[RosterAutoInvite] error:", e.message);
        }
      }
      // A broker inviting themselves shouldn't have to "accept" their own
      // invite — auto-accept it with the same account so they're immediately
      // assignable. (Also catches a self-invite left pending from before.)
      const selfPending = roster.some(
        (r: any) =>
          String(r.driverId || r.driver_id || "") === String(auth.userId) &&
          String(r.status || "").toLowerCase() === "pending"
      );
      if (invitedSelf || selfPending) {
        try {
          const pr = await websiteFetch("/api/invitations/pending", { method: "GET", jwt: auth.jwt });
          const pending = pr.ok ? await pr.json().catch(() => []) : [];
          for (const inv of Array.isArray(pending) ? pending : []) {
            // Only auto-accept the broker's OWN invite to themselves — require
            // a POSITIVE inviter match; if we can't prove they sent it, leave
            // it pending for the user to act on manually.
            const inviter = String(inv.brokerId || inv.broker_id || inv.inviterId || inv.inviter_id || inv.invitedBy || inv.invited_by || "");
            if (inviter !== String(auth.userId)) continue;
            try {
              const ar = await websiteFetch(`/api/invitations/${inv.id}/accept`, { method: "POST", jwt: auth.jwt });
              if (ar.ok) invitedAny = true;
              else console.error(`[RosterAutoInvite] self-accept ${inv.id} failed: ${ar.status}`);
            } catch (e: any) {
              console.error("[RosterAutoInvite] self-accept error:", e.message);
            }
          }
        } catch (e: any) {
          console.error("[RosterAutoInvite] self-accept fetch error:", e.message);
        }
      }
      if (invitedAny) roster = (await fetchRoster()) || roster;

      // Enrich each roster driver with truck details for the assign sheet:
      // trucks assigned to them directly, else the active trucks of their
      // company (their parent trucking company, or their own account).
      try {
        const driverIds = roster
          .map((r: any) => String(r.driverId || r.driver_id || ""))
          .filter(Boolean);
        if (driverIds.length > 0) {
          const du = await pool.query(
            `SELECT id::text AS id, full_name, company, COALESCE(trucking_company_id::text, id::text) AS company_key
               FROM users WHERE id::text = ANY($1)`,
            [driverIds]
          );
          const userMap = new Map(du.rows.map((u: any) => [u.id, u]));
          // Tenant guard: the company-wide truck fallback only applies to the
          // broker's OWN company. For external roster drivers we only show
          // trucks explicitly assigned to them — otherwise a rostered driver
          // from another company would leak that company's whole fleet
          // (plates, capacities) into this broker's view.
          const brokerKey = String(auth.userId);
          const tr = await pool.query(
            `SELECT t.id, t.truck_number, t.year, t.make, t.model, t.truck_type, t.capacity,
                    t.license_plate, t.assigned_driver_id::text AS assigned_driver_id,
                    t.trucking_company_id::text AS trucking_company_id,
                    o.company AS owner_company, o.full_name AS owner_name
               FROM trucks t
               LEFT JOIN users o ON o.id::text = t.trucking_company_id::text
              WHERE t.archived_at IS NULL AND t.is_active = true
                AND (t.assigned_driver_id::text = ANY($1) OR t.trucking_company_id::text = $2)`,
            [driverIds, brokerKey]
          );
          roster = roster.map((r: any) => {
            const dId = String(r.driverId || r.driver_id || "");
            const u = userMap.get(dId);
            // One driver per truck: only show trucks explicitly assigned to
            // this driver. No company-wide fallback — it duplicated every
            // unassigned truck under every driver. Assign a driver to a truck
            // in My Vehicles to link them here.
            const pool_ = tr.rows.filter((t: any) => t.assigned_driver_id === dId);
            return {
              ...r,
              companyName: pool_[0]?.owner_company || u?.company || "",
              trucks: pool_.map((t: any) => ({
                id: t.id,
                truckNumber: t.truck_number,
                year: t.year,
                make: t.make,
                model: t.model,
                truckType: t.truck_type,
                capacity: t.capacity,
                licensePlate: t.license_plate,
              })),
            };
          });
        }
      } catch (e: any) {
        console.error("[Roster] truck enrichment failed:", e.message);
      }

      return res.json(addDualKeys(roster));
    } catch (e: any) {
      console.error("GET /api/broker/roster error:", e.message);
      return res.status(500).json({ message: "Failed to load roster" });
    }
  });

  // Roster availability for a given date: reads the shared driver_availability
  // table (drivers mark trucks unavailable in their calendar) so the broker's
  // assign sheet can flag who can't run that day.
  app.get("/api/broker/roster-availability", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const date = String(req.query.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: "date=YYYY-MM-DD required" });
    }
    try {
      // Derive the driver list from the broker's own roster (upstream) —
      // never trust caller-supplied IDs, or any broker could read any
      // driver's availability.
      const auth = getWebsiteAuth(req)!;
      let driverIds: string[] = [];
      if (auth.jwt && !auth.jwt.startsWith("dev-local:")) {
        const rr = await websiteFetch("/api/broker/roster", { method: "GET", jwt: auth.jwt });
        if (rr.ok) {
          const rosterData = await rr.json().catch(() => []);
          if (Array.isArray(rosterData)) {
            driverIds = rosterData
              .map((d: any) => String(d.driverId || d.driver_id || d.id || ""))
              .filter(Boolean)
              .slice(0, 200);
          }
        }
      }
      if (driverIds.length === 0) return res.json({});
      const result = await pool.query(
        `SELECT driver_id, is_available, notes
         FROM driver_availability
         WHERE date = $1 AND driver_id = ANY($2)`,
        [date, driverIds]
      );
      const map: Record<string, { unavailable: boolean; notes: string | null }> = {};
      for (const r of result.rows) {
        // A driver is unavailable for the day if ANY of their records for that
        // date says so (e.g. their only truck is blocked).
        if (r.is_available === false) {
          map[String(r.driver_id)] = { unavailable: true, notes: r.notes || null };
        } else if (!map[String(r.driver_id)]) {
          map[String(r.driver_id)] = { unavailable: false, notes: null };
        }
      }
      // Also flag drivers already booked (approved) on another active job
      // that runs on this date. No detail is exposed to the broker — the row
      // just reads unavailable (notes stay null). The job's working days are
      // computed the same way the app does (weekend-skipping continuation
      // days), so a Mon–Fri job leaves the weekend open.
      try {
        // excludeJobId: when the assign sheet is open for a specific job, that
        // job's own assignments must not mark its trucks "unavailable" — they
        // show as already-assigned (checked) instead.
        const excludeJobId = String(req.query.excludeJobId || req.query.exclude_job_id || "");
        const params: any[] = [date, driverIds.map(String)];
        let excludeClause = "";
        if (excludeJobId) {
          params.push(excludeJobId);
          excludeClause = ` AND ja.job_id::text <> $3`;
        }
        const booked = await pool.query(
          `SELECT DISTINCT ja.driver_id, j.scheduled_date, j.estimated_days,
                  j.includes_weekends, j.includes_saturday, j.includes_sunday
             FROM job_assignments ja
             JOIN jobs j ON j.id = ja.job_id
            WHERE ja.driver_id::text = ANY($2)
              AND ja.status::text = 'approved'
              AND j.status::text NOT IN ('completed','cancelled','expired')
              AND $1::date >= j.scheduled_date::date
              AND $1::date <= (j.scheduled_date::date
                    + (GREATEST(CEIL(COALESCE(j.estimated_days,1)::numeric)::int, 1) * 3) * INTERVAL '1 day')::date${excludeClause}`,
          params
        );
        for (const r of booked.rows) {
          const key = String(r.driver_id);
          if (map[key]?.unavailable) continue;
          const workingDays = getJobDateRange(
            r.scheduled_date,
            Number(r.estimated_days) || 1,
            !!r.includes_weekends,
            r.includes_saturday !== false,
            r.includes_sunday !== false
          );
          if (workingDays.includes(date)) {
            map[key] = { unavailable: true, notes: null };
          }
        }
      } catch (e: any) {
        console.error("roster-availability booked-job check error:", e.message);
      }
      return res.json(map);
    } catch (e: any) {
      console.error("GET /api/broker/roster-availability error:", e.message);
      return res.status(500).json({ message: "Failed to load availability" });
    }
  });

  // --- Scheduled day sends: broker stages held assignments, then either sends
  // them all now (client loops send-all) or schedules an automatic send time.
  app.get("/api/broker/scheduled-sends", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    const date = String(req.query.date || "").slice(0, 10);
    try {
      const params: any[] = [auth.userId];
      // Pending rows always; sent and failed rows from the last 7 days so the
      // broker can confirm a schedule actually fired (or see that it failed)
      // instead of the row silently vanishing once the worker processes it.
      let where = `broker_id = $1 AND (status = 'pending' OR (status IN ('sent', 'failed') AND send_at > NOW() - INTERVAL '7 days'))`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) { where += ` AND date = $2`; params.push(date); }
      const r = await pool.query(
        `SELECT id, date, send_at, status, error, sent_jobs, created_at FROM broker_scheduled_sends WHERE ${where} ORDER BY send_at ASC`,
        params
      );
      return res.json(r.rows.map((row: any) => ({
        id: row.id,
        date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
        sendAt: row.send_at,
        status: row.status,
        error: row.error ?? null,
        sentJobs: row.sent_jobs ?? 0,
      })));
    } catch (e: any) {
      console.error("GET /api/broker/scheduled-sends error:", e.message);
      return res.status(500).json({ message: "Failed to load scheduled sends" });
    }
  });

  app.post("/api/broker/scheduled-sends", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    if (auth.jwt && auth.jwt.startsWith("dev-local:")) {
      return res.status(400).json({ message: "Scheduled sends require a LoadLink login" });
    }
    const date = String(req.body?.date || "").slice(0, 10);
    const sendAt = new Date(String(req.body?.sendAt || ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: "date must be YYYY-MM-DD" });
    if (isNaN(sendAt.getTime())) return res.status(400).json({ message: "sendAt must be a valid timestamp" });
    if (sendAt.getTime() < Date.now() - 60_000) return res.status(400).json({ message: "sendAt is in the past" });
    try {
      // One pending schedule per broker per day: replace any existing one.
      await pool.query(
        `DELETE FROM broker_scheduled_sends WHERE broker_id = $1 AND date = $2 AND status IN ('pending', 'failed')`,
        [auth.userId, date]
      );
      // Broker's local timezone offset (minutes, getTimezoneOffset semantics)
      // so the worker buckets timestamped job dates into the same local day.
      const tzOffsetMin = Number(req.body?.tzOffsetMin ?? req.header("X-TZ-Offset") ?? 0) || 0;
      const r = await pool.query(
        `INSERT INTO broker_scheduled_sends (broker_id, date, send_at, tz_offset_min) VALUES ($1, $2, $3, $4)
         RETURNING id, date, send_at, status`,
        [auth.userId, date, sendAt.toISOString(), tzOffsetMin]
      );
      const row = r.rows[0];
      return res.status(201).json({
        id: row.id,
        date,
        sendAt: row.send_at,
        status: row.status,
      });
    } catch (e: any) {
      console.error("POST /api/broker/scheduled-sends error:", e.message);
      return res.status(500).json({ message: "Failed to schedule send" });
    }
  });

  app.delete("/api/broker/scheduled-sends/:id", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    try {
      const r = await pool.query(
        `DELETE FROM broker_scheduled_sends WHERE id = $1 AND broker_id = $2 AND status IN ('pending', 'failed') RETURNING id`,
        [req.params.id, auth.userId]
      );
      if (r.rowCount === 0) return res.status(404).json({ message: "Scheduled send not found" });
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("DELETE /api/broker/scheduled-sends error:", e.message);
      return res.status(500).json({ message: "Failed to cancel scheduled send" });
    }
  });

  // Add a client manually (no invite). Stored companion-side only; the client
  // does not need a LoadLink account for the broker to post jobs for them.
  app.post("/api/broker/clients", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const contactName = String(req.body?.contactName || req.body?.contact_name || "").trim();
    const address = String(req.body?.address || "").trim();
    const notes = String(req.body?.notes || "").trim();
    if (!name) return res.status(400).json({ message: "Client name is required" });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }
    try {
      const dupe = await pool.query(
        `SELECT id FROM broker_manual_clients WHERE broker_id = $1 AND lower(name) = lower($2)`,
        [auth.userId, name]
      );
      if (dupe.rows[0]) return res.status(409).json({ message: "You already have a client with that name" });
      const result = await pool.query(
        `INSERT INTO broker_manual_clients (broker_id, name, email, phone, contact_name, address, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [auth.userId, name, email || null, phone || null, contactName || null, address || null, notes || null]
      );
      return res.status(201).json(addDualKeys(result.rows[0]));
    } catch (e: any) {
      console.error("POST /api/broker/clients error:", e.message);
      return res.status(500).json({ message: "Failed to add client" });
    }
  });

  // Edit a manually added client (typo fixes / contact updates). Only
  // companion-local manual clients (ids prefixed `manual-`) are editable —
  // registered/invited clients live upstream and are not touched here.
  app.put("/api/broker/clients/:id", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    const rawId = String(req.params.id || "");
    if (!rawId.startsWith("manual-")) {
      return res.status(400).json({ message: "Only manually added clients can be edited" });
    }
    const id = rawId.slice(7);
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const contactName = String(req.body?.contactName || req.body?.contact_name || "").trim();
    const address = String(req.body?.address || "").trim();
    const notes = String(req.body?.notes || "").trim();
    if (!name) return res.status(400).json({ message: "Client name is required" });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }
    try {
      const dupe = await pool.query(
        `SELECT id FROM broker_manual_clients WHERE broker_id = $1 AND lower(name) = lower($2) AND id::text <> $3`,
        [auth.userId, name, id]
      );
      if (dupe.rows[0]) return res.status(409).json({ message: "You already have a client with that name" });
      const result = await pool.query(
        `UPDATE broker_manual_clients SET name = $1, email = $2, phone = $3, contact_name = $4, address = $5, notes = $6
         WHERE id::text = $7 AND broker_id = $8 RETURNING *`,
        [name, email || null, phone || null, contactName || null, address || null, notes || null, id, auth.userId]
      );
      if (!result.rows[0]) return res.status(404).json({ message: "Client not found" });
      return res.json(addDualKeys(result.rows[0]));
    } catch (e: any) {
      console.error("PUT /api/broker/clients/:id error:", e.message);
      return res.status(500).json({ message: "Failed to update client" });
    }
  });

  // Remove a manually added client. Scoped to the broker's own rows.
  // Archive / unarchive a client (companion-side, works for manual and
  // registered clients alike). Purely a view flag for this broker's own
  // Clients tab — never touches the client record or their jobs.
  app.post("/api/broker/clients/:id/archive", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    const key = String(req.params.id || "").trim();
    if (!key) return res.status(400).json({ message: "Missing client id" });
    try {
      await pool.query(
        `INSERT INTO broker_archived_clients (broker_id, client_key) VALUES ($1, $2)
         ON CONFLICT (broker_id, client_key) DO NOTHING`,
        [auth.userId, key]
      );
      return res.json({ success: true, archived: true });
    } catch (e: any) {
      console.error("POST /api/broker/clients/:id/archive error:", e.message);
      return res.status(500).json({ message: "Failed to archive client" });
    }
  });

  app.delete("/api/broker/clients/:id/archive", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    const key = String(req.params.id || "").trim();
    if (!key) return res.status(400).json({ message: "Missing client id" });
    try {
      await pool.query(
        `DELETE FROM broker_archived_clients WHERE broker_id = $1 AND client_key = $2`,
        [auth.userId, key]
      );
      return res.json({ success: true, archived: false });
    } catch (e: any) {
      console.error("DELETE /api/broker/clients/:id/archive error:", e.message);
      return res.status(500).json({ message: "Failed to restore client" });
    }
  });

  app.delete("/api/broker/clients/:id", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    const rawId = String(req.params.id || "");
    if (!rawId.startsWith("manual-")) {
      return res.status(400).json({ message: "Only manually added clients can be removed" });
    }
    try {
      const result = await pool.query(
        `DELETE FROM broker_manual_clients WHERE id::text = $1 AND broker_id = $2 RETURNING id`,
        [rawId.slice(7), auth.userId]
      );
      if (!result.rows[0]) return res.status(404).json({ message: "Client not found" });
      return res.json({ success: true });
    } catch (e: any) {
      console.error("DELETE /api/broker/clients/:id error:", e.message);
      return res.status(500).json({ message: "Failed to remove client" });
    }
  });

  // Verifies the given clientUserId belongs to this broker. Manual clients are
  // checked against the companion-local table; registered clients against the
  // broker's upstream client list. Returns null on success or an error tuple.
  async function verifyBrokerClient(auth: { userId: string; jwt?: string }, clientUserId: string): Promise<{ status: number; message: string } | null> {
    if (clientUserId.startsWith("manual-")) {
      const own = await pool.query(
        `SELECT id FROM broker_manual_clients WHERE id::text = $1 AND broker_id = $2`,
        [clientUserId.slice(7), auth.userId]
      ).catch(() => ({ rows: [] as any[] }));
      return own.rows[0] ? null : { status: 403, message: "Not one of your clients" };
    }
    if (!auth.jwt || auth.jwt.startsWith("dev-local:")) {
      return { status: 400, message: "This feature requires a live website account." };
    }
    const cr = await websiteFetch("/api/broker/clients", { method: "GET", jwt: auth.jwt });
    if (!cr.ok) return { status: cr.status, message: "Could not verify client list" };
    const clients = await cr.json().catch(() => []);
    const isMyClient = Array.isArray(clients) && clients.some((c: any) =>
      String(c.clientUserId || c.client_user_id || "") === clientUserId
    );
    return isMyClient ? null : { status: 403, message: "Not one of your clients" };
  }

  app.get("/api/broker/client-projects", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    const clientUserId = String(req.query.clientUserId || "").trim();
    if (!clientUserId) return res.status(400).json({ message: "clientUserId is required" });
    try {
      const err = await verifyBrokerClient(auth, clientUserId);
      if (err) return res.status(err.status).json({ message: err.message });
      // Broker-created projects for this client (companion-local).
      const brokerProjects = await pool.query(
        `SELECT * FROM broker_client_projects WHERE broker_id = $1 AND client_user_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC`,
        [auth.userId, clientUserId]
      );
      // Registered clients may also have their own synced projects.
      let clientOwn: any[] = [];
      if (!clientUserId.startsWith("manual-")) {
        const result = await pool.query(
          `SELECT * FROM contractor_projects WHERE contractor_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
          [clientUserId]
        );
        clientOwn = result.rows;
      }
      return res.json([
        ...brokerProjects.rows.map((r: any) => ({ ...r, is_broker_project: true, isBrokerProject: true })),
        ...clientOwn.map((r: any) => ({ ...r, is_broker_project: false, isBrokerProject: false })),
      ].map(addDualKeys));
    } catch (e: any) {
      console.error("GET /api/broker/client-projects error:", e.message);
      return res.status(500).json({ message: "Failed to load client projects" });
    }
  });

  // Broker creates a project for one of their clients. Stored companion-side
  // (broker_client_projects) — never pushed upstream, since the project belongs
  // to the broker's bookkeeping, not the client's own website account.
  app.post("/api/broker/client-projects", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    const clientUserId = String(req.body?.clientUserId || req.body?.client_user_id || "").trim();
    const name = String(req.body?.name || "").trim();
    const jobNumber = String(req.body?.jobNumber || req.body?.job_number || "").trim();
    const siteAddress = String(req.body?.siteAddress || req.body?.site_address || "").trim();
    const notes = String(req.body?.notes || "").trim();
    const siteLat = req.body?.siteLat ?? req.body?.site_lat;
    const siteLng = req.body?.siteLng ?? req.body?.site_lng;
    const lat = siteLat != null && siteLat !== "" && isFinite(Number(siteLat)) ? Number(siteLat) : null;
    const lng = siteLng != null && siteLng !== "" && isFinite(Number(siteLng)) ? Number(siteLng) : null;
    if (!clientUserId) return res.status(400).json({ message: "clientUserId is required" });
    if (!name) return res.status(400).json({ message: "Project name is required" });
    try {
      const err = await verifyBrokerClient(auth, clientUserId);
      if (err) return res.status(err.status).json({ message: err.message });
      const dupe = await pool.query(
        `SELECT id FROM broker_client_projects WHERE broker_id = $1 AND client_user_id = $2 AND lower(name) = lower($3) AND deleted_at IS NULL`,
        [auth.userId, clientUserId, name]
      );
      if (dupe.rows[0]) return res.status(409).json({ message: "This client already has a project with that name" });
      const result = await pool.query(
        `INSERT INTO broker_client_projects (broker_id, client_user_id, name, job_number, site_address, site_lat, site_lng, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [auth.userId, clientUserId, name, jobNumber || null, siteAddress || null, lat, lng, notes || null]
      );
      return res.status(201).json(addDualKeys(result.rows[0]));
    } catch (e: any) {
      console.error("POST /api/broker/client-projects error:", e.message);
      return res.status(500).json({ message: "Failed to create project" });
    }
  });

  // Update a broker-created client project (site location, name, notes...).
  app.put("/api/broker/client-projects/:id", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    try {
      const own = await pool.query(
        `SELECT * FROM broker_client_projects WHERE id::text = $1 AND broker_id = $2 AND deleted_at IS NULL`,
        [String(req.params.id), auth.userId]
      );
      if (!own.rows[0]) return res.status(404).json({ message: "Project not found" });
      const b = req.body || {};
      const name = b.name != null ? String(b.name).trim() : null;
      if (b.name != null && !name) return res.status(400).json({ message: "Project name cannot be empty" });
      const siteLatRaw = b.siteLat ?? b.site_lat;
      const siteLngRaw = b.siteLng ?? b.site_lng;
      const result = await pool.query(
        `UPDATE broker_client_projects SET
           name = COALESCE($3, name),
           job_number = COALESCE($4, job_number),
           site_address = COALESCE($5, site_address),
           site_lat = COALESCE($6, site_lat),
           site_lng = COALESCE($7, site_lng),
           notes = COALESCE($8, notes)
         WHERE id::text = $1 AND broker_id = $2 RETURNING *`,
        [
          String(req.params.id), auth.userId,
          name,
          b.jobNumber != null || b.job_number != null ? String(b.jobNumber ?? b.job_number).trim() : null,
          b.siteAddress != null || b.site_address != null ? String(b.siteAddress ?? b.site_address).trim() : null,
          siteLatRaw != null && siteLatRaw !== "" && isFinite(Number(siteLatRaw)) ? Number(siteLatRaw) : null,
          siteLngRaw != null && siteLngRaw !== "" && isFinite(Number(siteLngRaw)) ? Number(siteLngRaw) : null,
          b.notes != null ? String(b.notes).trim() : null,
        ]
      );
      return res.json(addDualKeys(result.rows[0]));
    } catch (e: any) {
      console.error("PUT /api/broker/client-projects/:id error:", e.message);
      return res.status(500).json({ message: "Failed to update project" });
    }
  });

  // Swap two truck assignments between two of the broker's jobs, with
  // upstream compensation: the website owns assignments, so this sequences
  // delete/assign calls and restores the originals on any failure so a
  // truck is never left off both jobs. Registered BEFORE the wildcard proxy.
  app.post("/api/broker/assignments/swap", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    if (!auth.jwt || auth.jwt.startsWith("dev-local:")) {
      return res.status(400).json({ message: "This feature requires a live website account." });
    }
    const { assignmentIdA, assignmentIdB, jobIdA, jobIdB } = req.body || {};
    if (!assignmentIdA || !assignmentIdB || !jobIdA || !jobIdB ||
        assignmentIdA === assignmentIdB || jobIdA === jobIdB) {
      return res.status(400).json({ message: "Two different job assignments are required" });
    }
    try {
      const readAuthoritativeAssignment = async (jobId: string, assignmentId: string) => {
        const response = await websiteFetch(
          `/api/broker/jobs/${encodeURIComponent(jobId)}/assignments`,
          { method: "GET", jwt: auth.jwt }
        );
        if (!response.ok) return null;
        const rows = await response.json().catch(() => []);
        const row = Array.isArray(rows)
          ? rows.find((x: any) => String(x.id || x.assignmentId || x.assignment_id) === assignmentId)
          : null;
        if (!row) return null;
        return {
          id: assignmentId,
          job_id: jobId,
          driver_id: String(row.driverId || row.driver_id || row.driver?.id || ""),
          sent_at: Object.prototype.hasOwnProperty.call(row, "sentAt") ? row.sentAt : row.sent_at,
          status: String(row.status || "").toLowerCase(),
        };
      };
      const [a, b] = await Promise.all([
        readAuthoritativeAssignment(String(jobIdA), String(assignmentIdA)),
        readAuthoritativeAssignment(String(jobIdB), String(assignmentIdB)),
      ]);
      if (!a || !b) return res.status(404).json({ message: "Assignment not found" });
      if (String(a.job_id) === String(b.job_id)) {
        return res.status(400).json({ message: "These trucks are on the same job" });
      }
      if (!a.driver_id || !b.driver_id) {
        return res.status(409).json({ message: "One of these assignments has no driver" });
      }
      const activeStatuses = ["pending", "accepted", "approved", "confirmed", "assigned"];
      if (!activeStatuses.includes(String(a.status)) || !activeStatuses.includes(String(b.status))) {
        return res.status(400).json({ message: "Only active assignments can be switched" });
      }

      const ws = async (method: string, path: string, body?: any) => {
        const r = await websiteFetch(path, { method, body, jwt: auth.jwt });
        const text = await r.text();
        let data: any; try { data = JSON.parse(text); } catch { data = { message: text }; }
        return { ok: r.ok, status: r.status, data };
      };
      const del = (id: string) => ws("DELETE", `/api/broker/assignments/${id}`);
      const assign = (jobId: string, driverId: string, sendNow: boolean) =>
        ws("POST", `/api/broker/jobs/${jobId}/assign`, { driverId, sendNow });
      const newId = (d: any): string | null =>
        d?.assignment?.id ? String(d.assignment.id) : (d?.id ? String(d.id) : null);
      // Deterministic fallback: locate an assignment upstream by job+driver
      // (the assign response shape isn't guaranteed to include an id).
      const findUpstream = async (jobId: string, driverId: string): Promise<string | null> => {
        try {
          const r = await ws("GET", "/api/assignments");
          const list = Array.isArray(r.data) ? r.data : [];
          const hit = list.find((x: any) =>
            String(x.jobId ?? x.job_id) === jobId &&
            String(x.driverId ?? x.driver_id) === driverId &&
            !["rejected", "withdrawn", "cancelled", "expired"].includes(String(x.status || "").toLowerCase()));
          return hit?.id ? String(hit.id) : null;
        } catch { return null; }
      };

      const sentA = !!a.sent_at, sentB = !!b.sent_at;
      const dA = String(a.driver_id), dB = String(b.driver_id);
      const jobA = String(a.job_id), jobB = String(b.job_id);

      // 1. Remove truck A (nothing changed on failure).
      const r1 = await del(String(a.id));
      if (!r1.ok) return res.status(502).json({ message: r1.data?.message || "Could not remove the first truck" });
      // 2. Remove truck B; on failure put A back.
      const r2 = await del(String(b.id));
      if (!r2.ok) {
        const backA = await assign(jobA, dA, sentA);
        return res.status(502).json({
          message: (r2.data?.message || "Could not remove the second truck.") +
            (backA.ok ? " Nothing was switched." : " Check both jobs — a truck may need to be re-assigned."),
        });
      }
      // 3. Assign A's driver to B's job; on failure restore both originals.
      const r3 = await assign(jobB, dA, sentA);
      if (!r3.ok) {
        const back1 = await assign(jobA, dA, sentA);
        const back2 = await assign(jobB, dB, sentB);
        const restored = back1.ok && back2.ok;
        return res.status(r3.status === 409 ? 409 : 502).json({
          message: (r3.data?.message || "Could not move the first truck.") +
            (restored ? " Both trucks were put back on their original jobs." : " Check both jobs — a truck may need to be re-assigned."),
        });
      }
      // 4. Assign B's driver to A's job; on failure undo step 3 and restore.
      const r4 = await assign(jobA, dB, sentB);
      if (!r4.ok) {
        // Undo step 3 deterministically: find the just-created assignment
        // (response id, else upstream lookup). Only re-add driver A to the
        // original job if the moved assignment was actually removed —
        // otherwise a blind re-add would double-book the driver.
        const created = newId(r3.data) || (await findUpstream(jobB, dA));
        const movedRemoved = created ? (await del(created)).ok : false;
        const backB = await assign(jobB, dB, sentB);
        const backA = movedRemoved ? await assign(jobA, dA, sentA) : { ok: false };
        const restored = movedRemoved && backA.ok && backB.ok;
        return res.status(r4.status === 409 ? 409 : 502).json({
          message: (r4.data?.message || "Could not move the second truck.") +
            (restored ? " Both trucks were put back on their original jobs." : " Check both jobs — a truck may need to be re-assigned."),
        });
      }

      // Best-effort local mirror so the app shows the swap immediately
      // (the ~60s down-sync reconciles the authoritative rows/ids).
      try {
        const idA2 = newId(r3.data), idB2 = newId(r4.data);
        await pool.query(
          `UPDATE job_assignments SET id = COALESCE($2, id), job_id = $3, sent_at = $4 WHERE id::text = $1`,
          [String(a.id), idA2, jobB, sentA ? new Date() : null]
        );
        await pool.query(
          `UPDATE job_assignments SET id = COALESCE($2, id), job_id = $3, sent_at = $4 WHERE id::text = $1`,
          [String(b.id), idB2, jobA, sentB ? new Date() : null]
        );
      } catch (e: any) {
        console.error("[assignments/swap] local mirror failed:", e.message);
      }

      // A driver who was already told to report to the old job needs one clear
      // replacement message with the new instructions. Held assignments were
      // never communicated, so moving one remains silent.
      await Promise.all([
        sentA
          ? sendBrokerAssignmentChangePush(dA, jobB, "reassigned").catch((e: any) =>
              console.error("[assignments/swap] reassignment push A failed:", e.message))
          : Promise.resolve(),
        sentB
          ? sendBrokerAssignmentChangePush(dB, jobA, "reassigned").catch((e: any) =>
              console.error("[assignments/swap] reassignment push B failed:", e.message))
          : Promise.resolve(),
      ]);

      return res.json({ success: true });
    } catch (e: any) {
      console.error("POST /api/broker/assignments/swap error:", e.message);
      return res.status(500).json({ message: "Failed to switch trucks" });
    }
  });

  // Add companion-owned phone delivery around the website's authoritative
  // send-all action. Scheduled sends call the same helper above.
  app.post("/api/broker/jobs/:id/send-all", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    try {
      const up = await sendBrokerJobInstructions(String(req.params.id), auth.userId, auth.jwt);
      const text = await up.text();
      res.status(up.status);
      try { return res.json(JSON.parse(text)); } catch { return res.send(text); }
    } catch (e: any) {
      console.error("POST /api/broker/jobs/:id/send-all error:", e.message);
      return res.status(502).json({ message: "Failed to send driver instructions" });
    }
  });

  // The Truck Confirmations card can send one held assignment at a time.
  // Keep that path on the same durable phone-delivery wrapper as send-all.
  app.post("/api/broker/jobs/:id/send", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    const assignmentId = String(req.body?.assignmentId || "").trim();
    if (!assignmentId) return res.status(400).json({ message: "assignmentId is required" });
    try {
      const up = await sendBrokerJobInstructions(
        String(req.params.id),
        auth.userId,
        auth.jwt,
        assignmentId,
      );
      const text = await up.text();
      res.status(up.status);
      try { return res.json(JSON.parse(text)); } catch { return res.send(text); }
    } catch (e: any) {
      console.error("POST /api/broker/jobs/:id/send error:", e.message);
      return res.status(e.status || 502).json({ message: e.message || "Failed to send driver instructions" });
    }
  });

  // Assigning with "Send instructions now" must not bypass durable phone
  // delivery. Create the assignment held first, then use the same wrapped
  // single-assignment send path. If the second step is interrupted, the held
  // assignment remains visible for a safe manual retry.
  app.post("/api/broker/jobs/:id/assign", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    const jobId = String(req.params.id);
    const driverId = String(req.body?.driverId || "").trim();
    const sendNow = req.body?.sendNow === true;
    if (!driverId) return res.status(400).json({ message: "driverId is required" });
    try {
      // Make retries idempotent. A previous Send Now may have created the held
      // website assignment before phone-delivery failed; in that case, send
      // the existing held row instead of returning "already assigned".
      const currentResponse = await websiteFetch(
        `/api/broker/jobs/${encodeURIComponent(jobId)}/assignments`,
        { method: "GET", jwt: auth.jwt }
      );
      if (currentResponse.ok) {
        const current = await currentResponse.json().catch(() => []);
        const existing = (Array.isArray(current) ? current : []).find((a: any) => {
          const existingDriverId = String(a.driverId || a.driver_id || a.driver?.id || "");
          const status = String(a.status || "").toLowerCase();
          return existingDriverId === driverId &&
            ["pending", "accepted", "approved", "confirmed", "assigned"].includes(status);
        });
        if (existing) {
          const existingId = String(existing.id || existing.assignmentId || existing.assignment_id || "");
          const sentAt = Object.prototype.hasOwnProperty.call(existing, "sentAt")
            ? existing.sentAt
            : existing.sent_at;
          if (sendNow && existingId && !sentAt) {
            const sent = await sendBrokerJobInstructions(jobId, auth.userId, auth.jwt, existingId);
            const sentText = await sent.text();
            let sentBody: any = sentText;
            try { sentBody = JSON.parse(sentText); } catch {}
            res.status(sent.status);
            return typeof sentBody === "string" ? res.send(sentBody) : res.json(sentBody);
          }
          if (sendNow && existingId && sentAt) {
            await reconcileDormantBrokerInstructionPushes(jobId, existingId);
            await deliverPendingBrokerInstructionPushes(jobId, existingId);
          }
          return res.json({ assignmentId: existingId, alreadyAssigned: true, sent: !!sentAt });
        }
      }

      const before = await pool.query(
        `SELECT ja.id::text AS id
           FROM job_assignments ja
           JOIN jobs j ON j.id = ja.job_id
          WHERE ja.job_id::text = $1
            AND j.contractor_id::text = $2
            AND ja.driver_id::text = $3`,
        [jobId, auth.userId, driverId]
      );
      const existingIds = before.rows.map((row: any) => String(row.id));
      const assigned = await websiteFetch(`/api/broker/jobs/${jobId}/assign`, {
        method: "POST",
        body: { ...req.body, driverId, sendNow: false },
        jwt: auth.jwt,
      });
      const assignedText = await assigned.text();
      let assignedBody: any = assignedText;
      try { assignedBody = JSON.parse(assignedText); } catch {}
      if (!assigned.ok) {
        res.status(assigned.status);
        return typeof assignedBody === "string" ? res.send(assignedBody) : res.json(assignedBody);
      }

      let assignmentId = String(
        assignedBody?.assignmentId ||
        assignedBody?.assignment_id ||
        assignedBody?.assignment?.id ||
        assignedBody?.id ||
        ""
      ).trim();
      if (!assignmentId) {
        const resolved = await pool.query(
          `SELECT ja.id::text AS id
             FROM job_assignments ja
             JOIN jobs j ON j.id = ja.job_id
            WHERE ja.job_id::text = $1
              AND j.contractor_id::text = $2
              AND ja.driver_id::text = $3
              AND ja.status::text = 'pending'
              AND ja.sent_at IS NULL
              AND NOT (ja.id::text = ANY($4::text[]))
            ORDER BY ja.created_at DESC
            LIMIT 1`,
          [jobId, auth.userId, driverId, existingIds]
        );
        assignmentId = String(resolved.rows[0]?.id || "");
      }

      if (sendNow) {
        if (!assignmentId) {
          return res.status(502).json({
            message: "Truck was added, but instructions could not be sent yet. Use Send on the held assignment.",
          });
        }
        const sent = await sendBrokerJobInstructions(jobId, auth.userId, auth.jwt, assignmentId);
        const sentText = await sent.text();
        let sentBody: any = sentText;
        try { sentBody = JSON.parse(sentText); } catch {}
        res.status(sent.status);
        return typeof sentBody === "string" ? res.send(sentBody) : res.json(sentBody);
      }

      const responseBody = typeof assignedBody === "object" && assignedBody !== null
        ? { ...assignedBody, ...(assignmentId ? { assignmentId } : {}) }
        : assignedBody;
      res.status(assigned.status);
      return typeof responseBody === "string" ? res.send(responseBody) : res.json(responseBody);
    } catch (e: any) {
      console.error("POST /api/broker/jobs/:id/assign error:", e.message);
      return res.status(e.status || 502).json({ message: e.message || "Failed to assign driver" });
    }
  });

  app.delete("/api/broker/assignments/:id", requireAuth, requireBrokerRole, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    const assignmentId = String(req.params.id || "").trim();
    const jobId = String(req.query.jobId || req.body?.jobId || "").trim();
    if (!assignmentId || !jobId) {
      return res.status(400).json({ message: "Assignment and job are required" });
    }
    try {
      // Read the assignment from the authoritative broker endpoint before
      // deleting it; newly-created broker assignments may never appear in the
      // companion's local mirror.
      const detailsResponse = await websiteFetch(
        `/api/broker/jobs/${encodeURIComponent(jobId)}/assignments`,
        { method: "GET", jwt: auth.jwt }
      );
      const details = detailsResponse.ok
        ? await detailsResponse.json().catch(() => [])
        : [];
      const assignment = Array.isArray(details)
        ? details.find((a: any) => String(a.id || a.assignmentId || a.assignment_id) === assignmentId)
        : null;
      if (!assignment) {
        return res.status(detailsResponse.ok ? 404 : detailsResponse.status).json({
          message: detailsResponse.ok ? "Assignment not found" : "Could not verify this assignment",
        });
      }

      const driverId = String(
        assignment.driverId || assignment.driver_id || assignment.driver?.id || ""
      );
      const wasSent = !!(assignment.sentAt ?? assignment.sent_at);
      const removed = await websiteFetch(`/api/broker/assignments/${encodeURIComponent(assignmentId)}`, {
        method: "DELETE",
        jwt: auth.jwt,
      });
      const text = await removed.text();
      let data: any; try { data = JSON.parse(text); } catch { data = { message: text }; }
      if (!removed.ok) return res.status(removed.status).json(data);

      await pool.query(`DELETE FROM job_assignments WHERE id::text = $1`, [assignmentId]).catch(() => {});
      if (wasSent && driverId) {
        await sendBrokerAssignmentChangePush(driverId, jobId, "removed").catch((e: any) =>
          console.error("[broker/assignments] removal push failed:", e.message)
        );
      }
      return res.status(removed.status).json(addDualKeys(data));
    } catch (e: any) {
      console.error("DELETE /api/broker/assignments/:id error:", e.message);
      return res.status(502).json({ message: "Failed to remove truck" });
    }
  });

  // Broker dashboard data + actions (broker-only enforcement is upstream).
  app.all(/^\/api\/broker\/.*/, requireAuth, proxyToWebsite);
  // Driver thumbs up/down on a sent broker assignment. Proxies upstream, then
  // (fire-and-forget) alerts the posting broker: running confirmed-count pushes
  // on thumbs up, and an immediate "reassign needed" alert on thumbs down.
  const handleAssignmentResponse = (action: "confirm" | "decline") =>
    async (req: Request, res: Response) => {
      const auth = getWebsiteAuth(req)!;
      const assignmentId = String(req.params.id);
      try {
        const up = await websiteFetch(`/api/assignments/${assignmentId}/${action}`, {
          method: "POST",
          body: req.body ?? {},
          jwt: auth.jwt,
        });
        const text = await up.text();
        // Upstream role gate: the website rejects a driver-side confirm/decline
        // when the confirming driver is ALSO the job's posting broker ("This
        // assignment is not a broker assignment"). Brokers can legitimately
        // send a job to themselves as the driver, so handle the self-assign
        // case directly against the shared DB (the same store the website
        // reads), mirroring what the upstream confirm/decline would do.
        const isSelfAssignGate =
          up.status === 400 && /not a broker assignment/i.test(text || "");
        if (isSelfAssignGate) {
          let selfAssigned = false;
          try {
            const row = await pool.query(
              `SELECT ja.id FROM job_assignments ja
                 JOIN jobs j ON j.id = ja.job_id
                WHERE ja.id = $1
                  AND ja.driver_id::text = $2
                  AND j.contractor_id::text = $2
                  AND ja.sent_at IS NOT NULL`,
              [assignmentId, auth.userId]
            );
            selfAssigned = row.rows.length > 0;
          } catch {
            selfAssigned = false; // e.g. schema without sent_at — fall through to the upstream error
          }
          if (selfAssigned) {
            // Only a pending assignment may transition (mirrors the upstream
            // confirm/decline rule); a repeated tap on the same action is
            // treated as idempotent success, anything else surfaces the
            // upstream error unchanged.
            const target = action === "confirm" ? "approved" : "rejected";
            const upd = await pool.query(
              action === "confirm"
                ? `UPDATE job_assignments SET status = 'approved', approved_at = NOW()
                     WHERE id = $1 AND status::text = 'pending'`
                : `UPDATE job_assignments SET status = 'rejected'
                     WHERE id = $1 AND status::text = 'pending'`,
              [assignmentId]
            );
            let done = (upd.rowCount || 0) === 1;
            if (!done) {
              const cur = await pool.query(
                `SELECT status::text AS status FROM job_assignments WHERE id = $1`,
                [assignmentId]
              );
              done = cur.rows[0]?.status === target;
            }
            if (done) {
              // No broker notification: the broker IS the driver here.
              return res.json({ ok: true, selfAssigned: true });
            }
          }
        }
        res.status(up.status);
        try { res.json(JSON.parse(text)); } catch { res.send(text); }
        if (up.ok) {
          notifyBrokerAssignmentResponse(assignmentId, auth.userId, action).catch((e) =>
            console.error("Broker confirm-notify error:", e.message)
          );
        }
      } catch (e: any) {
        console.error(`POST /api/assignments/:id/${action} error:`, e.message);
        if (!res.headersSent) res.status(502).json({ message: "Failed to reach website" });
      }
    };
  app.post("/api/assignments/:id/confirm", requireAuth, handleAssignmentResponse("confirm"));
  app.post("/api/assignments/:id/decline", requireAuth, handleAssignmentResponse("decline"));
  // Broker roster / client-company invitations.
  app.get("/api/invitations/pending", requireAuth, proxyToWebsite);
  app.post("/api/invitations/:id/accept", requireAuth, proxyToWebsite);

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

      // Client attribution is companion-owned because the website strips these
      // fields from broker jobs. Handle it separately from the jobs UPDATE.
      const clientName = req.body.clientName ?? req.body.client_name;
      const clientEmail = req.body.clientEmail ?? req.body.client_email ?? '';
      const clientUserId = req.body.clientUserId ?? req.body.client_user_id ?? '';
      const companionEditKeys = new Set(['clientName', 'client_name', 'clientEmail', 'client_email', 'clientUserId', 'client_user_id']);
      const roleRow = await pool.query(
        `SELECT role::text AS role FROM users WHERE id::text = $1 LIMIT 1`,
        [auth.userId]
      );
      const isBroker = roleRow.rows[0]?.role === 'broker';
      if (clientName !== undefined) {
        if (!isBroker) return res.status(403).json({ message: "Broker access required to change a job's client" });
        const clientKey = String(clientUserId || '').trim();
        if (!clientKey) return res.status(400).json({ message: "Choose a client from your client list" });
        const clientErr = await verifyBrokerClient(auth, clientKey);
        if (clientErr) return res.status(clientErr.status).json({ message: clientErr.message });
      }

      // Validate project ownership before allowing a job to be relinked. Broker
      // projects must belong to this broker and the job's selected/current
      // client; contractor projects must belong to the editing contractor.
      const requestedProjectId = req.body.projectId ?? req.body.project_id;
      if (requestedProjectId !== undefined && requestedProjectId !== null && String(requestedProjectId)) {
        if (isBroker) {
          let clientKey = String(clientUserId || '').trim();
          if (!clientKey) {
            const currentLink = await pool.query(
              `SELECT client_key FROM broker_job_clients WHERE job_id::text = $1 AND broker_id = $2 LIMIT 1`,
              [req.params.id, auth.userId]
            );
            clientKey = String(currentLink.rows[0]?.client_key || '');
          }
          if (!clientKey) return res.status(400).json({ message: "Choose a client before changing the job name" });
          const permitted = await pool.query(
            `SELECT 1 FROM broker_client_projects
               WHERE id::text = $1 AND broker_id = $2 AND client_user_id = $3 AND deleted_at IS NULL
             UNION ALL
             SELECT 1 FROM contractor_projects
               WHERE id::text = $1 AND contractor_id::text = $3 AND deleted_at IS NULL
             LIMIT 1`,
            [String(requestedProjectId), auth.userId, clientKey]
          );
          if (!permitted.rows[0]) return res.status(403).json({ message: "That job name does not belong to the selected client" });
        } else {
          const permitted = await pool.query(
            `SELECT 1 FROM contractor_projects WHERE id::text = $1 AND contractor_id::text = $2 AND deleted_at IS NULL LIMIT 1`,
            [String(requestedProjectId), auth.userId]
          );
          if (!permitted.rows[0]) return res.status(403).json({ message: "That project does not belong to your account" });
        }
      }

      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;
      for (const [k, v] of Object.entries(req.body)) {
        if (v !== undefined && !companionEditKeys.has(k)) {
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
      // Persist client attribution only after the job update succeeds, so a
      // malformed job edit cannot leave the client changed on its own.
      if (clientName !== undefined) {
        await pool.query(
          `INSERT INTO broker_job_clients (job_id, broker_id, client_key, client_name, client_email)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (job_id) DO UPDATE SET
             broker_id = EXCLUDED.broker_id,
             client_key = EXCLUDED.client_key,
             client_name = EXCLUDED.client_name,
             client_email = EXCLUDED.client_email`,
          [req.params.id, auth.userId, String(clientUserId).trim(), String(clientName).trim(), String(clientEmail || '').trim()]
        );
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
          // Awaited: fire-and-forget after the response never runs on autoscale.
          for (const a of approvedAssignments.rows) {
            if (a.driver_id) {
              await sendPushNotification(String(a.driver_id), notifTitle, notifBody, { jobId: req.params.id, type: 'job_date_changed' }).catch(() => {});
            }
          }
        }
      }

      const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
      // Mirror EVERY update to the website, not just date changes. We share the DB
      // with the website, but the periodic sync (`syncJobs`) re-pulls jobs from the
      // website and upserts them, overwriting any column the website doesn't know
      // about with its stale value. If we only push on date changes, a time-only
      // edit (pickup_time) survives locally until the next sync, then reverts to
      // the website's old value on refresh. Pushing all updates keeps them in sync.
      if (updates.length > 0) {
        // The website's PUT validation is strict about key casing AND value
        // types (proven empirically via sync_queue replays): keys must be
        // camelCase, decimal/numeric columns must be strings ("32.3"), and
        // integer columns must be numbers (estimatedTrips: 3). A snake_case
        // body or a wrongly-typed value gets HTTP 400 "Validation error", the
        // push never lands, and the next periodic down-sync reverts the edit.
        // Sourcing values from the freshly-updated DB row guarantees correct
        // types, because pg returns numeric columns as strings and integer
        // columns as numbers — the same column types the website validates
        // against (shared schema).
        const updatedRow = result.rows[0] || {};
        const pushBody: Record<string, any> = {};
        for (const k of Object.keys(req.body)) {
          if (req.body[k] === undefined) continue;
          if (companionEditKeys.has(k)) continue;
          // Companion-only return-leg fields: the website doesn't know them and
          // its strict validation would 400 the whole push, reverting the edit.
          if (COMPANION_ONLY_JOB_KEYS.has(k)) continue;
          const col = camelToSnake(k);
          let v = Object.prototype.hasOwnProperty.call(updatedRow, col) ? updatedRow[col] : req.body[k];
          if (v instanceof Date) {
            v = col === 'scheduled_date' ? v.toISOString().slice(0, 10) : v.toISOString();
          }
          pushBody[snakeToCamel(k)] = v;
        }
        pushToWebsite(`/api/jobs/${req.params.id}`, auth, { method: "PUT", body: pushBody }).catch(() => {});
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

  // Shared gate for EVERY application-creation path (accept, counter-bid, …):
  // a private job (or a broker job not yet classified — NULL visibility fails
  // closed) rejects applications unless the applicant already participates,
  // holds a live sent assignment, is invited, or public overflow openings
  // remain. Returns an error message to send as 403, or null when allowed.
  async function privateJobApplicationBlock(jobId: string, userId: string): Promise<string | null> {
    try {
      const visFeats = await getVisibilityFeatures(pool);
      if (!visFeats.jobsVisibility) return null;
      const jr = await pool.query(
        `SELECT id, contractor_id, driver_id, project_id, visibility::text AS visibility${visFeats.publicPositionsRemaining ? ", public_positions_remaining" : ""}
         FROM jobs WHERE id = $1`,
        [jobId]
      );
      const job = jr.rows[0];
      if (!job) return null; // let the caller's own not-found handling run
      let participant = String(job.contractor_id) === String(userId);
      if (!participant) {
        const aChk = await pool.query(
          `SELECT 1 FROM job_assignments ja WHERE ja.job_id = $1 AND ja.driver_id::text = $2
           AND ja.status::text NOT IN ('rejected','withdrawn','cancelled','expired')
           AND (ja.sent_at IS NOT NULL OR NOT EXISTS (
             SELECT 1 FROM users _bu WHERE _bu.id::text = $3::text AND _bu.role::text = 'broker'))
           LIMIT 1`,
          [jobId, userId, String(job.contractor_id)]
        );
        participant = aChk.rows.length > 0;
      }
      const allowed = await canViewPrivateJob(pool, visFeats, job, userId, participant);
      return allowed ? null : "This job is private and not accepting public applications.";
    } catch (e: any) {
      console.error("privateJobApplicationBlock error:", e.message);
      // Fail closed only when we know the feature is active; on unexpected
      // errors keep legacy behavior rather than blocking all applications.
      return null;
    }
  }

  app.post("/api/jobs/:id/accept", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const { vehicleIds } = req.body || {};

      // Look up the job + caller's favorite status BEFORE writing any assignments,
      // so we can enforce the auto-approval truck cap.
      const acceptVisibilityFeatures = await getVisibilityFeatures(pool);
      const visibilitySelect = acceptVisibilityFeatures.jobsVisibility
        ? `, visibility`
        : `, NULL::text AS visibility`;
      const jobRow = await pool.query(
        `SELECT id, contractor_id, driver_id, project_id${visibilitySelect},
                COALESCE(trucks_needed, 1)::int AS trucks_needed
         FROM jobs WHERE id = $1`,
        [req.params.id]
      );
      if (!jobRow.rows[0]) return res.status(404).json({ message: "Job not found" });
      const contractorId = jobRow.rows[0]?.contractor_id;
      const trucksNeeded = Number(jobRow.rows[0]?.trucks_needed) || 1;
      const isOwnPostedJob = String(contractorId) === auth.userId;

      // Self-application is allowed only while the account is actively acting
      // as a trucking company. Broker mode manages its own posting through the
      // roster assignment flow. Private/NULL jobs remain roster-only.
      if (isOwnPostedJob) {
        const fleetRole = await pool.query(
          `SELECT role::text AS role FROM users WHERE id::text = $1 LIMIT 1`,
          [auth.userId]
        );
        const baseRole = String(fleetRole.rows[0]?.role || "");
        const fleetEntitled = allowedRolesForUser(baseRole).includes("trucking_company");
        const activeRole = String(auth.user?.role || "");
        const activeFleetMode =
          activeRole === "trucking_company" ||
          (activeRole === baseRole && fleetEntitled);
        // Legacy project-backed marketplace jobs use NULL to mean public.
        // Broker roster jobs are project-less, so they still fail closed after
        // any later account-role change unless explicitly made public.
        const visibility = jobRow.rows[0].visibility;
        const legacyContractorProject = visibility == null && !!jobRow.rows[0].project_id
          ? await pool.query(
              `SELECT 1 FROM contractor_projects WHERE id::text = $1::text LIMIT 1`,
              [String(jobRow.rows[0].project_id)]
            )
          : null;
        const publicFleetJob =
          visibility === "public" ||
          (visibility == null && !!legacyContractorProject?.rows[0]);
        if (!activeFleetMode || !fleetEntitled || !publicFleetJob) {
          return res.status(403).json({ message: "Switch to Trucking Company mode and make this job public before applying a truck" });
        }
        if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
          return res.status(400).json({ message: "Select at least one truck" });
        }
      }

      // Private jobs (broker roster-only work) cannot take public applications.
      const privateBlock = await privateJobApplicationBlock(req.params.id, auth.userId);
      if (privateBlock) return res.status(403).json({ message: privateBlock });

      // Never trust vehicle ids supplied by the client. Every selected truck
      // must be active and belong to this account (owned fleet truck or a truck
      // assigned directly to this driver).
      if (Array.isArray(vehicleIds) && vehicleIds.length > 0) {
        const uniqueVehicleIds = [...new Set(vehicleIds.map((v: any) => String(v)))];
        if (uniqueVehicleIds.length !== vehicleIds.length) {
          return res.status(400).json({ message: "Select each truck only once" });
        }
        const ownedVehicles = await pool.query(
          `SELECT id::text AS id FROM trucks
           WHERE id::text = ANY($1::text[])
             AND (trucking_company_id::text = $2 OR assigned_driver_id::text = $2)
             AND COALESCE(is_active, true) = true
             AND archived_at IS NULL`,
          [uniqueVehicleIds, auth.userId]
        );
        if (ownedVehicles.rows.length !== uniqueVehicleIds.length) {
          return res.status(403).json({ message: "One or more selected trucks do not belong to your account" });
        }
      }

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

      // Fleets (trucking companies) run multiple trucks/drivers, so they're exempt
      // from the DRIVER-level double-booking guard and driver-level auto-withdraw —
      // only the per-truck guard applies. Computed once for reuse below.
      const callerIsFleet = isAutoApprove ? await isFleetAccount(auth.userId) : false;

      // Double-booking guard: an auto-approved application is committed immediately
      // and the flip below approves ALL of this driver's pending assignments on the
      // job, not just the trucks in this request. So reject up-front if any truck
      // that will become approved — newly requested OR already pending on this job —
      // is already approved on an overlapping job. Plain (non-auto) applications stay
      // pending and are guarded at approval time instead.
      if (isAutoApprove) {
        const pendingRows = await pool.query(
          `SELECT vehicle_id FROM job_assignments WHERE job_id = $1 AND driver_id = $2 AND status::text = 'pending' AND vehicle_id IS NOT NULL`,
          [req.params.id, auth.userId]
        );
        const vidsToApprove = [
          ...(Array.isArray(vehicleIds) ? vehicleIds : []),
          ...pendingRows.rows.map((r: any) => r.vehicle_id),
        ];
        const conflicts = await findApprovedTruckConflicts(vidsToApprove, String(req.params.id));
        if (conflicts.length > 0) {
          return res.status(409).json({ message: bookingConflictMessage(conflicts), conflicts });
        }
        // Driver double-booking: a SOLO driver can't be approved on two overlapping
        // jobs. Fleets are exempt — they can run different trucks from their fleet on
        // overlapping jobs (the per-truck guard above still blocks the SAME truck).
        if (!callerIsFleet) {
          const driverConflicts = await findApprovedDriverConflicts([auth.userId], String(req.params.id));
          if (driverConflicts.length > 0) {
            return res.status(409).json({ message: driverConflictMessage(driverConflicts, true), conflicts: driverConflicts });
          }
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
        const autoApproveUpdate = await pool.query(
          `UPDATE job_assignments SET status = 'approved', approved_at = NOW() WHERE job_id = $1 AND driver_id = $2 AND status::text = 'pending'`,
          [req.params.id, auth.userId]
        );
        await pool.query(`UPDATE jobs SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [req.params.id]);
        // Auto-approved applicant: pull their other overlapping PENDING applications.
        // Fleets only pull the SAME truck's other pending apps (driverIds omitted) so a
        // company can keep DIFFERENT trucks pending on overlapping jobs.
        await withdrawConflictingPendingApplications(String(req.params.id), Array.isArray(vehicleIds) ? vehicleIds : [], callerIsFleet ? [] : [auth.userId], auth);
        autoApproved = true;
        // Auto-approval also means the driver got the job — same cash-register
        // alert + in-app row as a contractor approval. Only when the UPDATE
        // actually flipped pending → approved (idempotent on retries).
        if ((autoApproveUpdate.rowCount || 0) > 0) {
          const jobRowForAward = await pool.query(`SELECT material FROM jobs WHERE id = $1`, [req.params.id]);
          // Awaited: fire-and-forget after the response never runs on autoscale.
          await notifyDriverJobAwarded(String(auth.userId), String(req.params.id), jobRowForAward.rows[0]?.material).catch(() => {});
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
        // Create an in-app notification row so the contractor sees it in the
        // notifications list with an unread badge on the bell (not just a push).
        try {
          await pool.query(
            `INSERT INTO notifications (id, user_id, type, title, message, job_id, is_read, created_at)
             VALUES ($1, $2, 'new_load', $3, $4, $5, false, NOW())`,
            [crypto.randomUUID(), contractorId, notifTitle, notifBody, req.params.id]
          );
        } catch (e: any) {
          console.error("Job-application notification insert error:", e.message);
        }
        // Standard notification sound on the contractor's device for new
        // applications (the truck horn is reserved for alerting drivers to new
        // jobs in their area, not for application receipts).
        // Awaited: fire-and-forget after the response never runs on autoscale.
        await sendPushNotification(contractorId, notifTitle, notifBody, { jobId: req.params.id, type: 'job_application' }).catch(() => {});
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

      // Only APPROVED assignments block a truck — this must match the accept/approve
      // guards exactly (pending applications are only re-checked at approval time), or
      // the truck-select sheet would show a false "blocked" that the server then allows.
      const assignResult = await pool.query(
        `SELECT ja.*, j.scheduled_date, j.estimated_days, j.material as job_material,
                j.includes_weekends, j.includes_saturday, j.includes_sunday FROM job_assignments ja
         JOIN jobs j ON ja.job_id = j.id
         WHERE ja.vehicle_id IS NOT NULL AND ja.job_id != $1
         AND j.status::text IN ('open', 'in_progress', 'pending', 'accepted')
         AND ja.status::text = 'approved'`,
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

      // Use the SAME date expansion as the accept-time guards so the truck-select
      // sheet's warnings never disagree with what the server will actually allow.
      const jobDateKeys: string[] = job?.scheduled_date
        ? getJobDateRange(
            job.scheduled_date,
            Number(job.estimated_days) || 1,
            !!job.includes_weekends,
            job.includes_saturday !== false,
            job.includes_sunday !== false,
          )
        : [];

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
          const aDates = getJobDateRange(
            a.scheduled_date,
            Number(a.estimated_days) || 1,
            !!a.includes_weekends,
            a.includes_saturday !== false,
            a.includes_sunday !== false,
          );
          for (const dKey of aDates) {
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
      // A poster cannot bid against their own job. Public broker self-application
      // must use /accept with an active owned truck; private jobs remain roster-only.
      const ownerCheck = await pool.query(
        `SELECT contractor_id FROM jobs WHERE id = $1`,
        [req.params.id]
      );
      if (!ownerCheck.rows[0]) return res.status(404).json({ message: "Job not found" });
      if (String(ownerCheck.rows[0].contractor_id) === auth.userId) {
        return res.status(403).json({ message: "You cannot counteroffer on your own job" });
      }
      const privateBlock = await privateJobApplicationBlock(req.params.id, auth.userId);
      if (privateBlock) return res.status(403).json({ message: privateBlock });
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
      // Double-booking guard: don't approve a truck OR driver already approved on an overlapping job.
      const vRow = await pool.query(`SELECT vehicle_id, driver_id FROM job_assignments WHERE id = $1 AND job_id = $2`, [req.params.assignmentId, req.params.id]);
      const approveVid = vRow.rows[0]?.vehicle_id;
      const approveDid = vRow.rows[0]?.driver_id;
      // Fleets can run different trucks on overlapping jobs, so the driver-level guard
      // and driver-level auto-withdraw below don't apply to them (per-truck guard does).
      const approvedIsFleet = await isFleetAccount(approveDid);
      if (approveVid) {
        const conflicts = await findApprovedTruckConflicts([approveVid], String(req.params.id));
        if (conflicts.length > 0) {
          return res.status(409).json({ message: bookingConflictMessage(conflicts), conflicts });
        }
      }
      if (approveDid && !approvedIsFleet) {
        const driverConflicts = await findApprovedDriverConflicts([approveDid], String(req.params.id));
        if (driverConflicts.length > 0) {
          return res.status(409).json({ message: driverConflictMessage(driverConflicts, false), conflicts: driverConflicts });
        }
      }
      // Only rows actually transitioning to 'approved' count — a repeated
      // approve call (retry/double-tap) matches 0 rows, so the awarded
      // notification below can't be duplicated.
      const approveUpdate = await pool.query(
        `UPDATE job_assignments SET status = 'approved', approved_at = NOW()
         WHERE id = $1 AND job_id = $2 AND status::text <> 'approved'`,
        [req.params.assignmentId, req.params.id]
      );
      await pool.query(`UPDATE jobs SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [req.params.id]);
      // Pull this truck/driver's other overlapping PENDING applications so a second
      // contractor never opens an application that can only 409 ("already booked").
      await withdrawConflictingPendingApplications(String(req.params.id), [approveVid], approvedIsFleet ? [] : [approveDid], auth);
      pushToWebsite(`/api/job-assignments/${req.params.assignmentId}/approve`, auth, { method: "POST" }).catch(() => {});
      // Cash-register alert: the driver was awarded the job. Only fires when
      // the UPDATE above actually transitioned the row (idempotent on retries).
      if (approveDid && (approveUpdate.rowCount || 0) > 0) {
        const jobRow = await pool.query(`SELECT material FROM jobs WHERE id = $1`, [req.params.id]);
        // Awaited: fire-and-forget after the response never runs on autoscale.
        await notifyDriverJobAwarded(String(approveDid), String(req.params.id), jobRow.rows[0]?.material).catch(() => {});
      }
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
        `SELECT ja.driver_id, ja.job_id, j.contractor_id FROM job_assignments ja
         JOIN jobs j ON ja.job_id = j.id
         WHERE ja.id = $1`,
        [req.params.assignmentId]
      );
      if (aRow.rows.length === 0) return res.status(404).json({ message: "Assignment not found" });
      const { driver_id, contractor_id, job_id: assignmentJobId } = aRow.rows[0];
      if (String(contractor_id) !== auth.userId && String(driver_id) !== auth.userId) {
        return res.status(403).json({ message: "You do not have permission to modify this assignment" });
      }
      const { vehicleId, vehicle_id } = req.body;
      const vid = vehicleId || vehicle_id;
      // Double-booking guard: don't attach a truck already approved on an overlapping job.
      if (vid) {
        const conflicts = await findApprovedTruckConflicts([vid], assignmentJobId);
        if (conflicts.length > 0) {
          return res.status(409).json({ message: bookingConflictMessage(conflicts), conflicts });
        }
      }
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
        `SELECT id, scheduled_date, pickup_time, origin_lat, origin_lng, destination_lat, destination_lng,
                haul_both_ways, return_origin_lat, return_origin_lng, return_destination_lat, return_destination_lng
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

      // NOTE: No time-of-day clock-in window is enforced. A driver may clock in
      // at ANY time (24/7) on the job day. The pickup time is the scheduled start
      // shown to drivers — informational only, not a hard gate.
      //
      // The only remaining timing guard is at the DAY level: you can't clock into
      // a job that hasn't started yet. We compare calendar DATES with a full day
      // of slack instead of the driver's exact timezone (which we can't trust) —
      // no local timezone is ever a full day off from UTC, so a legitimate
      // clock-in on the scheduled day is never wrongly blocked, while clocking
      // into a job days early is. Clocking in late (on/after the job day) is
      // always allowed.
      if (job.scheduled_date) {
        const dateStr = String(job.scheduled_date).substring(0, 10);
        const [y, m, d] = dateStr.split('-').map(Number);
        if (y && m && d) {
          const scheduledDayUTC = Date.UTC(y, m - 1, d);
          const earliestAllowed = scheduledDayUTC - 24 * 60 * 60 * 1000; // 1-day tz slack
          if (startedAt.getTime() < earliestAllowed) {
            const startStr = new Date(scheduledDayUTC).toLocaleDateString('en-US', {
              timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
            });
            return res.status(400).json({
              code: "NOT_STARTED",
              message: `This job starts ${startStr}. You can clock in any time on the job day.`,
              scheduledStartAt: new Date(scheduledDayUTC).toISOString(),
            });
          }
        }
      }

      // Rule: must be within 15 ROAD miles (driving distance, not straight-line)
      // of pickup, dropoff, or anywhere along the route between them.
      const startLat = req.body?.lat ?? req.body?.start_lat ?? null;
      const startLng = req.body?.lng ?? req.body?.start_lng ?? null;
      const GEOFENCE_MILES = 15;

      const oLat = job.origin_lat ? Number(job.origin_lat) : null;
      const oLng = job.origin_lng ? Number(job.origin_lng) : null;
      const dLat = job.destination_lat ? Number(job.destination_lat) : null;
      const dLng = job.destination_lng ? Number(job.destination_lng) : null;
      // "Haul Both Ways" jobs have a second leg — its points count as valid
      // clock-in locations too.
      const bothWays = job.haul_both_ways === true;
      const roLat = bothWays && job.return_origin_lat ? Number(job.return_origin_lat) : null;
      const roLng = bothWays && job.return_origin_lng ? Number(job.return_origin_lng) : null;
      const rdLat = bothWays && job.return_destination_lat ? Number(job.return_destination_lat) : null;
      const rdLng = bothWays && job.return_destination_lng ? Number(job.return_destination_lng) : null;
      const hasReturnCoords = (roLat != null && roLng != null) || (rdLat != null && rdLng != null);
      const hasJobCoords = (oLat != null && oLng != null) || (dLat != null && dLng != null) || hasReturnCoords;

      if (hasJobCoords) {
        if (startLat == null || startLng == null) {
          return res.status(400).json({
            code: "LOCATION_REQUIRED",
            message: "Location is required to clock in. Enable location and try again.",
          });
        }
        const driverLat = Number(startLat);
        const driverLng = Number(startLng);
        // Treat (0,0) as "no location": it's a real point in the ocean off
        // Africa that older clients sent as a failure fallback, which made the
        // geofence report a bogus ~6000 miles. Ask for a real fix instead.
        if (isNaN(driverLat) || isNaN(driverLng) || (driverLat === 0 && driverLng === 0)) {
          return res.status(400).json({
            code: "LOCATION_REQUIRED",
            message: "Location is required to clock in. Enable location and try again.",
          });
        }
        // Straight-line distance first: it's free, and since roads are never
        // shorter than the crow flies, a driver within ~1 air mile is always
        // in range — no need to burn a Directions call. For "Haul Both Ways"
        // jobs the return leg counts too — take the minimum across both legs.
        const legAir = [
          airMilesToLeg(driverLat, driverLng, oLat, oLng, dLat, dLng),
          hasReturnCoords ? airMilesToLeg(driverLat, driverLng, roLat, roLng, rdLat, rdLng) : null,
        ].filter((m): m is number => m != null);
        const airMiles = Math.min(...legAir);
        if (airMiles > 1) {
          const target = (oLat != null && oLng != null && dLat != null && dLng != null) ? "job route" : "job site";
          const legRoad = await Promise.all([
            roadMilesToJobArea(driverLat, driverLng, oLat, oLng, dLat, dLng),
            hasReturnCoords ? roadMilesToJobArea(driverLat, driverLng, roLat, roLng, rdLat, rdLng) : Promise.resolve(null),
          ]);
          const validRoad = legRoad.filter((m): m is number => m != null);
          const roadMiles = validRoad.length > 0 ? Math.min(...validRoad) : null;
          if (roadMiles != null) {
            if (roadMiles > GEOFENCE_MILES) {
              return res.status(403).json({
                code: "OUT_OF_GEOFENCE",
                message: `You're ${roadMiles.toFixed(1)} road miles from the ${target}. Clock-in is allowed within ${GEOFENCE_MILES} road miles of pickup, dropoff, or anywhere along the route.`,
                distanceMiles: Math.round(roadMiles * 10) / 10,
                geofenceMiles: GEOFENCE_MILES,
              });
            }
          } else if (airMiles > GEOFENCE_MILES) {
            // Directions API unavailable — fall back to straight-line so an
            // outage never blocks a legitimate on-site clock-in.
            return res.status(403).json({
              code: "OUT_OF_GEOFENCE",
              message: `You're ${airMiles.toFixed(1)} miles from the ${target}. Clock-in is allowed within ${GEOFENCE_MILES} road miles of pickup, dropoff, or anywhere along the route.`,
              distanceMiles: Math.round(airMiles * 10) / 10,
              geofenceMiles: GEOFENCE_MILES,
            });
          }
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
      const runRow = await pool.query(`SELECT job_id, driver_id, started_at FROM job_runs WHERE id = $1`, [req.params.runId]);
      if (runRow.rows.length === 0) return res.status(404).json({ message: "Run not found" });
      const { job_id: jobIdForEnd, driver_id: runDriverId, started_at: runStartedAt } = runRow.rows[0];
      if (String(runDriverId) !== auth.userId) {
        const contractorCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [jobIdForEnd]);
        if (!contractorCheck.rows[0] || String(contractorCheck.rows[0].contractor_id) !== auth.userId) {
          return res.status(403).json({ message: "You do not have permission to clock out this run" });
        }
      }

      // Persist everything the client submits on clock-out. The previous version
      // only set status + ended_at=NOW() and dropped the body, so loads_hauled,
      // the end location, any manually-adjusted clock-out time, and the billed
      // snapshot were all lost — loads showed 0 and earnings fell back to raw
      // elapsed time instead of billed time.
      const body: any = req.body || {};
      const now = new Date();
      const customTime = body.custom_time || body.customTime || null;
      let endedAt = customTime ? new Date(customTime) : now;
      if (isNaN(endedAt.getTime())) endedAt = now;

      let actualMin: number | null = null;
      let billedMin: number | null = null;
      if (runStartedAt) {
        actualMin = Math.max(0, Math.round((endedAt.getTime() - new Date(runStartedAt).getTime()) / 60000));
        billedMin = billedMinutesFrom(actualMin);
      }
      const loads = body.loads_hauled != null ? Number(body.loads_hauled)
        : body.loadsHauled != null ? Number(body.loadsHauled) : null;
      const endLat = body.lat != null ? Number(body.lat)
        : body.end_lat != null ? Number(body.end_lat) : null;
      const endLng = body.lng != null ? Number(body.lng)
        : body.end_lng != null ? Number(body.end_lng) : null;

      await pool.query(
        `UPDATE job_runs SET
           status = 'completed',
           ended_at = $2,
           actual_duration_minutes = COALESCE($3::int, actual_duration_minutes),
           billed_duration_minutes = COALESCE($4::int, billed_duration_minutes),
           loads_hauled = COALESCE($5::int, loads_hauled),
           end_lat = COALESCE($6::numeric, end_lat),
           end_lng = COALESCE($7::numeric, end_lng),
           updated_at = NOW()
         WHERE id = $1`,
        [req.params.runId, endedAt, actualMin, billedMin, loads, endLat, endLng]
      );
      if (jobIdForEnd) {
        pushToWebsite(`/api/jobs/${jobIdForEnd}/end`, auth, { method: "POST", body: { ...(body || {}), runId: req.params.runId } }).catch(() => {});
      }
      const result = await pool.query(`SELECT * FROM job_runs WHERE id = $1`, [req.params.runId]);
      return res.json(addDualKeys(result.rows[0] || { id: req.params.runId }));
    } catch (e: any) {
      console.error("Clock-out error:", e.message);
      return res.status(500).json({ message: "Failed to clock out" });
    }
  });

  // Truck Down — a driver flags that their truck is down on a job they're
  // assigned to. status: 'back_shortly' | 'out_for_day' to set, null/'up' to
  // clear. Posts a status message to the job thread, notifies the contractor,
  // and (for 'out_for_day') clocks the driver out of today's active run.
  app.post("/api/jobs/:id/truck-down", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const jobId = req.params.id;
      const rawStatus = req.body?.status;
      const clearing = rawStatus == null || rawStatus === 'up' || rawStatus === '';
      const VALID = new Set(['back_shortly', 'out_for_day']);
      if (!clearing && !VALID.has(rawStatus)) {
        return res.status(400).json({ message: "Invalid truck-down status" });
      }
      const newStatus: string | null = clearing ? null : rawStatus;

      // Caller must be an APPROVED driver on this job (not merely a pending
      // applicant) — only the actually-assigned driver may flag truck-down,
      // post to the thread, and notify the contractor.
      const assignRes = await pool.query(
        `SELECT id FROM job_assignments WHERE job_id = $1 AND driver_id = $2
         AND status::text IN ('approved','accepted')
         ORDER BY created_at DESC LIMIT 1`,
        [jobId, auth.userId]
      );
      if (assignRes.rows.length === 0) {
        return res.status(403).json({ message: "You are not assigned to this job" });
      }
      const assignmentId = assignRes.rows[0].id;

      await pool.query(
        `UPDATE job_assignments
         SET truck_down_status = $1::text,
             truck_down_at = CASE WHEN $1::text IS NULL THEN NULL ELSE NOW() END
         WHERE id = $2`,
        [newStatus, assignmentId]
      );

      // "Out for the day" stops today's clock if one is running.
      if (newStatus === 'out_for_day') {
        const activeRun = await pool.query(
          `SELECT id FROM job_runs WHERE job_id = $1 AND driver_id = $2 AND status::text = 'active'
           AND started_at::date = CURRENT_DATE
           ORDER BY created_at DESC LIMIT 1`,
          [jobId, auth.userId]
        );
        if (activeRun.rows.length > 0) {
          const runId = activeRun.rows[0].id;
          await pool.query(
            `UPDATE job_runs SET status = 'completed', ended_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [runId]
          );
          pushToWebsite(`/api/jobs/${jobId}/end`, auth, { method: "POST", body: { runId } }).catch(() => {});
        }
      }

      // Human-readable status for the thread + notification.
      const driverRow = await pool.query(`SELECT full_name FROM users WHERE id = $1`, [auth.userId]);
      const driverName = driverRow.rows[0]?.full_name || 'The driver';
      let messageBody: string;
      let notifTitle: string;
      if (newStatus === 'back_shortly') {
        messageBody = `🔧 Truck Down — ${driverName} will be back with you shortly.`;
        notifTitle = 'Truck Down';
      } else if (newStatus === 'out_for_day') {
        messageBody = `🔧 Truck Down — ${driverName} is out for the day.`;
        notifTitle = 'Truck Down';
      } else {
        messageBody = `✅ ${driverName}'s truck is back up and running.`;
        notifTitle = 'Truck Back Up';
      }

      // Post into the job message thread (local + website sync).
      const msgId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO job_messages (id, job_id, sender_id, body, read, created_at) VALUES ($1, $2, $3, $4, false, NOW())`,
        [msgId, jobId, auth.userId, messageBody]
      );
      pushToWebsite(`/api/jobs/${jobId}/messages`, auth, { method: "POST", body: { body: messageBody } }).catch(() => {});

      // Notify the contractor who posted the job.
      const jobRow = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [jobId]);
      const contractorId = jobRow.rows[0]?.contractor_id;
      if (contractorId && String(contractorId) !== auth.userId) {
        await pool.query(
          `INSERT INTO notifications (id, user_id, type, title, message, job_id, is_read, created_at)
           VALUES ($1, $2, 'general', $3, $4, $5, false, NOW())`,
          [crypto.randomUUID(), contractorId, notifTitle, messageBody, jobId]
        );
      }

      return res.json(addDualKeys({
        id: assignmentId,
        truck_down_status: newStatus,
        truck_down_at: newStatus ? new Date().toISOString() : null,
      }));
    } catch (e: any) {
      console.error("Truck-down error:", e.message);
      return res.status(500).json({ message: "Failed to update truck status" });
    }
  });

  app.patch("/api/job-runs/:runId", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const runRow = await pool.query(`SELECT driver_id, job_id, started_at, ended_at FROM job_runs WHERE id = $1`, [req.params.runId]);
      if (runRow.rows.length === 0) return res.status(404).json({ message: "Run not found" });
      const { driver_id: runDriverId, job_id: runJobId, started_at: existingStart, ended_at: existingEnd } = runRow.rows[0];
      if (String(runDriverId) !== auth.userId) {
        const contractorCheck = await pool.query(`SELECT contractor_id FROM jobs WHERE id = $1`, [runJobId]);
        if (!contractorCheck.rows[0] || String(contractorCheck.rows[0].contractor_id) !== auth.userId) {
          return res.status(403).json({ message: "You do not have permission to update this run" });
        }
      }
      // When a run's times are edited, recompute the billed-duration snapshot so
      // earnings and the job summary stay in sync with the new start/end.
      const body: any = { ...req.body };
      if ('started_at' in body || 'ended_at' in body || 'startedAt' in body || 'endedAt' in body) {
        const s = body.started_at ?? body.startedAt ?? existingStart;
        const e = body.ended_at ?? body.endedAt ?? existingEnd;
        if (s && e) {
          const sd = new Date(s), ed = new Date(e);
          if (!isNaN(sd.getTime()) && !isNaN(ed.getTime()) && ed.getTime() > sd.getTime()) {
            const actual = Math.max(0, Math.round((ed.getTime() - sd.getTime()) / 60000));
            body.actual_duration_minutes = actual;
            body.billed_duration_minutes = billedMinutesFrom(actual);
          }
        }
      }
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;
      for (const [k, v] of Object.entries(body)) {
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
        [id, req.params.runId, jobId, auth.userId, req.body.weightValue || req.body.weight_value, req.body.notes, req.body.imageData || req.body.image_data || req.body.image_base64 || req.body.imageBase64]
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
    // Lazy hydration also repairs pre-existing sessions minted before login
    // started merging the DB row into the session user.
    await hydrateUserFromDb(auth.user);
    return res.json(userPayload(auth.user, auth.originalRole));
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
      "address",
      "city",
      "state",
      "zipCode", "zip_code",
      "alsoDriver", "also_driver",
      "notificationPreferences", "notification_preferences",
      "expoPushToken", "expo_push_token",
      "confirmationSoundEnabled", "confirmation_sound_enabled",
    ]);

    const safeBody: Record<string, any> = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (PROFILE_ALLOWLIST.has(k)) {
        safeBody[k] = v;
      }
    }

    // "I also drive" (also_driver) makes an account driver-discoverable
    // (/api/drivers/search treats also_driver = true as driver-eligible), so it
    // must be gated to trucking-company-type accounts server-side — the UI
    // gating is not a security control. Reject the write for any other account.
    if ('also_driver' in safeBody || 'alsoDriver' in safeBody) {
      const accountRole = String(auth.originalRole || auth.user?.role || '');
      if (!accountRole.includes('trucking_company')) {
        return res.status(403).json({ message: "Only trucking company accounts can enable 'I also drive'." });
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
    return res.json(userPayload(auth.user, auth.originalRole));
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
    return res.json(userPayload(auth.user, auth.originalRole));
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
    const entitlementRoles = allowedRolesForUser(String(baseRole));
    // The three self-serve company roles are all sign-up-eligible and carry the
    // same trust level, so an account holding one of them may change to any of
    // the three. This is how a user fixes a role they picked wrong at sign-up.
    // Driver/foreman are invite-only and linked to a parent account, so they are
    // NEVER a valid switch target here — they're only reachable via invitation.
    const SELF_SERVE_COMPANY_ROLES = ["trucking_company", "contractor", "trucking_company_contractor", "broker"];
    const permitted = new Set<string>(entitlementRoles);
    if (SELF_SERVE_COMPANY_ROLES.includes(String(baseRole))) {
      SELF_SERVE_COMPANY_ROLES.forEach((r) => permitted.add(r));
    }
    if (!permitted.has(String(role))) {
      return res.status(403).json({ message: "You are not authorized to switch to this role." });
    }
    auth.user.role = role;
    // Persist a genuine account-type change so it survives re-login (users.role
    // is the entitlement source both this app and the website read at login).
    // But keep a compound account's view-switch (e.g. a
    // driver_trucking_company_contractor toggling between its component views)
    // session-only — persisting one component would collapse the compound
    // entitlement and trap the account. Dev-local sessions are never persisted.
    const isCompoundViewSwitch = entitlementRoles.length > 1 && entitlementRoles.includes(String(role));
    if (!String(auth.jwt).startsWith("dev-local:") && !isCompoundViewSwitch) {
      try {
        await pool.query(`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`, [role, auth.userId]);
        (auth as any).originalRole = role;
      } catch {}
      // The website keeps its OWN users record (separate from this DB) and
      // gates /api/broker/* etc. on it. If the role only changes here, the
      // website 403s broker/company endpoints while the app shows them —
      // jobs "disappear". Mirror the change upstream (PUT /api/users/:id is
      // the accepted endpoint; PUT /api/profile rejects role).
      try {
        const ur = await websiteFetch(`/api/users/${auth.userId}`, {
          method: "PUT",
          body: { role },
          jwt: auth.jwt,
        });
        if (!ur.ok) {
          console.error(`[RoleSync] Failed to push role '${role}' to website for ${auth.userId}: ${ur.status}`);
        }
      } catch (e: any) {
        console.error(`[RoleSync] Error pushing role to website:`, e.message);
      }
    }
    const localToken = req.headers.authorization?.slice(7) || "";
    if (localToken) {
      tokenToJwt.set(localToken, auth);
      saveJsonMap("sessions.json", tokenToJwt);
    }
    return res.json(userPayload(auth.user, auth.originalRole));
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
        WHERE (u.role LIKE '%driver%' OR u.also_driver = true OR u.id = $1)`;
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
      // The website writes assignment notifications without job_id, which
      // leaves them un-tappable in the app. Resolve the job from the message
      // ("assigned you a <material> job on <M/D/YYYY>") via this user's own
      // assignments and backfill the row so it only costs us once.
      for (const row of result.rows) {
        if (row.job_id || !row.message) continue;
        const m = String(row.message).match(/assigned you an? (.+?) job on (\d{1,2})\/(\d{1,2})\/(\d{4})/i);
        if (!m) continue;
        try {
          const [, material, mo, day, yr] = m;
          const jr = await pool.query(
            `SELECT j.id FROM jobs j
              JOIN job_assignments a ON a.job_id = j.id AND a.driver_id::text = $1
                AND a.status::text NOT IN ('declined','withdrawn','rejected')
             WHERE LOWER(j.material) = LOWER($2)
               AND j.scheduled_date::date = make_date($3::int, $4::int, $5::int)
             ORDER BY j.created_at DESC LIMIT 1`,
            [String(auth.userId), material.trim(), yr, mo, day]
          );
          if (jr.rows[0]?.id) {
            row.job_id = jr.rows[0].id;
            pool.query(`UPDATE notifications SET job_id = $1 WHERE id = $2`, [row.job_id, row.id]).catch(() => {});
          }
        } catch {}
      }
      // Return one synthetic, assignment-keyed confirmation item for every
      // sent broker assignment still awaiting a response. It is independent
      // of the 50-row inbox limit and never attaches controls to an unrelated
      // same-job notification. Once the driver responds, the pending row no
      // longer matches and this item disappears automatically.
      try {
        const pending = await pool.query(
          `SELECT ja.id::text AS assignment_id, ja.job_id::text AS job_id,
                  ja.sent_at, j.material, j.scheduled_date,
                  COALESCE(broker.company, broker.full_name, 'Your broker') AS broker_name
             FROM job_assignments ja
             JOIN jobs j ON j.id = ja.job_id
             JOIN users broker ON broker.id::text = j.contractor_id::text
            WHERE ja.driver_id::text = $1
              AND ja.status::text = 'pending'
              AND ja.sent_at IS NOT NULL
              AND broker.role::text = 'broker'
            ORDER BY ja.sent_at DESC`,
          [auth.userId]
        );
        for (const p of pending.rows) {
          const dateKey = p.scheduled_date instanceof Date
            ? p.scheduled_date.toISOString().slice(0, 10)
            : String(p.scheduled_date || "").slice(0, 10);
          const dayLabel = dateKey
            ? new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-US", {
                weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
              })
            : "the scheduled day";
          result.rows.unshift({
            id: `broker-assignment:${p.assignment_id}`,
            user_id: auth.userId,
            type: "new_load",
            title: "Instructions need confirmation",
            message: `${p.broker_name} assigned you to ${p.material || "a job"} on ${dayLabel}. Confirm that you can perform it.`,
            job_id: p.job_id,
            is_read: false,
            created_at: p.sent_at,
            pendingAssignmentIds: [String(p.assignment_id)],
            pending_assignment_ids: [String(p.assignment_id)],
          });
        }
      } catch (e: any) {
        console.error("GET /api/notifications assignment annotation error:", e.message);
      }
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

  // --- Driver / foreman invitations ---
  // The website has no delete endpoint for invitations and they live only in
  // the website's own DB, so "removing" one is a per-user hide list persisted
  // to .data/hidden_invitations.json. The invite email/link stays valid.
  const HIDDEN_INVITES_FILE = "hidden_invitations.json";
  const hiddenInvitesByUser: Record<string, string[]> = (() => {
    try {
      const parsed = JSON.parse(readFileSync(join(DATA_DIR, HIDDEN_INVITES_FILE), "utf-8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  })();
  function hideInvitationForUser(userId: string, inviteId: string) {
    const list = hiddenInvitesByUser[userId] || (hiddenInvitesByUser[userId] = []);
    if (!list.includes(inviteId)) list.push(inviteId);
    // Keep the per-user list bounded; only recent hides matter.
    if (list.length > 500) hiddenInvitesByUser[userId] = list.slice(list.length - 500);
    try {
      writeFileSync(join(DATA_DIR, HIDDEN_INVITES_FILE), JSON.stringify(hiddenInvitesByUser), "utf-8");
    } catch {}
  }

  // Invite a driver or foreman by email to create a LoadLink profile.
  // CREATE forwards to the website's /api/invitations so it can send the
  // accept-link email (an email side-effect the companion cannot replicate)
  // and own the acceptance flow. LIST reads the shared driver_invitations
  // table directly (local-first read pattern, no JWT dependency).
  app.post("/api/driver-invitations", requireAuth, async (req: Request, res: Response) => {
    const auth = getWebsiteAuth(req)!;
    // The role cached in the login session can lag behind the shared DB (the
    // website has returned e.g. 'contractor' for a trucking_company account),
    // so read the authoritative role from the DB and fall back to the session.
    let role = (auth.user?.role || '').toLowerCase();
    try {
      const dbRole = await pool.query(`SELECT role FROM users WHERE id = $1`, [auth.userId]);
      const r = (dbRole.rows[0]?.role || '').toLowerCase();
      if (r) role = r.includes(role) || !role ? r : `${r}_${role}`;
    } catch {}
    const canInvite = role.includes('contractor') || role.includes('trucking_company');
    if (!canInvite) {
      return res.status(403).json({ message: "Only contractors and trucking companies can send invitations." });
    }
    const email = (req.body?.email || req.body?.driverEmail || "").trim().toLowerCase();
    const type = (req.body?.type || req.body?.invitationType || "driver").trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ message: "A valid email address is required." });
    }
    if (type !== "driver" && type !== "foreman") {
      return res.status(400).json({ message: "Invitation type must be 'driver' or 'foreman'." });
    }
    // Enforce the parent-linkage model: trucking companies invite drivers,
    // contractors invite foremen (a combined role can do both). Client-side
    // gating is UX only; this server check is the source of truth so a crafted
    // request can't create an orphaned (unlinked) driver/foreman account.
    if (type === "driver" && !role.includes("trucking_company")) {
      return res.status(403).json({ message: "Only trucking companies can invite drivers." });
    }
    if (type === "foreman" && !role.includes("contractor")) {
      return res.status(403).json({ message: "Only contractors can invite foremen." });
    }
    const firstName = (req.body?.firstName || req.body?.driverFirstName || "").trim();
    const lastName = (req.body?.lastName || req.body?.driverLastName || "").trim();
    const phone = (req.body?.phone || req.body?.driverPhone || "").trim();
    const message = (req.body?.message || "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

    // Send both key cases so the website handler can read either format.
    const payload: any = {
      email, driverEmail: email, driver_email: email,
      invitationType: type, invitation_type: type, type,
    };
    if (firstName) { payload.driverFirstName = firstName; payload.driver_first_name = firstName; }
    if (lastName) { payload.driverLastName = lastName; payload.driver_last_name = lastName; }
    if (fullName) { payload.driverName = fullName; payload.driver_name = fullName; }
    if (phone) { payload.driverPhone = phone; payload.driver_phone = phone; }
    if (message) { payload.message = message; }

    try {
      const websiteRes = await websiteFetch("/api/invitations", {
        method: "POST",
        body: payload,
        jwt: auth.jwt,
      });
      const text = await websiteRes.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch {}
      if (!websiteRes.ok) {
        // Pass 401 through so the app's silent re-login + retry can kick in.
        if (websiteRes.status === 401) {
          return res.status(401).json({ message: "Your session expired. Please try again." });
        }
        const msg = data?.message || data?.error || "Could not send the invitation. Please try again.";
        return res.status(400).json({ message: msg });
      }
      return res.json(addDualKeys(data?.invitation || data || { ok: true }));
    } catch (e: any) {
      console.error("Invitation send error:", e.message);
      return res.status(502).json({ message: "Could not reach the LoadLink service to send the invitation." });
    }
  });

  app.get("/api/driver-invitations", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const role = (auth.user?.role || '').toLowerCase();
      if (!(role.includes('contractor') || role.includes('trucking_company'))) {
        return res.json([]);
      }
      // The website stores invitations in its own database (not the shared
      // driver_invitations table, which stays empty), so the list must be
      // proxied from the website API. Fall back to the local table only if
      // the website is unreachable (e.g. dev-local sessions).
      if (auth.jwt) {
        try {
          const websiteRes = await websiteFetch("/api/invitations", { jwt: auth.jwt });
          if (websiteRes.ok) {
            const data = await websiteRes.json();
            const list = Array.isArray(data) ? data : (data?.invitations || []);
            // The website list can contain duplicate rows for the same
            // invitation id; dedupe so the app doesn't render duplicates.
            const seen = new Set<string>();
            const hidden = new Set(hiddenInvitesByUser[String(auth.userId)] || []);
            const unique = list.filter((inv: any) => {
              const id = String(inv?.id ?? "");
              if (!id || seen.has(id) || hidden.has(id)) return false;
              seen.add(id);
              return true;
            });
            return res.json(unique.map(addDualKeys));
          }
          // Pass 401 through so the app's silent re-login + retry can kick in
          // instead of silently showing an empty list from the local fallback.
          if (websiteRes.status === 401) {
            return res.status(401).json({ message: "Your session expired. Please try again." });
          }
        } catch (e: any) {
          console.error("Website invitation list error:", e.message);
        }
      }
      const result = await pool.query(
        `SELECT * FROM driver_invitations
         WHERE contractor_id = $1 OR trucking_company_id = $1
         ORDER BY created_at DESC LIMIT 100`,
        [auth.userId]
      );
      const hiddenLocal = new Set(hiddenInvitesByUser[String(auth.userId)] || []);
      return res.json(result.rows.filter((r: any) => !hiddenLocal.has(String(r.id))).map(addDualKeys));
    } catch (e: any) {
      console.error("Invitation list error:", e.message);
      return res.json([]);
    }
  });

  // Remove an invitation from the sender's list. The website has no delete
  // endpoint, so this only hides it for the requesting user (per-user hide
  // list) — the emailed invite link itself remains valid.
  app.delete("/api/driver-invitations/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const inviteId = String(req.params.id || "").trim();
      if (!inviteId) return res.status(400).json({ message: "Missing invitation id." });
      hideInvitationForUser(String(auth.userId), inviteId);
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Invitation remove error:", e.message);
      return res.status(500).json({ message: "Could not remove the invitation. Please try again." });
    }
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
                    COALESCE(cp.name, bcp.name) as project_name,
                    u.full_name as driver_name
             FROM job_runs jr
             JOIN trucks t ON jr.vehicle_id = t.id
             JOIN jobs j ON jr.job_id = j.id
             LEFT JOIN users c ON j.contractor_id = c.id
             LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text
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
      // Compute "today" in the USER'S local timezone, not the server's UTC
      // clock. The client sends X-TZ-Offset (minutes from UTC, per JS
      // Date.getTimezoneOffset). Shifting now by that offset makes the Date's
      // UTC wall-clock read the user's local time, so setHours(0,0,0,0) lands on
      // the user's local midnight (server runs in UTC on Replit).
      const rawTz = Number(req.header("X-TZ-Offset"));
      const tzOffsetMin = Number.isFinite(rawTz) ? rawTz : 0;
      const today = new Date(Date.now() - tzOffsetMin * 60000);
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
      // Brokers get the same poster-centric widget: their posted jobs each
      // day with trucks-needed counts (the client renders a "N projects / M
      // trucks" summary per day).
      const isPosterView = isContractorOnly || role === 'broker';

      let userTrucks: any[] = [];
      let truckAssignments: any[] = [];
      let contractorJobsForDays: any[] = [];

      if (isPosterView) {
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
                    COALESCE(cp.name, bcp.name) AS project_name,
                    (SELECT COUNT(*)::int FROM job_assignments ja
                       WHERE ja.job_id = j.id AND ja.status::text = 'approved') AS trucks_assigned,
                    (SELECT COUNT(*)::int FROM job_assignments ja
                       WHERE ja.job_id = j.id) AS applications_count,
                    (SELECT COUNT(*)::int FROM job_runs jr
                       WHERE jr.job_id = j.id AND jr.status::text = 'active') AS active_run_count
               FROM jobs j
               LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text
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
               COALESCE(cp.name, bcp.name) AS project_name
             FROM job_assignments ja
             JOIN trucks t ON ja.vehicle_id = t.id
             JOIN jobs   j ON ja.job_id     = j.id
             LEFT JOIN users               contractor ON j.contractor_id = contractor.id
             LEFT JOIN contractor_projects cp         ON j.project_id    = cp.id
             LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text
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

        if (isPosterView) {
          // Contractor/broker view: each day lists posted jobs working that
          // day with truck-needed / booked / applied counts. No fleet-trucks UI.
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
              activeRunCount: j.active_run_count || 0,
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

      // Broker home card: per-day truck confirmation tallies (replaces the
      // location/status widgets client-side). Counts come from the upstream
      // broker jobs API, which is authoritative for sent/confirmed/declined.
      let brokerConfirmations: any[] | undefined;
      if (role === 'broker' && auth.jwt && !auth.jwt.startsWith('dev-local:')) {
        try {
          const jr = await websiteFetch("/api/broker/jobs", { method: "GET", jwt: auth.jwt });
          if (jr.ok) {
            const bJobs = await jr.json().catch(() => []);
            const byDay = new Map<string, { confirmed: number; sent: number; declined: number; jobs: number; held: number; heldJobIds: string[] }>();
            for (const job of Array.isArray(bJobs) ? bJobs : []) {
              const jd = String(job.scheduledDate || job.scheduled_date || "").slice(0, 10);
              if (!jd) continue;
              const s = job.assignmentStats || {};
              const cur = byDay.get(jd) || { confirmed: 0, sent: 0, declined: 0, jobs: 0, held: 0, heldJobIds: [] };
              cur.confirmed += Number(s.confirmed ?? s.confirmedCount) || 0;
              cur.sent += Number(s.sent ?? s.sentCount) || 0;
              cur.declined += Number(s.declined ?? s.declinedCount) || 0;
              cur.jobs += 1;
              // Held = assigned but instructions not sent yet. The jobs LIST
              // endpoint omits the assignments array, so use the stats.
              const heldHere = Number(s.held ?? s.heldCount) || 0;
              if (heldHere > 0) {
                cur.held += heldHere;
                cur.heldJobIds.push(String(job.id));
              }
              byDay.set(jd, cur);
            }
            brokerConfirmations = upcomingDays.map((d: any) => {
              const g = byDay.get(d.date) || { confirmed: 0, sent: 0, declined: 0, jobs: 0, held: 0, heldJobIds: [] };
              const totalOut = g.confirmed + g.sent;
              return {
                date: d.date,
                confirmed: g.confirmed,
                totalSent: totalOut,
                declined: g.declined,
                held: g.held,
                heldJobIds: g.heldJobIds,
                allConfirmed: totalOut > 0 && g.confirmed >= totalOut,
              };
            });
          }
        } catch (e: any) {
          console.error("Dashboard broker confirmations error:", e.message);
        }
      }

      const dashboard = {
        brokerConfirmations,
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

      let query = `SELECT j.*, COALESCE(cp.name, bcp.name) as project_name,
          COALESCE((SELECT COUNT(*)::int FROM job_assignments ja WHERE ja.job_id = j.id AND ja.status::text = 'pending'), 0) as pending_applications,
          COALESCE((SELECT COUNT(*)::int FROM job_assignments ja WHERE ja.job_id = j.id AND ja.status::text = 'approved'), 0) as approved_assignments,
          COALESCE((SELECT COUNT(*)::int FROM job_runs jr WHERE jr.job_id = j.id AND jr.status::text = 'active'), 0) as active_run_count
        FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text WHERE j.contractor_id = $1 AND j.archived_at IS NULL`;
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
          // A job counts as Active if its status is in_progress/accepted/pending
          // OR a truck is currently clocked in on it (active job_run), even while
          // the job's stored status is still 'open'. A completed/cancelled job is
          // never Active even if a stray active run exists.
          query += ` AND (j.status::text IN ('in_progress', 'accepted', 'pending')
            OR (j.status::text NOT IN ('completed', 'cancelled')
                AND EXISTS (SELECT 1 FROM job_runs jr WHERE jr.job_id = j.id AND jr.status::text = 'active')))`;
        } else if (statusLower === 'open') {
          // Exclude jobs being actively worked so they surface under Active
          // instead of Open (mirrors isOpenTabJob on the client).
          query += ` AND j.status::text IN ('open', 'accepted', 'pending')
            AND NOT EXISTS (SELECT 1 FROM job_runs jr WHERE jr.job_id = j.id AND jr.status::text = 'active')`;
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
      const truckType = req.query.truck_type as string | undefined;
      if (truckType) {
        query += ` AND j.truck_type::text = $${paramIdx}`;
        params.push(truckType);
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
      // Held broker assignments (sent_at IS NULL on a broker-posted job) are
      // invisible to the truck until the broker sends them. Driver-created
      // applications also have sent_at NULL, so the broker check is required.
      const result = await pool.query(
        `SELECT j.*, COALESCE(cp.name, bcp.name) as project_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text
         WHERE (j.driver_id = $1 OR j.id IN (
           SELECT ja.job_id FROM job_assignments ja
           WHERE ja.driver_id = $1
             AND (ja.sent_at IS NOT NULL OR NOT EXISTS (
               SELECT 1 FROM users bu
               WHERE bu.id::text = j.contractor_id::text AND bu.role::text = 'broker'))))
         AND j.archived_at IS NULL
         ORDER BY j.created_at DESC`,
        [auth.userId]
      );
      const rows = result.rows.map(addDualKeys);
      // Flag jobs with a SENT, still-pending broker assignment awaiting the
      // driver's confirm/decline so the My Jobs list can render the prompt.
      try {
        const pend = await pool.query(
          `SELECT ja.id, ja.job_id, ja.sent_at
           FROM job_assignments ja
           JOIN jobs bj ON bj.id = ja.job_id
           JOIN users bu ON bu.id::text = bj.contractor_id::text AND bu.role::text = 'broker'
           WHERE ja.driver_id::text = $1
             AND ja.status::text = 'pending'
             AND ja.sent_at IS NOT NULL`,
          [auth.userId]
        );
        const byJob = new Map(pend.rows.map((r: any) => [String(r.job_id), r]));
        for (const row of rows) {
          const m = byJob.get(String(row.id));
          if (m) {
            row.needsConfirmation = true;
            row.needs_confirmation = true;
            row.assignmentId = m.id;
            row.assignment_id = m.id;
            row.assignmentSentAt = m.sent_at;
            row.assignment_sent_at = m.sent_at;
          }
        }
      } catch (e: any) {
        console.error("GET /api/driver/jobs broker annotate error:", e.message);
      }
      return res.json(rows);
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
      // Day 1 is always the scheduled start date — a job set for Sat/Sun means that
      // exact day. Weekend-skipping only applies to continuation days of multi-day
      // jobs, so a single weekend job no longer slides to the next weekday.
      const dayAllowed = added === 0
        ? true
        : (!isWeekendDay
          ? true
          : (includesWeekends && ((dow === 6 && includesSaturday) || (dow === 0 && includesSunday))));
      if (dayAllowed) {
        const key = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`;
        dates.push(key);
        added++;
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
  }

  // Shared double-booking guard. Returns overlapping APPROVED truck bookings on
  // OTHER active jobs for any of the given vehicleIds, using the same calendar
  // date expansion (getJobDateRange) the calendar UI uses, so server enforcement
  // and the on-screen conflict warnings never disagree.
  async function findApprovedTruckConflicts(
    vehicleIds: (string | null | undefined)[],
    targetJobId: string
  ): Promise<{ vehicleId: string; conflictDates: string[]; jobMaterial: string | null }[]> {
    const vIds = Array.from(new Set((vehicleIds || []).filter((v): v is string => !!v)));
    if (vIds.length === 0) return [];
    const jr = await pool.query(
      `SELECT scheduled_date, estimated_days, includes_weekends, includes_saturday, includes_sunday FROM jobs WHERE id = $1`,
      [targetJobId]
    );
    const tj = jr.rows[0];
    if (!tj || !tj.scheduled_date) return [];
    const targetDates = new Set(
      getJobDateRange(
        tj.scheduled_date,
        Number(tj.estimated_days) || 1,
        !!tj.includes_weekends,
        tj.includes_saturday !== false,
        tj.includes_sunday !== false
      )
    );
    if (targetDates.size === 0) return [];
    const other = await pool.query(
      `SELECT ja.vehicle_id, j.material AS job_material, j.scheduled_date, j.estimated_days,
              j.includes_weekends, j.includes_saturday, j.includes_sunday
       FROM job_assignments ja JOIN jobs j ON ja.job_id = j.id
       WHERE ja.vehicle_id::text = ANY($1::text[])
         AND ja.job_id <> $2
         AND ja.status::text = 'approved'
         AND j.status::text IN ('open', 'in_progress', 'pending', 'accepted')`,
      [vIds, targetJobId]
    );
    const conflicts: { vehicleId: string; conflictDates: string[]; jobMaterial: string | null }[] = [];
    for (const r of other.rows) {
      const otherDates = getJobDateRange(
        r.scheduled_date,
        Number(r.estimated_days) || 1,
        !!r.includes_weekends,
        r.includes_saturday !== false,
        r.includes_sunday !== false
      );
      const overlap = otherDates.filter((d) => targetDates.has(d));
      if (overlap.length > 0) {
        conflicts.push({ vehicleId: r.vehicle_id, conflictDates: overlap, jobMaterial: r.job_material || null });
      }
    }
    return conflicts;
  }

  function bookingConflictMessage(
    conflicts: { conflictDates: string[]; jobMaterial: string | null }[]
  ): string {
    const allDates = Array.from(new Set(conflicts.flatMap((c) => c.conflictDates))).sort();
    const pretty = allDates.map((d) => {
      const [, m, day] = d.split('-');
      return `${Number(m)}/${Number(day)}`;
    });
    const material = conflicts.find((c) => c.jobMaterial)?.jobMaterial;
    const onJob = material ? ` on another "${material}" job` : ' on another job';
    return `That truck is already booked${onJob} for ${pretty.join(', ')}. Pick a different truck or remove the other booking first.`;
  }

  // A trucking company runs a FLEET — multiple trucks, multiple drivers — so it can
  // legitimately have DIFFERENT trucks approved on overlapping jobs. The driver-level
  // double-booking guard ("one human can't be in two places") must NOT apply to fleets;
  // only the per-truck guard does. A fleet is detected either from the role entitlement
  // (users.role contains 'trucking_company') OR from owning multiple trucks — some fleet
  // owners carry the 'contractor' role but still run several trucks independently.
  async function isFleetAccount(userId: string | null | undefined): Promise<boolean> {
    if (!userId) return false;
    const r = await pool.query(`SELECT role FROM users WHERE id::text = $1`, [String(userId)]);
    if (String(r.rows[0]?.role || '').includes('trucking_company')) return true;
    // A fleet is anyone running multiple trucks — including a "contractor" role
    // account that owns a fleet. Each truck books independently (the per-truck
    // guard still blocks a single truck being double-booked), so the "one human,
    // one place at a time" DRIVER guard must not apply to a multi-truck owner.
    const tc = await pool.query(
      `SELECT COUNT(*)::int AS n FROM trucks WHERE trucking_company_id::text = $1 AND archived_at IS NULL`,
      [String(userId)]
    );
    return (tc.rows[0]?.n || 0) >= 2;
  }

  // Shared double-booking guard for DRIVERS. Mirrors findApprovedTruckConflicts
  // but keyed on driver_id, so a driver can't be APPROVED on two active jobs whose
  // working days overlap — regardless of which truck (or no truck) is attached.
  async function findApprovedDriverConflicts(
    driverIds: (string | null | undefined)[],
    targetJobId: string
  ): Promise<{ driverId: string; conflictDates: string[]; jobMaterial: string | null }[]> {
    const dIds = Array.from(new Set((driverIds || []).filter((v): v is string => !!v)));
    if (dIds.length === 0) return [];
    const jr = await pool.query(
      `SELECT scheduled_date, estimated_days, includes_weekends, includes_saturday, includes_sunday FROM jobs WHERE id = $1`,
      [targetJobId]
    );
    const tj = jr.rows[0];
    if (!tj || !tj.scheduled_date) return [];
    const targetDates = new Set(
      getJobDateRange(
        tj.scheduled_date,
        Number(tj.estimated_days) || 1,
        !!tj.includes_weekends,
        tj.includes_saturday !== false,
        tj.includes_sunday !== false
      )
    );
    if (targetDates.size === 0) return [];
    const other = await pool.query(
      `SELECT ja.driver_id, j.material AS job_material, j.scheduled_date, j.estimated_days,
              j.includes_weekends, j.includes_saturday, j.includes_sunday
       FROM job_assignments ja JOIN jobs j ON ja.job_id = j.id
       WHERE ja.driver_id::text = ANY($1::text[])
         AND ja.job_id <> $2
         AND ja.status::text = 'approved'
         AND j.status::text IN ('open', 'in_progress', 'pending', 'accepted')`,
      [dIds, targetJobId]
    );
    const conflicts: { driverId: string; conflictDates: string[]; jobMaterial: string | null }[] = [];
    for (const r of other.rows) {
      const otherDates = getJobDateRange(
        r.scheduled_date,
        Number(r.estimated_days) || 1,
        !!r.includes_weekends,
        r.includes_saturday !== false,
        r.includes_sunday !== false
      );
      const overlap = otherDates.filter((d) => targetDates.has(d));
      if (overlap.length > 0) {
        conflicts.push({ driverId: r.driver_id, conflictDates: overlap, jobMaterial: r.job_material || null });
      }
    }
    return conflicts;
  }

  function driverConflictMessage(
    conflicts: { conflictDates: string[]; jobMaterial: string | null }[],
    self: boolean
  ): string {
    const allDates = Array.from(new Set(conflicts.flatMap((c) => c.conflictDates))).sort();
    const pretty = allDates.map((d) => {
      const [, m, day] = d.split('-');
      return `${Number(m)}/${Number(day)}`;
    });
    const material = conflicts.find((c) => c.jobMaterial)?.jobMaterial;
    const onJob = material ? ` on another "${material}" job` : ' on another job';
    return self
      ? `You're already booked${onJob} for ${pretty.join(', ')}. You can't be on two jobs the same day — finish or drop the other booking first.`
      : `That driver is already booked${onJob} for ${pretty.join(', ')}. Approve them on different dates or remove the other booking first.`;
  }

  // After a truck/driver becomes APPROVED on a job, automatically withdraw that
  // same truck's (or driver's) still-PENDING applications on OTHER active jobs
  // whose working days overlap. This stops a second contractor from ever opening
  // a stuck application that can only error out ("already booked"), and clears it
  // from their applicant list. The applicant (trucking company) is notified for
  // each application that was pulled. Best-effort: failures never block approval.
  async function withdrawConflictingPendingApplications(
    targetJobId: string,
    vehicleIds: (string | null | undefined)[],
    driverIds: (string | null | undefined)[],
    auth: { jwt: string; userId: string; user: any }
  ): Promise<void> {
    try {
      const vIds = Array.from(new Set((vehicleIds || []).filter((v): v is string => !!v)));
      const dIds = Array.from(new Set((driverIds || []).filter((v): v is string => !!v)));
      if (vIds.length === 0 && dIds.length === 0) return;

      const jr = await pool.query(
        `SELECT material, scheduled_date, estimated_days, includes_weekends, includes_saturday, includes_sunday FROM jobs WHERE id = $1`,
        [targetJobId]
      );
      const tj = jr.rows[0];
      if (!tj || !tj.scheduled_date) return;
      const targetDates = new Set(
        getJobDateRange(
          tj.scheduled_date,
          Number(tj.estimated_days) || 1,
          !!tj.includes_weekends,
          tj.includes_saturday !== false,
          tj.includes_sunday !== false
        )
      );
      if (targetDates.size === 0) return;
      const targetMaterial = tj.material || '';

      const others = await pool.query(
        `SELECT ja.id, ja.driver_id, ja.job_id, j.material AS job_material, j.scheduled_date,
                j.estimated_days, j.includes_weekends, j.includes_saturday, j.includes_sunday
         FROM job_assignments ja JOIN jobs j ON ja.job_id = j.id
         WHERE ja.job_id <> $1
           AND ja.status::text = 'pending'
           AND ( ja.vehicle_id::text = ANY($2::text[]) OR ja.driver_id::text = ANY($3::text[]) )
           AND j.status::text IN ('open', 'in_progress', 'pending', 'accepted')`,
        [targetJobId, vIds, dIds]
      );

      const toWithdraw: { id: string; driverId: string; jobId: string; jobMaterial: string | null; dates: string[] }[] = [];
      for (const r of others.rows) {
        const otherDates = getJobDateRange(
          r.scheduled_date,
          Number(r.estimated_days) || 1,
          !!r.includes_weekends,
          r.includes_saturday !== false,
          r.includes_sunday !== false
        );
        const overlap = otherDates.filter((d) => targetDates.has(d));
        if (overlap.length > 0) {
          toWithdraw.push({ id: String(r.id), driverId: String(r.driver_id), jobId: String(r.job_id), jobMaterial: r.job_material || null, dates: overlap });
        }
      }
      if (toWithdraw.length === 0) return;

      // Conditional withdraw: only flip rows that are STILL pending, so if another
      // contractor approved one of these between our SELECT and UPDATE, we never
      // clobber that approval. RETURNING tells us exactly which rows we pulled.
      const updated = await pool.query(
        `UPDATE job_assignments SET status = 'withdrawn'
         WHERE id = ANY($1::varchar[]) AND status::text = 'pending'
         RETURNING id`,
        [toWithdraw.map((w) => w.id)]
      );
      const withdrawnIds = new Set(updated.rows.map((r: any) => String(r.id)));
      const pulled = toWithdraw.filter((w) => withdrawnIds.has(w.id));
      if (pulled.length === 0) return;

      // Reopen any affected job that now has no remaining active applicants — but
      // only from a still-fillable state, never demoting an accepted/in-progress job.
      for (const jobId of Array.from(new Set(pulled.map((w) => w.jobId)))) {
        const remaining = await pool.query(
          `SELECT COUNT(*)::int AS c FROM job_assignments WHERE job_id = $1 AND status::text NOT IN ('withdrawn', 'rejected')`,
          [jobId]
        );
        if ((remaining.rows[0]?.c || 0) === 0) {
          await pool.query(
            `UPDATE jobs SET status = 'open', updated_at = NOW() WHERE id = $1 AND status::text IN ('open', 'pending')`,
            [jobId]
          );
        }
      }

      // Notify the applicant (trucking company) for each application that was pulled.
      const onJob = targetMaterial ? `a "${targetMaterial}" job` : 'another job';
      for (const w of pulled) {
        const dates = Array.from(new Set(w.dates)).sort().map((d) => { const [, m, day] = d.split('-'); return `${Number(m)}/${Number(day)}`; });
        const title = 'Application withdrawn — double booking';
        const body = `Your application${w.jobMaterial ? ` for the "${w.jobMaterial}" job` : ''} was automatically withdrawn because you were approved on ${onJob} that overlaps ${dates.join(', ')}.`;
        try {
          await pool.query(
            `INSERT INTO notifications (id, user_id, type, title, message, job_id, is_read, created_at)
             VALUES ($1, $2, 'general', $3, $4, $5, false, NOW())`,
            [crypto.randomUUID(), w.driverId, title, body, w.jobId]
          );
        } catch (e: any) {
          console.error("Auto-withdraw notification insert error:", e.message);
        }
        await sendPushNotification(w.driverId, title, body, { jobId: w.jobId, type: 'application_withdrawn' }).catch(() => {});
      }
    } catch (e: any) {
      console.error("withdrawConflictingPendingApplications error:", e.message);
    }
  }

  async function getJobsForCalendar(auth: { jwt: string; userId: string; user: any }, role: 'driver' | 'contractor'): Promise<any[]> {
    try {
      let result;
      const userRole = (auth.user?.role || '').toLowerCase();
      if (role === 'contractor') {
        result = await pool.query(
          `SELECT j.*, COALESCE(cp.name, bcp.name) as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text LEFT JOIN users u ON j.contractor_id::text = u.id::text WHERE j.contractor_id = $1 AND j.archived_at IS NULL ORDER BY j.scheduled_date DESC`,
          [auth.userId]
        );
      } else if (userRole === 'trucking_company') {
        result = await pool.query(
          `SELECT DISTINCT j.*, COALESCE(cp.name, bcp.name) as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text LEFT JOIN users u ON j.contractor_id::text = u.id::text
           WHERE j.id IN (SELECT ja.job_id FROM job_assignments ja JOIN trucks t ON ja.vehicle_id = t.id WHERE t.trucking_company_id = $1 AND ja.status::text NOT IN ('withdrawn', 'rejected'))
           AND j.archived_at IS NULL
           ORDER BY j.scheduled_date DESC`,
          [auth.userId]
        );
      } else {
        result = await pool.query(
          `SELECT j.*, COALESCE(cp.name, bcp.name) as project_name, u.company as contractor_name FROM jobs j LEFT JOIN contractor_projects cp ON j.project_id = cp.id LEFT JOIN broker_client_projects bcp ON j.project_id = bcp.id::text LEFT JOIN users u ON j.contractor_id::text = u.id::text
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
      // Brokers post jobs under their own contractor_id, so their calendar is
      // the poster view (own postings), same as contractors.
      const isContractorRole = (userRole.includes('contractor') || userRole === 'broker') && userRole !== 'trucking_company';
      // Fleet (trucking-company) view: the calendar is about THIS company's own trucks.
      // A job can carry assignments for trucks owned by other companies (e.g. a sub the
      // contractor hired); those must not appear as bookings in this fleet's calendar.
      const isTruckingCompany = userRole === 'trucking_company';
      // Driver view: neither a contractor (job poster) nor a fleet. A driver should
      // only see their own assignment on a job, not co-drivers' trucks.
      const isDriverView = !isContractorRole && !isTruckingCompany;
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
            `SELECT ja.job_id, ja.vehicle_id, ja.driver_id, ja.status, t.make, t.model, t.year, t.truck_number, t.license_plate, t.truck_type, t.trucking_company_id
             FROM job_assignments ja LEFT JOIN trucks t ON ja.vehicle_id = t.id
             WHERE ja.job_id = ANY($1) AND ja.status::text NOT IN ('withdrawn', 'rejected')`,
            [jobIds]
          );
          for (const row of assResult.rows) {
            if (!assignmentsByJob[row.job_id]) assignmentsByJob[row.job_id] = [];
            assignmentsByJob[row.job_id].push({
              vehicleId: row.vehicle_id,
              driverId: row.driver_id,
              status: row.status,
              make: row.make,
              model: row.model,
              year: row.year,
              truckNumber: row.truck_number,
              licensePlate: row.license_plate,
              truckType: row.truck_type,
              truckCompanyId: row.trucking_company_id,
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
        const allAssignments = assignmentsByJob[job.id] || [];
        // Scope which trucks show as bookings on this job:
        // - Fleet (trucking_company): only this company's own trucks. A job can carry
        //   another company's truck (e.g. a sub the contractor hired) — not this fleet's.
        // - Driver: only this driver's own assignment. Co-drivers' trucks on the same
        //   multi-truck job are not this driver's bookings.
        // - Contractor: no filter — they posted the job and manage every approved truck.
        const vehicleAssignments = isTruckingCompany
          ? allAssignments.filter((a: any) => String(a.truckCompanyId) === String(userId))
          : isDriverView
          ? allAssignments.filter((a: any) => String(a.driverId) === String(userId))
          : allAssignments;
        const rawActiveRuns = activeRunsByJob[job.id] || [];
        // Fleet and driver views: scope clock-in runs to the trucks we kept above, so a
        // shared job doesn't leak another company's / co-driver's truck runs.
        const activeRuns = (isTruckingCompany || isDriverView)
          ? rawActiveRuns.filter((r: any) => vehicleAssignments.some((a: any) => String(a.vehicleId) === String(r.vehicle_id)))
          : rawActiveRuns;
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

  // Per-truck / per-company billing breakdown for a single job (job owner only).
  // Groups the job's runs by driver, resolves each driver's parent trucking
  // company (users.trucking_company_id, falling back to the driver themselves),
  // and prices each driver's own time/loads with the same rules as
  // computeJobEarnings so the numbers always reconcile with invoice math.
  app.get("/api/jobs/:id/billing", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      const jobRes = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
      const job = jobRes.rows[0];
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (String(job.contractor_id) !== String(auth.userId)) {
        return res.status(403).json({ message: "Only the job poster can view billing" });
      }

      const runsRes = await pool.query(
        `SELECT jr.driver_id, jr.vehicle_id, jr.billed_duration_minutes, jr.actual_duration_minutes,
                jr.started_at, jr.ended_at, jr.status, jr.loads_hauled,
                u.full_name AS driver_name,
                COALESCE(u.trucking_company_id::text, u.id::text) AS company_id,
                COALESCE(NULLIF(tc.company, ''), NULLIF(tc.full_name, ''), NULLIF(u.company, '')) AS company_name,
                t.truck_number, t.make, t.model, t.year
         FROM job_runs jr
         JOIN users u ON u.id::text = jr.driver_id::text
         LEFT JOIN users tc ON tc.id::text = u.trucking_company_id::text
         LEFT JOIN trucks t ON t.id::text = jr.vehicle_id::text
         WHERE jr.job_id = $1
         ORDER BY jr.started_at ASC`,
        [req.params.id]
      );

      type Entry = {
        driver_id: string; driver_name: string | null;
        company_id: string; company_name: string | null;
        trucks: string[]; minutes: number; loads: number; run_count: number; has_active_run: boolean;
      };
      const byDriver = new Map<string, Entry>();
      for (const r of runsRes.rows) {
        // Same minutes fallback chain as computeJobEarnings.
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
        const truckLabel = r.truck_number
          ? `#${r.truck_number}`
          : [r.year, r.make, r.model].filter(Boolean).join(' ') || null;
        const key = String(r.driver_id);
        const e: Entry = byDriver.get(key) || {
          driver_id: key, driver_name: r.driver_name || null,
          company_id: String(r.company_id), company_name: r.company_name || null,
          trucks: [], minutes: 0, loads: 0, run_count: 0, has_active_run: false,
        };
        e.minutes += mins;
        e.loads += Number(r.loads_hauled || 0);
        e.run_count += 1;
        if (r.status === 'active') e.has_active_run = true;
        if (truckLabel && !e.trucks.includes(truckLabel)) e.trucks.push(truckLabel);
        byDriver.set(key, e);
      }

      const rate = Number(job.rate || 0);
      const rateType = String(job.rate_type || 'per_hour');
      const isFlat = rateType === 'flat' || rateType === 'flat_rate' || rateType === 'per_job';
      const entriesRaw = Array.from(byDriver.values());
      const entries = entriesRaw.map((e) => {
        let amount = 0;
        if (isFlat) amount = entriesRaw.length > 0 ? rate / entriesRaw.length : 0;
        else if (rateType === 'per_load') amount = e.loads * rate;
        else amount = (e.minutes / 60) * rate;
        return {
          ...e,
          minutes: Math.round(e.minutes),
          amount: Number(amount.toFixed(2)),
        };
      }).sort((a, b) => b.amount - a.amount);

      const total = entries.reduce((s, e) => s + e.amount, 0);
      res.json(addDualKeys({
        job_id: job.id,
        rate,
        rate_type: rateType,
        entries,
        total_amount: Number(total.toFixed(2)),
        total_minutes: entries.reduce((s, e) => s + e.minutes, 0),
        total_loads: entries.reduce((s, e) => s + e.loads, 0),
      }));
    } catch (error: any) {
      console.error("Job billing error:", error.message);
      res.status(500).json({ message: "Failed to load job billing" });
    }
  });

  // Find all jobs that should be tallied under a given invoice, then recompute totals.
  // For OPEN invoices: act as a live, rolling tally of all unbilled work between the
  // contractor and driver that has any tracked time/loads. For issued/paid invoices:
  // stay locked to the explicitly-linked jobs (snapshot semantics).
  async function recomputeInvoice(invoice: any): Promise<{ jobs: any[]; total: number; jobCount: number }> {
    const isOpen = invoice.status === 'open';
    let jobsRes;
    if (isOpen) {
      // A job bills under the month of its FIRST working day (scheduled_date):
      // a June 30 -> July job belongs on the June invoice. Without the month
      // filter, an old open invoice would keep sweeping in every newer
      // un-invoiced job and its period label would be wrong.
      jobsRes = await pool.query(
        `SELECT DISTINCT j.*, COALESCE(cp.name, bcp.name) AS project_name FROM jobs j
         LEFT JOIN contractor_projects cp ON cp.id = j.project_id
         LEFT JOIN broker_client_projects bcp ON bcp.id::text = j.project_id
         LEFT JOIN job_runs jr ON jr.job_id = j.id
         WHERE j.invoice_id = $1
            OR (j.contractor_id = $2
                AND (j.driver_id = $3 OR jr.driver_id = $3)
                AND j.status::text IN ('completed', 'in_progress', 'accepted')
                AND (j.invoice_id IS NULL OR j.invoice_id = $1)
                AND date_trunc('month', COALESCE(j.scheduled_date, j.created_at)) = date_trunc('month', $4::timestamp))`,
        [invoice.id, invoice.contractor_id, invoice.driver_id, invoice.period_month]
      );
    } else {
      jobsRes = await pool.query(
        `SELECT DISTINCT j.*, COALESCE(cp.name, bcp.name) AS project_name FROM jobs j
         LEFT JOIN contractor_projects cp ON cp.id = j.project_id
         LEFT JOIN broker_client_projects bcp ON bcp.id::text = j.project_id
         WHERE j.invoice_id = $1`,
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

  // Make sure every month that has billable, un-invoiced work for this user
  // has an open monthly invoice to bill it under. A job belongs to the month
  // of its first working day (scheduled_date). Writes go to the shared DB the
  // website reads, so both apps see the same invoice.
  async function ensureMonthlyInvoices(userId: string): Promise<void> {
    const candidates = await pool.query(
      `SELECT DISTINCT j.contractor_id,
              COALESCE(jr.driver_id, j.driver_id) AS billing_driver_id,
              date_trunc('month', COALESCE(j.scheduled_date, j.created_at)) AS bill_month
       FROM jobs j
       LEFT JOIN job_runs jr ON jr.job_id = j.id
       WHERE j.invoice_id IS NULL
         AND j.status::text IN ('completed', 'in_progress', 'accepted')
         AND COALESCE(jr.driver_id, j.driver_id) IS NOT NULL
         AND (j.contractor_id = $1 OR jr.driver_id = $1 OR j.driver_id = $1)`,
      [userId]
    );
    for (const row of candidates.rows) {
      if (!row.contractor_id || !row.billing_driver_id || !row.bill_month) continue;
      // No unique constraint exists on (contractor, driver, month) in the
      // shared table, so serialize check+insert per pair/month with an
      // advisory lock to prevent duplicate invoices under concurrent requests.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const monthKey = new Date(row.bill_month).toISOString().slice(0, 7);
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtext($1))`,
          [`inv:${row.contractor_id}:${row.billing_driver_id}:${monthKey}`]
        );
        const existing = await client.query(
          `SELECT id FROM monthly_invoices
           WHERE contractor_id = $1 AND driver_id = $2
             AND date_trunc('month', period_month) = date_trunc('month', $3::timestamp)
           LIMIT 1`,
          [row.contractor_id, row.billing_driver_id, row.bill_month]
        );
        if (existing.rows.length === 0) {
          const d = new Date(row.bill_month);
          const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
          const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
          await client.query(
            `INSERT INTO monthly_invoices (invoice_number, contractor_id, driver_id, period_month, period_label, status)
             VALUES ($1, $2, $3, $4, $5, 'open')`,
            [invoiceNumber, row.contractor_id, row.billing_driver_id, row.bill_month, label]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }
  }

  app.get("/api/invoices", requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = getWebsiteAuth(req)!;
      await ensureMonthlyInvoices(auth.userId).catch((e) =>
        console.error("ensureMonthlyInvoices error:", e.message)
      );
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
          d.state AS driver_state, d.zip_code AS driver_zip,
          d.trucking_company_id AS driver_parent_company_id,
          COALESCE(NULLIF(tcp.company, ''), NULLIF(tcp.full_name, '')) AS driver_parent_company_name,
          tcp.email AS driver_parent_company_email, tcp.phone AS driver_parent_company_phone,
          tcp.address AS driver_parent_company_address, tcp.city AS driver_parent_company_city,
          tcp.state AS driver_parent_company_state, tcp.zip_code AS driver_parent_company_zip
        FROM monthly_invoices mi
        LEFT JOIN users c ON c.id = mi.contractor_id
        LEFT JOIN users d ON d.id = mi.driver_id
        LEFT JOIN users tcp ON tcp.id::text = d.trucking_company_id::text
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

      return res.json(recomputed.map((r) => addDualKeys(stripAccountingSyncUnlessPayee(r, auth.userId))));
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
          d.state AS driver_state, d.zip_code AS driver_zip,
          d.trucking_company_id AS driver_parent_company_id,
          COALESCE(NULLIF(tcp.company, ''), NULLIF(tcp.full_name, '')) AS driver_parent_company_name,
          tcp.email AS driver_parent_company_email, tcp.phone AS driver_parent_company_phone,
          tcp.address AS driver_parent_company_address, tcp.city AS driver_parent_company_city,
          tcp.state AS driver_parent_company_state, tcp.zip_code AS driver_parent_company_zip
        FROM monthly_invoices mi
        LEFT JOIN users c ON c.id = mi.contractor_id
        LEFT JOIN users d ON d.id = mi.driver_id
        LEFT JOIN users tcp ON tcp.id::text = d.trucking_company_id::text
        WHERE mi.id = $1 AND (mi.contractor_id = $2 OR mi.driver_id = $2)`,
        [req.params.id, auth.userId]
      );
      if (result.rows.length > 0) {
        const invoice = result.rows[0];
        const calc = await recomputeInvoice(invoice);
        invoice.jobs = calc.jobs.map(addDualKeys);
        invoice.total_amount = calc.total;
        invoice.job_count = calc.jobCount;
        return res.json(addDualKeys(stripAccountingSyncUnlessPayee(invoice, auth.userId)));
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
      return res.json(addDualKeys(stripAccountingSyncUnlessPayee(result.rows[0] || {}, auth.userId)));
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
      let projects = result.rows;

      // Brokers also create projects under their clients (companion-local
      // table). Include those so the Projects tab shows every project, not
      // just self-owned ones.
      let brokerQuery = `SELECT * FROM broker_client_projects WHERE broker_id = $1`;
      if (!includeDeleted) brokerQuery += ` AND deleted_at IS NULL`;
      brokerQuery += ` ORDER BY created_at DESC`;
      const brokerResult = await pool.query(brokerQuery, [auth.userId]).catch(() => ({ rows: [] as any[] }));
      if (brokerResult.rows.length) {
        const seen = new Set(projects.map((p: any) => String(p.id)));
        projects = projects.concat(
          brokerResult.rows
            .filter((p: any) => !seen.has(String(p.id)))
            // broker_client_projects has no status column; derive it.
            .map((p: any) => ({ ...p, status: p.deleted_at ? "deleted" : "active" }))
        );
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

      // Register the project with the website, then persist its details.
      // syncProjects() reconciles local projects against the website's
      // /api/contractor-projects list and soft-deletes any it can't find, so an
      // unpushed project gets wiped ~5 min later. Two steps are required:
      //   1) POST creates/registers the project (site fields are NOT persisted
      //      by the create endpoint).
      //   2) PUT persists site_address/lat/lng + notes — without it the periodic
      //      down-sync (upsertMany) overwrites the local row with the website's
      //      site-less copy, wiping the address/coordinates.
      (async () => {
        await pushToWebsite("/api/contractor-projects", auth, {
          method: "POST",
          body: { id, name, site_address: siteAddress, site_lat: siteLat, site_lng: siteLng, contractorId: auth.userId },
        });
        await pushToWebsite(`/api/contractor-projects/${id}`, auth, {
          method: "PUT",
          body: { name, job_number: jobNumber, site_address: siteAddress, site_lat: siteLat, site_lng: siteLng, notes },
        });
      })().catch(() => {});

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
      if (owned.rows.length === 0) {
        // Broker-created client projects live in a companion-local table with
        // a narrower column set (no status/site_address_type/updated_at).
        const brokerOwned = await pool.query(
          `SELECT id FROM broker_client_projects WHERE id::text = $1 AND broker_id = $2 AND deleted_at IS NULL`,
          [req.params.id, auth.userId]
        ).catch(() => ({ rows: [] as any[] }));
        if (brokerOwned.rows.length === 0) return res.status(404).json({ message: "Project not found" });
        const bFieldMap: Record<string, string> = {
          name: 'name', projectName: 'name', project_name: 'name',
          jobNumber: 'job_number', job_number: 'job_number',
          siteAddress: 'site_address', site_address: 'site_address',
          siteLat: 'site_lat', site_lat: 'site_lat',
          siteLng: 'site_lng', site_lng: 'site_lng',
          notes: 'notes',
        };
        const bUpdates: string[] = [];
        const bValues: any[] = [];
        let bIdx = 1;
        for (const [bodyKey, dbCol] of Object.entries(bFieldMap)) {
          if (req.body[bodyKey] !== undefined) {
            bUpdates.push(`${dbCol} = $${bIdx}`);
            bValues.push(req.body[bodyKey]);
            bIdx++;
          }
        }
        if (bUpdates.length > 0) {
          bValues.push(req.params.id);
          await pool.query(
            `UPDATE broker_client_projects SET ${bUpdates.join(', ')} WHERE id::text = $${bIdx}`,
            bValues
          );
        }
        const bRow = await pool.query(`SELECT * FROM broker_client_projects WHERE id::text = $1`, [req.params.id]);
        const bp = bRow.rows[0] || { id: req.params.id };
        return res.json(addDualKeys({ ...bp, status: bp.deleted_at ? 'deleted' : 'active' }));
      }

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

      // Propagate the edit to the website so the reconcile keeps it in sync.
      // Send canonical snake_case fields from the updated row — the website's
      // validation rejects the client's camelCase shape (see POST above).
      pushToWebsite(`/api/contractor-projects/${req.params.id}`, auth, {
        method: "PUT",
        body: {
          name: project.name,
          job_number: project.job_number,
          site_address: project.site_address,
          site_lat: project.site_lat,
          site_lng: project.site_lng,
          notes: project.notes,
        },
      }).catch(() => {});

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
      if (upd.rowCount === 0) {
        // Broker client projects are companion-local; no website push needed.
        const bUpd = await pool.query(
          `UPDATE broker_client_projects SET deleted_at = NOW()
           WHERE id::text = $1 AND broker_id = $2 RETURNING id`,
          [req.params.id, auth.userId]
        ).catch(() => ({ rowCount: 0 }));
        if (bUpd.rowCount === 0) return res.status(404).json({ message: "Project not found" });
        return res.json({ ok: true });
      }

      // Propagate the delete to the website so it drops out of the reconcile list too.
      pushToWebsite(`/api/contractor-projects/${req.params.id}`, auth, {
        method: "DELETE",
      }).catch(() => {});

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
         WHERE id = $1 AND contractor_id::text = $2 RETURNING *`,
        [req.params.id, auth.userId]
      );
      if (upd.rowCount === 0) {
        // Broker client projects are companion-local; just clear the soft delete.
        const bUpd = await pool.query(
          `UPDATE broker_client_projects SET deleted_at = NULL
           WHERE id::text = $1 AND broker_id = $2 RETURNING id`,
          [req.params.id, auth.userId]
        ).catch(() => ({ rowCount: 0 }));
        if (bUpd.rowCount === 0) return res.status(404).json({ message: "Project not found" });
        return res.json({ ok: true });
      }

      // Re-register with the website (the delete dropped it from their list), so
      // the reconcile sees it again instead of soft-deleting it on the next sync.
      // POST re-creates, then PUT persists the site fields (see POST route note).
      const p = upd.rows[0];
      (async () => {
        await pushToWebsite("/api/contractor-projects", auth, {
          method: "POST",
          body: {
            id: p.id,
            name: p.name,
            site_address: p.site_address,
            site_lat: p.site_lat,
            site_lng: p.site_lng,
            contractorId: auth.userId,
          },
        });
        await pushToWebsite(`/api/contractor-projects/${p.id}`, auth, {
          method: "PUT",
          body: {
            name: p.name,
            job_number: p.job_number,
            site_address: p.site_address,
            site_lat: p.site_lat,
            site_lng: p.site_lng,
            notes: p.notes,
          },
        });
      })().catch(() => {});

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

      // The job's driver is usually held on the approved job_assignment, not
      // jobs.driver_id (which is typically NULL). For review authorization only
      // an APPROVED assignment counts as the finalized hauler — a pending/other
      // applicant must never be treated as a participant or reviewee.
      let resolvedDriverId = job.driver_id;
      if (!resolvedDriverId) {
        const a = await pool.query(
          `SELECT driver_id FROM job_assignments WHERE job_id = $1
           AND status::text = 'approved'
           ORDER BY approved_at DESC NULLS LAST, created_at DESC
           LIMIT 1`,
          [jobId]
        );
        resolvedDriverId = a.rows[0]?.driver_id || null;
      }

      const callerIsContractor = String(job.contractor_id) === String(auth.userId);
      const callerIsDriver = resolvedDriverId != null && String(resolvedDriverId) === String(auth.userId);
      if (!callerIsContractor && !callerIsDriver) {
        return res.status(403).json({ message: "You did not participate in this job" });
      }
      // The reviewee must be the legitimate counterparty.
      const expectedReviewee = callerIsContractor ? resolvedDriverId : job.contractor_id;
      if (!expectedReviewee) {
        return res.status(409).json({ message: "This job has no finalized hauler to review yet." });
      }
      if (String(revieweeId) !== String(expectedReviewee)) {
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
        const truckDurationSeconds = Math.round(durationSeconds * 1.25);

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

  // Road-mile distance from a point to a job's area (pickup, dropoff, or the
  // closest point along the route). Used by the app to show how far a driver
  // really was (driving distance) when they clocked in/out away from the site.
  app.get("/api/jobs/:id/road-distance", requireAuth, async (req: Request, res: Response) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
        return res.status(400).json({ message: "lat and lng are required" });
      }
      const jobRes = await pool.query(
        `SELECT origin_lat, origin_lng, destination_lat, destination_lng,
                haul_both_ways, return_origin_lat, return_origin_lng, return_destination_lat, return_destination_lng
         FROM jobs WHERE id = $1`,
        [req.params.id]
      );
      const job = jobRes.rows[0];
      if (!job) return res.status(404).json({ message: "Job not found" });
      const oLat = job.origin_lat ? Number(job.origin_lat) : null;
      const oLng = job.origin_lng ? Number(job.origin_lng) : null;
      const dLat = job.destination_lat ? Number(job.destination_lat) : null;
      const dLng = job.destination_lng ? Number(job.destination_lng) : null;
      const bothWays = job.haul_both_ways === true;
      const roLat = bothWays && job.return_origin_lat ? Number(job.return_origin_lat) : null;
      const roLng = bothWays && job.return_origin_lng ? Number(job.return_origin_lng) : null;
      const rdLat = bothWays && job.return_destination_lat ? Number(job.return_destination_lat) : null;
      const rdLng = bothWays && job.return_destination_lng ? Number(job.return_destination_lng) : null;
      const hasReturnCoords = (roLat != null && roLng != null) || (rdLat != null && rdLng != null);
      const legAir = [
        airMilesToLeg(lat, lng, oLat, oLng, dLat, dLng),
        hasReturnCoords ? airMilesToLeg(lat, lng, roLat, roLng, rdLat, rdLng) : null,
      ].filter((m): m is number => m != null);
      if (legAir.length === 0) {
        return res.status(404).json({ message: "Job has no coordinates" });
      }
      const airMiles = Math.min(...legAir);
      const legRoad = await Promise.all([
        roadMilesToJobArea(lat, lng, oLat, oLng, dLat, dLng),
        hasReturnCoords ? roadMilesToJobArea(lat, lng, roLat, roLng, rdLat, rdLng) : Promise.resolve(null),
      ]);
      const validRoad = legRoad.filter((m): m is number => m != null);
      const roadMiles = validRoad.length > 0 ? Math.min(...validRoad) : null;
      return res.json(addDualKeys({
        road_miles: roadMiles != null ? Math.round(roadMiles * 10) / 10 : null,
        air_miles: Math.round(airMiles * 10) / 10,
      }));
    } catch (err: any) {
      console.error("GET /api/jobs/:id/road-distance error:", err.message);
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

  startNewJobWatcher();
  startBrokerScheduledSendWorker();

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
