import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Modal, ActivityIndicator, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';

interface LocationResult {
  address: string;
  lat: number;
  lng: number;
}

interface LocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (result: LocationResult) => void;
  title: string;
  initialLat?: number;
  initialLng?: number;
  initialAddress?: string;
}

export default function LocationPickerModal({
  visible,
  onClose,
  onSelect,
  title,
  initialLat,
  initialLng,
  initialAddress,
}: LocationPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng, address: initialAddress || '' } : null
  );
  const [searchResults, setSearchResults] = useState<LocationResult[]>([]);

  useEffect(() => {
    if (visible) {
      setSelectedLocation(
        initialLat && initialLng ? { lat: initialLat, lng: initialLng, address: initialAddress || '' } : null
      );
      setSearchText('');
      setSearchResults([]);
    }
  }, [visible, initialLat, initialLng, initialAddress]);

  async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results.length > 0) {
        const r = results[0];
        const parts = [r.name, r.street, r.city, r.region, r.postalCode, r.country].filter(Boolean);
        return parts.join(', ');
      }
    } catch {}
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  async function handleSearch() {
    if (!searchText.trim()) return;
    setSearching(true);
    try {
      const results = await Location.geocodeAsync(searchText.trim());
      const mapped: LocationResult[] = [];
      for (const r of results.slice(0, 5)) {
        const addr = await reverseGeocode(r.latitude, r.longitude);
        mapped.push({ lat: r.latitude, lng: r.longitude, address: addr });
      }
      setSearchResults(mapped);
      if (mapped.length > 0) {
        setSelectedLocation(mapped[0]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleConfirm() {
    if (selectedLocation) {
      onSelect(selectedLocation);
    }
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.container, { paddingTop: 67 }]}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
            <Text style={styles.headerTitle}>{title}</Text>
            <Pressable
              onPress={handleConfirm}
              hitSlop={12}
              style={[styles.headerBtn, !selectedLocation && styles.headerBtnDisabled]}
              disabled={!selectedLocation}
            >
              <Ionicons name="checkmark" size={24} color={selectedLocation ? Colors.primary : Colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search address..."
                placeholderTextColor={Colors.textMuted}
                value={searchText}
                onChangeText={setSearchText}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                autoCorrect={false}
              />
              {searchText.length > 0 && (
                <Pressable onPress={() => { setSearchText(''); setSearchResults([]); }}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </Pressable>
              )}
            </View>
            <Pressable style={styles.searchBtn} onPress={handleSearch}>
              {searching ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <Ionicons name="arrow-forward" size={20} color={Colors.background} />
              )}
            </Pressable>
          </View>

          <View style={styles.resultsArea}>
            {searchResults.length > 0 ? (
              searchResults.map((item, index) => (
                <Pressable
                  key={`${item.lat}-${item.lng}-${index}`}
                  style={({ pressed }) => [
                    styles.resultItem,
                    pressed && styles.resultItemPressed,
                    selectedLocation?.lat === item.lat && selectedLocation?.lng === item.lng && styles.resultItemSelected,
                  ]}
                  onPress={() => setSelectedLocation(item)}
                >
                  <Ionicons name="location" size={18} color={
                    selectedLocation?.lat === item.lat && selectedLocation?.lng === item.lng ? Colors.primary : Colors.textMuted
                  } />
                  <View style={styles.resultTextContainer}>
                    <Text style={styles.resultText} numberOfLines={2}>{item.address}</Text>
                    <Text style={styles.resultCoords}>
                      {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                    </Text>
                  </View>
                  {selectedLocation?.lat === item.lat && selectedLocation?.lng === item.lng && (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                  )}
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Search for a location</Text>
                <Text style={styles.emptyDesc}>Type an address above and tap search</Text>
              </View>
            )}
          </View>

          {selectedLocation && (
            <View style={[styles.selectedBar, { paddingBottom: 34 }]}>
              <View style={styles.selectedInfo}>
                <Ionicons name="location" size={20} color={Colors.primary} />
                <Text style={styles.selectedAddress} numberOfLines={2}>{selectedLocation.address}</Text>
              </View>
              <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
                <Text style={styles.confirmBtnText}>SET LOCATION</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnDisabled: {
    opacity: 0.4,
  },
  headerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.text,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultItemPressed: {
    backgroundColor: Colors.primaryLight,
  },
  resultItemSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  resultTextContainer: {
    flex: 1,
  },
  resultText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  resultCoords: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.textSecondary,
  },
  emptyDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
  },
  selectedBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 12,
  },
  selectedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectedAddress: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 15,
    color: Colors.background,
    letterSpacing: 1,
  },
});
