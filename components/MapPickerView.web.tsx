import { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';

interface MapPickerViewProps {
  mapPin: { latitude: number; longitude: number } | null;
  onMapPress: (e: any) => void;
  userLat: number | null;
  userLng: number | null;
  originLat: number | null;
  originLng: number | null;
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
.my-loc-btn{position:absolute;top:12px;right:12px;width:44px;height:44px;border-radius:22px;
  background:rgba(22,26,34,0.9);border:1px solid #2a3040;z-index:1000;cursor:pointer;
  display:flex;align-items:center;justify-content:center;transition:background 0.15s;}
.my-loc-btn:hover{background:#1e2430;}
.my-loc-btn svg{fill:#FF9900;}
.my-loc-btn.loading svg{animation:spin 1s linear infinite;}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.day-night-btn{position:absolute;top:64px;right:12px;width:44px;height:44px;border-radius:22px;
  background:rgba(22,26,34,0.9);border:1px solid #2a3040;z-index:1000;cursor:pointer;
  display:flex;align-items:center;justify-content:center;font-size:20px;transition:background 0.15s;}
.day-night-btn:hover{background:#1e2430;}
</style>
</head><body>
<div id="map"></div>
<div id="dayNightBtn" class="day-night-btn" title="Toggle day/night map">&#9728;&#65039;</div>
<div id="myLocBtn" class="my-loc-btn" title="Find my location">
  <svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
</div>
<script>
var map=L.map('map',{attributionControl:false}).setView([${lat},${lng}],${hasMarker ? 14 : 11});
var darkTiles=L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19});
var lightTiles=L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:19});
var isDark=true;
try{isDark=(localStorage.getItem('mapDayNight')||'dark')==='dark';}catch(ex){}
(isDark?darkTiles:lightTiles).addTo(map);
var dnBtn=document.getElementById('dayNightBtn');
function syncDnBtn(){dnBtn.innerHTML=isDark?'&#9728;&#65039;':'&#127769;';}
syncDnBtn();
dnBtn.addEventListener('click',function(){
  isDark=!isDark;
  try{localStorage.setItem('mapDayNight',isDark?'dark':'light');}catch(ex){}
  if(isDark){map.removeLayer(lightTiles);darkTiles.addTo(map);}
  else{map.removeLayer(darkTiles);lightTiles.addTo(map);}
  syncDnBtn();
});

var orangeIcon=L.divIcon({
  html:'<div style="width:24px;height:24px;background:#FF9900;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>',
  iconSize:[24,24],iconAnchor:[12,12],className:''
});

var marker=${hasMarker ? `L.marker([${lat},${lng}],{icon:orangeIcon,draggable:true}).addTo(map)` : 'null'};

function attachDrag(m){
  m.on('dragend',function(e){
    var ll=e.target.getLatLng();
    window.parent.postMessage(JSON.stringify({type:'mapClick',lat:ll.lat,lng:ll.lng}),'*');
  });
}
if(marker){attachDrag(marker);}

function placeMarker(lat,lng,notify){
  if(marker){marker.setLatLng([lat,lng]);}
  else{marker=L.marker([lat,lng],{icon:orangeIcon,draggable:true}).addTo(map);attachDrag(marker);}
  if(notify){window.parent.postMessage(JSON.stringify({type:'mapClick',lat:lat,lng:lng}),'*');}
}

map.on('click',function(e){placeMarker(e.latlng.lat,e.latlng.lng,true);});

document.getElementById('myLocBtn').addEventListener('click',function(){
  var btn=this;btn.classList.add('loading');
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(function(pos){
      map.flyTo([pos.coords.latitude,pos.coords.longitude],15,{duration:0.8});
      placeMarker(pos.coords.latitude,pos.coords.longitude,true);
      btn.classList.remove('loading');
    },function(){btn.classList.remove('loading');},{enableHighAccuracy:true,timeout:10000});
  }else{btn.classList.remove('loading');}
});

window.addEventListener('message',function(e){
  try{var d=JSON.parse(e.data);
    if(d.type==='flyTo'){map.flyTo([d.lat,d.lng],14,{duration:0.8});placeMarker(d.lat,d.lng,false);}
  }catch(ex){}
});
</script>
</body></html>`;
}

export default function MapPickerView({ mapPin, onMapPress, userLat, userLng, originLat, originLng }: MapPickerViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Initial center: existing pin > origin > user GPS > Jackson, WY area.
  const initLat = mapPin?.latitude ?? originLat ?? userLat ?? 43.48;
  const initLng = mapPin?.longitude ?? originLng ?? userLng ?? -110.76;

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'mapClick') {
          // Mark as map-originated so the flyTo effect doesn't re-fly to it.
          lastExternalPin.current = `${d.lat},${d.lng}`;
          onMapPress({ nativeEvent: { coordinate: { latitude: d.lat, longitude: d.lng } } });
        }
      } catch {}
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMapPress]);

  // Fly the map to a pin set from outside (e.g. address search).
  const lastExternalPin = useRef<string>('');
  useEffect(() => {
    if (!mapPin) return;
    const key = `${mapPin.latitude},${mapPin.longitude}`;
    if (key === lastExternalPin.current) return;
    lastExternalPin.current = key;
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ type: 'flyTo', lat: mapPin.latitude, lng: mapPin.longitude }),
        '*'
      );
    } catch {}
  }, [mapPin]);

  return (
    <View style={styles.wrapper}>
      <iframe
        ref={iframeRef}
        srcDoc={getLeafletHTML(initLat, initLng, !!mapPin)}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Pick location"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: Colors.card,
  },
});
