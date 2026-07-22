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
