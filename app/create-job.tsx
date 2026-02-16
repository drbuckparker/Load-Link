import { useState, useRef, useCallback } from 'react';
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
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import MapView, { Marker, MapPressEvent } from 'react-native-maps';
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

  function handleMapPress(e: MapPressEvent) {
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
        onScrollBeginDrag={() => setShowProjectDropdown(false)}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MATERIAL & TYPE</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.label}>Material</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Gravel, Sand, Topsoil"
              placeholderTextColor={Colors.textMuted}
              value={material}
              onChangeText={setMaterial}
            />

            <Text style={[styles.label, { marginTop: 14 }]}>Job Type</Text>
            {renderChips(JOB_TYPES, jobType, setJobType)}

            <Text style={[styles.label, { marginTop: 14 }]}>Truck Type</Text>
            {renderChips(TRUCK_TYPES, truckType, setTruckType)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LOCATIONS</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.label}>Origin Address</Text>
            <View style={styles.addressRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Pickup location"
                placeholderTextColor={Colors.textMuted}
                value={originAddress}
                onChangeText={(t) => { setOriginAddress(t); setOriginLat(null); setOriginLng(null); }}
              />
              <Pressable style={styles.mapPinBtn} onPress={() => openMapPicker('origin')}>
                <Ionicons name="location" size={20} color={originLat ? Colors.primary : Colors.textSecondary} />
              </Pressable>
            </View>
            {originLat && originLng && (
              <Text style={styles.coordText}>
                {originLat.toFixed(5)}, {originLng.toFixed(5)}
              </Text>
            )}

            <Text style={[styles.label, { marginTop: 14 }]}>Destination Address</Text>
            <View style={styles.addressRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Drop-off location"
                placeholderTextColor={Colors.textMuted}
                value={destinationAddress}
                onChangeText={(t) => { setDestinationAddress(t); setDestLat(null); setDestLng(null); }}
              />
              <Pressable style={styles.mapPinBtn} onPress={() => openMapPicker('destination')}>
                <Ionicons name="location" size={20} color={destLat ? Colors.primary : Colors.textSecondary} />
              </Pressable>
            </View>
            {destLat && destLng && (
              <Text style={styles.coordText}>
                {destLat.toFixed(5)}, {destLng.toFixed(5)}
              </Text>
            )}

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
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.textMuted}
              value={scheduledDate}
              onChangeText={setScheduledDate}
            />

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

          {Platform.OS !== 'web' ? (
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: mapPin?.latitude ?? 37.7749,
                longitude: mapPin?.longitude ?? -122.4194,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              onPress={handleMapPress}
              mapType="standard"
            >
              {mapPin && (
                <Marker coordinate={mapPin} draggable onDragEnd={(e) => setMapPin(e.nativeEvent.coordinate)} />
              )}
            </MapView>
          ) : (
            <View style={[styles.map, styles.mapWebFallback]}>
              <Ionicons name="map-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.mapWebText}>Map is available on your mobile device</Text>
              <Text style={styles.mapWebSub}>Use the address field to type a location on web</Text>
            </View>
          )}

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
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapPinBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.muted,
    borderRadius: 10,
  },
  coordText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
    paddingHorizontal: 2,
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
