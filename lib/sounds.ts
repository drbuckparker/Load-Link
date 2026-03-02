import { Audio } from 'expo-av';
import { Platform } from 'react-native';

let soundObject: Audio.Sound | null = null;

export async function playNotificationSound() {
  try {
    if (Platform.OS === 'web') return;

    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: false,
      shouldDuckAndroid: true,
    });

    if (soundObject) {
      await soundObject.unloadAsync();
      soundObject = null;
    }

    const { sound } = await Audio.Sound.createAsync(
      require('@/assets/sounds/notification.wav'),
      { shouldPlay: true, volume: 0.7 }
    );
    soundObject = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
        soundObject = null;
      }
    });
  } catch (e) {
  }
}

export async function playMessageSound() {
  try {
    if (Platform.OS === 'web') return;

    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: false,
      shouldDuckAndroid: true,
    });

    if (soundObject) {
      await soundObject.unloadAsync();
      soundObject = null;
    }

    const { sound } = await Audio.Sound.createAsync(
      require('@/assets/sounds/message.wav'),
      { shouldPlay: true, volume: 0.5 }
    );
    soundObject = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
        soundObject = null;
      }
    });
  } catch (e) {
  }
}
