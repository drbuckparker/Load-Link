import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Modal, ActivityIndicator, Platform, ScrollView } from 'react-native';
import MapView, { Marker, MapPressEvent, Region } from 'react-native-maps';
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
  const mapRef = useRef<MapView>(null);
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng, address: initialAddress || '' } : null
  );
  const [region, setRegion] = useState<Region>({
    latitude: initialLat || 43.4799,
    longitude: initialLng || -110.7624,
    latitudeDelta: 0.15,
    longitudeDelta: 0.15,
  });
  const [searchResults, setSearchResults] = useState<LocationResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (visible && !initialLat && !initialLng) {
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const newRegion = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.15,
              longitudeDelta: 0.15,
            };
            setRegion(newRegion);
            mapRef.current?.animateToRegion(newRegion, 500);
          }
        } catch {}
      })();
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setSelectedLocation(
        initialLat && initialLng ? { lat: initialLat, lng: initialLng, address: initialAddress || '' } : null
      );
      setSearchText('');
      setSearchResults([]);
      setShowResults(false);
      if (initialLat && initialLng) {
        setRegion({
          latitude: initialLat,
          longitude: initialLng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      }
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
    setShowResults(true);
    try {
      const query = encodeURIComponent(searchText.trim());
      const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&addressdetails=1&limit=8&countrycodes=us,ca`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'LoadLinkApp/1.0' },
      });
      const data = await resp.json();
      const mapped: LocationResult[] = data.map((item: any) => ({
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        address: item.display_name,
      }));
      setSearchResults(mapped);
      if (mapped.length > 0) {
        const first = mapped[0];
        const newRegion = {
          latitude: first.lat,
          longitude: first.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };
        setRegion(newRegion);
        mapRef.current?.animateToRegion(newRegion, 500);
        setSelectedLocation(first);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  const [locating, setLocating] = useState(false);

  async function handleFindMyLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const { latitude, longitude } = loc.coords;
        const addr = await reverseGeocode(latitude, longitude);
        const newRegion = {
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        setRegion(newRegion);
        mapRef.current?.animateToRegion(newRegion, 500);
        setSelectedLocation({ lat: latitude, lng: longitude, address: addr });
        setShowResults(false);
      }
    } catch {}
    setLocating(false);
  }

  async function handleMapPress(e: MapPressEvent) {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setShowResults(false);
    const addr = await reverseGeocode(latitude, longitude);
    setSelectedLocation({ lat: latitude, lng: longitude, address: addr });
  }

  function handleSelectResult(result: LocationResult) {
    setSelectedLocation(result);
    setShowResults(false);
    const newRegion = {
      latitude: result.lat,
      longitude: result.lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
    setRegion(newRegion);
    mapRef.current?.animateToRegion(newRegion, 500);
  }

  function handleConfirm() {
    if (selectedLocation) {
      onSelect(selectedLocation);
    }
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
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
              <Pressable onPress={() => { setSearchText(''); setSearchResults([]); setShowResults(false); }}>
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

        {showResults && searchResults.length > 0 && (
          <ScrollView style={styles.resultsContainer} nestedScrollEnabled>
            {searchResults.map((item, index) => (
              <Pressable
                key={`${item.lat}-${item.lng}-${index}`}
                style={({ pressed }) => [styles.resultItem, pressed && styles.resultItemPressed]}
                onPress={() => handleSelectResult(item)}
              >
                <Ionicons name="location" size={16} color={Colors.primary} />
                <Text style={styles.resultText} numberOfLines={2}>{item.address}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={region}
            onPress={handleMapPress}
            mapType="standard"
          >
            {selectedLocation && (
              <Marker
                coordinate={{ latitude: selectedLocation.lat, longitude: selectedLocation.lng }}
                draggable
                onDragEnd={async (e) => {
                  const { latitude, longitude } = e.nativeEvent.coordinate;
                  const addr = await reverseGeocode(latitude, longitude);
                  setSelectedLocation({ lat: latitude, lng: longitude, address: addr });
                }}
              />
            )}
          </MapView>

          <Pressable
            style={({ pressed }) => [styles.myLocationBtn, pressed && styles.myLocationBtnPressed]}
            onPress={handleFindMyLocation}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="navigate" size={22} color={Colors.primary} />
            )}
          </Pressable>

          {!selectedLocation && (
            <View style={styles.mapHint}>
              <Ionicons name="finger-print" size={16} color={Colors.primary} />
              <Text style={styles.mapHintText}>Tap the map to drop a pin</Text>
            </View>
          )}
        </View>

        {selectedLocation && (
          <View style={[styles.selectedBar, { paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 16) }]}>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  resultsContainer: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    maxHeight: 200,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  resultItemPressed: {
    backgroundColor: Colors.primaryLight,
  },
  resultText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.text,
  },
  mapContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  map: {
    flex: 1,
  },
  myLocationBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(22, 26, 34, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  myLocationBtnPressed: {
    backgroundColor: Colors.surface,
  },
  mapHint: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  mapHintText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text,
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
