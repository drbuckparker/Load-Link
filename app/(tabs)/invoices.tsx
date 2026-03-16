import { View, Text, FlatList, Pressable, StyleSheet, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useState, useMemo } from 'react';
import { queryClient } from '@/lib/query-client';
import { router } from 'expo-router';

interface Invoice {
  id: string;
  contractorId: string;
  driverId: string;
  periodMonth: number;
  periodYear: number;
  totalAmount: number;
  status: 'open' | 'issued' | 'payment_sent' | 'payment_received' | 'void';
  contractorName: string;
  driverName: string;
  createdAt: string;
}

function mapInvoice(inv: any): Invoice {
  let month = inv.periodMonth ?? 1;
  let year = inv.periodYear ?? 2026;
  if (inv.period_month && typeof inv.period_month === 'string') {
    const d = new Date(inv.period_month);
    month = d.getUTCMonth() + 1;
    year = d.getUTCFullYear();
  }
  return {
    id: inv.id,
    contractorId: inv.contractor_id ?? inv.contractorId ?? '',
    driverId: inv.driver_id ?? inv.driverId ?? '',
    periodMonth: month,
    periodYear: year,
    totalAmount: Number(inv.total_amount ?? inv.totalAmount) || 0,
    status: inv.status ?? 'open',
    contractorName: inv.contractor_name ?? inv.contractorName ?? '',
    driverName: inv.driver_name ?? inv.driverName ?? '',
    createdAt: inv.created_at ?? inv.createdAt ?? '',
  };
}

const STATUS_FILTERS = ['All', 'Open', 'Issued', 'Payment Sent', 'Payment Received', 'Void'] as const;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getInvoiceStatusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'payment_received': return { bg: Colors.successBg, text: Colors.success };
    case 'payment_sent': return { bg: Colors.warningBg, text: Colors.warning };
    case 'issued': return { bg: 'rgba(59, 130, 246, 0.2)', text: '#3B82F6' };
    case 'void': return { bg: Colors.destructiveBg, text: Colors.destructive };
    case 'open': return { bg: 'rgba(107, 112, 128, 0.2)', text: Colors.textMuted };
    default: return { bg: 'rgba(107, 112, 128, 0.2)', text: Colors.textMuted };
  }
}

function formatStatusLabel(status: string): string {
  return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default function InvoicesScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<string>('All');
  const [refreshing, setRefreshing] = useState(false);

  const filterToDbStatus: Record<string, string> = {
    'Open': 'open', 'Issued': 'issued', 'Payment Sent': 'payment_sent',
    'Payment Received': 'payment_received', 'Void': 'void',
  };
  const queryParam = filter === 'All' ? '' : `?status=${filterToDbStatus[filter] || filter.toLowerCase()}`;

  const { data: invoicesData, isLoading } = useQuery<any>({
    queryKey: [`/api/invoices${queryParam}`],
  });

  const invoices = useMemo(() => {
    if (!invoicesData) return [];
    const items = invoicesData.invoices || invoicesData;
    if (!Array.isArray(items)) return [];
    return items.map(mapInvoice);
  }, [invoicesData]);

  const stats = useMemo(() => {
    const totalOutstanding = invoices
      .filter((inv: Invoice) => ['open', 'issued', 'payment_sent'].includes(inv.status))
      .reduce((sum: number, inv: Invoice) => sum + inv.totalAmount, 0);
    const totalPaid = invoices
      .filter((inv: Invoice) => inv.status === 'payment_received')
      .reduce((sum: number, inv: Invoice) => sum + inv.totalAmount, 0);
    return {
      totalOutstanding,
      totalPaid,
      invoiceCount: invoices.length,
    };
  }, [invoices]);

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

        <Text style={styles.sectionTitle}>INVOICE HISTORY</Text>
      </View>
    );
  }

  function renderInvoice({ item }: { item: Invoice }) {
    const statusColor = getInvoiceStatusColor(item.status);
    const monthName = MONTH_NAMES[item.periodMonth - 1] || 'Jan';

    return (
      <Pressable
        style={({ pressed }) => [styles.invoiceCard, pressed && styles.invoiceCardPressed]}
        onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: item.id } })}
      >
        <View style={styles.invoiceLeft}>
          <View style={styles.invoiceIcon}>
            <Ionicons name="document-text" size={18} color={Colors.primary} />
          </View>
          <View style={styles.invoiceInfo}>
            <Text style={styles.invoicePeriod}>{monthName} {item.periodYear}</Text>
            <Text style={styles.invoiceDriver}>{item.driverName}</Text>
            <Text style={styles.invoiceDate}>
              {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </View>
        </View>
        <View style={styles.invoiceRight}>
          <Text style={styles.invoiceAmount}>${item.totalAmount.toLocaleString()}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor.text }]}>
              {formatStatusLabel(item.status).toUpperCase()}
            </Text>
          </View>
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
        data={invoices}
        renderItem={renderInvoice}
        keyExtractor={item => item.id}
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
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
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
  },
  sectionTitle: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  invoiceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  invoiceCardPressed: {
    backgroundColor: Colors.cardHover,
    transform: [{ scale: 0.99 }],
  },
  invoiceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  invoiceIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceInfo: {
    flex: 1,
    gap: 2,
  },
  invoicePeriod: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  invoiceDriver: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  invoiceDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
  },
  invoiceRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  invoiceAmount: {
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
