import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const MAP_DAY_NIGHT_KEY = 'mapDayNight';

// Dark map styling for Android (Google Maps). iOS uses userInterfaceStyle instead.
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e4e' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
];

export default function MapPickerView({ mapPin, onMapPress, userLat, userLng, originLat, originLng }: MapPickerViewProps) {
  const mapRef = useRef<MapView>(null);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(MAP_DAY_NIGHT_KEY)
      .then(val => {
        if (val === 'light') setIsDark(false);
      })
      .catch(() => {});
  }, []);

  const toggleDayNight = () => {
    setIsDark(prev => {
      const next = !prev;
      AsyncStorage.setItem(MAP_DAY_NIGHT_KEY, next ? 'dark' : 'light').catch(() => {});
      return next;
    });
  };

  const centerLat = Number(mapPin?.latitude || originLat || userLat || 43.48);
  const centerLng = Number(mapPin?.longitude || originLng || userLng || -110.76);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          latitude: centerLat,
          longitude: centerLng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onPress={onMapPress}
        showsUserLocation
        showsMyLocationButton
        mapType="standard"
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        customMapStyle={isDark ? DARK_MAP_STYLE : []}
      >
        {mapPin && (
          <Marker
            coordinate={mapPin}
            draggable
            onDragEnd={onMapPress}
          />
        )}
      </MapView>
      <Pressable
        style={({ pressed }) => [styles.dayNightBtn, pressed && styles.dayNightBtnPressed]}
        onPress={toggleDayNight}
        hitSlop={8}
        accessibilityLabel="Toggle day/night map"
      >
        <Ionicons name={isDark ? 'sunny' : 'moon'} size={22} color={Colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  dayNightBtn: {
    position: 'absolute',
    top: 64,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(22,26,34,0.9)',
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNightBtnPressed: {
    backgroundColor: Colors.card,
  },
});
