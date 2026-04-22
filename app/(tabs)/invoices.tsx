import { View, Text, FlatList, Pressable, StyleSheet, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useState, useMemo } from 'react';
import { queryClient } from '@/lib/query-client';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

interface RawInvoice {
  id: string;
  contractor_id: string;
  driver_id: string;
  contractor_name?: string;
  contractor_company?: string;
  driver_name?: string;
  driver_company?: string;
  total_amount: any;
  status: string;
  created_at: string;
  period_month?: string;
  period_label?: string;
}

interface PartyGroup {
  partyId: string;
  partyName: string;
  partyCompany: string | null;
  invoiceCount: number;
  totalAmount: number;
  outstanding: number;
  paid: number;
  latestDate: string;
  hasOpen: boolean;
}

const STATUS_FILTERS = ['All', 'Open', 'Issued', 'Payment Sent', 'Payment Received', 'Void'] as const;

function isContractorRole(role?: string | null): boolean {
  if (!role) return false;
  return role === 'trucking_company_contractor' || role === 'contractor' || role === 'trucking_company';
}

export default function InvoicesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [filter, setFilter] = useState<string>('All');
  const [refreshing, setRefreshing] = useState(false);

  const viewerIsContractor = isContractorRole(user?.role);

  const filterToDbStatus: Record<string, string> = {
    'Open': 'open', 'Issued': 'issued', 'Payment Sent': 'payment_sent',
    'Payment Received': 'payment_received', 'Void': 'void',
  };
  const queryParam = filter === 'All' ? '' : `?status=${filterToDbStatus[filter] || filter.toLowerCase()}`;

  const { data: invoicesData, isLoading } = useQuery<any>({
    queryKey: [`/api/invoices${queryParam}`],
  });

  const invoices: RawInvoice[] = useMemo(() => {
    if (!invoicesData) return [];
    const items = invoicesData.invoices || invoicesData;
    if (!Array.isArray(items)) return [];
    return items as RawInvoice[];
  }, [invoicesData]);

  const groups: PartyGroup[] = useMemo(() => {
    const map = new Map<string, PartyGroup>();
    for (const inv of invoices) {
      const partyId = viewerIsContractor ? inv.driver_id : inv.contractor_id;
      const partyName = (viewerIsContractor ? inv.driver_name : inv.contractor_name) || 'Unknown';
      const partyCompany = (viewerIsContractor ? inv.driver_company : inv.contractor_company) || null;
      if (!partyId) continue;
      const amt = Number(inv.total_amount) || 0;
      const isOutstanding = ['open', 'issued', 'payment_sent'].includes(inv.status);
      const isPaid = inv.status === 'payment_received';
      const existing = map.get(partyId);
      if (existing) {
        existing.invoiceCount += 1;
        existing.totalAmount += amt;
        if (isOutstanding) existing.outstanding += amt;
        if (isPaid) existing.paid += amt;
        if (inv.created_at > existing.latestDate) existing.latestDate = inv.created_at;
        if (inv.status === 'open') existing.hasOpen = true;
      } else {
        map.set(partyId, {
          partyId,
          partyName,
          partyCompany,
          invoiceCount: 1,
          totalAmount: amt,
          outstanding: isOutstanding ? amt : 0,
          paid: isPaid ? amt : 0,
          latestDate: inv.created_at,
          hasOpen: inv.status === 'open',
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  }, [invoices, viewerIsContractor]);

  const stats = useMemo(() => {
    const totalOutstanding = invoices
      .filter(inv => ['open', 'issued', 'payment_sent'].includes(inv.status))
      .reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);
    const totalPaid = invoices
      .filter(inv => inv.status === 'payment_received')
      .reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);
    return {
      totalOutstanding,
      totalPaid,
      invoiceCount: invoices.length,
    };
  }, [invoices]);

  const partyLabel = viewerIsContractor ? 'DRIVERS / TRUCKING COMPANIES' : 'CONTRACTORS';
  const partyIconName = viewerIsContractor ? 'person-circle' : 'business';

  function renderHeader() {
    return (
      <View>
        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: Colors.warning }]} />
              <View>
                <Text style={styles.statLabel}>Outstanding</Text>
                <Text style={styles.statValue}>${stats.totalOutstanding.toLocaleString()}</Text>
              </View>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: Colors.success }]} />
              <View>
                <Text style={styles.statLabel}>Paid</Text>
                <Text style={styles.statValue}>${stats.totalPaid.toLocaleString()}</Text>
              </View>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: Colors.info }]} />
              <View>
                <Text style={styles.statLabel}>Invoices</Text>
                <Text style={styles.statValue}>{stats.invoiceCount}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.filterRow}>
          {STATUS_FILTERS.map(s => (
            <Pressable
              key={s}
              style={[styles.filterChip, filter === s && styles.filterChipActive]}
              onPress={() => setFilter(s)}
            >
              <Text style={[styles.filterChipText, filter === s && styles.filterChipTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{partyLabel}</Text>
      </View>
    );
  }

  function renderGroup({ item }: { item: PartyGroup }) {
    return (
      <Pressable
        style={({ pressed }) => [styles.groupCard, pressed && styles.groupCardPressed]}
        onPress={() => router.push({ pathname: '/invoices-by-party/[partyId]', params: { partyId: item.partyId } })}
      >
        <View style={styles.groupLeft}>
          <View style={styles.groupIcon}>
            <Ionicons name={partyIconName as any} size={22} color={Colors.primary} />
          </View>
          <View style={styles.groupInfo}>
            <Text style={styles.groupName} numberOfLines={1}>{item.partyCompany || item.partyName}</Text>
            {item.partyCompany && (
              <Text style={styles.groupSubName} numberOfLines={1}>{item.partyName}</Text>
            )}
            <Text style={styles.groupMeta}>
              {item.invoiceCount} invoice{item.invoiceCount !== 1 ? 's' : ''}
              {item.outstanding > 0 && (
                <Text style={{ color: Colors.warning }}> · ${item.outstanding.toLocaleString()} due</Text>
              )}
            </Text>
          </View>
        </View>
        <View style={styles.groupRight}>
          <Text style={styles.groupTotal}>${item.totalAmount.toLocaleString()}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Text style={styles.headerTitle}>INVOICES</Text>
      </View>

      <FlatList
        data={groups}
        renderItem={renderGroup}
        keyExtractor={item => item.partyId}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
        ListHeaderComponent={renderHeader}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith('/api/invoices') }); setRefreshing(false); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No Invoices Yet</Text>
              <Text style={styles.emptyText}>Invoices will appear here as jobs are completed</Text>
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
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted },
  statValue: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text },
  statDivider: { width: 1, height: 30, backgroundColor: Colors.border },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  filterChip: {
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  filterChipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.primary },
  sectionTitle: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  groupCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groupCardPressed: { backgroundColor: Colors.cardHover, transform: [{ scale: 0.99 }] },
  groupLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupInfo: { flex: 1, gap: 2 },
  groupName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text },
  groupSubName: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary },
  groupMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  groupRight: { alignItems: 'flex-end', gap: 4, flexDirection: 'row' },
  groupTotal: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text, marginRight: 4 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.text, marginTop: 8 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textMuted },
});
