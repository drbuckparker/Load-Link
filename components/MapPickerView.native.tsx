import { useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import Colors from '@/constants/colors';

interface MapPickerViewProps {
  mapPin: { latitude: number; longitude: number } | null;
  onMapPress: (e: any) => void;
  userLat: number | null;
  userLng: number | null;
  originLat: number | null;
  originLng: number | null;
}

export default function MapPickerView({ mapPin, onMapPress, userLat, userLng, originLat, originLng }: MapPickerViewProps) {
  const mapRef = useRef<MapView>(null);

  const centerLat = Number(mapPin?.latitude || originLat || userLat || 43.48);
  const centerLng = Number(mapPin?.longitude || originLng || userLng || -110.76);

  return (
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
      userInterfaceStyle="dark"
    >
      {mapPin && (
        <Marker
          coordinate={mapPin}
          draggable
          onDragEnd={onMapPress}
        />
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
