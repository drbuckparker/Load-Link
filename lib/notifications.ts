import { Platform } from 'react-native';
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
    return Notifications;
  } catch {
    return null;
  }
}

if (Platform.OS === 'ios') {
  getNotifications();
}

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const N = await getNotifications();
    if (!N) return null;

    const { status: existingStatus } = await N.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await N.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', {
        name: 'LoadLink',
        importance: N.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });
    }

    const tokenData = await N.getExpoPushTokenAsync({
      projectId: undefined,
    });
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
