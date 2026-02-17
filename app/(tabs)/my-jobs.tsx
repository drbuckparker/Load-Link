import { useState, useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Platform, ActivityIndicator, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, queryClient } from '@/lib/query-client';
import { formatTruckType } from '@/lib/mock-data';

type Filter = 'upcoming' | 'active' | 'completed';

interface DriverJob {
  assignmentId: string;
  id: string;
  material: string;
  projectName: string;
  pickup: string;
  dropoff: string;
  pickupTime: string;
  scheduledDate: string;
  status: string;
  assignmentStatus: string;
  truckType: string;
  trucksNeeded: number;
  contractorName: string;
  contractorCompany: string;
  rate: string;
  rateType: string;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string;
    truckType: string;
  } | null;
}

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  truck_type: string;
  is_primary: boolean;
}

export default function MyJobsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [vehicleModalJob, setVehicleModalJob] = useState<DriverJob | null>(null);

  const jobsQuery = useQuery<DriverJob[]>({
    queryKey: ['/api/driver/jobs', `?filter=${filter === 'completed' ? 'completed' : 'active'}`],
    enabled: !!user,
  });

  const vehiclesQuery = useQuery<Vehicle[]>({
    queryKey: ['/api/vehicles'],
    enabled: !!user,
  });

  const assignVehicleMutation = useMutation({
    mutationFn: async ({ assignmentId, vehicleId }: { assignmentId: string; vehicleId: string | null }) => {
      return apiRequest('PUT', `/api/assignments/${assignmentId}/vehicle`, { vehicleId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/jobs'] });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVehicleModalJob(null);
    },
  });

  const filteredJobs = useMemo(() => {
    if (!jobsQuery.data) return [];
    if (filter === 'active') {
      return jobsQuery.data.filter(j => j.status === 'in_progress' || j.status === 'accepted');
    }
    if (filter === 'upcoming') {
      return jobsQuery.data.filter(j => {
        if (j.status === 'completed') return false;
        if (j.status === 'in_progress') return false;
        return true;
      });
    }
    return jobsQuery.data;
  }, [jobsQuery.data, filter]);

  function formatDate(dateStr: string) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'in_progress': return Colors.warning;
      case 'accepted': return Colors.info;
      case 'completed': return Colors.success;
      case 'pending': return Colors.textMuted;
      default: return Colors.textSecondary;
    }
  }

  function getStatusBg(status: string) {
    switch (status) {
      case 'in_progress': return Colors.warningBg;
      case 'accepted': return Colors.infoBg;
      case 'completed': return Colors.successBg;
      case 'pending': return 'rgba(255,255,255,0.05)';
      default: return 'rgba(255,255,255,0.05)';
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case 'in_progress': return 'Active';
      case 'accepted': return 'Accepted';
      case 'completed': return 'Completed';
      case 'pending': return 'Pending';
      case 'open': return 'Open';
      default: return status;
    }
  }

  function renderJob({ item }: { item: DriverJob }) {
    const needsTruck = !item.vehicle && item.assignmentStatus !== 'pending';
    return (
      <Pressable
        style={styles.jobCard}
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/job/${item.id}` as any);
        }}
      >
        {item.projectName ? (
          <Text style={styles.projectName} numberOfLines={1}>{item.projectName.toUpperCase()}</Text>
        ) : null}

        <View style={styles.jobHeader}>
          <Text style={styles.materialText} numberOfLines={1}>{item.material}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusBg(item.status) }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusLabel(item.status)}
            </Text>
          </View>
        </View>

        {item.contractorCompany ? (
          <View style={styles.infoRow}>
            <Ionicons name="business-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.infoText}>{item.contractorCompany}</Text>
          </View>
        ) : null}

        {item.scheduledDate ? (
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.infoText}>{formatDate(item.scheduledDate)}</Text>
            {item.pickupTime ? <Text style={styles.infoTextMuted}>{item.pickupTime}</Text> : null}
          </View>
        ) : null}

        {item.pickup ? (
          <View style={styles.infoRow}>
            <Ionicons name="location" size={14} color={Colors.success} />
            <Text style={styles.infoText} numberOfLines={1}>{item.pickup}</Text>
          </View>
        ) : null}
        {item.dropoff ? (
          <View style={styles.infoRow}>
            <Ionicons name="flag" size={14} color={Colors.destructive} />
            <Text style={styles.infoText} numberOfLines={1}>{item.dropoff}</Text>
          </View>
        ) : null}

        {item.rate ? (
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={14} color={Colors.primary} />
            <Text style={[styles.infoText, { color: Colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
              ${Number(item.rate).toFixed(2)}/{item.rateType || 'hr'}
            </Text>
          </View>
        ) : null}

        <View style={styles.truckSection}>
          {item.vehicle ? (
            <Pressable
              style={styles.truckAssigned}
              onPress={(e) => {
                e.stopPropagation?.();
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setVehicleModalJob(item);
              }}
            >
              <MaterialCommunityIcons name="dump-truck" size={18} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.truckName}>
                  {item.vehicle.year} {item.vehicle.make} {item.vehicle.model}
                </Text>
                {item.vehicle.licensePlate ? (
                  <Text style={styles.truckPlate}>{item.vehicle.licensePlate}</Text>
                ) : null}
              </View>
              <Ionicons name="swap-horizontal" size={16} color={Colors.textMuted} />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.assignTruckBtn, needsTruck && styles.assignTruckBtnUrgent]}
              onPress={(e) => {
                e.stopPropagation?.();
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setVehicleModalJob(item);
              }}
            >
              <MaterialCommunityIcons name="dump-truck" size={18} color={needsTruck ? Colors.warning : Colors.textMuted} />
              <Text style={[styles.assignTruckText, needsTruck && { color: Colors.warning }]}>
                {needsTruck ? 'Assign Truck' : 'Assign Truck'}
              </Text>
              <Ionicons name="add-circle" size={18} color={needsTruck ? Colors.warning : Colors.textMuted} />
            </Pressable>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Text style={styles.headerTitle}>MY JOBS</Text>
      </View>

      <View style={styles.filterRow}>
        {(['upcoming', 'active', 'completed'] as Filter[]).map(f => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => {
              setFilter(f);
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === 'upcoming' ? 'Upcoming' : f === 'active' ? 'Active' : 'Completed'}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredJobs}
        renderItem={renderJob}
        keyExtractor={item => item.assignmentId || item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === 'web' ? 134 : 100 }]}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          jobsQuery.isLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="dump-truck" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {filter === 'upcoming' ? 'No Upcoming Jobs' : filter === 'active' ? 'No Active Jobs' : 'No Completed Jobs'}
              </Text>
              <Text style={styles.emptyText}>
                {filter === 'upcoming' ? 'Jobs you apply for will appear here' : filter === 'active' ? 'Accept a job to get started' : 'Completed jobs will show here'}
              </Text>
              <Pressable
                style={styles.browseBtn}
                onPress={() => router.push('/(tabs)' as any)}
              >
                <Ionicons name="search" size={16} color={Colors.primaryForeground} />
                <Text style={styles.browseBtnText}>Browse Jobs</Text>
              </Pressable>
            </View>
          )
        }
      />

      <Modal
        visible={!!vehicleModalJob}
        transparent
        animationType="fade"
        onRequestClose={() => setVehicleModalJob(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setVehicleModalJob(null)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ASSIGN TRUCK</Text>
              <Pressable onPress={() => setVehicleModalJob(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </Pressable>
            </View>

            {vehicleModalJob && (
              <View style={styles.modalJobInfo}>
                <Text style={styles.modalJobMaterial}>{vehicleModalJob.material}</Text>
                {vehicleModalJob.truckType ? (
                  <Text style={styles.modalJobType}>Requires: {formatTruckType(vehicleModalJob.truckType)}</Text>
                ) : null}
              </View>
            )}

            {vehiclesQuery.isLoading ? (
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: 30 }} />
            ) : !vehiclesQuery.data?.length ? (
              <View style={{ paddingVertical: 24, alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="dump-truck" size={36} color={Colors.textMuted} />
                <Text style={{ color: Colors.textMuted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>No vehicles added yet</Text>
                <Pressable
                  style={styles.addVehicleBtn}
                  onPress={() => {
                    setVehicleModalJob(null);
                    router.push('/vehicles' as any);
                  }}
                >
                  <Ionicons name="add" size={16} color={Colors.primaryForeground} />
                  <Text style={styles.addVehicleBtnText}>Add Vehicle</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {vehiclesQuery.data.map(v => {
                  const isSelected = vehicleModalJob?.vehicle?.id === v.id;
                  return (
                    <Pressable
                      key={v.id}
                      style={[styles.vehicleOption, isSelected && styles.vehicleOptionSelected]}
                      onPress={() => {
                        if (!vehicleModalJob) return;
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        assignVehicleMutation.mutate({
                          assignmentId: vehicleModalJob.assignmentId,
                          vehicleId: isSelected ? null : v.id,
                        });
                      }}
                    >
                      <MaterialCommunityIcons
                        name="dump-truck"
                        size={20}
                        color={isSelected ? Colors.primary : Colors.textSecondary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.vehicleName, isSelected && { color: Colors.primary }]}>
                          {v.year} {v.make} {v.model}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                          {v.license_plate ? (
                            <Text style={styles.vehiclePlate}>{v.license_plate}</Text>
                          ) : null}
                          {v.truck_type ? (
                            <Text style={styles.vehicleType}>{formatTruckType(v.truck_type)}</Text>
                          ) : null}
                        </View>
                      </View>
                      {isSelected ? (
                        <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                      ) : (
                        <View style={styles.vehicleRadio} />
                      )}
                    </Pressable>
                  );
                })}

                {vehicleModalJob?.vehicle && (
                  <Pressable
                    style={styles.removeVehicleBtn}
                    onPress={() => {
                      if (!vehicleModalJob) return;
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      assignVehicleMutation.mutate({
                        assignmentId: vehicleModalJob.assignmentId,
                        vehicleId: null,
                      });
                    }}
                  >
                    <Ionicons name="close-circle-outline" size={16} color={Colors.destructive} />
                    <Text style={styles.removeVehicleText}>Remove Truck</Text>
                  </Pressable>
                )}
              </View>
            )}

            {assignVehicleMutation.isPending && (
              <View style={styles.savingOverlay}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 2,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
  },
  listContent: { padding: 16, paddingTop: 4 },
  jobCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  projectName: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 11,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  materialText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  infoTextMuted: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
  truckSection: {
    marginTop: 4,
  },
  truckAssigned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  truckName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.primary,
  },
  truckPlate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textSecondary,
  },
  assignTruckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  assignTruckBtnUrgent: {
    borderColor: Colors.warning,
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  assignTruckText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.textMuted,
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
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  browseBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.primaryForeground,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
    letterSpacing: 1,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalJobInfo: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 4,
  },
  modalJobMaterial: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
  },
  modalJobType: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  vehicleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  vehicleOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  vehicleName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  vehiclePlate: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  vehicleType: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textSecondary,
  },
  vehicleRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  addVehicleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  addVehicleBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.primaryForeground,
  },
  removeVehicleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  removeVehicleText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.destructive,
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
});
