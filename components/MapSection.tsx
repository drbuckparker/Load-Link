import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
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
  const [locationLoading, setLocationLoading] = useState(true);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setUserLocation(coords);
          mapRef.current?.animateToRegion({
            latitude: coords.lat,
            longitude: coords.lng,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }, 500);
        }
      } catch {}
      setLocationLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (defaultLat && defaultLng && !userLocation) {
      mapRef.current?.animateToRegion({
        latitude: defaultLat,
        longitude: defaultLng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 300);
    }
  }, [defaultLat, defaultLng]);

  const displayLat = userLocation?.lat || (defaultLat != null ? Number(defaultLat) : undefined);
  const displayLng = userLocation?.lng || (defaultLng != null ? Number(defaultLng) : undefined);

  const hasCoordinates = displayLat !== undefined && displayLng !== undefined && !isNaN(displayLat) && !isNaN(displayLng);

  return (
    <View style={styles.mapWrapper}>
      {hasCoordinates ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          region={{
            latitude: userLocation?.lat || displayLat!,
            longitude: userLocation?.lng || displayLng!,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
        >
          <Marker
            coordinate={{
              latitude: userLocation?.lat || displayLat!,
              longitude: userLocation?.lng || displayLng!,
            }}
            title="You"
          />
        </MapView>
      ) : (
        <View style={[styles.map, styles.mapPlaceholder]}>
          {locationLoading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <Text style={styles.noLocationText}>Location unavailable</Text>
          )}
        </View>
      )}
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
  mapPlaceholder: {
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noLocationText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
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
