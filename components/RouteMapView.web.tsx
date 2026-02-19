import { View, Text, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

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
  const dest = props.hasDest ? `${props.dLat},${props.dLng}` : `${props.oLat},${props.oLng}`;
  const origin = props.hasOrigin ? `${props.oLat},${props.oLng}` : '';

  return (
    <View style={{ flex: 1, backgroundColor: Colors.cardBg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="map" size={64} color={Colors.textMuted} />
      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 16, color: Colors.textSecondary, marginTop: 12 }}>
        Map view available on mobile
      </Text>
      <Pressable
        onPress={() => Linking.openURL(`https://www.google.com/maps/dir/${origin}/${dest}`)}
        style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 }}
      >
        <Ionicons name="open-outline" size={18} color="#fff" />
        <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 14, color: '#fff' }}>OPEN IN GOOGLE MAPS</Text>
      </Pressable>
    </View>
  );
}
