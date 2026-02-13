import { useState, useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Platform, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { MOCK_JOBS, Job, MOCK_NOTIFICATIONS } from '@/lib/mock-data';
import JobCard from '@/components/JobCard';

const TRUCK_FILTERS = ['All', 'End Dump', 'Side Dump', 'Belly Dump'] as const;
const STATUS_FILTERS = ['Open', 'My Jobs', 'Completed'] as const;

export default function JobsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [truckFilter, setTruckFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('Open');
  const [showFilters, setShowFilters] = useState(false);

  const unreadCount = MOCK_NOTIFICATIONS.filter(n => !n.isRead).length;

  const filteredJobs = useMemo(() => {
    let jobs = [...MOCK_JOBS];

    if (statusFilter === 'Open') {
      jobs = jobs.filter(j => j.status === 'open');
    } else if (statusFilter === 'My Jobs') {
      jobs = jobs.filter(j => j.driverId === user?.id && ['accepted', 'in_progress'].includes(j.status));
    } else if (statusFilter === 'Completed') {
      jobs = jobs.filter(j => j.driverId === user?.id && j.status === 'completed');
    }

    if (truckFilter !== 'All') {
      const type = truckFilter.toLowerCase().replace(' ', '_');
      jobs = jobs.filter(j => j.truckType === type);
    }

    if (search) {
      const q = search.toLowerCase();
      jobs = jobs.filter(j =>
        j.material.toLowerCase().includes(q) ||
        j.originAddress.toLowerCase().includes(q) ||
        j.contractorCompany.toLowerCase().includes(q)
      );
    }

    return jobs;
  }, [statusFilter, truckFilter, search, user?.id]);

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
          <View style={styles.emptyState}>
            <Ionicons name="briefcase-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Jobs Found</Text>
            <Text style={styles.emptyText}>Try adjusting your filters or search terms</Text>
          </View>
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
