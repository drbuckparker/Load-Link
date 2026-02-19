import { View, Text, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { getApiUrl } from '@/lib/query-client';

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
  const origin = props.hasOrigin ? `${props.oLat},${props.oLng}` : '';
  const dest = props.hasDest ? `${props.dLat},${props.dLng}` : `${props.oLat},${props.oLng}`;
  const baseUrl = getApiUrl();
  const mapUrl = `${baseUrl}/api/map-embed?oLat=${props.oLat}&oLng=${props.oLng}&dLat=${props.dLat}&dLng=${props.dLng}&hasOrigin=${props.hasOrigin}&hasDest=${props.hasDest}`;

  return (
    <View style={{ flex: 1 }}>
      <iframe
        src={mapUrl}
        style={{ width: '100%', height: '100%', border: 'none' } as any}
        allowFullScreen
      />
      <View style={{
        position: 'absolute', bottom: 50, right: 16,
      }}>
        <Pressable
          onPress={() => Linking.openURL(`https://www.google.com/maps/dir/${origin}/${dest}`)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: Colors.primary, borderRadius: 10,
            paddingHorizontal: 14, paddingVertical: 10,
          }}
        >
          <Ionicons name="open-outline" size={16} color="#fff" />
          <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 12, color: '#fff' }}>GOOGLE MAPS</Text>
        </Pressable>
      </View>
    </View>
  );
}
