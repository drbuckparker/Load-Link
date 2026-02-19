import MapView, { Marker, Polyline } from 'react-native-maps';

interface RouteMapViewProps {
  oLat: number;
  oLng: number;
  dLat: number;
  dLng: number;
  hasOrigin: boolean;
  hasDest: boolean;
  midLat: number;
  midLng: number;
  latDelta: number;
  lngDelta: number;
  originAddress: string;
  destinationAddress: string;
  routeCoords: { latitude: number; longitude: number }[];
}

export default function RouteMapView(props: RouteMapViewProps) {
  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={{
        latitude: props.midLat,
        longitude: props.midLng,
        latitudeDelta: Math.max(props.latDelta, 0.05),
        longitudeDelta: Math.max(props.lngDelta, 0.05),
      }}
      mapType="standard"
    >
      {props.hasOrigin && (
        <Marker
          coordinate={{ latitude: props.oLat, longitude: props.oLng }}
          title="Pickup"
          description={props.originAddress}
          pinColor="#22c55e"
        />
      )}
      {props.hasDest && (
        <Marker
          coordinate={{ latitude: props.dLat, longitude: props.dLng }}
          title="Dropoff"
          description={props.destinationAddress}
          pinColor="#FF9900"
        />
      )}
      {props.routeCoords.length > 1 && (
        <Polyline
          coordinates={props.routeCoords}
          strokeColor="#3b82f6"
          strokeWidth={4}
        />
      )}
    </MapView>
  );
}
