import { useState, useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Platform, TextInput, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { Job, Notification } from '@/lib/mock-data';
import JobCard from '@/components/JobCard';

const TRUCK_FILTERS = ['All', 'End Dump', 'Side Dump', 'Belly Dump'] as const;
const STATUS_FILTERS = ['Open', 'My Jobs', 'Completed'] as const;

function mapJob(j: any): Job {
  return {
    id: j.id,
    contractorId: j.contractor_id ?? j.contractorId ?? '',
    contractorName: j.contractor_name ?? j.contractorName ?? '',
    contractorCompany: j.contractor_company ?? j.contractorCompany ?? '',
    driverId: j.driver_id ?? j.driverId,
    jobType: j.job_type ?? j.jobType ?? 'single_load',
    material: j.material ?? '',
    originAddress: j.origin_address ?? j.originAddress ?? '',
    originLat: j.origin_lat ?? j.originLat ?? 0,
    originLng: j.origin_lng ?? j.originLng ?? 0,
    destinationAddress: j.destination_address ?? j.destinationAddress ?? '',
    destinationLat: j.destination_lat ?? j.destinationLat ?? 0,
    destinationLng: j.destination_lng ?? j.destinationLng ?? 0,
    distance: j.distance ?? 0,
    rate: Number(j.rate) || 0,
    rateType: j.rate_type ?? j.rateType ?? 'per_hour',
    truckType: j.truck_type ?? j.truckType ?? 'end_dump',
    trucksNeeded: j.trucks_needed ?? j.trucksNeeded ?? 1,
    status: j.status ?? 'open',
    urgent: j.urgent ?? false,
    scheduledDate: j.scheduled_date ?? j.scheduledDate ?? '',
    pickupTime: j.pickup_time ?? j.pickupTime ?? '',
    estimatedDays: j.estimated_days ?? j.estimatedDays,
    estimatedTrips: j.estimated_trips ?? j.estimatedTrips,
    estimatedCost: j.estimated_cost != null ? Number(j.estimated_cost) : j.estimatedCost != null ? Number(j.estimatedCost) : undefined,
    requiresTarp: j.requires_tarp ?? j.requiresTarp ?? false,
    requiresWeightTickets: j.requires_weight_tickets ?? j.requiresWeightTickets ?? false,
    capacityNeeded: j.capacity_needed ?? j.capacityNeeded,
    totalTonsNeeded: j.total_tons_needed ?? j.totalTonsNeeded,
    createdAt: j.created_at ?? j.createdAt ?? '',
    projectName: j.project_name ?? j.projectName,
  };
}

function mapNotification(n: any): Notification {
  return {
    id: n.id,
    type: n.type ?? '',
    title: n.title ?? '',
    message: n.message ?? '',
    jobId: n.job_id ?? n.jobId,
    isRead: n.is_read ?? n.isRead ?? false,
    createdAt: n.created_at ?? n.createdAt ?? '',
  };
}

export default function JobsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [truckFilter, setTruckFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('Open');
  const [showFilters, setShowFilters] = useState(false);

  const jobsQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter === 'Open') {
      params.set('status', 'open');
    } else if (statusFilter === 'My Jobs') {
      params.set('status', 'my_jobs');
      if (user?.id) params.set('driver_id', user.id);
    } else if (statusFilter === 'Completed') {
      params.set('status', 'completed');
      if (user?.id) params.set('driver_id', user.id);
    }
    if (truckFilter !== 'All') {
      params.set('truck_type', truckFilter.toLowerCase().replace(' ', '_'));
    }
    if (search) {
      params.set('search', search);
    }
    return params.toString();
  }, [statusFilter, truckFilter, search, user?.id]);

  const { data: jobsData, isLoading: jobsLoading } = useQuery<any[]>({
    queryKey: [jobsQueryParams ? `/api/jobs?${jobsQueryParams}` : '/api/jobs'],
  });

  const { data: notifsData } = useQuery<any[]>({
    queryKey: ['/api/notifications'],
  });

  const filteredJobs = useMemo(() => {
    if (!jobsData || !Array.isArray(jobsData)) return [];
    return jobsData.map(mapJob);
  }, [jobsData]);

  const unreadCount = useMemo(() => {
    if (!notifsData || !Array.isArray(notifsData)) return 0;
    return notifsData.filter((n: any) => !(n.is_read ?? n.isRead)).length;
  }, [notifsData]);

  function renderHeader() {
    return (
      <View>
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search jobs, materials..."
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            style={[styles.filterBtn, showFilters && styles.filterBtnActive]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons name="options" size={20} color={showFilters ? Colors.primary : Colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.statusFilters}>
          {STATUS_FILTERS.map(s => (
            <Pressable
              key={s}
              style={[styles.statusChip, statusFilter === s && styles.statusChipActive]}
              onPress={() => setStatusFilter(s)}
            >
              <Text style={[styles.statusChipText, statusFilter === s && styles.statusChipTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        {showFilters && (
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>TRUCK TYPE</Text>
            <View style={styles.truckFilters}>
              {TRUCK_FILTERS.map(t => (
                <Pressable
                  key={t}
                  style={[styles.truckChip, truckFilter === t && styles.truckChipActive]}
                  onPress={() => setTruckFilter(t)}
                >
                  {t !== 'All' && <MaterialCommunityIcons name="dump-truck" size={14} color={truckFilter === t ? Colors.primary : Colors.textMuted} />}
                  <Text style={[styles.truckChipText, truckFilter === t && styles.truckChipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.resultCount}>{filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.logoMark}>
            <Ionicons name="cube" size={20} color={Colors.primary} />
          </View>
          <Text style={styles.headerTitle}>LOADLINK</Text>
        </View>
        <Pressable style={styles.notifBtn} onPress={() => router.push('/notifications')}>
          <Ionicons name="notifications-outline" size={22} color={Colors.text} />
          {unreadCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <FlatList
        data={filteredJobs}
        renderItem={({ item }) => (
          <JobCard
            job={item}
            onPress={() => router.push({ pathname: '/job/[id]', params: { id: item.id } })}
            showStatus={statusFilter !== 'Open'}
          />
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          jobsLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="briefcase-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No Jobs Found</Text>
              <Text style={styles.emptyText}>Try adjusting your filters or search terms</Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 2,
  },
  notifBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: '#fff',
  },
  listContent: {
    padding: 16,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
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
    fontSize: 14,
    color: Colors.text,
    height: '100%',
  },
  filterBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  statusFilters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statusChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  statusChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  statusChipTextActive: {
    color: Colors.primary,
  },
  filterSection: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterLabel: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 11,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 10,
  },
  truckFilters: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  truckChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.muted,
  },
  truckChipActive: {
    backgroundColor: Colors.primaryLight,
  },
  truckChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  truckChipTextActive: {
    color: Colors.primary,
  },
  resultCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
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
  },
});
