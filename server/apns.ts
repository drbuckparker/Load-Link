// Direct APNs (Apple Push Notification service) sender. Used INSTEAD of
// Expo's push service for iOS when APNs credentials are configured, because
// the Expo Launch-managed Expo project has no APNs key uploaded (Expo returns
// InvalidCredentials and silently drops every iOS push).
//
// Auth: token-based (JWT signed ES256 with the .p8 key from the user's Apple
// Developer account). Apple requires refreshing the JWT between 20 and 60
// minutes; we cache it for 45.
//
// Topic: the apns-topic header must equal the *installed* app's bundle id.
// Expo Launch builds report `app.replit.loadlink` (seen in Expo's error
// message) while app.json declares `com.loadlink.app`, so we try the
// configured/default topic first and fall back to the other on a topic-related
// rejection, then remember which one worked.

import { importPKCS8, SignJWT } from 'jose';
import http2 from 'node:http2';
import type { ExpoPushMessage } from './push-payload';

const APNS_HOST = 'https://api.push.apple.com';

// APNs speaks HTTP/2 only — Node's fetch (undici) negotiates HTTP/1.1 and the
// connection fails, so we use node:http2 directly. One session per burst,
// closed shortly after idle.
let session: http2.ClientHttp2Session | null = null;
let sessionCloseTimer: ReturnType<typeof setTimeout> | null = null;

function getSession(): http2.ClientHttp2Session {
  if (session && !session.closed && !session.destroyed) return session;
  session = http2.connect(APNS_HOST);
  session.on('error', () => { try { session?.destroy(); } catch {} session = null; });
  session.on('close', () => { session = null; });
  return session;
}

function scheduleSessionClose() {
  if (sessionCloseTimer) clearTimeout(sessionCloseTimer);
  sessionCloseTimer = setTimeout(() => {
    try { session?.close(); } catch {}
    session = null;
  }, 30_000);
  (sessionCloseTimer as any)?.unref?.();
}

function apnsRequest(path: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    let s: http2.ClientHttp2Session;
    try { s = getSession(); } catch (e) { return reject(e); }
    const req = s.request({ ':method': 'POST', ':path': path, ...headers });
    const timeout = setTimeout(() => { req.close(http2.constants.NGHTTP2_CANCEL); reject(new Error('APNs request timeout')); }, 10_000);
    let status = 0;
    let data = '';
    req.on('response', (h) => { status = Number(h[':status'] || 0); });
    req.setEncoding('utf8');
    req.on('data', (c) => { data += c; });
    req.on('end', () => { clearTimeout(timeout); scheduleSessionClose(); resolve({ status, body: data }); });
    req.on('error', (e) => { clearTimeout(timeout); reject(e); });
    req.end(body);
  });
}
const TOPIC_CANDIDATES = [
  process.env.APNS_BUNDLE_ID || 'app.replit.loadlink',
  'com.loadlink.app',
].filter((v, i, a) => a.indexOf(v) === i);

let workingTopic: string | null = null;
let cachedJwt: { token: string; exp: number } | null = null;

export function apnsConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_P8 && process.env.APNS_KEY_ID && process.env.APPLE_TEAM_ID);
}

async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.exp > now + 60) return cachedJwt.token;
  // Secrets pasted through UIs often arrive mangled: escaped newlines, all on
  // one line, or just the base64 body without the BEGIN/END armor. Normalize
  // to a canonical PEM so importPKCS8 accepts it.
  let pem = (process.env.APNS_KEY_P8 || '').replace(/\\n/g, '\n').trim();
  if (!pem.includes('-----BEGIN')) {
    const b64 = pem.replace(/\s+/g, '');
    pem = `-----BEGIN PRIVATE KEY-----\n${b64.replace(/(.{64})/g, '$1\n').trim()}\n-----END PRIVATE KEY-----`;
  } else if (!pem.includes('\n')) {
    // Armor present but newlines lost ("-----BEGIN PRIVATE KEY----- MIG... -----END PRIVATE KEY-----")
    const m = pem.match(/-----BEGIN PRIVATE KEY-----(.*?)-----END PRIVATE KEY-----/s);
    if (m) {
      const b64 = m[1].replace(/\s+/g, '');
      pem = `-----BEGIN PRIVATE KEY-----\n${b64.replace(/(.{64})/g, '$1\n').trim()}\n-----END PRIVATE KEY-----`;
    }
  }
  const key = await importPKCS8(pem, 'ES256');
  // Apple Key IDs and Team IDs are uppercase alphanumeric; normalize because a
  // lowercase-pasted Key ID yields 403 InvalidProviderToken.
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: (process.env.APNS_KEY_ID || '').trim().toUpperCase() })
    .setIssuer((process.env.APPLE_TEAM_ID || '').trim().toUpperCase())
    .setIssuedAt(now)
    .sign(key);
  cachedJwt = { token, exp: now + 45 * 60 };
  return token;
}

// Map an Expo-style push message onto a raw APNs alert payload so all senders
// keep using the canonical builders in push-payload.ts.
function toApnsPayload(msg: ExpoPushMessage): Record<string, any> {
  const aps: Record<string, any> = {
    alert: { title: msg.title, body: msg.body },
    sound: msg.sound,
    'interruption-level': msg.interruptionLevel === 'timeSensitive' ? 'time-sensitive' : msg.interruptionLevel,
  };
  if (typeof msg.badge === 'number') aps.badge = msg.badge;
  return { aps, ...msg.data };
}

export type ApnsResult = { ok: boolean; status?: number; reason?: string };

/** Send one push straight to Apple. Returns ok=false with the APNs `reason`
 *  (e.g. BadDeviceToken, TopicDisallowed, ExpiredProviderToken) on failure. */
export async function sendApnsPush(deviceToken: string, msg: ExpoPushMessage): Promise<ApnsResult> {
  if (!apnsConfigured()) return { ok: false, reason: 'NotConfigured' };
  try {
    const jwt = await getApnsJwt();
    const payload = JSON.stringify(toApnsPayload(msg));
    // Try the last-known-good topic first, but keep the other candidates as
    // fallbacks — installs may be split across bundle ids, so one device's
    // success must not lock out the other cohort.
    const topics = workingTopic
      ? [workingTopic, ...TOPIC_CANDIDATES.filter((t) => t !== workingTopic)]
      : TOPIC_CANDIDATES;
    let last: ApnsResult = { ok: false, reason: 'NoTopicTried' };
    for (const topic of topics) {
      const res = await apnsRequest(`/3/device/${deviceToken}`, {
        authorization: `bearer ${jwt}`,
        'apns-topic': topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        ...(msg.collapseId ? { 'apns-collapse-id': msg.collapseId.slice(0, 64) } : {}),
      }, payload);
      if (res.status >= 200 && res.status < 300) {
        workingTopic = topic;
        return { ok: true, status: res.status };
      }
      let reason = '';
      try { reason = JSON.parse(res.body)?.reason || ''; } catch {}
      last = { ok: false, status: res.status, reason };
      // Only try the next topic when the failure is topic-related.
      const topicIssue = ['TopicDisallowed', 'BadTopic', 'DeviceTokenNotForTopic', 'MissingTopic'].includes(reason);
      if (!topicIssue) return last;
    }
    return last;
  } catch (e: any) {
    return { ok: false, reason: e.message };
  }
}
