// Builders for Expo push messages. Every push MUST carry an explicit iOS
// sound — if `sound` is omitted, APNs delivers the notification silently
// (it lands in Notification Center with no sound, banner chime, or vibration),
// which is exactly the "push arrives but makes no noise" failure mode.
// Android ignores `sound`/`interruptionLevel` here and uses the channel's
// fixed settings instead (channelId), so both platforms stay covered.

export type ExpoPushMessage = {
  to: string;
  sound: string;
  title: string;
  body: string;
  data: Record<string, any>;
  channelId: string;
  priority: 'default' | 'normal' | 'high';
  interruptionLevel: 'passive' | 'active' | 'timeSensitive' | 'critical';
};

export function buildExpoPushMessage(opts: {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  /** iOS notification sound: 'default' or a sound file bundled in the app
   *  binary (e.g. 'truckhorn.wav'). Never empty/undefined — that means silent. */
  sound?: string;
  /** Android channel; the channel (created client-side) controls Android
   *  sound/vibration/importance. */
  channelId?: string;
  interruptionLevel?: ExpoPushMessage['interruptionLevel'];
}): ExpoPushMessage {
  const sound = (opts.sound || '').trim() || 'default';
  return {
    to: opts.to,
    sound,
    title: opts.title,
    body: opts.body,
    data: opts.data || {},
    channelId: opts.channelId || 'default',
    priority: 'high',
    // 'active' lights the screen and plays sound immediately (iOS 15+).
    // 'timeSensitive' additionally breaks through Focus modes when the build
    // has the time-sensitive entitlement; APNs downgrades it to 'active' when
    // the entitlement is absent, so it is always safe to request.
    interruptionLevel: opts.interruptionLevel || 'active',
  };
}

// ---------------------------------------------------------------------------
// Business-event push builders. Each driver-facing business event has ONE
// canonical sound + Android channel pairing, defined here so senders can't
// drift. Android channel sounds are immutable after creation, so each custom
// sound needs its own dedicated channel (created client-side in
// lib/notifications.ts):
//   - New job in a driver's radius  -> truckhorn.wav    on channel 'job-alerts'
//   - Driver awarded/approved a job -> cashregister.wav on channel 'job-awarded'
// Both sound files must be listed in app.json's expo-notifications "sounds"
// so they are bundled into the native binary.
// ---------------------------------------------------------------------------

export const PUSH_SOUNDS = {
  NEW_JOB: 'truckhorn.wav',
  JOB_AWARDED: 'cashregister.wav',
} as const;

export const PUSH_CHANNELS = {
  NEW_JOB: 'job-alerts',
  JOB_AWARDED: 'job-awarded',
} as const;

/** Push for a new job posted within a driver's configured location/radius. */
export function buildNewJobNearbyPush(opts: {
  to: string; title: string; body: string; jobId: string;
}): ExpoPushMessage {
  return buildExpoPushMessage({
    to: opts.to,
    title: opts.title,
    body: opts.body,
    data: { type: 'new_job', jobId: opts.jobId },
    sound: PUSH_SOUNDS.NEW_JOB,
    channelId: PUSH_CHANNELS.NEW_JOB,
    interruptionLevel: 'timeSensitive',
  });
}

/** Push for a driver being awarded a job (assignment approved / auto-approved). */
export function buildJobAwardedPush(opts: {
  to: string; title: string; body: string; jobId: string;
}): ExpoPushMessage {
  return buildExpoPushMessage({
    to: opts.to,
    title: opts.title,
    body: opts.body,
    data: { type: 'job_awarded', jobId: opts.jobId },
    sound: PUSH_SOUNDS.JOB_AWARDED,
    channelId: PUSH_CHANNELS.JOB_AWARDED,
    interruptionLevel: 'timeSensitive',
  });
}
