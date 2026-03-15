import { View, Text, FlatList, Pressable, StyleSheet, Switch, Platform, Alert, TextInput, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import TruckIcon from '@/components/TruckIcon';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useCallback, useRef } from 'react';
import Colors from '@/constants/colors';
import { apiRequest, queryClient, getApiUrl } from '@/lib/query-client';

interface AssignedDriver {
  id: string;
  name: string;
  email: string;
}

interface Vehicle {
  id: number;
  driver_id: number;
  truck_type: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  vin_number: string;
  max_capacity_tons: number;
  truck_number: string;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
  assigned_driver_id: string | null;
  assigned_driver: AssignedDriver | null;
}

const TRUCK_TYPES = ['end_dump', 'side_dump', 'belly_dump'] as const;
const TRUCK_TYPE_LABELS: Record<string, string> = {
  end_dump: 'End Dump',
  side_dump: 'Side Dump',
  belly_dump: 'Belly Dump',
};

const EMPTY_FORM = {
  truck_type: 'end_dump',
  make: '',
  model: '',
  year: '',
  license_plate: '',
  vin_number: '',
  max_capacity_tons: '',
  truck_number: '',
  is_primary: false,
  assigned_driver_id: '' as string,
  assigned_driver_name: '' as string,
};

export default function VehiclesScreen() {
  const insets = useSafeAreaInsets();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [refreshing, setRefreshing] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [driverResults, setDriverResults] = useState<AssignedDriver[]>([]);
  const [searchingDrivers, setSearchingDrivers] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const searchDrivers = useCallback((query: string) => {
    setDriverSearch(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (query.length < 2) { setDriverResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearchingDrivers(true);
      try {
        const url = new URL(`/api/drivers/search?q=${encodeURIComponent(query)}`, getApiUrl());
        const resp = await fetch(url.toString(), { credentials: 'include' });
        const data = await resp.json();
        setDriverResults(data);
      } catch { setDriverResults([]); }
      setSearchingDrivers(false);
    }, 300);
  }, []);

  const { data: _vehicles, isLoading } = useQuery<Vehicle[]>({
    queryKey: ['/api/vehicles'],
  });
  const vehicles = _vehicles || [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        truck_type: form.truck_type,
        make: form.make,
        model: form.model,
        year: parseInt(form.year) || 0,
        license_plate: form.license_plate,
        vin_number: form.vin_number,
        max_capacity_tons: parseFloat(form.max_capacity_tons) || 0,
        truck_number: form.truck_number,
        is_primary: form.is_primary,
        assigned_driver_id: form.assigned_driver_id || null,
      };
      if (editingId) {
        return apiRequest('PUT', `/api/vehicles/${editingId}`, payload);
      }
      return apiRequest('POST', '/api/vehicles', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/vehicles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
    },
  });

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function openEdit(v: Vehicle) {
    setEditingId(v.id);
    setForm({
      truck_type: v.truck_type || 'end_dump',
      make: v.make || '',
      model: v.model || '',
      year: v.year ? String(v.year) : '',
      license_plate: v.license_plate || '',
      vin_number: v.vin_number || '',
      max_capacity_tons: v.max_capacity_tons ? String(v.max_capacity_tons) : '',
      truck_number: v.truck_number || '',
      is_primary: !!v.is_primary,
      assigned_driver_id: v.assigned_driver_id || '',
      assigned_driver_name: v.assigned_driver?.name || '',
    });
    setDriverSearch('');
    setDriverResults([]);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDriverSearch('');
    setDriverResults([]);
  }

  function handleDelete(id: number) {
    if (Platform.OS === 'web') {
      deleteMutation.mutate(id);
      return;
    }
    Alert.alert('Delete Vehicle', 'Are you sure you want to delete this vehicle?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);
  }

  function renderForm() {
    if (!showForm) return null;
    return (
      <View style={styles.formContainer}>
        <Text style={styles.formTitle}>{editingId ? 'Edit Vehicle' : 'Add Vehicle'}</Text>

        <Text style={styles.fieldLabel}>Truck Type</Text>
        <View style={styles.chipRow}>
          {TRUCK_TYPES.map(t => (
            <Pressable
              key={t}
              style={[styles.chip, form.truck_type === t && styles.chipActive]}
              onPress={() => setForm(f => ({ ...f, truck_type: t }))}
            >
              <Text style={[styles.chipText, form.truck_type === t && styles.chipTextActive]}>
                {TRUCK_TYPE_LABELS[t]}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.formRow}>
          <View style={styles.formHalf}>
            <Text style={styles.fieldLabel}>Make</Text>
            <TextInput
              style={styles.input}
              value={form.make}
              onChangeText={v => setForm(f => ({ ...f, make: v }))}
              placeholder="e.g. Peterbilt"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={styles.formHalf}>
            <Text style={styles.fieldLabel}>Model</Text>
            <TextInput
              style={styles.input}
              value={form.model}
              onChangeText={v => setForm(f => ({ ...f, model: v }))}
              placeholder="e.g. 389"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={styles.formHalf}>
            <Text style={styles.fieldLabel}>Year</Text>
            <TextInput
              style={styles.input}
              value={form.year}
              onChangeText={v => setForm(f => ({ ...f, year: v }))}
              placeholder="2024"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.formHalf}>
            <Text style={styles.fieldLabel}>Truck #</Text>
            <TextInput
              style={styles.input}
              value={form.truck_number}
              onChangeText={v => setForm(f => ({ ...f, truck_number: v }))}
              placeholder="T-001"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>License Plate</Text>
        <TextInput
          style={styles.input}
          value={form.license_plate}
          onChangeText={v => setForm(f => ({ ...f, license_plate: v }))}
          placeholder="ABC-1234"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="characters"
        />

        <Text style={styles.fieldLabel}>VIN Number</Text>
        <TextInput
          style={styles.input}
          value={form.vin_number}
          onChangeText={v => setForm(f => ({ ...f, vin_number: v }))}
          placeholder="17-character VIN"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="characters"
        />

        <Text style={styles.fieldLabel}>Max Capacity (tons)</Text>
        <TextInput
          style={styles.input}
          value={form.max_capacity_tons}
          onChangeText={v => setForm(f => ({ ...f, max_capacity_tons: v }))}
          placeholder="25"
          placeholderTextColor={Colors.textMuted}
          keyboardType="decimal-pad"
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Primary Vehicle</Text>
          <Switch
            value={form.is_primary}
            onValueChange={v => setForm(f => ({ ...f, is_primary: v }))}
            trackColor={{ false: Colors.border, true: Colors.success }}
            thumbColor="#fff"
          />
        </View>

        <Text style={styles.fieldLabel}>Assigned Driver</Text>
        {form.assigned_driver_id ? (
          <View style={styles.assignedDriverRow}>
            <View style={styles.assignedDriverInfo}>
              <Ionicons name="person" size={16} color={Colors.primary} />
              <Text style={styles.assignedDriverName}>{form.assigned_driver_name}</Text>
            </View>
            <Pressable onPress={() => setForm(f => ({ ...f, assigned_driver_id: '', assigned_driver_name: '' }))} hitSlop={8}>
              <Ionicons name="close-circle" size={22} color={Colors.destructive} />
            </Pressable>
          </View>
        ) : (
          <View>
            <TextInput
              style={styles.input}
              value={driverSearch}
              onChangeText={searchDrivers}
              placeholder="Search by name or email..."
              placeholderTextColor={Colors.textMuted}
            />
            {searchingDrivers && (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 6 }} />
            )}
            {driverResults.length > 0 && (
              <View style={styles.driverDropdown}>
                {driverResults.map(d => (
                  <Pressable
                    key={d.id}
                    style={styles.driverOption}
                    onPress={() => {
                      setForm(f => ({ ...f, assigned_driver_id: d.id, assigned_driver_name: d.name }));
                      setDriverSearch('');
                      setDriverResults([]);
                    }}
                  >
                    <Ionicons name="person-outline" size={16} color={Colors.textSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.driverOptionName}>{d.name}</Text>
                      <Text style={styles.driverOptionEmail}>{d.email}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.formActions}>
          <Pressable style={styles.cancelBtn} onPress={closeForm}>
            <Ionicons name="close" size={20} color={Colors.textMuted} />
          </Pressable>
          <Pressable
            style={[styles.saveBtn, saveMutation.isPending && { opacity: 0.6 }]}
            onPress={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.primaryForeground} />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color={Colors.primaryForeground} />
                <Text style={styles.saveBtnText}>Save</Text>
              </>
            )}
          </Pressable>
        </View>

        {saveMutation.isError && (
          <Text style={styles.errorText}>{(saveMutation.error as Error).message}</Text>
        )}
      </View>
    );
  }

  function renderVehicle({ item }: { item: Vehicle }) {
    const isPrimary = !!item.is_primary;
    return (
      <View style={[styles.vehicleCard, isPrimary && styles.vehicleCardPrimary]}>
        <View style={styles.vehicleCardHeader}>
          <View style={styles.vehicleIconWrap}>
            <TruckIcon size={24} color={isPrimary ? Colors.primary : Colors.textMuted} />
          </View>
          <View style={styles.vehicleInfo}>
            <View style={styles.vehicleTitleRow}>
              <Text style={styles.vehicleTitle}>
                {item.year} {item.make} {item.model}
              </Text>
              {isPrimary && (
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                </View>
              )}
            </View>
            <Text style={styles.vehicleType}>{TRUCK_TYPE_LABELS[item.truck_type] || item.truck_type}</Text>
          </View>
          <View style={styles.vehicleActions}>
            <Pressable onPress={() => openEdit(item)} hitSlop={8}>
              <Ionicons name="create-outline" size={20} color={Colors.textMuted} />
            </Pressable>
            <Pressable onPress={() => handleDelete(item.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={20} color={Colors.destructive} />
            </Pressable>
          </View>
        </View>

        <View style={styles.vehicleDetails}>
          <View style={styles.detailItem}>
            <Ionicons name="card-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.detailText}>{item.license_plate || '—'}</Text>
          </View>
          <View style={styles.detailItem}>
            <MaterialCommunityIcons name="weight" size={14} color={Colors.textMuted} />
            <Text style={styles.detailText}>{item.max_capacity_tons ? `${item.max_capacity_tons}t` : '—'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="pricetag-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.detailText}>{item.truck_number || '—'}</Text>
          </View>
          {item.assigned_driver && (
            <View style={styles.detailItem}>
              <Ionicons name="person" size={14} color={Colors.primary} />
              <Text style={[styles.detailText, { color: Colors.primary }]}>{item.assigned_driver.name}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/profile' as any); }} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Vehicles</Text>
        <Pressable onPress={openAdd} hitSlop={8}>
          <Ionicons name="add-circle" size={28} color={Colors.primary} />
        </Pressable>
      </View>

      <FlatList
        data={vehicles}
        keyExtractor={item => String(item.id)}
        renderItem={renderVehicle}
        ListHeaderComponent={renderForm()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] }); setRefreshing(false); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 60 }} />
          ) : (
            <View style={styles.emptyState}>
              <TruckIcon size={48} />
              <Text style={styles.emptyTitle}>No vehicles yet</Text>
              <Text style={styles.emptySubtitle}>Tap the + button to add your first vehicle</Text>
            </View>
          )
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === 'web' ? 34 + 40 : 40 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!vehicles.length || showForm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 1,
  },
  listContent: { padding: 16 },

  formContainer: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: 16,
  },
  formTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
    marginBottom: 14,
  },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 10,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.muted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  chipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.primary,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formHalf: { flex: 1 },
  input: {
    backgroundColor: Colors.muted,
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  switchLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.muted,
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  saveBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.primaryForeground,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.destructive,
    marginTop: 8,
  },

  vehicleCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  vehicleCardPrimary: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  vehicleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  vehicleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleInfo: { flex: 1 },
  vehicleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vehicleTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
  },
  vehicleType: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  primaryBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  primaryBadgeText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 9,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  vehicleActions: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  vehicleDetails: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
  },

  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.text,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
  },
  assignedDriverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.muted,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  assignedDriverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  assignedDriverName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  driverDropdown: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 6,
    overflow: 'hidden',
  },
  driverOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  driverOptionName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.text,
  },
  driverOptionEmail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
  },
  assignedDriverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  assignedDriverCardText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.primary,
  },
});
