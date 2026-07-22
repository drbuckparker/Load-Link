import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { apiRequest } from '@/lib/query-client';

let Notifications: typeof import('expo-notifications') | null = null;

async function getNotifications() {
  if (Notifications) return Notifications;
  if (Platform.OS === 'web') return null;
  try {
    Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (Platform.OS === 'android') {
      // Android routes notifications through channels. A channel's importance,
      // vibration and sound are fixed at creation and OVERRIDE the per-message
      // values, so we need one channel per alert style.
      //
      // 'job-alerts': MAX importance so new-job alerts pop a heads-up banner and
      // vibrate even on silent, and play the truck horn. Used by the new-job
      // driver push (channelId 'job-alerts').
      await Notifications.setNotificationChannelAsync('job-alerts', {
        name: 'New Job Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400],
        enableVibrate: true,
        sound: 'truckhorn.wav',
        lightColor: '#FF9900',
      });
      // 'job-awarded': the driver won/was approved for a job — plays the cash
      // register. Dedicated channel because Android channel sounds are
      // immutable after creation; reusing 'job-alerts' would force the horn.
      await Notifications.setNotificationChannelAsync('job-awarded', {
        name: 'Job Awarded',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400],
        enableVibrate: true,
        sound: 'cashregister.wav',
        lightColor: '#FF9900',
      });
      // 'default': everything else — still shows a banner and vibrates, but with
      // the standard notification sound.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'General',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        lightColor: '#FF9900',
      });
    }

    return Notifications;
  } catch {
    return null;
  }
}

if (Platform.OS !== 'web') {
  getNotifications();
}

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const N = await getNotifications();
    if (!N) return null;

    const existing = await N.getPermissionsAsync();
    let finalStatus = existing.status;

    // Re-request when not granted OR when iOS granted only "provisional"
    // (quiet) delivery — provisional notifications go straight to Notification
    // Center with NO sound or banner, which looks like "push arrives silently".
    // Passing explicit iOS options guarantees we ask for alert + sound + badge.
    const iosProvisional =
      Platform.OS === 'ios' &&
      existing.ios?.status === N.IosAuthorizationStatus.PROVISIONAL;
    if (existing.status !== 'granted' || iosProvisional) {
      const { status } = await N.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: true },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      '06835a51-8023-416f-948f-d8450c3495bf';
    const tokenData = await N.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    try {
      await apiRequest('POST', '/api/push/register', { token });
    } catch (e) {
    }

    return token;
  } catch (e) {
    return null;
  }
}
