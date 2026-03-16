import { View, Text, ScrollView, Pressable, StyleSheet, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import TruckIcon from '@/components/TruckIcon';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { queryClient } from '@/lib/query-client';
import { formatTruckType } from '@/lib/mock-data';

function isContractorRole(role: string): boolean {
  return role.includes('contractor') || role === 'trucking_company';
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getStatusInfo(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'open': return { label: 'OPEN', color: Colors.warning, bg: Colors.warningBg };
    case 'issued': return { label: 'ISSUED', color: Colors.info, bg: Colors.infoBg };
    case 'payment_sent': return { label: 'PAYMENT SENT', color: Colors.info, bg: Colors.infoBg };
    case 'payment_received': return { label: 'PAID', color: Colors.success, bg: Colors.successBg };
    case 'paid': return { label: 'PAID', color: Colors.success, bg: Colors.successBg };
    case 'void': return { label: 'VOID', color: Colors.destructive, bg: Colors.destructiveBg };
    default: return { label: status.toUpperCase(), color: Colors.textMuted, bg: 'rgba(107,112,128,0.2)' };
  }
}

function getJobStatusInfo(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'completed': return { label: 'COMPLETED', color: Colors.success, bg: Colors.successBg };
    case 'in_progress': return { label: 'IN PROGRESS', color: Colors.warning, bg: Colors.warningBg };
    case 'open': return { label: 'OPEN', color: Colors.info, bg: Colors.infoBg };
    case 'cancelled': return { label: 'CANCELLED', color: Colors.destructive, bg: Colors.destructiveBg };
    default: return { label: status.toUpperCase(), color: Colors.textMuted, bg: 'rgba(107,112,128,0.2)' };
  }
}

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isContractor = user?.role ? isContractorRole(user.role) : false;
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ['/api/invoices/' + id],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
          <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)' as any); }} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>INVOICE</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
          <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)' as any); }} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>INVOICE</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.destructive} />
          <Text style={styles.errorText}>Invoice not found</Text>
          <Pressable style={styles.retryBtn} onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)' as any); }}>
            <Text style={styles.retryBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const periodDate = new Date(data.period_month);
  const monthName = MONTH_NAMES[periodDate.getUTCMonth()] || 'Unknown';
  const year = periodDate.getUTCFullYear();
  const statusInfo = getStatusInfo(data.status);
  const invoiceJobs = data.jobs || [];
  const driverSnapshot = data.driver_snapshot || {};
  const contractorSnapshot = data.contractor_snapshot || {};

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)' as any); }} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>INVOICE</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === 'web' ? 134 : 100 }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await queryClient.invalidateQueries({ queryKey: ['/api/invoices/' + id] }); setRefreshing(false); }} tintColor={Colors.primary} colors={[Colors.primary]} />}>
        <View style={styles.invoiceHeader}>
          <View style={styles.invoiceIconLarge}>
            <Ionicons name="document-text" size={28} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.invoiceNumber}>{data.invoice_number}</Text>
            <Text style={styles.invoicePeriod}>{monthName} {year}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
        </View>

        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>TOTAL AMOUNT</Text>
          <Text style={styles.amountValue}>${Number(data.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          <Text style={styles.amountJobs}>{data.job_count} job{data.job_count !== 1 ? 's' : ''}</Text>
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>DETAILS</Text>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Ionicons name="business-outline" size={16} color={Colors.textMuted} />
              <View>
                <Text style={styles.detailLabel}>Contractor</Text>
                <Text style={styles.detailValue}>{data.contractor_name || contractorSnapshot.fullName || 'N/A'}</Text>
                {(data.contractor_company || contractorSnapshot.company) && (
                  <Text style={styles.detailSub}>{data.contractor_company || contractorSnapshot.company}</Text>
                )}
              </View>
            </View>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <TruckIcon size={16} />
              <View>
                <Text style={styles.detailLabel}>Driver</Text>
                <Text style={styles.detailValue}>{data.driver_name || driverSnapshot.fullName || 'N/A'}</Text>
                {(data.driver_company || driverSnapshot.company) && (
                  <Text style={styles.detailSub}>{data.driver_company || driverSnapshot.company}</Text>
                )}
              </View>
            </View>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} />
              <View>
                <Text style={styles.detailLabel}>Created</Text>
                <Text style={styles.detailValue}>
                  {new Date(data.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
            </View>
          </View>
          {data.due_date && (
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
                <View>
                  <Text style={styles.detailLabel}>Due Date</Text>
                  <Text style={styles.detailValue}>
                    {new Date(data.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
              </View>
            </View>
          )}
          {data.paid_at && (
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} />
                <View>
                  <Text style={styles.detailLabel}>Paid On</Text>
                  <Text style={[styles.detailValue, { color: Colors.success }]}>
                    {new Date(data.paid_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
              </View>
            </View>
          )}
          {data.notes && (
            <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
              <View style={styles.detailItem}>
                <Ionicons name="chatbubble-outline" size={16} color={Colors.textMuted} />
                <View>
                  <Text style={styles.detailLabel}>Notes</Text>
                  <Text style={styles.detailValue}>{data.notes}</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        <View style={styles.jobsCard}>
          <Text style={styles.sectionTitle}>JOBS ({invoiceJobs.length})</Text>
          {invoiceJobs.length === 0 ? (
            <View style={styles.emptyJobs}>
              <Ionicons name="briefcase-outline" size={32} color={Colors.textMuted} />
              <Text style={styles.emptyJobsText}>No linked jobs found</Text>
              <Text style={styles.emptyJobsSub}>Jobs associated with this invoice will appear here</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {invoiceJobs.map((job: any) => {
                const jobStatus = getJobStatusInfo(job.status);
                return (
                  <Pressable
                    key={job.id}
                    style={styles.jobCard}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(`/job/${job.id}` as any);
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.jobMaterial} numberOfLines={1}>{job.material}</Text>
                      <View style={[styles.jobStatusBadge, { backgroundColor: jobStatus.bg }]}>
                        <Text style={[styles.jobStatusText, { color: jobStatus.color }]}>{jobStatus.label}</Text>
                      </View>
                    </View>
                    <View style={{ gap: 4, marginTop: 6 }}>
                      {job.origin_address && (
                        <View style={styles.jobLocationRow}>
                          <Ionicons name="location" size={13} color={Colors.success} />
                          <Text style={styles.jobLocationText} numberOfLines={1}>{job.origin_address}</Text>
                        </View>
                      )}
                      {job.destination_address && (
                        <View style={styles.jobLocationRow}>
                          <Ionicons name="flag" size={13} color={Colors.destructive} />
                          <Text style={styles.jobLocationText} numberOfLines={1}>{job.destination_address}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.jobMetaRow}>
                      {job.truck_type && (
                        <View style={styles.jobMeta}>
                          <TruckIcon size={13} />
                          <Text style={styles.jobMetaText}>{formatTruckType(job.truck_type)}</Text>
                        </View>
                      )}
                      {job.rate && (
                        <View style={styles.jobMeta}>
                          <Ionicons name="cash-outline" size={13} color={Colors.primary} />
                          <Text style={[styles.jobMetaText, { color: Colors.primary }]}>
                            ${Number(job.rate).toLocaleString()}/{job.rate_type === 'per_hour' ? 'hr' : job.rate_type === 'per_ton' ? 'ton' : 'load'}
                          </Text>
                        </View>
                      )}
                      {job.scheduled_date && (
                        <View style={styles.jobMeta}>
                          <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                          <Text style={styles.jobMetaText}>
                            {new Date(job.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ position: 'absolute', right: 12, top: '50%' }} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {driverSnapshot && (driverSnapshot.phone || driverSnapshot.email) && (
          <View style={styles.contactCard}>
            <Text style={styles.sectionTitle}>{isContractor ? 'DRIVER CONTACT' : 'CONTRACTOR CONTACT'}</Text>
            {(isContractor ? driverSnapshot : contractorSnapshot).phone && (
              <View style={styles.contactRow}>
                <Ionicons name="call-outline" size={16} color={Colors.textMuted} />
                <Text style={styles.contactText}>{(isContractor ? driverSnapshot : contractorSnapshot).phone}</Text>
              </View>
            )}
            {(isContractor ? driverSnapshot : contractorSnapshot).email && (
              <View style={styles.contactRow}>
                <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
                <Text style={styles.contactText}>{(isContractor ? driverSnapshot : contractorSnapshot).email}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
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
    letterSpacing: 2,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  retryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.primaryForeground,
  },
  scrollContent: { padding: 16, gap: 16 },
  invoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  invoiceIconLarge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceNumber: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  invoicePeriod: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: Colors.text,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  amountCard: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 153, 0, 0.2)',
  },
  amountLabel: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 11,
    color: Colors.primary,
    letterSpacing: 1,
  },
  amountValue: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 36,
    color: Colors.text,
    marginTop: 4,
  },
  amountJobs: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  detailsCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  detailRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  detailLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
  },
  detailValue: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
    marginTop: 1,
  },
  detailSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  jobsCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyJobs: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 6,
  },
  emptyJobsText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  emptyJobsSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  jobCard: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 14,
    paddingRight: 32,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  jobMaterial: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  jobStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  jobStatusText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  jobLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  jobLocationText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  jobMetaRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  jobMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  jobMetaText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
  },
  contactCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  contactText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.text,
  },
});
