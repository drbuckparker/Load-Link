import React from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import TruckIcon from '@/components/TruckIcon';
import { formatTruckType } from '@/lib/mock-data';

export default function VehicleJobsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery<{ vehicle: any; jobs: any[] }>({
    queryKey: [`/api/vehicles/${id}/jobs`],
  });

  const vehicle = data?.vehicle;
  const jobsList = data?.jobs || [];

  const vehicleLabel = vehicle
    ? [vehicle.make, formatTruckType(vehicle.truck_type)].filter(Boolean).join(' ')
    : '';

  function getStatusBadge(status: string, scheduledDate?: string) {
    const isUpcoming = scheduledDate && new Date(scheduledDate) > new Date();
    if (isUpcoming && status === 'open') {
      return { label: 'UPCOMING', color: '#9382f6', bg: 'rgba(147,130,246,0.15)' };
    }
    const map: Record<string, { label: string; color: string; bg: string }> = {
      open: { label: 'OPEN', color: Colors.success, bg: Colors.successBg },
      in_progress: { label: 'IN PROGRESS', color: Colors.primary, bg: Colors.primaryLight },
      completed: { label: 'COMPLETED', color: Colors.textMuted, bg: Colors.muted },
      cancelled: { label: 'CANCELLED', color: Colors.destructive, bg: Colors.destructiveBg },
    };
    return map[status] || map.open;
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function renderJob({ item }: { item: any }) {
    const badge = getStatusBadge(item.status, item.scheduled_date);
    return (
      <Pressable
        style={styles.jobCard}
        onPress={() => router.push(`/job/${item.id}` as any)}
      >
        <View style={styles.jobHeader}>
          <Text style={styles.jobMaterial} numberOfLines={1}>{item.material || 'Job'}</Text>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>
        <View style={styles.jobDetail}>
          <Ionicons name="business-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.jobDetailText} numberOfLines={1}>{item.contractor_name}</Text>
        </View>
        {item.scheduled_date && (
          <View style={styles.jobDetail}>
            <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.jobDetailText}>{formatDate(item.scheduled_date)}</Text>
          </View>
        )}
        {(item.origin_address || item.destination_address) && (
          <View style={styles.jobDetail}>
            <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.jobDetailText} numberOfLines={1}>
              {item.origin_address ? item.origin_address.split(',')[0] : ''}{item.origin_address && item.destination_address ? ' → ' : ''}{item.destination_address ? item.destination_address.split(',')[0] : ''}
            </Text>
          </View>
        )}
        {item.assignment_status && (
          <View style={styles.jobDetail}>
            <Ionicons
              name={item.assignment_status === 'approved' ? 'checkmark-circle' : 'time-outline'}
              size={14}
              color={item.assignment_status === 'approved' ? Colors.success : Colors.warning}
            />
            <Text style={[styles.jobDetailText, { color: item.assignment_status === 'approved' ? Colors.success : Colors.warning }]}>
              {item.assignment_status === 'approved' ? 'Approved' : item.assignment_status === 'accepted' ? 'Accepted' : 'Pending'}
            </Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={styles.jobChevron} />
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <Pressable onPress={() => {
          try { if (router.canGoBack()) { router.back(); return; } } catch {}
          router.replace('/(tabs)/profile' as any);
        }} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.topBarCenter}>
          <TruckIcon size={18} />
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {vehicle ? `${vehicle.truck_number ? `#${vehicle.truck_number} ` : ''}${vehicleLabel}` : 'Vehicle Jobs'}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : jobsList.length === 0 ? (
        <View style={styles.center}>
          <TruckIcon size={48} />
          <Text style={styles.emptyTitle}>No Scheduled Jobs</Text>
          <Text style={styles.emptyText}>This vehicle doesn't have any jobs assigned yet.</Text>
        </View>
      ) : (
        <FlatList
          data={jobsList}
          renderItem={renderJob}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  topBarCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  topBarTitle: { fontFamily: 'ChakraPetch_700Bold', fontSize: 16, color: Colors.text, textTransform: 'uppercase' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontFamily: 'ChakraPetch_700Bold', fontSize: 18, color: Colors.text, marginTop: 16 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 8 },
  list: { padding: 16, gap: 12 },
  jobCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
  },
  jobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  jobMaterial: { fontFamily: 'ChakraPetch_700Bold', fontSize: 16, color: Colors.text, flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 11, textTransform: 'uppercase' },
  jobDetail: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  jobDetailText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, flex: 1 },
  jobChevron: { position: 'absolute', right: 16, top: '50%' },
});
