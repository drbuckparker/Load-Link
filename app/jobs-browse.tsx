import { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { Job, formatRate, formatJobType, formatTruckType, getStatusColor, getJobTypeColor, timeAgo } from '@/lib/mock-data';
import JobCard from '@/components/JobCard';

function isContractorRole(role?: string) {
  return role?.includes('contractor') ?? false;
}

function mapDbJob(raw: any): Job {
  return {
    id: String(raw.id),
    contractorId: raw.contractor_id || raw.contractorId || '',
    contractorName: raw.contractor_name || raw.contractorName || '',
    contractorCompany: raw.contractor_company || raw.contractorCompany || '',
    driverId: raw.driver_id || raw.driverId,
    jobType: raw.job_type || raw.jobType || 'single_load',
    material: raw.material || '',
    originAddress: raw.origin_address || raw.originAddress || '',
    originLat: Number(raw.origin_lat || raw.originLat || 0),
    originLng: Number(raw.origin_lng || raw.originLng || 0),
    destinationAddress: raw.destination_address || raw.destinationAddress || '',
    destinationLat: Number(raw.destination_lat || raw.destinationLat || 0),
    destinationLng: Number(raw.destination_lng || raw.destinationLng || 0),
    distance: Number(raw.distance || 0),
    rate: Number(raw.rate || 0),
    rateType: raw.rate_type || raw.rateType || 'flat_rate',
    truckType: raw.truck_type || raw.truckType || 'end_dump',
    trucksNeeded: Number(raw.trucks_needed || raw.trucksNeeded || 1),
    status: raw.status || 'open',
    urgent: Boolean(raw.urgent),
    scheduledDate: raw.scheduled_date || raw.scheduledDate || '',
    pickupTime: raw.pickup_time || raw.pickupTime || '',
    estimatedDays: raw.estimated_days || raw.estimatedDays,
    estimatedTrips: raw.estimated_trips || raw.estimatedTrips,
    estimatedCost: raw.estimated_cost || raw.estimatedCost,
    requiresTarp: Boolean(raw.requires_tarp || raw.requiresTarp),
    requiresWeightTickets: Boolean(raw.requires_weight_tickets || raw.requiresWeightTickets),
    capacityNeeded: raw.capacity_needed || raw.capacityNeeded,
    totalTonsNeeded: raw.total_tons_needed || raw.totalTonsNeeded,
    createdAt: raw.created_at || raw.createdAt || '',
    projectName: raw.project_name || raw.projectName,
  };
}

const DRIVER_FILTERS = ['Open', 'My Jobs', 'Completed'] as const;
const CONTRACTOR_FILTERS = ['Open', 'In Progress', 'Completed', 'All'] as const;
const TRUCK_TYPES = ['end_dump', 'side_dump', 'belly_dump'] as const;

export default function JobsBrowseScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isContractor = isContractorRole(user?.role);

  const [activeFilter, setActiveFilter] = useState<string>('Open');
  const [search, setSearch] = useState('');
  const [showTruckFilter, setShowTruckFilter] = useState(false);
  const [selectedTruckType, setSelectedTruckType] = useState<string | null>(null);

  const statusParam = useMemo(() => {
    if (activeFilter === 'All') return undefined;
    if (activeFilter === 'Open') return 'open';
    if (activeFilter === 'My Jobs') return 'accepted';
    if (activeFilter === 'In Progress') return 'in_progress';
    if (activeFilter === 'Completed') return 'completed';
    return undefined;
  }, [activeFilter]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (statusParam) params.set('status', statusParam);
    if (selectedTruckType) params.set('truck_type', selectedTruckType);
    if (search.trim()) params.set('search', search.trim());
    if (!isContractor && user?.id && activeFilter === 'My Jobs') {
      params.set('driver_id', user.id);
    }
    return params.toString();
  }, [statusParam, selectedTruckType, search, isContractor, user?.id, activeFilter]);

  const endpoint = isContractor ? '/api/contractor/jobs' : '/api/jobs';
  const queryUrl = queryParams ? `${endpoint}?${queryParams}` : endpoint;

  const { data: rawJobs, isLoading, refetch } = useQuery<any[]>({
    queryKey: [queryUrl],
    enabled: !!user,
  });

  const jobs = useMemo(() => {
    if (!rawJobs) return [];
    const list = Array.isArray(rawJobs) ? rawJobs : [];
    return list.map(mapDbJob);
  }, [rawJobs]);

  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const filters = isContractor ? CONTRACTOR_FILTERS : DRIVER_FILTERS;

  function renderContractorCard({ item }: { item: Job }) {
    const statusColor = getStatusColor(item.status);
    const jobTypeColor = getJobTypeColor(item.jobType);

    return (
      <Pressable
        style={({ pressed }) => [styles.cardContainer, pressed && styles.cardPressed]}
        onPress={() => router.push(`/job/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardMaterial} numberOfLines={1}>{item.material}</Text>
            {item.urgent && (
              <View style={styles.urgentBadge}>
                <Ionicons name="flash" size={10} color={Colors.primary} />
                <Text style={styles.urgentText}>URGENT</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardRate}>{formatRate(item.rate, item.rateType)}</Text>
        </View>

        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.badgeText, { color: statusColor.text }]}>
              {item.status.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: jobTypeColor.bg }]}>
            <Text style={[styles.badgeText, { color: jobTypeColor.text }]}>{formatJobType(item.jobType, item.estimatedDays)}</Text>
          </View>
          <View style={styles.badge}>
            <MaterialCommunityIcons name="dump-truck" size={12} color={Colors.textSecondary} />
            <Text style={styles.badgeText}>{formatTruckType(item.truckType)}</Text>
          </View>
        </View>

        <View style={styles.locationRow}>
          <View style={styles.locationDot}>
            <View style={styles.dotGreen} />
            <View style={styles.dotLine} />
            <View style={styles.dotOrange} />
          </View>
          <View style={styles.locationTexts}>
            <Text style={styles.locationText} numberOfLines={1}>{item.originAddress}</Text>
            <Text style={styles.locationText} numberOfLines={1}>{item.destinationAddress}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.footerItem}>
            <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.footerText}>
              {item.scheduledDate ? new Date(item.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
            </Text>
          </View>
          <View style={styles.footerItem}>
            <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.footerText}>{item.pickupTime || '—'}</Text>
          </View>
          {item.driverId ? (
            <View style={styles.footerItem}>
              <Ionicons name="person-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.footerText}>Assigned</Text>
            </View>
          ) : (
            <View style={styles.footerItem}>
              <Ionicons name="people-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.footerText}>No driver</Text>
            </View>
          )}
          <Text style={styles.timeAgoText}>{timeAgo(item.createdAt)}</Text>
        </View>
      </Pressable>
    );
  }

  function renderDriverCard({ item }: { item: Job }) {
    return (
      <JobCard
        job={item}
        onPress={() => router.push(`/job/${item.id}`)}
        showStatus={activeFilter === 'My Jobs' || activeFilter === 'Completed'}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{isContractor ? 'MY JOBS' : 'FIND LOADS'}</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search jobs..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable
          style={[styles.filterButton, showTruckFilter && styles.filterButtonActive]}
          onPress={() => setShowTruckFilter(!showTruckFilter)}
          hitSlop={4}
        >
          <Ionicons name="options-outline" size={20} color={showTruckFilter ? Colors.primary : Colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.chipRow}>
        {filters.map((filter) => {
          const isActive = activeFilter === filter;
          return (
            <Pressable
              key={filter}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{filter}</Text>
            </Pressable>
          );
        })}
      </View>

      {showTruckFilter && (
        <View style={styles.truckFilterSection}>
          <Text style={styles.truckFilterLabel}>Truck Type</Text>
          <View style={styles.truckFilterRow}>
            <Pressable
              style={[styles.truckChip, !selectedTruckType && styles.truckChipActive]}
              onPress={() => setSelectedTruckType(null)}
            >
              <Text style={[styles.truckChipText, !selectedTruckType && styles.truckChipTextActive]}>All</Text>
            </Pressable>
            {TRUCK_TYPES.map((tt) => {
              const isActive = selectedTruckType === tt;
              return (
                <Pressable
                  key={tt}
                  style={[styles.truckChip, isActive && styles.truckChipActive]}
                  onPress={() => setSelectedTruckType(isActive ? null : tt)}
                >
                  <MaterialCommunityIcons name="dump-truck" size={14} color={isActive ? Colors.primary : Colors.textSecondary} />
                  <Text style={[styles.truckChipText, isActive && styles.truckChipTextActive]}>{formatTruckType(tt)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : jobs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="briefcase-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No jobs found</Text>
          <Text style={styles.emptySubtitle}>
            {search ? 'Try adjusting your search or filters' : 'Check back later for new opportunities'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id}
          renderItem={isContractor ? renderContractorCard : renderDriverCard}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={false}
        />
      )}

      {isContractor && (
        <Pressable
          style={[styles.fab, { bottom: Platform.OS === 'web' ? 34 + 20 : insets.bottom + 20 }]}
          onPress={() => router.push('/create-job')}
        >
          <Ionicons name="add" size={28} color={Colors.primaryForeground} />
        </Pressable>
      )}
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
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 20,
    color: Colors.text,
    letterSpacing: 1.5,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
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
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.text,
    height: 44,
  },
  filterButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontFamily: 'Inter_600SemiBold',
  },
  truckFilterSection: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  truckFilterLabel: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  truckFilterRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  truckChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  truckChipActive: {
    borderColor: Colors.primary,
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.text,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  cardContainer: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardPressed: {
    backgroundColor: Colors.cardHover,
    transform: [{ scale: 0.99 }],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  cardMaterial: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.text,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  urgentText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  cardRate: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.primary,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.muted,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  badgeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.textSecondary,
  },
  locationRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  locationDot: {
    alignItems: 'center',
    width: 12,
    paddingTop: 4,
  },
  dotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  dotLine: {
    width: 1,
    height: 14,
    backgroundColor: Colors.border,
  },
  dotOrange: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  locationTexts: {
    flex: 1,
    gap: 8,
  },
  locationText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
  timeAgoText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginLeft: 'auto',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
