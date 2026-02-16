import { useState } from 'react';
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
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import Colors from '@/constants/colors';
import { apiRequest, queryClient } from '@/lib/query-client';

const JOB_TYPES = [
  { label: 'Single Load', value: 'single_load' },
  { label: 'Full Day', value: 'full_day' },
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

export default function CreateJobScreen() {
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);

  const [projectId, setProjectId] = useState('');
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
  const [scheduledDate, setScheduledDate] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [pickupTime, setPickupTime] = useState('');
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

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ['/api/projects'],
  });

  const { data: pastMaterials = [] } = useQuery<string[]>({
    queryKey: ['/api/materials'],
  });

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
      let resolvedProjectId = projectId ? parseInt(projectId, 10) : undefined;

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
      };

      if (distance) body.distance = parseFloat(distance);
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

      await apiRequest('POST', '/api/jobs', body);

      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey.join('');
        return key.includes('/api/jobs') || key.includes('/api/contractor/jobs');
      }});

      router.back();
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
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
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
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => { setShowProjectDropdown(false); setShowMaterialDropdown(false); setShowCalendar(false); }}
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
            <View style={styles.labelRow}>
              <Text style={[styles.label, { marginBottom: 0 }]}>Origin Address</Text>
              <Pressable style={styles.mapPinLink} onPress={() => openMapPicker('origin')}>
                <Ionicons name="location" size={16} color={originLat ? Colors.primary : Colors.textSecondary} />
                <Text style={[styles.mapPinLinkText, originLat && { color: Colors.primary }]}>
                  {originLat ? 'Pin Set' : 'Drop Pin'}
                </Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Pickup location"
              placeholderTextColor={Colors.textMuted}
              value={originAddress}
              onChangeText={(t) => { setOriginAddress(t); setOriginLat(null); setOriginLng(null); }}
            />

            <View style={[styles.labelRow, { marginTop: 14 }]}>
              <Text style={[styles.label, { marginBottom: 0 }]}>Destination Address</Text>
              <Pressable style={styles.mapPinLink} onPress={() => openMapPicker('destination')}>
                <Ionicons name="location" size={16} color={destLat ? Colors.primary : Colors.textSecondary} />
                <Text style={[styles.mapPinLinkText, destLat && { color: Colors.primary }]}>
                  {destLat ? 'Pin Set' : 'Drop Pin'}
                </Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Drop-off location"
              placeholderTextColor={Colors.textMuted}
              value={destinationAddress}
              onChangeText={(t) => { setDestinationAddress(t); setDestLat(null); setDestLng(null); }}
            />

            <Text style={[styles.label, { marginTop: 14 }]}>Distance</Text>
            <View style={styles.inputWithSuffix}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                value={distance}
                onChangeText={setDistance}
                keyboardType="numeric"
              />
              <Text style={styles.suffixText}>mi</Text>
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
            <TextInput
              style={styles.input}
              placeholder="7:00 AM"
              placeholderTextColor={Colors.textMuted}
              value={pickupTime}
              onChangeText={setPickupTime}
            />

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
              <Text style={[styles.switchLabel, urgent && { color: Colors.primary }]}>Urgent</Text>
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

          <View style={[styles.map, styles.mapWebFallback]}>
            <Ionicons name="map-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.mapWebText}>Tap the map area to set coordinates</Text>
            <Text style={styles.mapWebSub}>Full map available on your mobile device via Expo Go</Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
              <Pressable
                style={[styles.mapConfirmBtn, { paddingHorizontal: 20, height: 44 }]}
                onPress={() => {
                  setMapPin({ latitude: 37.7749, longitude: -122.4194 });
                }}
              >
                <Text style={[styles.mapConfirmText, { fontSize: 13 }]}>USE DEFAULT LOCATION</Text>
              </Pressable>
            </View>
          </View>

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
});
