import { useState, useEffect, useRef, useCallback } from 'react';
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

function getLeafletHTML(lat: number, lng: number, hasMarker: boolean): string {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#161a22;}
.leaflet-control-attribution{display:none!important;}
.leaflet-control-zoom a{background:#1e2430!important;color:#e8e6e3!important;border-color:#2a3040!important;}
.leaflet-control-zoom a:hover{background:#FF9900!important;color:#161a22!important;}
.hint-overlay{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.75);color:#e8e6e3;padding:8px 16px;border-radius:20px;
  font-family:Inter,sans-serif;font-size:13px;z-index:1000;pointer-events:none;
  display:flex;align-items:center;gap:6px;white-space:nowrap;}
.hint-dot{width:8px;height:8px;background:#FF9900;border-radius:50%;}
</style>
</head><body>
<div id="map"></div>
<div id="hint" class="hint-overlay" style="display:${hasMarker ? 'none' : 'flex'}">
  <span class="hint-dot"></span> Tap the map to drop a pin
</div>
<script>
var map=L.map('map',{attributionControl:false}).setView([${lat},${lng}],13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);

var orangeIcon=L.divIcon({
  html:'<div style="width:24px;height:24px;background:#FF9900;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>',
  iconSize:[24,24],iconAnchor:[12,12],className:''
});

var marker=${hasMarker ? `L.marker([${lat},${lng}],{icon:orangeIcon,draggable:true}).addTo(map)` : 'null'};

${hasMarker ? `marker.on('dragend',function(e){
  var ll=e.target.getLatLng();
  window.parent.postMessage(JSON.stringify({type:'markerMoved',lat:ll.lat,lng:ll.lng}),'*');
});` : ''}

map.on('click',function(e){
  document.getElementById('hint').style.display='none';
  if(marker){marker.setLatLng(e.latlng);}
  else{marker=L.marker(e.latlng,{icon:orangeIcon,draggable:true}).addTo(map);
    marker.on('dragend',function(ev){
      var ll=ev.target.getLatLng();
      window.parent.postMessage(JSON.stringify({type:'markerMoved',lat:ll.lat,lng:ll.lng}),'*');
    });
  }
  window.parent.postMessage(JSON.stringify({type:'mapClick',lat:e.latlng.lat,lng:e.latlng.lng}),'*');
});

window.addEventListener('message',function(e){
  try{var d=JSON.parse(e.data);
    if(d.type==='flyTo'){
      map.flyTo([d.lat,d.lng],14,{duration:0.8});
      document.getElementById('hint').style.display='none';
      if(marker){marker.setLatLng([d.lat,d.lng]);}
      else{marker=L.marker([d.lat,d.lng],{icon:orangeIcon,draggable:true}).addTo(map);
        marker.on('dragend',function(ev){
          var ll=ev.target.getLatLng();
          window.parent.postMessage(JSON.stringify({type:'markerMoved',lat:ll.lat,lng:ll.lng}),'*');
        });
      }
    }
  }catch(ex){}
});
</script>
</body></html>`;
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng, address: initialAddress || '' } : null
  );
  const [searchResults, setSearchResults] = useState<LocationResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    if (visible) {
      setSelectedLocation(
        initialLat && initialLng ? { lat: initialLat, lng: initialLng, address: initialAddress || '' } : null
      );
      setSearchText('');
      setSearchResults([]);
      setShowResults(false);
      setMapKey(prev => prev + 1);
    }
  }, [visible, initialLat, initialLng, initialAddress]);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'mapClick' || d.type === 'markerMoved') {
          setShowResults(false);
          reverseGeocode(d.lat, d.lng).then(addr => {
            setSelectedLocation({ lat: d.lat, lng: d.lng, address: addr });
          });
        }
      } catch {}
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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
        setSelectedLocation(first);
        sendToMap('flyTo', first.lat, first.lng);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function sendToMap(type: string, lat: number, lng: number) {
    try {
      const iframe = iframeRef.current;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({ type, lat, lng }), '*');
      }
    } catch {}
  }

  function handleSelectResult(result: LocationResult) {
    setSelectedLocation(result);
    setShowResults(false);
    sendToMap('flyTo', result.lat, result.lng);
  }

  function handleConfirm() {
    if (selectedLocation) {
      onSelect(selectedLocation);
    }
    onClose();
  }

  const mapLat = initialLat || 43.4799;
  const mapLng = initialLng || -110.7624;
  const hasMarker = !!(initialLat && initialLng);

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
            <View style={styles.resultsContainer}>
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
            </View>
          )}

          <View style={styles.mapContainer}>
            <iframe
              key={mapKey}
              ref={iframeRef}
              srcDoc={getLeafletHTML(mapLat, mapLng, hasMarker)}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: 12,
              }}
              title="Pick location"
            />
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
  resultsContainer: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    maxHeight: 200,
    zIndex: 10,
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
