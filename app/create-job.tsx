import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Switch,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Colors from '@/constants/colors';
import MapPickerView from '@/components/MapPickerView';
import { apiRequest, queryClient, getApiUrl } from '@/lib/query-client';
import { fetch } from 'expo/fetch';

const DISMISSED_KEY = 'loadlink_dismissed_locations';

const JOB_TYPES = [
  { label: 'Single Load', value: 'single_load' },
  { label: 'Single Day', value: 'full_day' },
  { label: 'Multi-Day', value: 'multi_day' },
] as const;

const TRUCK_TYPES = [
  { label: 'End Dump', value: 'end_dump' },
  { label: 'Side Dump', value: 'side_dump' },
  { label: 'Belly Dump', value: 'belly_dump' },
] as const;

const RATE_TYPES = [
  { label: 'Per Hour', value: 'per_hour' },
  { label: 'Per Ton', value: 'per_ton' },
  { label: 'Per Load', value: 'per_load' },
  { label: 'Flat Rate', value: 'flat_rate' },
] as const;

const MATERIAL_WEIGHT_PER_YARD: Record<string, number> = {
  'gravel': 1.4,
  '3/4 crush': 1.4,
  '3/4 minus': 1.4,
  'crushed rock': 1.4,
  'crushed gravel': 1.4,
  'road base': 1.5,
  'road mix': 1.5,
  'base course': 1.5,
  'pit run': 1.35,
  'sand': 1.35,
  'fill sand': 1.35,
  'concrete sand': 1.35,
  'fill': 1.2,
  'fill dirt': 1.2,
  'dirt': 1.1,
  'topsoil': 1.1,
  'top soil': 1.1,
  'clay': 1.5,
  'concrete': 2.0,
  'asphalt': 1.6,
  'rip rap': 1.65,
  'riprap': 1.65,
  'rock': 1.5,
  'boulders': 1.5,
  'cobble': 1.5,
  'drain rock': 1.3,
  'pea gravel': 1.35,
  'decomposed granite': 1.4,
  'dg': 1.4,
  'recycled concrete': 1.3,
  'recycled asphalt': 1.3,
  'rap': 1.3,
  'slag': 1.5,
  'limestone': 1.5,
  'millings': 1.3,
};

function getMaterialWeightPerYard(mat: string): number {
  const lower = mat.trim().toLowerCase();
  if (MATERIAL_WEIGHT_PER_YARD[lower]) return MATERIAL_WEIGHT_PER_YARD[lower];
  for (const key of Object.keys(MATERIAL_WEIGHT_PER_YARD)) {
    if (lower.includes(key) || key.includes(lower)) return MATERIAL_WEIGHT_PER_YARD[key];
  }
  return 1.35;
}

export default function CreateJobScreen() {
  const insets = useSafeAreaInsets();
  const routeParams = useLocalSearchParams<{ projectId?: string }>();
  const [submitting, setSubmitting] = useState(false);

  const [projectId, setProjectId] = useState(routeParams.projectId || '');
  const [projectName, setProjectName] = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [material, setMaterial] = useState('');
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const [jobType, setJobType] = useState('single_load');
  const [truckType, setTruckType] = useState('end_dump');
  const [originAddress, setOriginAddress] = useState('');
  const [originLat, setOriginLat] = useState<number | null>(null);
  const [originLng, setOriginLng] = useState<number | null>(null);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destLat, setDestLat] = useState<number | null>(null);
  const [destLng, setDestLng] = useState<number | null>(null);
  const [mapPickerTarget, setMapPickerTarget] = useState<'origin' | 'destination' | null>(null);
  const [mapPin, setMapPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [reversingGeocode, setReversingGeocode] = useState(false);
  const [distance, setDistance] = useState('');
  const [originSuggestions, setOriginSuggestions] = useState<any[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<any[]>([]);
  const [showOriginSuggestions, setShowOriginSuggestions] = useState(false);
  const [showDestSuggestions, setShowDestSuggestions] = useState(false);
  const [dismissedLocations, setDismissedLocations] = useState<Set<string>>(new Set());
  const [routeInfo, setRouteInfo] = useState<{ truck_duration_text: string; truck_duration_seconds: number; distance_miles: number } | null>(null);
  const [fetchingRoute, setFetchingRoute] = useState(false);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const originDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scheduledDate, setScheduledDate] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [pickupTime, setPickupTime] = useState('');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerHour, setPickerHour] = useState(7);
  const [pickerMinute, setPickerMinute] = useState(0);
  const [pickerAmPm, setPickerAmPm] = useState<'AM' | 'PM'>('AM');
  const [estimatedDays, setEstimatedDays] = useState('');
  const [estimatedDaysManual, setEstimatedDaysManual] = useState(false);
  const [includesWeekends, setIncludesWeekends] = useState(false);
  const [rate, setRate] = useState('');
  const [rateType, setRateType] = useState('per_hour');
  const [trucksNeeded, setTrucksNeeded] = useState(1);
  const [estimatedTrips, setEstimatedTrips] = useState('');
  const [totalTonsNeeded, setTotalTonsNeeded] = useState('');
  const [totalUnit, setTotalUnit] = useState<'tons' | 'yards' | 'hours'>('tons');
  const [showTotalUnitDropdown, setShowTotalUnitDropdown] = useState(false);
  const [showCapacityUnitDropdown, setShowCapacityUnitDropdown] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState('');
  const [loadTime, setLoadTime] = useState(10);
  const [unloadTime, setUnloadTime] = useState(10);
  const [truckCapacity, setTruckCapacity] = useState('');
  const [capacityUnit, setCapacityUnit] = useState<'tons' | 'yards'>('tons');
  const [requiresTarp, setRequiresTarp] = useState(false);
  const [requiresWeightTickets, setRequiresWeightTickets] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [paperworkDescription, setPaperworkDescription] = useState('');
  const [showHaulDirectionModal, setShowHaulDirectionModal] = useState(false);
  const [pendingProject, setPendingProject] = useState<any>(null);

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ['/api/projects'],
  });

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then(val => {
      if (val) setDismissedLocations(new Set(JSON.parse(val)));
    }).catch(() => {});
  }, []);

  async function dismissSavedLocation(address: string, target: 'origin' | 'destination') {
    const updated = new Set(dismissedLocations);
    updated.add(address.toLowerCase());
    setDismissedLocations(updated);
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...updated])).catch(() => {});
    if (target === 'origin') {
      setOriginSuggestions(prev => prev.filter(s => !s.saved || s.description.toLowerCase() !== address.toLowerCase()));
    } else {
      setDestSuggestions(prev => prev.filter(s => !s.saved || s.description.toLowerCase() !== address.toLowerCase()));
    }
  }

  useEffect(() => {
    if (Platform.OS === 'web') {
      navigator.geolocation?.getCurrentPosition(
        (pos) => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); },
        () => {},
        { enableHighAccuracy: false, timeout: 5000 }
      );
    } else {
      (async () => {
        try {
          const Location = await import('expo-location');
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setUserLat(loc.coords.latitude);
            setUserLng(loc.coords.longitude);
          }
        } catch {}
      })();
    }
  }, []);

  useEffect(() => {
    if (routeParams.projectId && projects.length > 0 && !projectName) {
      const match = projects.find((p: any) => String(p.id) === routeParams.projectId);
      if (match) {
        setProjectId(String(match.id));
        setProjectName(match.name || '');
        if (match.site_address) {
          setPendingProject(match);
          setShowHaulDirectionModal(true);
        }
      }
    }
  }, [routeParams.projectId, projects]);

  const { data: rawMaterials = [] } = useQuery<any[]>({
    queryKey: ['/api/materials'],
  });
  const pastMaterials = rawMaterials.map((m: any) => typeof m === 'string' ? m : (m.name || m.normalizedName || String(m)));

  const filteredMaterials = material.trim()
    ? pastMaterials.filter((m: string) =>
        m.toLowerCase().includes(material.toLowerCase()) && m.toLowerCase() !== material.toLowerCase()
      )
    : pastMaterials;

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function formatDisplayDate(isoDate: string) {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
  }

  function getCalendarDays() {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }

  function selectCalendarDate(day: number) {
    const m = String(calendarMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    setScheduledDate(`${calendarYear}-${m}-${d}`);
    setShowCalendar(false);
  }

  function prevMonth() {
    if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(calendarYear - 1); }
    else setCalendarMonth(calendarMonth - 1);
  }

  function nextMonth() {
    if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(calendarYear + 1); }
    else setCalendarMonth(calendarMonth + 1);
  }

  const selectedProject = projects.find((p: any) => String(p.id) === projectId);

  const filteredProjects = projectName.trim()
    ? projects.filter((p: any) =>
        (p.name || '').toLowerCase().includes(projectName.toLowerCase())
      )
    : projects;

  const exactMatch = projects.find(
    (p: any) => (p.name || '').toLowerCase() === projectName.trim().toLowerCase()
  );

  function selectProject(id: string, name: string) {
    setProjectId(id);
    setProjectName(name);
    setShowProjectDropdown(false);
    const proj = projects.find((p: any) => String(p.id) === id);
    if (proj?.site_address) {
      setPendingProject(proj);
      setShowHaulDirectionModal(true);
    }
  }

  function applyHaulDirection(direction: 'to' | 'from') {
    if (!pendingProject) return;
    const addr = pendingProject.site_address || '';
    const lat = pendingProject.site_lat ? Number(pendingProject.site_lat) : null;
    const lng = pendingProject.site_lng ? Number(pendingProject.site_lng) : null;
    if (direction === 'to') {
      setDestinationAddress(addr);
      setDestLat(lat);
      setDestLng(lng);
    } else {
      setOriginAddress(addr);
      setOriginLat(lat);
      setOriginLng(lng);
    }
    setShowHaulDirectionModal(false);
    setPendingProject(null);
  }

  function handleProjectNameChange(text: string) {
    setProjectName(text);
    if (!text.trim()) {
      setProjectId('');
    } else {
      const match = projects.find(
        (p: any) => (p.name || '').toLowerCase() === text.trim().toLowerCase()
      );
      setProjectId(match ? String(match.id) : '');
    }
    if (!showProjectDropdown && text.trim()) {
      setShowProjectDropdown(true);
    }
  }

  async function openMapPicker(target: 'origin' | 'destination') {
    if (Platform.OS !== 'web') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location permission helps center the map on your area.');
      }
    }

    let initialPin: { latitude: number; longitude: number } | null = null;
    if (target === 'origin' && originLat && originLng) {
      initialPin = { latitude: originLat, longitude: originLng };
    } else if (target === 'destination' && destLat && destLng) {
      initialPin = { latitude: destLat, longitude: destLng };
    }
    setMapPin(initialPin);
    setMapPickerTarget(target);
  }

  function handleMapPress(e: any) {
    setMapPin(e.nativeEvent.coordinate);
  }

  async function confirmMapPin() {
    if (!mapPin || !mapPickerTarget) return;

    setReversingGeocode(true);
    let address = `${mapPin.latitude.toFixed(5)}, ${mapPin.longitude.toFixed(5)}`;

    try {
      if (Platform.OS !== 'web') {
        const results = await Location.reverseGeocodeAsync({
          latitude: mapPin.latitude,
          longitude: mapPin.longitude,
        });
        if (results.length > 0) {
          const r = results[0];
          const parts = [r.streetNumber, r.street, r.city, r.region].filter(Boolean);
          if (parts.length > 0) address = parts.join(', ');
        }
      }
    } catch {}

    if (mapPickerTarget === 'origin') {
      setOriginAddress(address);
      setOriginLat(mapPin.latitude);
      setOriginLng(mapPin.longitude);
    } else {
      setDestinationAddress(address);
      setDestLat(mapPin.latitude);
      setDestLng(mapPin.longitude);
    }

    setReversingGeocode(false);
    setMapPickerTarget(null);
    setMapPin(null);
  }

  const loadSavedLocations = useCallback(async (target: 'origin' | 'destination', search?: string) => {
    try {
      const baseUrl = getApiUrl();
      const savedUrl = new URL('/api/saved-locations', baseUrl);
      if (search) savedUrl.searchParams.set('search', search);
      const res = await fetch(savedUrl.toString(), { credentials: 'include' });
      if (res.ok) {
        const savedLocations = await res.json();
        const savedItems = savedLocations
          .filter((loc: any) => !dismissedLocations.has(loc.address.toLowerCase()))
          .map((loc: any, i: number) => ({
            place_id: `saved_${loc.type}_${i}_${loc.address}`,
            description: loc.address,
            saved: true,
            savedType: loc.type,
            savedName: loc.name,
            savedLat: loc.lat,
            savedLng: loc.lng,
            structured: { main_text: loc.name || loc.address.split(',')[0], secondary_text: loc.name ? loc.address : '' },
          }));
        if (target === 'origin') { setOriginSuggestions(savedItems); setShowOriginSuggestions(savedItems.length > 0); }
        else { setDestSuggestions(savedItems); setShowDestSuggestions(savedItems.length > 0); }
      } else {
        if (target === 'origin') { setOriginSuggestions([]); setShowOriginSuggestions(false); }
        else { setDestSuggestions([]); setShowDestSuggestions(false); }
      }
    } catch {
      if (target === 'origin') { setOriginSuggestions([]); setShowOriginSuggestions(false); }
      else { setDestSuggestions([]); setShowDestSuggestions(false); }
    }
  }, [dismissedLocations]);

  const fetchPlaceSuggestions = useCallback(async (input: string, target: 'origin' | 'destination') => {
    if (input.trim().length < 2) {
      loadSavedLocations(target, input.trim() || undefined);
      return;
    }
    try {
      const baseUrl = getApiUrl();

      const savedUrl = new URL('/api/saved-locations', baseUrl);
      savedUrl.searchParams.set('search', input);
      const [savedRes, placesRes] = await Promise.all([
        fetch(savedUrl.toString(), { credentials: 'include' }).catch(() => null),
        (() => {
          const url = new URL('/api/places/autocomplete', baseUrl);
          url.searchParams.set('input', input);
          if (userLat && userLng) {
            url.searchParams.set('lat', String(userLat));
            url.searchParams.set('lng', String(userLng));
          }
          return fetch(url.toString(), { credentials: 'include' });
        })(),
      ]);

      const savedLocations = savedRes && savedRes.ok ? await savedRes.json() : [];
      const placesData = placesRes.ok ? await placesRes.json() : [];

      const savedItems = savedLocations
        .filter((loc: any) => !dismissedLocations.has(loc.address.toLowerCase()))
        .map((loc: any, i: number) => ({
          place_id: `saved_${loc.type}_${i}_${loc.address}`,
          description: loc.address,
          saved: true,
          savedType: loc.type,
          savedName: loc.name,
          savedLat: loc.lat,
          savedLng: loc.lng,
          structured: { main_text: loc.name || loc.address.split(',')[0], secondary_text: loc.name ? loc.address : '' },
        }));

      const combined = [...savedItems, ...placesData];
      if (target === 'origin') { setOriginSuggestions(combined); setShowOriginSuggestions(true); }
      else { setDestSuggestions(combined); setShowDestSuggestions(true); }
    } catch {}
  }, [userLat, userLng, dismissedLocations]);

  async function geocodeAddress(address: string, target: 'origin' | 'destination') {
    if (address.trim().length < 3) return;
    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/places/autocomplete', baseUrl);
      url.searchParams.set('input', address);
      if (userLat && userLng) {
        url.searchParams.set('lat', String(userLat));
        url.searchParams.set('lng', String(userLng));
      }
      const res = await fetch(url.toString(), { credentials: 'include' });
      if (res.ok) {
        const suggestions = await res.json();
        if (suggestions.length > 0) {
          const detailUrl = new URL('/api/places/details', baseUrl);
          detailUrl.searchParams.set('place_id', suggestions[0].place_id);
          const detailRes = await fetch(detailUrl.toString(), { credentials: 'include' });
          if (detailRes.ok) {
            const detail = await detailRes.json();
            if (target === 'origin') {
              setOriginLat(detail.lat);
              setOriginLng(detail.lng);
              if (detail.address) setOriginAddress(detail.address);
            } else {
              setDestLat(detail.lat);
              setDestLng(detail.lng);
              if (detail.address) setDestinationAddress(detail.address);
            }
            return;
          }
        }
      }
      const geoUrl = new URL('/api/places/geocode', baseUrl);
      geoUrl.searchParams.set('address', address);
      const geoRes = await fetch(geoUrl.toString(), { credentials: 'include' });
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (target === 'origin') {
          setOriginLat(geoData.lat);
          setOriginLng(geoData.lng);
          if (geoData.address) setOriginAddress(geoData.address);
        } else {
          setDestLat(geoData.lat);
          setDestLng(geoData.lng);
          if (geoData.address) setDestinationAddress(geoData.address);
        }
      }
    } catch {}
  }

  const originGeoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destGeoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleOriginTextChange(text: string) {
    setOriginAddress(text);
    setOriginLat(null);
    setOriginLng(null);
    setRouteInfo(null);
    if (originDebounceRef.current) clearTimeout(originDebounceRef.current);
    if (originGeoRef.current) clearTimeout(originGeoRef.current);
    originDebounceRef.current = setTimeout(() => fetchPlaceSuggestions(text, 'origin'), 300);
    originGeoRef.current = setTimeout(() => {
      if (text.trim().length >= 3) geocodeAddress(text, 'origin');
    }, 2000);
  }

  function handleDestTextChange(text: string) {
    setDestinationAddress(text);
    setDestLat(null);
    setDestLng(null);
    setRouteInfo(null);
    if (destDebounceRef.current) clearTimeout(destDebounceRef.current);
    if (destGeoRef.current) clearTimeout(destGeoRef.current);
    destDebounceRef.current = setTimeout(() => fetchPlaceSuggestions(text, 'destination'), 300);
    destGeoRef.current = setTimeout(() => {
      if (text.trim().length >= 3) geocodeAddress(text, 'destination');
    }, 2000);
  }

  async function selectSuggestion(placeId: string, description: string, target: 'origin' | 'destination', suggestion?: any) {
    if (target === 'origin') {
      setOriginAddress(description); setShowOriginSuggestions(false); setOriginSuggestions([]);
      if (originGeoRef.current) clearTimeout(originGeoRef.current);
    } else {
      setDestinationAddress(description); setShowDestSuggestions(false); setDestSuggestions([]);
      if (destGeoRef.current) clearTimeout(destGeoRef.current);
    }

    if (suggestion?.saved && suggestion.savedLat && suggestion.savedLng) {
      if (target === 'origin') {
        setOriginLat(suggestion.savedLat);
        setOriginLng(suggestion.savedLng);
      } else {
        setDestLat(suggestion.savedLat);
        setDestLng(suggestion.savedLng);
      }
      return;
    }

    if (suggestion?.saved && (!suggestion.savedLat || !suggestion.savedLng)) {
      geocodeAddress(description, target);
      return;
    }

    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/places/details', baseUrl);
      url.searchParams.set('place_id', placeId);
      const res = await fetch(url.toString(), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (target === 'origin') {
          setOriginAddress(data.address || description);
          setOriginLat(data.lat);
          setOriginLng(data.lng);
        } else {
          setDestinationAddress(data.address || description);
          setDestLat(data.lat);
          setDestLng(data.lng);
        }
      }
    } catch {}
  }

  async function fetchRouteInfo(oLat: number, oLng: number, dLat: number, dLng: number) {
    setFetchingRoute(true);
    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/directions', baseUrl);
      url.searchParams.set('origin_lat', String(oLat));
      url.searchParams.set('origin_lng', String(oLng));
      url.searchParams.set('dest_lat', String(dLat));
      url.searchParams.set('dest_lng', String(dLng));
      const res = await fetch(url.toString(), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRouteInfo(data);
        setDistance(String(data.distance_miles));
      }
    } catch {}
    setFetchingRoute(false);
  }

  useEffect(() => {
    if (originLat && originLng && destLat && destLng) {
      fetchRouteInfo(originLat, originLng, destLat, destLng);
    }
  }, [originLat, originLng, destLat, destLng]);

  const oneWayMinutes = routeInfo ? routeInfo.truck_duration_seconds / 60 : 0;
  const roundTripMinutes = routeInfo ? (oneWayMinutes * 2) + loadTime + unloadTime : 0;

  const capacityInTons = (() => {
    const cap = parseFloat(truckCapacity) || 0;
    if (cap <= 0) return 0;
    if (capacityUnit === 'yards') {
      return cap * getMaterialWeightPerYard(material);
    }
    return cap;
  })();

  const totalInTons = (() => {
    const val = parseFloat(totalTonsNeeded) || 0;
    if (val <= 0) return 0;
    if (totalUnit === 'hours') return 0;
    if (totalUnit === 'yards') return val * getMaterialWeightPerYard(material);
    return val;
  })();

  const calculatedTrips = (() => {
    if (totalInTons > 0 && capacityInTons > 0) return Math.ceil(totalInTons / capacityInTons);
    return parseInt(estimatedTrips, 10) || 0;
  })();

  const tripsPerTruck = trucksNeeded > 0 ? Math.ceil(calculatedTrips / trucksNeeded) : calculatedTrips;
  const tripsPerDay = roundTripMinutes > 0 ? Math.floor((10 * 60) / roundTripMinutes) : 0;

  const calculatedCost = (() => {
    const r = parseFloat(rate) || 0;
    if (r <= 0) return 0;
    if (rateType === 'per_load') return r * (calculatedTrips || 1);
    if (rateType === 'per_ton') return r * totalInTons;
    if (rateType === 'per_hour' && roundTripMinutes > 0 && calculatedTrips > 0) {
      const totalHours = (roundTripMinutes * tripsPerTruck) / 60;
      return r * totalHours * trucksNeeded;
    }
    if (rateType === 'flat_rate') return r;
    return 0;
  })();

  const estimatedDaysCalc = (() => {
    if (!routeInfo || calculatedTrips <= 0) return 0;
    const totalMinutes = tripsPerTruck * roundTripMinutes;
    const workDayMinutes = 10 * 60;
    return totalMinutes / workDayMinutes;
  })();

  useEffect(() => {
    if (calculatedTrips > 1) {
      if (tripsPerDay > 0 && tripsPerTruck > tripsPerDay) {
        setJobType('multi_day');
      } else if (jobType === 'single_load') {
        setJobType('full_day');
      }
    }
  }, [calculatedTrips, tripsPerDay, tripsPerTruck]);

  useEffect(() => {
    if (estimatedDaysCalc > 0 && !estimatedDaysManual) {
      setEstimatedDays(String(Math.ceil(estimatedDaysCalc)));
    }
  }, [estimatedDaysCalc]);

  function getEstimatedDaysText() {
    if (!routeInfo) return null;
    if (jobType === 'single_load') return 'Less than 1 day';
    if (calculatedTrips <= 0) return 'Enter tons & capacity';
    if (estimatedDaysCalc < 1) return 'Less than 1 day';
    return `~${Math.ceil(estimatedDaysCalc)} work day${Math.ceil(estimatedDaysCalc) > 1 ? 's' : ''}`;
  }

  async function handleSubmit() {
    if (!material.trim()) {
      Alert.alert('Required', 'Please enter a material.');
      return;
    }
    if (!originAddress.trim()) {
      Alert.alert('Required', 'Please enter an origin address.');
      return;
    }
    if (!destinationAddress.trim()) {
      Alert.alert('Required', 'Please enter a destination address.');
      return;
    }
    if (!rate.trim()) {
      Alert.alert('Required', 'Please enter a rate.');
      return;
    }

    setSubmitting(true);
    try {
      let resolvedProjectId: string | undefined = projectId || undefined;

      if (!resolvedProjectId && projectName.trim()) {
        const newProject = await apiRequest('POST', '/api/projects', {
          name: projectName.trim(),
        });
        const proj = await newProject.json();
        resolvedProjectId = proj.id;
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      }

      const body: Record<string, any> = {
        material: material.trim(),
        job_type: jobType,
        truck_type: truckType,
        ...(resolvedProjectId ? { project_id: resolvedProjectId } : {}),
        origin_address: originAddress.trim(),
        ...(originLat ? { origin_lat: originLat } : {}),
        ...(originLng ? { origin_lng: originLng } : {}),
        destination_address: destinationAddress.trim(),
        ...(destLat ? { destination_lat: destLat } : {}),
        ...(destLng ? { destination_lng: destLng } : {}),
        rate: parseFloat(rate),
        rate_type: rateType,
        trucks_needed: trucksNeeded,
        requires_tarp: requiresTarp,
        requires_weight_tickets: requiresWeightTickets,
        urgent,
        ...(urgent && paperworkDescription.trim() ? { paperwork_description: paperworkDescription.trim() } : {}),
      };

      if (distance) body.distance = parseFloat(distance);
      if (scheduledDate) body.scheduled_date = scheduledDate.trim();
      if (pickupTime) body.pickup_time = pickupTime.trim();
      if (jobType === 'multi_day') {
        if (estimatedDays) body.estimated_days = parseInt(estimatedDays, 10);
        body.includes_weekends = includesWeekends;
      }
      if (calculatedTrips > 0) body.estimated_trips = calculatedTrips;
      else if (estimatedTrips) body.estimated_trips = parseInt(estimatedTrips, 10);
      if (totalUnit === 'hours' && parseFloat(totalTonsNeeded) > 0) {
        body.total_hours = parseFloat(totalTonsNeeded);
      } else if (totalInTons > 0) {
        body.total_tons_needed = totalInTons;
      }
      if (calculatedCost > 0) body.estimated_cost = calculatedCost;
      else if (estimatedCost) body.estimated_cost = parseFloat(estimatedCost);
      if (truckCapacity) {
        const capLabel = capacityUnit === 'yards' 
          ? `${truckCapacity} yards (≈${capacityInTons.toFixed(1)} tons)` 
          : `${truckCapacity} tons`;
        body.capacity_needed = capLabel;
      }

      await apiRequest('POST', '/api/jobs', body);

      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey.join('');
        return key.includes('/api/jobs') || key.includes('/api/contractor/jobs');
      }});

      if (router.canGoBack()) { router.back(); } else { router.replace('/(tabs)'); }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create job.');
    } finally {
      setSubmitting(false);
    }
  }

  function renderChips<T extends string>(
    options: readonly { label: string; value: T }[],
    selected: T,
    onSelect: (v: T) => void,
  ) {
    return (
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const active = selected === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onSelect(opt.value)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Pressable onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace('/(tabs)'); } }} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Post a Job</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.projectBarWrap}>
        <View style={[
          styles.projectBar,
          selectedProject && styles.projectBarSelected,
        ]}>
          <Ionicons
            name={selectedProject ? 'folder' : 'folder-outline'}
            size={18}
            color={selectedProject ? Colors.primary : Colors.textMuted}
          />
          <TextInput
            style={styles.projectBarInput}
            placeholder="Type or select a project"
            placeholderTextColor={Colors.textMuted}
            value={projectName}
            onChangeText={handleProjectNameChange}
            onFocus={() => setShowProjectDropdown(true)}
          />
          {projectName.trim() ? (
            <Pressable onPress={() => { setProjectName(''); setProjectId(''); setShowProjectDropdown(false); }} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => setShowProjectDropdown(!showProjectDropdown)} hitSlop={8}>
            <Ionicons name={showProjectDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {selectedProject && (
          <View style={styles.projectMatchBadge}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.success || '#22c55e'} />
            <Text style={styles.projectMatchText}>Existing project</Text>
          </View>
        )}
        {!selectedProject && projectName.trim() && !exactMatch && (
          <View style={styles.projectMatchBadge}>
            <Ionicons name="add-circle" size={14} color={Colors.primary} />
            <Text style={[styles.projectMatchText, { color: Colors.primary }]}>New project will be created</Text>
          </View>
        )}

        {showProjectDropdown && (
          <View style={styles.dropdownList}>
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
              {filteredProjects.length > 0 ? (
                filteredProjects.map((p: any) => {
                  const isSelected = projectId === String(p.id);
                  return (
                    <Pressable
                      key={p.id}
                      style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                      onPress={() => selectProject(String(p.id), p.name)}
                    >
                      <Ionicons
                        name="folder"
                        size={18}
                        color={isSelected ? Colors.primary : Colors.textSecondary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
                          {p.name}
                        </Text>
                        {p.job_count > 0 && (
                          <Text style={styles.dropdownItemSub}>
                            {p.job_count} job{p.job_count !== 1 ? 's' : ''}
                          </Text>
                        )}
                      </View>
                      {isSelected && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                    </Pressable>
                  );
                })
              ) : (
                <View style={styles.dropdownEmpty}>
                  <Text style={styles.dropdownEmptyText}>
                    {projectName.trim() ? 'No matching projects' : 'No projects yet'}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => { setShowProjectDropdown(false); setShowMaterialDropdown(false); setShowCalendar(false); setShowOriginSuggestions(false); setShowDestSuggestions(false); }}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MATERIAL & TYPE</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.label}>Material</Text>
            <View style={{ zIndex: 5 }}>
              <View style={styles.addressRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="e.g. Gravel, Sand, Topsoil"
                  placeholderTextColor={Colors.textMuted}
                  value={material}
                  onChangeText={(t) => { setMaterial(t); if (t.trim() && !showMaterialDropdown) setShowMaterialDropdown(true); }}
                  onFocus={() => { if (pastMaterials.length > 0) setShowMaterialDropdown(true); }}
                />
                {pastMaterials.length > 0 && (
                  <Pressable onPress={() => setShowMaterialDropdown(!showMaterialDropdown)} hitSlop={8} style={{ paddingHorizontal: 6 }}>
                    <Ionicons name={showMaterialDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textSecondary} />
                  </Pressable>
                )}
              </View>
              {showMaterialDropdown && filteredMaterials.length > 0 && (
                <View style={styles.materialDropdown}>
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
                    {filteredMaterials.map((m) => (
                      <Pressable
                        key={m}
                        style={styles.materialDropdownItem}
                        onPress={() => { setMaterial(m); setShowMaterialDropdown(false); }}
                      >
                        <Text style={styles.materialDropdownText}>{m}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Job Type</Text>
            {renderChips(JOB_TYPES, jobType, setJobType)}

            <Text style={[styles.label, { marginTop: 14 }]}>Truck Type</Text>
            {renderChips(TRUCK_TYPES, truckType, setTruckType)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LOCATIONS</Text>
          <View style={styles.sectionCard}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { marginBottom: 0 }]}>Pickup Location</Text>
              <Pressable style={styles.mapPinLink} onPress={() => openMapPicker('origin')}>
                <Ionicons name="location" size={16} color={originLat ? Colors.primary : Colors.textSecondary} />
                <Text style={[styles.mapPinLinkText, originLat && { color: Colors.primary }]}>
                  {originLat ? 'Pin Set' : 'Drop Pin on Map'}
                </Text>
              </Pressable>
            </View>
            <View style={{ zIndex: 10 }}>
              <View style={styles.addressRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Search address, business, or project name"
                  placeholderTextColor={Colors.textMuted}
                  value={originAddress}
                  onChangeText={handleOriginTextChange}
                  onFocus={() => { if (originSuggestions.length > 0) setShowOriginSuggestions(true); else loadSavedLocations('origin'); }}
                />
                {originAddress.length > 0 && (
                  <Pressable onPress={() => { setOriginAddress(''); setOriginLat(null); setOriginLng(null); setOriginSuggestions([]); setShowOriginSuggestions(false); setRouteInfo(null); }} hitSlop={8} style={{ paddingHorizontal: 6 }}>
                    <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                  </Pressable>
                )}
              </View>
              {showOriginSuggestions && originSuggestions.length > 0 && (
                <View style={styles.suggestionsDropdown}>
                  {originSuggestions.map((s: any, idx: number) => (
                    <Pressable
                      key={s.place_id + '_' + idx}
                      style={[styles.suggestionItem, s.saved && styles.savedSuggestionItem]}
                      onPress={() => selectSuggestion(s.place_id, s.description, 'origin', s)}
                    >
                      <Ionicons
                        name={s.saved ? (s.savedType === 'project' ? 'briefcase' : 'time') : 'location-outline'}
                        size={16}
                        color={s.saved ? Colors.primary : Colors.textSecondary}
                        style={{ marginTop: 2 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.suggestionMain, s.saved && { color: Colors.textPrimary }]} numberOfLines={1}>
                          {s.structured?.main_text || s.description}
                        </Text>
                        {s.structured?.secondary_text ? (
                          <Text style={styles.suggestionSub} numberOfLines={1}>{s.structured.secondary_text}</Text>
                        ) : null}
                        {s.saved && !s.structured?.secondary_text && (
                          <Text style={[styles.suggestionSub, { color: Colors.primary }]} numberOfLines={1}>
                            {s.savedType === 'project' ? 'Project Site' : 'Recent Job'}
                          </Text>
                        )}
                      </View>
                      {s.saved && s.savedType !== 'project' && (
                        <Pressable
                          hitSlop={10}
                          onPress={(e) => { e.stopPropagation?.(); dismissSavedLocation(s.description, 'origin'); }}
                          style={{ padding: 4 }}
                        >
                          <Ionicons name="close" size={16} color={Colors.textMuted} />
                        </Pressable>
                      )}
                    </Pressable>
                  ))}
                </View>
              )}
              {originLat && (
                <View style={styles.coordBadge}>
                  <Ionicons name="navigate" size={12} color={Colors.primary} />
                  <Text style={styles.coordText}>{originLat.toFixed(4)}, {originLng?.toFixed(4)}</Text>
                </View>
              )}
            </View>

            <View style={[styles.labelRow, { marginTop: 14 }]}>
              <Text style={[styles.label, { marginBottom: 0 }]}>Dropoff Location</Text>
              <Pressable style={styles.mapPinLink} onPress={() => openMapPicker('destination')}>
                <Ionicons name="location" size={16} color={destLat ? Colors.primary : Colors.textSecondary} />
                <Text style={[styles.mapPinLinkText, destLat && { color: Colors.primary }]}>
                  {destLat ? 'Pin Set' : 'Drop Pin on Map'}
                </Text>
              </Pressable>
            </View>
            <View style={{ zIndex: 9 }}>
              <View style={styles.addressRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Search address, business, or project name"
                  placeholderTextColor={Colors.textMuted}
                  value={destinationAddress}
                  onChangeText={handleDestTextChange}
                  onFocus={() => { if (destSuggestions.length > 0) setShowDestSuggestions(true); else loadSavedLocations('destination'); }}
                />
                {destinationAddress.length > 0 && (
                  <Pressable onPress={() => { setDestinationAddress(''); setDestLat(null); setDestLng(null); setDestSuggestions([]); setShowDestSuggestions(false); setRouteInfo(null); }} hitSlop={8} style={{ paddingHorizontal: 6 }}>
                    <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                  </Pressable>
                )}
              </View>
              {showDestSuggestions && destSuggestions.length > 0 && (
                <View style={styles.suggestionsDropdown}>
                  {destSuggestions.map((s: any, idx: number) => (
                    <Pressable
                      key={s.place_id + '_' + idx}
                      style={[styles.suggestionItem, s.saved && styles.savedSuggestionItem]}
                      onPress={() => selectSuggestion(s.place_id, s.description, 'destination', s)}
                    >
                      <Ionicons
                        name={s.saved ? (s.savedType === 'project' ? 'briefcase' : 'time') : 'location-outline'}
                        size={16}
                        color={s.saved ? Colors.primary : Colors.textSecondary}
                        style={{ marginTop: 2 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.suggestionMain, s.saved && { color: Colors.textPrimary }]} numberOfLines={1}>
                          {s.structured?.main_text || s.description}
                        </Text>
                        {s.structured?.secondary_text ? (
                          <Text style={styles.suggestionSub} numberOfLines={1}>{s.structured.secondary_text}</Text>
                        ) : null}
                        {s.saved && !s.structured?.secondary_text && (
                          <Text style={[styles.suggestionSub, { color: Colors.primary }]} numberOfLines={1}>
                            {s.savedType === 'project' ? 'Project Site' : 'Recent Job'}
                          </Text>
                        )}
                      </View>
                      {s.saved && s.savedType !== 'project' && (
                        <Pressable
                          hitSlop={10}
                          onPress={(e) => { e.stopPropagation?.(); dismissSavedLocation(s.description, 'destination'); }}
                          style={{ padding: 4 }}
                        >
                          <Ionicons name="close" size={16} color={Colors.textMuted} />
                        </Pressable>
                      )}
                    </Pressable>
                  ))}
                </View>
              )}
              {destLat && (
                <View style={styles.coordBadge}>
                  <Ionicons name="navigate" size={12} color={Colors.primary} />
                  <Text style={styles.coordText}>{destLat.toFixed(4)}, {destLng?.toFixed(4)}</Text>
                </View>
              )}
            </View>
          </View>

          {(routeInfo || fetchingRoute) && (
            <View style={styles.routeCard}>
              <View style={styles.routeCardHeader}>
                <Ionicons name="speedometer-outline" size={18} color={Colors.primary} />
                <Text style={styles.routeCardTitle}>TRIP ESTIMATOR</Text>
              </View>
              {fetchingRoute ? (
                <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 12 }} />
              ) : routeInfo ? (
                <>
                  <View style={styles.routeStatsRow}>
                    <View style={styles.routeStat}>
                      <Text style={styles.routeStatValue}>{routeInfo.truck_duration_text}</Text>
                      <Text style={styles.routeStatLabel}>One-way</Text>
                    </View>
                    <View style={[styles.routeDivider]} />
                    <View style={styles.routeStat}>
                      <Text style={styles.routeStatValue}>{routeInfo.distance_miles} mi</Text>
                      <Text style={styles.routeStatLabel}>Distance</Text>
                    </View>
                  </View>

                  <View style={styles.timeAdjustRow}>
                    <View style={styles.timeAdjustItem}>
                      <Text style={styles.timeAdjustLabel}>Load Time</Text>
                      <View style={styles.timeAdjustControls}>
                        <Pressable style={styles.timeAdjustBtn} onPress={() => setLoadTime(Math.max(0, loadTime - 5))} hitSlop={8}>
                          <Ionicons name="remove" size={16} color={Colors.text} />
                        </Pressable>
                        <Text style={styles.timeAdjustValue}>{loadTime} min</Text>
                        <Pressable style={styles.timeAdjustBtn} onPress={() => setLoadTime(loadTime + 5)} hitSlop={8}>
                          <Ionicons name="add" size={16} color={Colors.text} />
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.timeAdjustItem}>
                      <Text style={styles.timeAdjustLabel}>Unload Time</Text>
                      <View style={styles.timeAdjustControls}>
                        <Pressable style={styles.timeAdjustBtn} onPress={() => setUnloadTime(Math.max(0, unloadTime - 5))} hitSlop={8}>
                          <Ionicons name="remove" size={16} color={Colors.text} />
                        </Pressable>
                        <Text style={styles.timeAdjustValue}>{unloadTime} min</Text>
                        <Pressable style={styles.timeAdjustBtn} onPress={() => setUnloadTime(unloadTime + 5)} hitSlop={8}>
                          <Ionicons name="add" size={16} color={Colors.text} />
                        </Pressable>
                      </View>
                    </View>
                  </View>

                  <View style={styles.roundTripSummary}>
                    <Ionicons name="repeat" size={16} color={Colors.primary} />
                    <Text style={styles.roundTripText}>
                      Round Trip: <Text style={{ color: Colors.primary, fontFamily: 'Inter_700Bold' }}>
                        {roundTripMinutes < 60 
                          ? `${Math.round(roundTripMinutes)} min`
                          : `${Math.floor(roundTripMinutes / 60)}h ${Math.round(roundTripMinutes % 60)}m`
                        }
                      </Text>
                      {'  ·  '}
                      <Text style={{ color: Colors.text, fontFamily: 'Inter_700Bold' }}>
                        {tripsPerDay} trips/day
                      </Text>
                      <Text style={{ color: Colors.textMuted }}> per truck</Text>
                    </Text>
                  </View>

                  {calculatedTrips > 0 && (
                    <View style={styles.tripCalcRow}>
                      <View style={styles.tripCalcItem}>
                        <Text style={styles.tripCalcValue}>{calculatedTrips}</Text>
                        <Text style={styles.tripCalcLabel}>Total Trips</Text>
                      </View>
                      <View style={styles.routeDivider} />
                      <View style={styles.tripCalcItem}>
                        <Text style={styles.tripCalcValue}>{tripsPerTruck}</Text>
                        <Text style={styles.tripCalcLabel}>Per Truck</Text>
                      </View>
                      <View style={styles.routeDivider} />
                      <View style={styles.tripCalcItem}>
                        <Text style={styles.tripCalcValue}>{getEstimatedDaysText()}</Text>
                        <Text style={styles.tripCalcLabel}>Duration</Text>
                      </View>
                    </View>
                  )}

                  <Text style={styles.routeNote}>Travel time adjusted for dump truck speeds (1.4x). {tripsPerDay} trips/day based on 10-hour workdays.</Text>
                </>
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SCHEDULE</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.label}>Scheduled Date</Text>
            <Pressable
              style={styles.input}
              onPress={() => {
                setShowCalendar(!showCalendar);
                setShowMaterialDropdown(false);
                setShowProjectDropdown(false);
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: scheduledDate ? Colors.text : Colors.textMuted }}>
                  {scheduledDate ? formatDisplayDate(scheduledDate) : 'Select a date'}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} />
              </View>
            </Pressable>
            {showCalendar && (
              <View style={styles.calendarContainer}>
                <View style={styles.calendarHeader}>
                  <Pressable onPress={prevMonth} hitSlop={12} style={styles.calendarArrow}>
                    <Ionicons name="chevron-back" size={20} color={Colors.text} />
                  </Pressable>
                  <Text style={styles.calendarTitle}>
                    {MONTH_NAMES[calendarMonth]} {calendarYear}
                  </Text>
                  <Pressable onPress={nextMonth} hitSlop={12} style={styles.calendarArrow}>
                    <Ionicons name="chevron-forward" size={20} color={Colors.text} />
                  </Pressable>
                </View>
                <View style={styles.calendarDayLabels}>
                  {DAY_LABELS.map((label) => (
                    <Text key={label} style={styles.calendarDayLabel}>{label}</Text>
                  ))}
                </View>
                <View style={styles.calendarGrid}>
                  {getCalendarDays().map((day, i) => {
                    if (day === null) return <View key={`empty-${i}`} style={styles.calendarCell} />;
                    const iso = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isSelected = iso === scheduledDate;
                    const today = new Date();
                    const isToday = day === today.getDate() && calendarMonth === today.getMonth() && calendarYear === today.getFullYear();
                    const isPast = new Date(calendarYear, calendarMonth, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    return (
                      <Pressable
                        key={day}
                        style={[
                          styles.calendarCell,
                          isSelected && styles.calendarCellSelected,
                          isToday && !isSelected && styles.calendarCellToday,
                        ]}
                        onPress={() => !isPast && selectCalendarDate(day)}
                        disabled={isPast}
                      >
                        <Text style={[
                          styles.calendarDayText,
                          isSelected && styles.calendarDayTextSelected,
                          isPast && { opacity: 0.3 },
                          isToday && !isSelected && { color: Colors.primary },
                        ]}>
                          {day}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            <Text style={[styles.label, { marginTop: 14 }]}>Pickup Time</Text>
            <Pressable
              style={styles.input}
              onPress={() => {
                if (pickupTime) {
                  const match = pickupTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
                  if (match) {
                    setPickerHour(parseInt(match[1], 10));
                    setPickerMinute(parseInt(match[2], 10));
                    setPickerAmPm(match[3].toUpperCase() as 'AM' | 'PM');
                  }
                }
                setShowTimePicker(true);
              }}
            >
              <Text style={pickupTime ? styles.inputText : styles.placeholderText}>
                {pickupTime || '7:00 AM'}
              </Text>
            </Pressable>

            {jobType === 'multi_day' && (
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>Estimated Days</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                  value={estimatedDays}
                  onChangeText={(text) => { setEstimatedDays(text); setEstimatedDaysManual(true); }}
                  keyboardType="numeric"
                />

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Includes Weekends</Text>
                  <Switch
                    value={includesWeekends}
                    onValueChange={setIncludesWeekends}
                    trackColor={{ false: Colors.border, true: Colors.success }}
                  />
                </View>
              </>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RATE & COST</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.label}>Rate</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={Colors.textMuted}
              value={rate}
              onChangeText={setRate}
              keyboardType="numeric"
            />

            <Text style={[styles.label, { marginTop: 14 }]}>Rate Type</Text>
            {renderChips(RATE_TYPES, rateType, setRateType)}

            <Text style={[styles.label, { marginTop: 14 }]}>Trucks Needed</Text>
            <View style={styles.stepperRow}>
              <Pressable
                style={styles.stepperBtn}
                onPress={() => setTrucksNeeded((prev) => Math.max(1, prev - 1))}
              >
                <Ionicons name="remove" size={20} color={Colors.text} />
              </Pressable>
              <Text style={styles.stepperValue}>{trucksNeeded}</Text>
              <Pressable
                style={styles.stepperBtn}
                onPress={() => setTrucksNeeded((prev) => prev + 1)}
              >
                <Ionicons name="add" size={20} color={Colors.text} />
              </Pressable>
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Total Material Needed</Text>
            <View style={styles.capacityRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                value={totalTonsNeeded}
                onChangeText={setTotalTonsNeeded}
                keyboardType="numeric"
              />
              <Pressable
                style={styles.unitDropdownBtn}
                onPress={() => { setShowTotalUnitDropdown(true); setShowCapacityUnitDropdown(false); }}
              >
                <Text style={styles.unitDropdownBtnText}>
                  {totalUnit === 'tons' ? 'Tons' : totalUnit === 'yards' ? 'Yards' : 'Hours'}
                </Text>
                <Ionicons name="chevron-down" size={14} color={Colors.primary} />
              </Pressable>
            </View>
            {totalUnit === 'yards' && parseFloat(totalTonsNeeded) > 0 && (
              <Text style={styles.yardConversionNote}>
                ≈ {totalInTons.toFixed(1)} tons ({getMaterialWeightPerYard(material)} t/yd³ for {material || 'default'})
              </Text>
            )}

            {totalUnit !== 'hours' && (
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>Truck Capacity</Text>
                <View style={styles.capacityRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="e.g. 20"
                    placeholderTextColor={Colors.textMuted}
                    value={truckCapacity}
                    onChangeText={setTruckCapacity}
                    keyboardType="numeric"
                  />
                  <Pressable
                    style={styles.unitDropdownBtn}
                    onPress={() => { setShowCapacityUnitDropdown(true); setShowTotalUnitDropdown(false); }}
                  >
                    <Text style={styles.unitDropdownBtnText}>
                      {capacityUnit === 'tons' ? 'Tons' : 'Yards'}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={Colors.primary} />
                  </Pressable>
                </View>
                {capacityUnit === 'yards' && parseFloat(truckCapacity) > 0 && (
                  <Text style={styles.yardConversionNote}>
                    ≈ {capacityInTons.toFixed(1)} tons per load ({getMaterialWeightPerYard(material)} t/yd³ for {material || 'default'})
                  </Text>
                )}
              </>
            )}

            {(parseFloat(totalTonsNeeded) > 0 && parseFloat(truckCapacity) > 0) ? (
              <View style={styles.jobEstimateCard}>
                <View style={styles.jobEstimateHeader}>
                  <Ionicons name="calculator-outline" size={16} color={Colors.primary} />
                  <Text style={styles.jobEstimateTitle}>JOB ESTIMATE</Text>
                </View>
                <View style={styles.jobEstimateGrid}>
                  <View style={styles.jobEstimateItem}>
                    <Text style={styles.jobEstimateValue}>{calculatedTrips}</Text>
                    <Text style={styles.jobEstimateLabel}>Total Trips</Text>
                  </View>
                  <View style={styles.jobEstimateDivider} />
                  <View style={styles.jobEstimateItem}>
                    <Text style={styles.jobEstimateValue}>{tripsPerTruck}</Text>
                    <Text style={styles.jobEstimateLabel}>Per Truck</Text>
                  </View>
                  {routeInfo && estimatedDaysCalc > 0 && (
                    <>
                      <View style={styles.jobEstimateDivider} />
                      <View style={styles.jobEstimateItem}>
                        <Text style={styles.jobEstimateValue}>
                          {estimatedDaysCalc < 1 ? '<1' : `~${Math.ceil(estimatedDaysCalc)}`}
                        </Text>
                        <Text style={styles.jobEstimateLabel}>
                          {Math.ceil(estimatedDaysCalc) === 1 ? 'Work Day' : 'Work Days'}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
                {calculatedCost > 0 && (
                  <View style={styles.jobEstimateCost}>
                    <Text style={styles.jobEstimateCostLabel}>Estimated Cost</Text>
                    <Text style={styles.jobEstimateCostValue}>
                      ${calculatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                )}
                {routeInfo && calculatedTrips > 0 && (
                  <Text style={styles.jobEstimateNote}>
                    {trucksNeeded} truck{trucksNeeded > 1 ? 's' : ''} × {tripsPerTruck} trip{tripsPerTruck > 1 ? 's' : ''} × {roundTripMinutes < 60 ? `${Math.round(roundTripMinutes)} min` : `${Math.floor(roundTripMinutes / 60)}h ${Math.round(roundTripMinutes % 60)}m`} round trip
                  </Text>
                )}
              </View>
            ) : (
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>Estimated Trips</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                  value={estimatedTrips}
                  onChangeText={setEstimatedTrips}
                  keyboardType="numeric"
                />

                <Text style={[styles.label, { marginTop: 14 }]}>Estimated Cost</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  value={estimatedCost}
                  onChangeText={setEstimatedCost}
                  keyboardType="numeric"
                />
              </>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>REQUIREMENTS</Text>
          <View style={styles.sectionCard}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Requires Tarp</Text>
              <Switch
                value={requiresTarp}
                onValueChange={setRequiresTarp}
                trackColor={{ false: Colors.border, true: Colors.success }}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Requires Weight Tickets</Text>
              <Switch
                value={requiresWeightTickets}
                onValueChange={setRequiresWeightTickets}
                trackColor={{ false: Colors.border, true: Colors.success }}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, urgent && { color: Colors.primary }]}>Requires Special Paperwork</Text>
              <Switch
                value={urgent}
                onValueChange={(v) => { setUrgent(v); if (!v) setPaperworkDescription(''); }}
                trackColor={{ false: Colors.border, true: Colors.primary }}
              />
            </View>

            {urgent && (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: Colors.primary, fontSize: 13, marginBottom: 6, fontWeight: '500' }}>
                  Please specify paperwork that's needed
                </Text>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                  placeholder="e.g. Bill of lading, environmental permits..."
                  placeholderTextColor={Colors.textMuted}
                  value={paperworkDescription}
                  onChangeText={setPaperworkDescription}
                  multiline
                  numberOfLines={3}
                />
              </View>
            )}

          </View>
        </View>

        <Pressable
          style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.primaryForeground} />
          ) : (
            <Text style={styles.submitBtnText}>POST JOB</Text>
          )}
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showHaulDirectionModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowHaulDirectionModal(false); setPendingProject(null); }}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { setShowHaulDirectionModal(false); setPendingProject(null); }}>
          <View style={styles.haulDirectionModal}>
            <Text style={styles.haulDirectionTitle}>Haul Direction</Text>
            <Text style={styles.haulDirectionSubtitle}>
              {pendingProject?.site_address}
            </Text>
            <View style={styles.haulDirectionButtons}>
              <Pressable
                style={styles.haulDirectionBtn}
                onPress={() => applyHaulDirection('to')}
              >
                <Ionicons name="arrow-forward-circle" size={28} color={Colors.primary} />
                <Text style={styles.haulDirectionBtnText}>Haul to Job</Text>
                <Text style={styles.haulDirectionBtnHint}>Auto-fill dropoff</Text>
              </Pressable>
              <Pressable
                style={styles.haulDirectionBtn}
                onPress={() => applyHaulDirection('from')}
              >
                <Ionicons name="arrow-back-circle" size={28} color={Colors.primary} />
                <Text style={styles.haulDirectionBtnText}>Haul from Job</Text>
                <Text style={styles.haulDirectionBtnHint}>Auto-fill pickup</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.haulDirectionSkip}
              onPress={() => { setShowHaulDirectionModal(false); setPendingProject(null); }}
            >
              <Text style={styles.haulDirectionSkipText}>Skip</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showTimePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <Pressable
          style={styles.timePickerOverlay}
          onPress={() => setShowTimePicker(false)}
        >
          <Pressable style={styles.timePickerSheet} onPress={() => {}}>
            <View style={styles.timePickerHeader}>
              <Pressable onPress={() => setShowTimePicker(false)}>
                <Text style={styles.timePickerCancel}>Cancel</Text>
              </Pressable>
              <Text style={styles.timePickerTitle}>Pickup Time</Text>
              <Pressable onPress={() => {
                const minStr = pickerMinute.toString().padStart(2, '0');
                setPickupTime(`${pickerHour}:${minStr} ${pickerAmPm}`);
                setShowTimePicker(false);
              }}>
                <Text style={styles.timePickerDone}>Done</Text>
              </Pressable>
            </View>

            <View style={styles.timePickerRollers}>
              <View style={styles.rollerColumn}>
                <Text style={styles.rollerLabel}>HOUR</Text>
                <ScrollView
                  style={styles.rollerScroll}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={48}
                  decelerationRate="fast"
                  contentContainerStyle={{ paddingVertical: 72 }}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                    <Pressable
                      key={h}
                      style={[styles.rollerItem, pickerHour === h && styles.rollerItemActive]}
                      onPress={() => setPickerHour(h)}
                    >
                      <Text style={[styles.rollerItemText, pickerHour === h && styles.rollerItemTextActive]}>
                        {h}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <Text style={styles.rollerColon}>:</Text>

              <View style={styles.rollerColumn}>
                <Text style={styles.rollerLabel}>MIN</Text>
                <ScrollView
                  style={styles.rollerScroll}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={48}
                  decelerationRate="fast"
                  contentContainerStyle={{ paddingVertical: 72 }}
                >
                  {[0, 15, 30, 45].map(m => (
                    <Pressable
                      key={m}
                      style={[styles.rollerItem, pickerMinute === m && styles.rollerItemActive]}
                      onPress={() => setPickerMinute(m)}
                    >
                      <Text style={[styles.rollerItemText, pickerMinute === m && styles.rollerItemTextActive]}>
                        {m.toString().padStart(2, '0')}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={[styles.rollerColumn, { flex: 0.8 }]}>
                <Text style={styles.rollerLabel}> </Text>
                <View style={styles.amPmContainer}>
                  <Pressable
                    style={[styles.amPmBtn, pickerAmPm === 'AM' && styles.amPmBtnActive]}
                    onPress={() => setPickerAmPm('AM')}
                  >
                    <Text style={[styles.amPmText, pickerAmPm === 'AM' && styles.amPmTextActive]}>AM</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.amPmBtn, pickerAmPm === 'PM' && styles.amPmBtnActive]}
                    onPress={() => setPickerAmPm('PM')}
                  >
                    <Text style={[styles.amPmText, pickerAmPm === 'PM' && styles.amPmTextActive]}>PM</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.timePickerHighlight} pointerEvents="none" />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={mapPickerTarget !== null}
        animationType="slide"
        onRequestClose={() => { setMapPickerTarget(null); setMapPin(null); }}
      >
        <View style={styles.mapContainer}>
          <View style={[styles.mapHeader, { paddingTop: Platform.OS === 'web' ? 20 : insets.top }]}>
            <Pressable onPress={() => { setMapPickerTarget(null); setMapPin(null); }} style={styles.backBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
            <Text style={styles.mapHeaderTitle}>
              {mapPickerTarget === 'origin' ? 'Set Origin' : 'Set Destination'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <Text style={styles.mapHint}>Tap the map to drop a pin</Text>

          <MapPickerView
            mapPin={mapPin}
            onMapPress={handleMapPress}
            userLat={userLat}
            userLng={userLng}
            originLat={originLat}
            originLng={originLng}
          />

          {mapPin && (
            <View style={[styles.mapFooter, { paddingBottom: Platform.OS === 'web' ? 20 : insets.bottom + 16 }]}>
              <View style={styles.mapCoordRow}>
                <Ionicons name="location" size={16} color={Colors.primary} />
                <Text style={styles.mapCoordText}>
                  {mapPin.latitude.toFixed(5)}, {mapPin.longitude.toFixed(5)}
                </Text>
              </View>
              <Pressable
                style={styles.mapConfirmBtn}
                onPress={confirmMapPin}
                disabled={reversingGeocode}
              >
                {reversingGeocode ? (
                  <ActivityIndicator color={Colors.primaryForeground} />
                ) : (
                  <Text style={styles.mapConfirmText}>CONFIRM LOCATION</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
      </Modal>

      <Modal
        visible={showTotalUnitDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTotalUnitDropdown(false)}
      >
        <Pressable style={styles.dropdownOverlay} onPress={() => setShowTotalUnitDropdown(false)}>
          <View style={styles.dropdownSheet}>
            <Text style={styles.dropdownSheetTitle}>UNIT TYPE</Text>
            {(['tons', 'yards', 'hours'] as const).map((u) => (
              <Pressable
                key={u}
                style={[styles.dropdownSheetItem, totalUnit === u && styles.dropdownSheetItemActive]}
                onPress={() => { setTotalUnit(u); setShowTotalUnitDropdown(false); }}
              >
                <Text style={[styles.dropdownSheetItemText, totalUnit === u && styles.dropdownSheetItemTextActive]}>
                  {u === 'tons' ? 'Tons' : u === 'yards' ? 'Yards' : 'Hours'}
                </Text>
                {totalUnit === u && <Ionicons name="checkmark" size={20} color={Colors.primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showCapacityUnitDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCapacityUnitDropdown(false)}
      >
        <Pressable style={styles.dropdownOverlay} onPress={() => setShowCapacityUnitDropdown(false)}>
          <View style={styles.dropdownSheet}>
            <Text style={styles.dropdownSheetTitle}>CAPACITY UNIT</Text>
            {(['tons', 'yards'] as const).map((u) => (
              <Pressable
                key={u}
                style={[styles.dropdownSheetItem, capacityUnit === u && styles.dropdownSheetItemActive]}
                onPress={() => { setCapacityUnit(u); setShowCapacityUnitDropdown(false); }}
              >
                <Text style={[styles.dropdownSheetItemText, capacityUnit === u && styles.dropdownSheetItemTextActive]}>
                  {u === 'tons' ? 'Tons' : 'Yards'}
                </Text>
                {capacityUnit === u && <Ionicons name="checkmark" size={20} color={Colors.primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 1,
  },
  projectBarWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    zIndex: 10,
  },
  projectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  projectBarSelected: {
    borderColor: Colors.primary,
  },
  projectBarInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.text,
    height: 48,
  },
  projectMatchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  projectMatchText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#22c55e',
  },
  dropdownList: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 6,
    overflow: 'hidden',
    maxHeight: 240,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dropdownItemActive: {
    backgroundColor: Colors.primaryLight,
  },
  dropdownItemText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  dropdownItemTextActive: {
    color: Colors.primary,
  },
  dropdownItemSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  dropdownEmpty: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 10,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.muted,
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 14,
    color: Colors.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  inputWithSuffix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  suffixText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: Colors.muted,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.primary,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  switchLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.text,
    minWidth: 30,
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.primaryForeground,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  mapPinLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  mapPinLinkText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  materialDropdown: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 6,
    overflow: 'hidden',
    maxHeight: 200,
  },
  materialDropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  materialDropdownText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  suggestionsDropdown: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 6,
    overflow: 'hidden',
    maxHeight: 220,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  savedSuggestionItem: {
    backgroundColor: 'rgba(255, 153, 0, 0.06)',
  },
  suggestionMain: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  suggestionSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  coordBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  coordText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.primary,
  },
  routeCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    marginTop: 10,
    padding: 16,
  },
  routeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  routeCardTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
    color: Colors.primary,
    letterSpacing: 1,
  },
  routeStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeStat: {
    flex: 1,
    alignItems: 'center',
  },
  routeStatValue: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 15,
    color: Colors.text,
    textAlign: 'center',
  },
  routeStatLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 3,
  },
  routeDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  routeNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  routeHint: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.primary,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 17,
  },
  timeAdjustRow: {
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  timeAdjustItem: {
    flex: 1,
    alignItems: 'center' as const,
    gap: 6,
  },
  timeAdjustLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  timeAdjustControls: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  timeAdjustBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  timeAdjustValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
    minWidth: 50,
    textAlign: 'center' as const,
  },
  roundTripSummary: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  roundTripText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  tripCalcRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    alignItems: 'center' as const,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  tripCalcItem: {
    alignItems: 'center' as const,
    flex: 1,
  },
  tripCalcValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.primary,
  },
  tripCalcLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  autoCalcRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,153,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,153,0,0.15)',
  },
  autoCalcText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.primary,
  },
  jobEstimateCard: {
    marginTop: 16,
    backgroundColor: 'rgba(255,153,0,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,153,0,0.2)',
    padding: 16,
  },
  jobEstimateHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 14,
  },
  jobEstimateTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
    color: Colors.primary,
    letterSpacing: 1,
  },
  jobEstimateGrid: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    alignItems: 'center' as const,
  },
  jobEstimateItem: {
    alignItems: 'center' as const,
    flex: 1,
  },
  jobEstimateValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.text,
  },
  jobEstimateLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  jobEstimateDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,153,0,0.2)',
  },
  jobEstimateCost: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,153,0,0.15)',
  },
  jobEstimateCostLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  jobEstimateCostValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.success,
  },
  jobEstimateNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    marginTop: 10,
  },
  capacityRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  unitToggle: {
    flexDirection: 'row' as const,
    borderRadius: 8,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  unitBtnActive: {
    backgroundColor: 'rgba(255,153,0,0.15)',
  },
  unitBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.textMuted,
  },
  unitBtnTextActive: {
    color: Colors.primary,
  },
  unitDropdownBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,153,0,0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
    minWidth: 90,
    justifyContent: 'center' as const,
  },
  unitDropdownBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.primary,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  dropdownSheet: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    width: 260,
    overflow: 'hidden' as const,
  },
  dropdownSheetTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 12,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  dropdownSheetItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  dropdownSheetItemActive: {
    backgroundColor: 'rgba(255,153,0,0.08)',
  },
  dropdownSheetItemText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: Colors.text,
  },
  dropdownSheetItemTextActive: {
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
  },
  yardConversionNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  calendarContainer: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 10,
    padding: 14,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarArrow: {
    padding: 6,
  },
  calendarTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
    textTransform: 'uppercase',
  },
  calendarDayLabels: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calendarDayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: '14.28%' as any,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCellSelected: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
  },
  calendarCellToday: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 20,
  },
  calendarDayText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  calendarDayTextSelected: {
    color: '#000',
    fontFamily: 'Inter_700Bold',
  },
  mapContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  mapHeaderTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 1,
  },
  mapHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 10,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  map: {
    flex: 1,
  },
  mapWebFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: Colors.card,
  },
  mapWebText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: Colors.text,
  },
  mapWebSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
  },
  mapFooter: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  mapCoordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  mapCoordText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  mapConfirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapConfirmText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.primaryForeground,
  },
  inputText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.text,
  },
  placeholderText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.textMuted,
  },
  timePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  timePickerSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    overflow: 'hidden',
  },
  timePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  timePickerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  timePickerCancel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.textMuted,
  },
  timePickerDone: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.primary,
  },
  timePickerRollers: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    height: 240,
  },
  timePickerHighlight: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: '50%' as any,
    marginTop: -24,
    height: 48,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    pointerEvents: 'none' as any,
  },
  rollerColumn: {
    flex: 1,
    alignItems: 'center',
  },
  rollerLabel: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  rollerScroll: {
    height: 192,
  },
  rollerItem: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  rollerItemActive: {
    backgroundColor: 'rgba(255,153,0,0.15)',
  },
  rollerItemText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 22,
    color: Colors.textMuted,
  },
  rollerItemTextActive: {
    fontFamily: 'Inter_700Bold',
    color: Colors.primary,
    fontSize: 24,
  },
  rollerColon: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: Colors.textMuted,
    marginTop: 20,
  },
  amPmContainer: {
    gap: 8,
    paddingTop: 40,
  },
  amPmBtn: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  amPmBtnActive: {
    backgroundColor: 'rgba(255,153,0,0.15)',
    borderColor: Colors.primary,
  },
  amPmText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.textMuted,
  },
  amPmTextActive: {
    color: Colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  haulDirectionModal: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  haulDirectionTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  haulDirectionSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  haulDirectionButtons: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  haulDirectionBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,153,0,0.08)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: 'rgba(255,153,0,0.2)',
    gap: 8,
  },
  haulDirectionBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
    textAlign: 'center' as const,
  },
  haulDirectionBtnHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center' as const,
  },
  haulDirectionSkip: {
    marginTop: 16,
    alignItems: 'center' as const,
    paddingVertical: 8,
  },
  haulDirectionSkipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textMuted,
  },
});
