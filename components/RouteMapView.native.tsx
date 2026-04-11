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
  const oLat = Number(props.oLat);
  const oLng = Number(props.oLng);
  const dLat = Number(props.dLat);
  const dLng = Number(props.dLng);
  const midLat = Number(props.midLat);
  const midLng = Number(props.midLng);

  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={{
        latitude: midLat,
        longitude: midLng,
        latitudeDelta: Math.max(props.latDelta, 0.05),
        longitudeDelta: Math.max(props.lngDelta, 0.05),
      }}
      mapType="standard"
    >
      {props.hasOrigin && !isNaN(oLat) && !isNaN(oLng) && (
        <Marker
          coordinate={{ latitude: oLat, longitude: oLng }}
          title="Pickup"
          description={props.originAddress}
          pinColor="#22c55e"
        />
      )}
      {props.hasDest && !isNaN(dLat) && !isNaN(dLng) && (
        <Marker
          coordinate={{ latitude: dLat, longitude: dLng }}
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
