import { View, Text, FlatList, Pressable, StyleSheet, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { Earning } from '@/lib/mock-data';
import { queryClient } from '@/lib/query-client';
import { useState, useMemo } from 'react';

type Period = 'week' | 'month' | 'all';

function mapEarning(e: any): Earning {
  return {
    id: e.id,
    jobId: e.job_id ?? e.jobId ?? '',
    material: e.material ?? '',
    contractorCompany: e.contractor_company ?? e.contractorCompany ?? '',
    date: e.date ?? e.completed_date ?? e.completedDate ?? '',
    billedHours: e.billed_hours ?? e.billedHours ?? 0,
    rate: Number(e.rate) || 0,
    rateType: e.rate_type ?? e.rateType ?? '',
    amount: Number(e.amount) || 0,
    status: e.status ?? e.payment_status ?? e.paymentStatus ?? 'pending',
  };
}

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('month');
  const [refreshing, setRefreshing] = useState(false);

  const { data: earningsData, isLoading } = useQuery<any>({
    queryKey: [`/api/earnings?period=${period}`],
  });

  const earnings = useMemo(() => {
    if (!earningsData) return [];
    const items = earningsData.earnings || earningsData;
    if (!Array.isArray(items)) return [];
    return items.map(mapEarning);
  }, [earningsData]);

  const stats = earningsData?.stats;
  const totalEarnings = stats?.totalEarnings ?? stats?.total_earnings ?? earnings.reduce((sum: number, e: Earning) => sum + e.amount, 0);
  const pendingAmount = stats?.pendingAmount ?? stats?.pending_amount ?? earnings.filter((e: Earning) => e.status === 'pending').reduce((sum: number, e: Earning) => sum + e.amount, 0);
  const paidAmount = stats?.paidAmount ?? stats?.paid_amount ?? earnings.filter((e: Earning) => e.status === 'paid').reduce((sum: number, e: Earning) => sum + e.amount, 0);
  const totalHours = earnings.reduce((sum: number, e: Earning) => sum + e.billedHours, 0);

  function renderHeader() {
    return (
      <View>
        <View style={styles.statsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL EARNINGS</Text>
            <Text style={styles.totalAmount}>${Number(totalEarnings).toLocaleString()}</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: Colors.success }]} />
              <View>
                <Text style={styles.statLabel}>Paid</Text>
                <Text style={styles.statValue}>${Number(paidAmount).toLocaleString()}</Text>
              </View>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: Colors.warning }]} />
              <View>
                <Text style={styles.statLabel}>Pending</Text>
                <Text style={styles.statValue}>${Number(pendingAmount).toLocaleString()}</Text>
              </View>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: Colors.info }]} />
              <View>
                <Text style={styles.statLabel}>Hours</Text>
                <Text style={styles.statValue}>{totalHours.toFixed(1)}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.periodRow}>
          {(['week', 'month', 'all'] as Period[]).map(p => (
            <Pressable
              key={p}
              style={[styles.periodChip, period === p && styles.periodChipActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodChipText, period === p && styles.periodChipTextActive]}>
                {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>JOB HISTORY</Text>
      </View>
    );
  }

  function renderEarning({ item }: { item: Earning }) {
    return (
      <View style={styles.earningCard}>
        <View style={styles.earningLeft}>
          <View style={styles.earningIcon}>
            <Ionicons name="briefcase" size={18} color={Colors.primary} />
          </View>
          <View style={styles.earningInfo}>
            <Text style={styles.earningMaterial}>{item.material}</Text>
            <Text style={styles.earningCompany}>{item.contractorCompany}</Text>
            <Text style={styles.earningDate}>
              {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {item.billedHours}h billed
            </Text>
          </View>
        </View>
        <View style={styles.earningRight}>
          <Text style={styles.earningAmount}>${item.amount.toLocaleString()}</Text>
          <View style={[styles.statusBadge, {
            backgroundColor: item.status === 'paid' ? Colors.successBg : Colors.warningBg
          }]}>
            <Text style={[styles.statusBadgeText, {
              color: item.status === 'paid' ? Colors.success : Colors.warning
            }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Text style={styles.headerTitle}>EARNINGS</Text>
      </View>

      <FlatList
        data={earnings}
        renderItem={renderEarning}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
        ListHeaderComponent={renderHeader}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await queryClient.invalidateQueries({ queryKey: ['/api/earnings'] }); setRefreshing(false); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="wallet-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No Earnings Yet</Text>
              <Text style={styles.emptyText}>Complete jobs to start earning</Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />
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
  listContent: { padding: 16 },
  statsCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  totalRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  totalLabel: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 11,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  totalAmount: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 36,
    color: Colors.primary,
    textShadowColor: 'rgba(255, 153, 0, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
  },
  statValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.border,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  periodChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  periodChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  periodChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  periodChipTextActive: {
    color: Colors.primary,
  },
  sectionTitle: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  earningCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  earningLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  earningIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningInfo: {
    flex: 1,
    gap: 2,
  },
  earningMaterial: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  earningCompany: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  earningDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
  },
  earningRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  earningAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    letterSpacing: 0.5,
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
