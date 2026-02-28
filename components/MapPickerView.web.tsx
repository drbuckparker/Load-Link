import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

interface MapPickerViewProps {
  mapPin: { latitude: number; longitude: number } | null;
  onMapPress: (e: any) => void;
  userLat: number | null;
  userLng: number | null;
  originLat: number | null;
  originLng: number | null;
}

export default function MapPickerView({ mapPin, onMapPress, userLat, userLng }: MapPickerViewProps) {
  return (
    <View style={styles.fallback}>
      <Ionicons name="map-outline" size={48} color={Colors.textMuted} />
      <Text style={styles.text}>Tap the map area to set coordinates</Text>
      <Text style={styles.sub}>Full map available on your mobile device via Expo Go</Text>
      <Pressable
        style={styles.btn}
        onPress={() => {
          const lat = userLat || 43.48;
          const lng = userLng || -110.76;
          onMapPress({ nativeEvent: { coordinate: { latitude: lat, longitude: lng } } });
        }}
      >
        <Text style={styles.btnText}>USE CURRENT LOCATION</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.card,
    gap: 8,
    padding: 20,
  },
  text: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.text,
    textAlign: 'center',
  },
  sub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  btn: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 20,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
    color: Colors.primaryForeground,
    letterSpacing: 1,
  },
});
