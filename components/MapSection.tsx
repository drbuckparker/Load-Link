import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import Colors from '@/constants/colors';

interface MapSectionProps {
  address?: string | null;
  defaultLat?: number;
  defaultLng?: number;
}

export default function MapSection({ address, defaultLat, defaultLng }: MapSectionProps) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch {}
    })();
  }, []);

  const mapLat = userLocation?.lat || defaultLat || 40.7608;
  const mapLng = userLocation?.lng || defaultLng || -111.891;

  return (
    <View style={styles.mapWrapper}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: mapLat,
          longitude: mapLng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {userLocation && (
          <Marker
            coordinate={{ latitude: userLocation.lat, longitude: userLocation.lng }}
            title="You"
          />
        )}
      </MapView>
      {userLocation && (
        <View style={styles.liveTag}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    height: 160,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  liveTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: '#fff',
  },
});
