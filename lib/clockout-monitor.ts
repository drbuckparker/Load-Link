import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pointToRouteMiles, CLOCKOUT_GEOFENCE_MILES } from '@/lib/geo';
import { apiRequest } from '@/lib/query-client';

// Watches a clocked-in driver's location (while the app is open or backgrounded,
// using the "While Using" permission + iOS background-location mode) and pings
// them once with a two-button reminder when they get more than 15 miles from the
// job's pickup, dropoff, or the route between them — so they never forget to
// clock out. iOS-only, matching the rest of the app's notification support; it
// only runs on a native/published build, not in Expo Go or on web.

const STORAGE_KEY = 'loadlink_clockout_session';
export const CLOCKOUT_CATEGORY_ID = 'clockout-check';

type ClockOutSession = {
  jobId: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  notified?: boolean;
};

let Location: typeof import('expo-location') | null = null;
let Notifications: typeof import('expo-notifications') | null = null;
let watchSub: { remove: () => void } | null = null;
let categoryReady = false;

async function getLocation() {
  if (Location) return Location;
  try { Location = await import('expo-location'); return Location; } catch { return null; }
}
async function getNotif() {
  if (Notifications) return Notifications;
  try { Notifications = await import('expo-notifications'); return Notifications; } catch { return null; }
}

async function loadSession(): Promise<ClockOutSession | null> {
  try { const raw = await AsyncStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function saveSession(s: ClockOutSession) {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}
async function clearSession() {
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
}

async function ensureCategory() {
  if (categoryReady) return;
  const N = await getNotif();
  if (!N) return;
  try {
    await N.setNotificationCategoryAsync(CLOCKOUT_CATEGORY_ID, [
      { identifier: 'still_working', buttonTitle: 'Still working', options: { opensAppToForeground: false } },
      { identifier: 'clock_out', buttonTitle: 'Clock out', options: { opensAppToForeground: true } },
    ]);
    categoryReady = true;
  } catch {}
}

// Confirm the driver still has an open run before nagging — guards against a
// clock-out that happened on another device. On a network error we assume still
// active, since missing a real "forgot to clock out" is worse than a rare ping.
async function hasActiveRun(jobId: string): Promise<boolean> {
  try {
    const res = await apiRequest('GET', `/api/jobs/${jobId}`);
    const job: any = await res.json();
    const runs = job?.runs;
    return Array.isArray(runs) && runs.some((r: any) => !r.clock_out_time && !r.clockOutTime);
  } catch {
    return true;
  }
}

async function handleLocation(lat: number, lng: number) {
  // A failed GPS read must never look like (0,0) — that reads as ~6000 mi away.
  if (!lat || !lng) return;
  const session = await loadSession();
  if (!session) { await stopClockOutMonitor(); return; }
  const miles = pointToRouteMiles(lat, lng, session.originLat, session.originLng, session.destLat, session.destLng);
  if (miles == null) return;
  if (miles > CLOCKOUT_GEOFENCE_MILES) {
    if (!session.notified) {
      // Don't nag if the user logged out or already clocked out elsewhere.
      const token = await AsyncStorage.getItem('loadlink_token');
      if (!token) { await stopClockOutMonitor(); return; }
      if (!(await hasActiveRun(session.jobId))) { await stopClockOutMonitor(); return; }
      const N = await getNotif();
      if (N) {
        await ensureCategory();
        try {
          await N.scheduleNotificationAsync({
            content: {
              title: 'Still on the clock?',
              body: `You're about ${Math.round(miles)} miles from the job. Are you still working, or did you forget to clock out?`,
              sound: true,
              categoryIdentifier: CLOCKOUT_CATEGORY_ID,
              data: { type: 'clockout_reminder', jobId: session.jobId },
            },
            trigger: null,
          });
        } catch {}
      }
      // Fire once per excursion; re-arms when they come back within range.
      await saveSession({ ...session, notified: true });
    }
  } else if (session.notified) {
    await saveSession({ ...session, notified: false });
  }
}

async function beginWatch() {
  const L = await getLocation();
  if (!L) return;
  try {
    const { status } = await L.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const req = await L.requestForegroundPermissionsAsync();
      if (req.status !== 'granted') return;
    }
  } catch { return; }
  if (watchSub) { try { watchSub.remove(); } catch {} watchSub = null; }
  try {
    watchSub = await L.watchPositionAsync(
      { accuracy: L.Accuracy.Balanced, distanceInterval: 800, timeInterval: 60000 },
      (loc) => { handleLocation(loc.coords.latitude, loc.coords.longitude); },
    );
  } catch {}
}

export async function startClockOutMonitor(session: Omit<ClockOutSession, 'notified'>) {
  if (Platform.OS !== 'ios') return;
  const hasOrigin = !!session.originLat && !!session.originLng;
  const hasDest = !!session.destLat && !!session.destLng;
  if (!hasOrigin && !hasDest) return;
  await saveSession({ ...session, notified: false });
  await ensureCategory();
  await beginWatch();
}

export async function stopClockOutMonitor() {
  if (watchSub) { try { watchSub.remove(); } catch {} watchSub = null; }
  await clearSession();
}

// Re-arm the watcher on app launch/resume if a shift is still active (the OS may
// have paused the JS subscription while the app was suspended).
export async function resumeClockOutMonitor() {
  if (Platform.OS !== 'ios') return;
  const session = await loadSession();
  if (!session) return;
  // Drop a stale session left behind by a logout so we don't resume tracking
  // (and reminding) someone who is no longer signed in.
  const token = await AsyncStorage.getItem('loadlink_token');
  if (!token) { await clearSession(); return; }
  await beginWatch();
}
