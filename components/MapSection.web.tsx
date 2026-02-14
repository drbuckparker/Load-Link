import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

interface MapSectionProps {
  address?: string | null;
}

export default function MapSection({ address }: MapSectionProps) {
  return (
    <View style={styles.mapPlaceholder}>
      <Ionicons name="map-outline" size={40} color={Colors.textMuted} />
      <Text style={styles.mapPlaceholderText}>Map available on mobile</Text>
      {address && (
        <Text style={styles.mapAddress} numberOfLines={2}>{address}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mapPlaceholder: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  mapPlaceholderText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
  mapAddress: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
});
