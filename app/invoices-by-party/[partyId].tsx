import { View, Text, SectionList, Pressable, StyleSheet, Platform, ActivityIndicator, RefreshControl, Linking, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useState, useMemo } from 'react';
import { queryClient, apiRequest } from '@/lib/query-client';
import { useAuth } from '@/contexts/AuthContext';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isContractorRole(role?: string | null): boolean {
  if (!role) return false;
  return role === 'trucking_company_contractor' || role === 'contractor' || role === 'trucking_company';
}

function getInvoiceStatusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'payment_received': return { bg: Colors.successBg, text: Colors.success };
    case 'payment_sent': return { bg: Colors.warningBg, text: Colors.warning };
    case 'issued': return { bg: 'rgba(59, 130, 246, 0.2)', text: '#3B82F6' };
    case 'void': return { bg: Colors.destructiveBg, text: Colors.destructive };
    default: return { bg: 'rgba(107, 112, 128, 0.2)', text: Colors.textMuted };
  }
}

function formatStatusLabel(status: string): string {
  return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function buildAddress(addr?: string | null, city?: string | null, state?: string | null, zip?: string | null): string {
  const parts: string[] = [];
  if (addr) parts.push(addr);
  const cityLine = [city, state].filter(Boolean).join(', ');
  if (cityLine) parts.push(zip ? `${cityLine} ${zip}` : cityLine);
  else if (zip) parts.push(zip);
  return parts.join('\n');
}

export default function InvoicesByPartyScreen() {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const viewerIsContractor = isContractorRole(user?.role);
  const [refreshing, setRefreshing] = useState(false);

  const { data: invoicesData, isLoading } = useQuery<any>({
    queryKey: ['/api/invoices'],
  });

  const allInvoices: any[] = useMemo(() => {
    if (!invoicesData) return [];
    const items = invoicesData.invoices || invoicesData;
    return Array.isArray(items) ? items : [];
  }, [invoicesData]);

  const invoices = useMemo(() => {
    return allInvoices.filter(inv => {
      const otherPartyId = viewerIsContractor ? inv.driver_id : inv.contractor_id;
      return otherPartyId === partyId;
    });
  }, [allInvoices, partyId, viewerIsContractor]);

  const partyInfo = useMemo(() => {
    if (invoices.length === 0) return null;
    const sample = invoices[0];
    if (viewerIsContractor) {
      return {
        name: sample.driver_name || 'Unknown',
        company: sample.driver_company,
        email: sample.driver_email,
        phone: sample.driver_phone,
        address: sample.driver_address,
        city: sample.driver_city,
        state: sample.driver_state,
        zip: sample.driver_zip,
      };
    }
    return {
      name: sample.contractor_name || 'Unknown',
      company: sample.contractor_company,
      email: sample.contractor_email,
      phone: sample.contractor_phone,
      address: sample.contractor_address,
      city: sample.contractor_city,
      state: sample.contractor_state,
      zip: sample.contractor_zip,
    };
  }, [invoices, viewerIsContractor]);

  const totals = useMemo(() => {
    let total = 0, outstanding = 0, paid = 0;
    for (const inv of invoices) {
      const amt = Number(inv.total_amount) || 0;
      total += amt;
      if (['open', 'issued', 'payment_sent'].includes(inv.status)) outstanding += amt;
      if (inv.status === 'payment_received') paid += amt;
    }
    return { total, outstanding, paid };
  }, [invoices]);

  const sections = useMemo(() => {
    const active = invoices.filter(i => i.status !== 'payment_received');
    const paid = invoices.filter(i => i.status === 'payment_received');
    const sortByDateDesc = (a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || '');
    active.sort(sortByDateDesc);
    paid.sort(sortByDateDesc);
    const out: { title: string; data: any[] }[] = [];
    if (active.length > 0) out.push({ title: 'ACTIVE', data: active });
    if (paid.length > 0) out.push({ title: 'PAID INVOICES', data: paid });
    return out;
  }, [invoices]);

  const fullAddress = partyInfo ? buildAddress(partyInfo.address, partyInfo.city, partyInfo.state, partyInfo.zip) : '';

  function renderHeader() {
    if (!partyInfo) return null;
    return (
      <View>
        <View style={styles.partyCard}>
          <View style={styles.partyTop}>
            <View style={styles.partyAvatar}>
              <Ionicons name={viewerIsContractor ? 'person-circle' : 'business'} size={28} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.partyName}>{partyInfo.company || partyInfo.name}</Text>
              {partyInfo.company && <Text style={styles.partySub}>{partyInfo.name}</Text>}
            </View>
          </View>

          <View style={styles.contactSection}>
            <Text style={styles.contactHeader}>{viewerIsContractor ? 'BILL TO / DRIVER CONTACT' : 'CONTRACTOR CONTACT'}</Text>
            {partyInfo.email ? (
              <Pressable style={styles.contactRow} onPress={() => Linking.openURL(`mailto:${partyInfo.email}`)}>
                <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
                <Text style={[styles.contactValue, { color: Colors.primary }]}>{partyInfo.email}</Text>
              </Pressable>
            ) : null}
            {partyInfo.phone ? (
              <Pressable style={styles.contactRow} onPress={() => Linking.openURL(`tel:${partyInfo.phone}`)}>
                <Ionicons name="call-outline" size={16} color={Colors.textMuted} />
                <Text style={[styles.contactValue, { color: Colors.primary }]}>{partyInfo.phone}</Text>
              </Pressable>
            ) : null}
            {fullAddress ? (
              <Pressable
                style={styles.contactRow}
                onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(fullAddress.replace(/\n/g, ', '))}`)}
              >
                <Ionicons name="location-outline" size={16} color={Colors.textMuted} />
                <Text style={[styles.contactValue, { color: Colors.primary }]}>{fullAddress}</Text>
              </Pressable>
            ) : (
              <View style={styles.contactRow}>
                <Ionicons name="location-outline" size={16} color={Colors.textMuted} />
                <Text style={[styles.contactValue, { color: Colors.textMuted }]}>Mailing address not on file</Text>
              </View>
            )}
            {!partyInfo.email && !partyInfo.phone && !fullAddress && (
              <Pressable
                onPress={() => Alert.alert('No contact info', 'This user has not set up their contact information yet.')}
                style={styles.contactRow}
              >
                <Ionicons name="alert-circle-outline" size={16} color={Colors.textMuted} />
                <Text style={[styles.contactValue, { color: Colors.textMuted }]}>No contact information available</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.totalsCard}>
          <View style={styles.totalsRow}>
            <View style={styles.totalsItem}>
              <Text style={styles.totalsLabel}>Total Billed</Text>
              <Text style={styles.totalsValue}>${totals.total.toLocaleString()}</Text>
            </View>
            <View style={styles.totalsDivider} />
            <View style={styles.totalsItem}>
              <Text style={[styles.totalsLabel, { color: Colors.warning }]}>Outstanding</Text>
              <Text style={styles.totalsValue}>${totals.outstanding.toLocaleString()}</Text>
            </View>
            <View style={styles.totalsDivider} />
            <View style={styles.totalsItem}>
              <Text style={[styles.totalsLabel, { color: Colors.success }]}>Paid</Text>
              <Text style={styles.totalsValue}>${totals.paid.toLocaleString()}</Text>
            </View>
          </View>
        </View>

      </View>
    );
  }

  async function hideInvoice(id: string) {
    try {
      await apiRequest('POST', `/api/invoices/${id}/hide`);
      await queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith('/api/invoices') });
    } catch (e: any) {
      Alert.alert('Could not clear invoice', e?.message || 'Please try again.');
    }
  }

  function confirmHide(item: any) {
    const label = `${item.period_label || ''}`.trim() || 'this invoice';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Clear ${label} from your view?\n\nIt has a $0 balance. You can restore it later from the website.`)) {
        hideInvoice(item.id);
      }
      return;
    }
    Alert.alert(
      'Clear invoice?',
      `${label} has a $0 balance. Hiding removes it from your view (you can restore it later from the website).`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => hideInvoice(item.id) },
      ]
    );
  }

  function renderInvoice({ item }: { item: any }) {
    const statusColor = getInvoiceStatusColor(item.status);
    let monthName = 'Jan';
    let year = 2026;
    if (item.period_month) {
      const d = new Date(item.period_month);
      monthName = MONTH_NAMES[d.getUTCMonth()] || 'Jan';
      year = d.getUTCFullYear();
    }
    const amount = Number(item.total_amount) || 0;
    const canClear = amount === 0 && (item.status === 'open' || item.status === 'void');
    return (
      <View style={styles.invoiceRow}>
        <Pressable
          style={({ pressed }) => [styles.invoiceCard, { flex: 1 }, pressed && styles.invoiceCardPressed]}
          onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: item.id } })}
        >
          <View style={styles.invoiceLeft}>
            <View style={styles.invoiceIcon}>
              <Ionicons name="document-text" size={18} color={Colors.primary} />
            </View>
            <View style={styles.invoiceInfo}>
              <Text style={styles.invoicePeriod}>{monthName} {year}</Text>
              <Text style={styles.invoiceDate}>
                {item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
              </Text>
            </View>
          </View>
          <View style={styles.invoiceRight}>
            <Text style={styles.invoiceAmount}>${amount.toLocaleString()}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor.text }]}>
                {formatStatusLabel(item.status).toUpperCase()}
              </Text>
            </View>
          </View>
        </Pressable>
        {canClear && (
          <Pressable
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.6 }]}
            onPress={() => confirmHide(item)}
            hitSlop={8}
            accessibilityLabel="Clear invoice"
          >
            <Ionicons name="close-circle" size={22} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/invoices' as any); }} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{partyInfo?.company || partyInfo?.name || 'INVOICES'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <SectionList
        sections={sections}
        renderItem={renderInvoice}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
        ListHeaderComponent={renderHeader}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionTitle, section.title === 'PAID INVOICES' && styles.sectionTitlePaid]}>
            {section.title} ({section.data.length})
          </Text>
        )}
        SectionSeparatorComponent={({ leadingItem }) => leadingItem ? <View style={{ height: 16 }} /> : null}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith('/api/invoices') }); setRefreshing(false); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyState}><ActivityIndicator size="large" color={Colors.primary} /></View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No Invoices</Text>
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
  },
  headerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
    letterSpacing: 1.5,
    flex: 1,
    textAlign: 'center',
  },
  listContent: { padding: 16 },
  partyCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  partyTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  partyAvatar: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyName: { fontFamily: 'Inter_700Bold', fontSize: 17, color: Colors.text },
  partySub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  contactSection: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  contactHeader: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 11,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
  },
  contactValue: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  totalsCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  totalsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  totalsItem: { alignItems: 'center', gap: 4, flex: 1 },
  totalsLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted },
  totalsValue: { fontFamily: 'ChakraPetch_700Bold', fontSize: 16, color: Colors.text },
  totalsDivider: { width: 1, height: 32, backgroundColor: Colors.border },
  sectionTitle: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  sectionTitlePaid: {
    color: Colors.success,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 16,
    marginTop: 4,
  },
  invoiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
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
  invoiceCardPressed: { backgroundColor: Colors.cardHover, transform: [{ scale: 0.99 }] },
  invoiceLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  invoiceIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceInfo: { flex: 1, gap: 2 },
  invoicePeriod: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text },
  invoiceDate: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted },
  invoiceRight: { alignItems: 'flex-end', gap: 4 },
  invoiceAmount: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.5 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.text, marginTop: 8 },
});
