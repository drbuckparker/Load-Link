import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';

interface MapSectionProps {
  address?: string | null;
  defaultLat?: number;
  defaultLng?: number;
}

function getLeafletHTML(lat: number, lng: number): string {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#161a22;}
.leaflet-control-attribution{display:none!important;}
</style>
</head><body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([${lat},${lng}],13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
var marker=L.circleMarker([${lat},${lng}],{radius:8,fillColor:'#FF9900',color:'#fff',weight:2,fillOpacity:1}).addTo(map);
window.addEventListener('message',function(e){
  try{var d=JSON.parse(e.data);if(d.type==='updateLocation'){
    map.setView([d.lat,d.lng],13);marker.setLatLng([d.lat,d.lng]);
  }}catch(ex){}
});
</script>
</body></html>`;
}

export default function MapSection({ address, defaultLat, defaultLng }: MapSectionProps) {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          if (defaultLat && defaultLng) {
            setLocation({ lat: defaultLat, lng: defaultLng });
          }
        },
        { enableHighAccuracy: false, timeout: 5000 }
      );
    } else if (defaultLat && defaultLng) {
      setLocation({ lat: defaultLat, lng: defaultLng });
    }
  }, [defaultLat, defaultLng]);

  const mapLat = location?.lat || defaultLat || 40.7608;
  const mapLng = location?.lng || defaultLng || -111.891;

  return (
    <View style={styles.mapWrapper}>
      <iframe
        ref={iframeRef}
        srcDoc={getLeafletHTML(mapLat, mapLng)}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: 12,
        }}
        title="Current location map"
      />
      {location && (
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
    borderWidth: 1,
    borderColor: Colors.border,
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
