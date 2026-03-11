import { useState, useEffect, useRef } from 'react';
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
import Colors from '@/constants/colors';
import { apiRequest, queryClient, getApiUrl } from '@/lib/query-client';
import { fetch } from 'expo/fetch';

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

export default function EditJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [material, setMaterial] = useState('');
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const [jobType, setJobType] = useState('full_day');
  const [truckType, setTruckType] = useState('end_dump');
  const [originAddress, setOriginAddress] = useState('');
  const [originLat, setOriginLat] = useState<number | null>(null);
  const [originLng, setOriginLng] = useState<number | null>(null);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destLat, setDestLat] = useState<number | null>(null);
  const [destLng, setDestLng] = useState<number | null>(null);
  const [originSuggestions, setOriginSuggestions] = useState<any[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<any[]>([]);
  const [showOriginSuggestions, setShowOriginSuggestions] = useState(false);
  const [showDestSuggestions, setShowDestSuggestions] = useState(false);
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
  const [includesWeekends, setIncludesWeekends] = useState(false);
  const [rate, setRate] = useState('');
  const [rateType, setRateType] = useState('per_hour');
  const [trucksNeeded, setTrucksNeeded] = useState(1);
  const [estimatedTrips, setEstimatedTrips] = useState('');
  const [totalTonsNeeded, setTotalTonsNeeded] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [requiresTarp, setRequiresTarp] = useState(false);
  const [requiresWeightTickets, setRequiresWeightTickets] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [capacityNeeded, setCapacityNeeded] = useState('');

  const { data: jobData, isLoading } = useQuery<any>({
    queryKey: [`/api/jobs/${id}`],
    enabled: !!id,
  });

  const { data: rawMaterials = [] } = useQuery<any[]>({
    queryKey: ['/api/materials'],
  });
  const pastMaterials = rawMaterials.map((m: any) => typeof m === 'string' ? m : (m.name || m.normalizedName || String(m)));

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
    if (jobData && !loaded) {
      setMaterial(jobData.material || '');
      setJobType(jobData.job_type || 'full_day');
      setTruckType(jobData.truck_type || 'end_dump');
      setOriginAddress(jobData.origin_address || '');
      setOriginLat(jobData.origin_lat ? Number(jobData.origin_lat) : null);
      setOriginLng(jobData.origin_lng ? Number(jobData.origin_lng) : null);
      setDestinationAddress(jobData.destination_address || '');
      setDestLat(jobData.destination_lat ? Number(jobData.destination_lat) : null);
      setDestLng(jobData.destination_lng ? Number(jobData.destination_lng) : null);
      if (jobData.scheduled_date) {
        const raw = String(jobData.scheduled_date);
        const iso = raw.length >= 10 ? raw.substring(0, 10) : raw;
        const [y, m, d] = iso.split('-').map(Number);
        if (y && m && d) {
          setScheduledDate(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
          setCalendarMonth(m - 1);
          setCalendarYear(y);
        }
      }
      setPickupTime(jobData.pickup_time || '');
      setEstimatedDays(jobData.estimated_days ? String(jobData.estimated_days) : '');
      setIncludesWeekends(jobData.includes_weekends || false);
      setRate(jobData.rate ? String(Number(jobData.rate)) : '');
      setRateType(jobData.rate_type || 'per_hour');
      setTrucksNeeded(jobData.trucks_needed || 1);
      setEstimatedTrips(jobData.estimated_trips ? String(jobData.estimated_trips) : '');
      setTotalTonsNeeded(jobData.total_tons_needed ? String(Number(jobData.total_tons_needed)) : '');
      setEstimatedCost(jobData.estimated_cost ? String(Number(jobData.estimated_cost)) : '');
      setRequiresTarp(jobData.requires_tarp || false);
      setRequiresWeightTickets(jobData.requires_weight_tickets || false);
      setUrgent(jobData.urgent || false);
      setCapacityNeeded(jobData.capacity_needed ? String(jobData.capacity_needed) : '');
      setLoaded(true);
    }
  }, [jobData, loaded]);

  const filteredMaterials = material.trim()
    ? pastMaterials.filter((m) =>
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

  async function fetchSuggestions(input: string, target: 'origin' | 'destination') {
    if (input.length < 3) {
      if (target === 'origin') { setOriginSuggestions([]); setShowOriginSuggestions(false); }
      else { setDestSuggestions([]); setShowDestSuggestions(false); }
      return;
    }
    try {
      const baseUrl = getApiUrl();
      let url = `${baseUrl}/api/places/autocomplete?input=${encodeURIComponent(input)}`;
      if (userLat && userLng) url += `&lat=${userLat}&lng=${userLng}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.predictions) {
        if (target === 'origin') { setOriginSuggestions(data.predictions); setShowOriginSuggestions(true); }
        else { setDestSuggestions(data.predictions); setShowDestSuggestions(true); }
      }
    } catch (err) {}
  }

  function handleOriginTextChange(text: string) {
    setOriginAddress(text);
    if (originDebounceRef.current) clearTimeout(originDebounceRef.current);
    originDebounceRef.current = setTimeout(() => fetchSuggestions(text, 'origin'), 300);
  }

  function handleDestTextChange(text: string) {
    setDestinationAddress(text);
    if (destDebounceRef.current) clearTimeout(destDebounceRef.current);
    destDebounceRef.current = setTimeout(() => fetchSuggestions(text, 'destination'), 300);
  }

  async function selectSuggestion(placeId: string, description: string, target: 'origin' | 'destination') {
    if (target === 'origin') {
      setOriginAddress(description);
      setShowOriginSuggestions(false);
    } else {
      setDestinationAddress(description);
      setShowDestSuggestions(false);
    }
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}/api/places/details?place_id=${placeId}`);
      const data = await res.json();
      if (data.location) {
        if (target === 'origin') { setOriginLat(data.location.lat); setOriginLng(data.location.lng); }
        else { setDestLat(data.location.lat); setDestLng(data.location.lng); }
      }
    } catch (err) {}
  }

  async function handleSave() {
    if (!material.trim()) {
      Alert.alert('Required', 'Please enter a material.');
      return;
    }
    if (!originAddress.trim()) {
      Alert.alert('Required', 'Please enter a pickup location.');
      return;
    }
    if (!destinationAddress.trim()) {
      Alert.alert('Required', 'Please enter a dropoff location.');
      return;
    }
    if (!rate.trim()) {
      Alert.alert('Required', 'Please enter a rate.');
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        material: material.trim(),
        job_type: jobType,
        truck_type: truckType,
        origin_address: originAddress.trim(),
        destination_address: destinationAddress.trim(),
        rate: parseFloat(rate),
        rate_type: rateType,
        trucks_needed: trucksNeeded,
        requires_tarp: requiresTarp,
        requires_weight_tickets: requiresWeightTickets,
        urgent,
      };

      if (originLat) body.origin_lat = originLat;
      if (originLng) body.origin_lng = originLng;
      if (destLat) body.destination_lat = destLat;
      if (destLng) body.destination_lng = destLng;
      if (scheduledDate) body.scheduled_date = scheduledDate.trim();
      if (pickupTime) body.pickup_time = pickupTime.trim();
      if (jobType === 'multi_day') {
        if (estimatedDays) body.estimated_days = parseInt(estimatedDays, 10);
        body.includes_weekends = includesWeekends;
      }
      if (estimatedTrips) body.estimated_trips = parseInt(estimatedTrips, 10);
      if (totalTonsNeeded) body.total_tons_needed = parseFloat(totalTonsNeeded);
      if (estimatedCost) body.estimated_cost = parseFloat(estimatedCost);
      if (capacityNeeded) body.capacity_needed = capacityNeeded.trim();

      await apiRequest('PUT', `/api/jobs/${id}`, body);

      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey.join('/');
        return key.includes('/api/jobs') || key.includes('/api/contractor/jobs');
      }});

      if (Platform.OS === 'web') {
        alert('Job updated successfully');
      } else {
        Alert.alert('Success', 'Job updated successfully');
      }

      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update job.');
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

  if (isLoading || !loaded) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.textSecondary, marginTop: 12, fontFamily: 'Inter_400Regular' }}>Loading job...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); }} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Job</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => { setShowMaterialDropdown(false); setShowCalendar(false); setShowOriginSuggestions(false); setShowDestSuggestions(false); }}
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
                  {filteredMaterials.map((m) => (
                    <Pressable
                      key={m}
                      style={styles.materialDropdownItem}
                      onPress={() => { setMaterial(m); setShowMaterialDropdown(false); }}
                    >
                      <Text style={styles.materialDropdownText}>{m}</Text>
                    </Pressable>
                  ))}
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
            <Text style={styles.label}>Pickup Location</Text>
            <View style={{ zIndex: 10 }}>
              <View style={styles.addressRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Search address or business"
                  placeholderTextColor={Colors.textMuted}
                  value={originAddress}
                  onChangeText={handleOriginTextChange}
                  onFocus={() => { if (originSuggestions.length > 0) setShowOriginSuggestions(true); }}
                />
                {originAddress.length > 0 && (
                  <Pressable onPress={() => { setOriginAddress(''); setOriginLat(null); setOriginLng(null); setOriginSuggestions([]); setShowOriginSuggestions(false); }} hitSlop={8} style={{ paddingHorizontal: 6 }}>
                    <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                  </Pressable>
                )}
              </View>
              {showOriginSuggestions && originSuggestions.length > 0 && (
                <View style={styles.suggestionsDropdown}>
                  {originSuggestions.map((s: any) => (
                    <Pressable
                      key={s.place_id}
                      style={styles.suggestionItem}
                      onPress={() => selectSuggestion(s.place_id, s.description, 'origin')}
                    >
                      <Ionicons name="location-outline" size={16} color={Colors.textSecondary} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestionMain} numberOfLines={1}>
                          {s.structured?.main_text || s.description}
                        </Text>
                        {s.structured?.secondary_text && (
                          <Text style={styles.suggestionSub} numberOfLines={1}>{s.structured.secondary_text}</Text>
                        )}
                      </View>
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

            <Text style={[styles.label, { marginTop: 14 }]}>Dropoff Location</Text>
            <View style={{ zIndex: 9 }}>
              <View style={styles.addressRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Search address or business"
                  placeholderTextColor={Colors.textMuted}
                  value={destinationAddress}
                  onChangeText={handleDestTextChange}
                  onFocus={() => { if (destSuggestions.length > 0) setShowDestSuggestions(true); }}
                />
                {destinationAddress.length > 0 && (
                  <Pressable onPress={() => { setDestinationAddress(''); setDestLat(null); setDestLng(null); setDestSuggestions([]); setShowDestSuggestions(false); }} hitSlop={8} style={{ paddingHorizontal: 6 }}>
                    <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                  </Pressable>
                )}
              </View>
              {showDestSuggestions && destSuggestions.length > 0 && (
                <View style={styles.suggestionsDropdown}>
                  {destSuggestions.map((s: any) => (
                    <Pressable
                      key={s.place_id}
                      style={styles.suggestionItem}
                      onPress={() => selectSuggestion(s.place_id, s.description, 'destination')}
                    >
                      <Ionicons name="location-outline" size={16} color={Colors.textSecondary} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestionMain} numberOfLines={1}>
                          {s.structured?.main_text || s.description}
                        </Text>
                        {s.structured?.secondary_text && (
                          <Text style={styles.suggestionSub} numberOfLines={1}>{s.structured.secondary_text}</Text>
                        )}
                      </View>
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
                    return (
                      <Pressable
                        key={day}
                        style={[
                          styles.calendarCell,
                          isSelected && styles.calendarCellSelected,
                          isToday && !isSelected && styles.calendarCellToday,
                        ]}
                        onPress={() => selectCalendarDate(day)}
                      >
                        <Text style={[
                          styles.calendarDayText,
                          isSelected && styles.calendarDayTextSelected,
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
                {pickupTime || 'Select time'}
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
                  onChangeText={setEstimatedDays}
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
          <Text style={styles.sectionTitle}>RATE & DETAILS</Text>
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

            <Text style={[styles.label, { marginTop: 14 }]}>Estimated Trips</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
              value={estimatedTrips}
              onChangeText={setEstimatedTrips}
              keyboardType="numeric"
            />

            <Text style={[styles.label, { marginTop: 14 }]}>Total Tons Needed</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
              value={totalTonsNeeded}
              onChangeText={setTotalTonsNeeded}
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
                onValueChange={setUrgent}
                trackColor={{ false: Colors.border, true: Colors.primary }}
              />
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Truck Capacity Minimum</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 20 tons"
              placeholderTextColor={Colors.textMuted}
              value={capacityNeeded}
              onChangeText={setCapacityNeeded}
            />
          </View>
        </View>

        <Pressable
          style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.primaryForeground} />
          ) : (
            <Text style={styles.submitBtnText}>SAVE CHANGES</Text>
          )}
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>

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
          </Pressable>
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
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 12,
    color: Colors.primary,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
  },
  inputText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.text,
  },
  placeholderText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.textMuted,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: 'rgba(255,153,0,0.15)',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  switchLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
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
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 20,
    color: Colors.text,
    minWidth: 32,
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.primaryForeground,
    letterSpacing: 1,
  },
  materialDropdown: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: 160,
    zIndex: 10,
    overflow: 'hidden',
  },
  materialDropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  materialDropdownText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.text,
  },
  suggestionsDropdown: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: 200,
    zIndex: 20,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  suggestionMain: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  suggestionSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  coordBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,153,0,0.08)',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  coordText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.primary,
  },
  calendarContainer: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calendarArrow: {
    padding: 4,
  },
  calendarTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
  },
  calendarDayLabels: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calendarDayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.textMuted,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: '14.28%',
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
  timePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  timePickerSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  timePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  timePickerCancel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: Colors.textSecondary,
  },
  timePickerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
  },
  timePickerDone: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.primary,
  },
  timePickerRollers: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  rollerColumn: {
    flex: 1,
    alignItems: 'center',
  },
  rollerLabel: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: 8,
  },
  rollerScroll: {
    height: 192,
  },
  rollerItem: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
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
    color: Colors.primary,
    fontFamily: 'Inter_700Bold',
  },
  rollerColon: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 28,
    color: Colors.textMuted,
    marginTop: 20,
  },
  amPmContainer: {
    gap: 8,
  },
  amPmBtn: {
    paddingHorizontal: 20,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amPmBtnActive: {
    backgroundColor: 'rgba(255,153,0,0.15)',
    borderColor: Colors.primary,
  },
  amPmText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.textMuted,
  },
  amPmTextActive: {
    color: Colors.primary,
  },
});
