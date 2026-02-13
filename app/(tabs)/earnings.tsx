import { View, Text, FlatList, Pressable, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { MOCK_EARNINGS, Earning } from '@/lib/mock-data';
import { useState, useMemo } from 'react';

type Period = 'week' | 'month' | 'all';

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('month');

  const earnings = useMemo(() => {
    const now = new Date('2026-02-13');
    return MOCK_EARNINGS.filter(e => {
      const d = new Date(e.date);
      if (period === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return d >= weekAgo;
      }
      if (period === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [period]);

  const totalEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);
  const pendingAmount = earnings.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0);
  const paidAmount = earnings.filter(e => e.status === 'paid').reduce((sum, e) => sum + e.amount, 0);
  const totalHours = earnings.reduce((sum, e) => sum + e.billedHours, 0);

  function renderHeader() {
    return (
      <View>
        <View style={styles.statsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL EARNINGS</Text>
            <Text style={styles.totalAmount}>${totalEarnings.toLocaleString()}</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: Colors.success }]} />
              <View>
                <Text style={styles.statLabel}>Paid</Text>
                <Text style={styles.statValue}>${paidAmount.toLocaleString()}</Text>
              </View>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: Colors.warning }]} />
              <View>
                <Text style={styles.statLabel}>Pending</Text>
                <Text style={styles.statValue}>${pendingAmount.toLocaleString()}</Text>
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
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Earnings Yet</Text>
            <Text style={styles.emptyText}>Complete jobs to start earning</Text>
          </View>
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
