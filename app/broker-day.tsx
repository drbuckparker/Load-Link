import { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Platform,
  ActivityIndicator, Modal, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/colors';
import { apiRequest, queryClient } from '@/lib/query-client';

type Assignment = {
  id: string;
  driverId?: string;
  driver_id?: string;
  driverName?: string;
  driver_name?: string;
  status?: string;
  sentAt?: string | null;
  sent_at?: string | null;
};

type BrokerJob = {
  id: string;
  material?: string;
  rate?: number | string;
  rateType?: string;
  rate_type?: string;
  status?: string;
  scheduledDate?: string;
  scheduled_date?: string;
  estimatedDays?: number;
  estimated_days?: number;
  includesWeekends?: boolean;
  includes_weekends?: boolean;
  includesSaturday?: boolean;
  includes_saturday?: boolean;
  includesSunday?: boolean;
  includes_sunday?: boolean;
  clientName?: string;
  client_name?: string;
  projectName?: string;
  project_name?: string;
  assignments?: Assignment[];
};

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function jobDateKey(j: BrokerJob): string {
  const raw = j.scheduledDate || j.scheduled_date || '';
  if (!raw) return '';
  return raw.slice(0, 10);
}

// Mirrors app/broker.tsx jobCoversDay (multi-day jobs cover a span of working days).
function jobCoversDay(j: BrokerJob, dateKey: string): boolean {
  const startKey = jobDateKey(j);
  if (!startKey) return false;
  if (startKey === dateKey) return true;
  if (dateKey < startKey) return false;
  const days = Math.ceil(Number(j.estimatedDays ?? j.estimated_days ?? 1) || 1);
  if (days <= 1) return false;
  const weekends = !!(j.includesWeekends ?? j.includes_weekends);
  const sat = weekends || !!(j.includesSaturday ?? j.includes_saturday);
  const sun = weekends || !!(j.includesSunday ?? j.includes_sunday);
  const d = new Date(`${startKey}T12:00:00`);
  let counted = 0;
  for (let i = 0; i < 400 && counted < days; i++) {
    const dow = d.getDay();
    const isWorkDay = (dow !== 6 || sat) && (dow !== 0 || sun);
    if (isWorkDay) {
      counted++;
      if (localDateKey(d) === dateKey) return true;
    }
    if (localDateKey(d) > dateKey) return false;
    d.setDate(d.getDate() + 1);
  }
  return false;
}

const ACTIVE_ASSIGN = ['pending', 'accepted', 'approved'];

function assignStatusLabel(a: Assignment): { label: string; color: string; bg: string } {
  const s = String(a.status || '').toLowerCase();
  const sent = a.sentAt ?? a.sent_at;
  if (s === 'rejected') return { label: 'DECLINED', color: Colors.destructive, bg: 'rgba(255,90,90,0.12)' };
  if (s === 'approved' && sent) return { label: 'CONFIRMED', color: Colors.success, bg: 'rgba(80,200,120,0.12)' };
  if (!sent) return { label: 'NOT SENT', color: Colors.warning, bg: 'rgba(255,180,60,0.12)' };
  return { label: 'SENT', color: Colors.warning, bg: 'rgba(255,180,60,0.12)' };
}

export default function BrokerDayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const dateKey = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
    ? params.date
    : localDateKey(new Date());

  const jobsQuery = useQuery<BrokerJob[]>({ queryKey: ['/api/broker/jobs'] });
  const rosterQuery = useQuery<any[]>({ queryKey: ['/api/broker/roster'] });

  // Truck the broker tapped (action sheet open)
  const [selected, setSelected] = useState<{ job: BrokerJob; a: Assignment } | null>(null);
  // Switch mode: the truck we're moving; next tap on a truck in another job completes the swap
  const [switching, setSwitching] = useState<{ job: BrokerJob; a: Assignment } | null>(null);
  const [busy, setBusy] = useState(false);

  const nameFor = (a: Assignment): string => {
    const direct = a.driverName || a.driver_name;
    if (direct) return direct;
    const id = String(a.driverId || a.driver_id || '');
    const roster = Array.isArray(rosterQuery.data) ? rosterQuery.data : [];
    const d = roster.find((r: any) => String(r.driverId || r.driver_id || r.id) === id);
    return d?.name || d?.driverName || d?.driver_name || d?.email || 'Driver';
  };

  const jobs = (Array.isArray(jobsQuery.data) ? jobsQuery.data : [])
    .filter(j => !['completed', 'cancelled', 'expired'].includes(String(j.status || '').toLowerCase()))
    .filter(j => jobCoversDay(j, dateKey));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/broker/jobs'] });
    queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
  };

  const removeMutation = useMutation({
    mutationFn: async (assignmentId: string) => apiRequest('DELETE', `/api/broker/assignments/${assignmentId}`),
    onSuccess: refresh,
    onError: (e: any) => Alert.alert('Error', e.message || 'Failed to remove truck'),
  });

  const confirmRemove = (job: BrokerJob, a: Assignment) => {
    Alert.alert(
      'Remove truck from job?',
      `${nameFor(a)} will be taken off "${job.material || 'this job'}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: () => { setSelected(null); removeMutation.mutate(a.id); },
        },
      ]
    );
  };

  // Swap two trucks between two jobs. Each driver keeps their own
  // sent/not-sent state: if their old instructions were already sent,
  // the new assignment sends right away too.
  const doSwitch = async (from: { job: BrokerJob; a: Assignment }, to: { job: BrokerJob; a: Assignment }) => {
    if (busy) return;
    setBusy(true);
    try {
      // Single server call: the server sequences the swap upstream and
      // restores both trucks to their original jobs if anything fails.
      await apiRequest('POST', '/api/broker/assignments/swap', {
        assignmentIdA: from.a.id,
        assignmentIdB: to.a.id,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Switch failed', e?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
      setSwitching(null);
      refresh();
    }
  };

  const confirmSwitch = (target: { job: BrokerJob; a: Assignment }) => {
    if (!switching) return;
    Alert.alert(
      'Switch trucks?',
      `${nameFor(switching.a)} moves to "${target.job.material || 'job'}" and ${nameFor(target.a)} moves to "${switching.job.material || 'job'}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch', onPress: () => doSwitch(switching, target) },
      ]
    );
  };

  const dayLabel = new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric',
  });

  const otherJobsExist = (jobId: string) =>
    jobs.some(j => j.id !== jobId && (j.assignments || []).some(a => ACTIVE_ASSIGN.includes(String(a.status || '').toLowerCase())));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="back-btn">
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>DAY OVERVIEW</Text>
          <Text style={styles.headerSub}>{dayLabel}</Text>
        </View>
        {busy ? <ActivityIndicator color={Colors.primary} /> : null}
      </View>

      {switching ? (
        <View style={styles.switchBanner}>
          <Ionicons name="swap-horizontal" size={16} color="#0E0F13" />
          <Text style={styles.switchBannerText} numberOfLines={2}>
            Switching {nameFor(switching.a)} — tap a truck on another job to swap
          </Text>
          <Pressable onPress={() => setSwitching(null)} hitSlop={10}>
            <Text style={styles.switchCancel}>CANCEL</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        {jobsQuery.isLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : jobs.length === 0 ? (
          <Text style={styles.emptyText}>No jobs scheduled for this day.</Text>
        ) : (
          jobs.map(job => {
            const assigns = (job.assignments || []).filter(a => {
              const s = String(a.status || '').toLowerCase();
              return ACTIVE_ASSIGN.includes(s) || s === 'rejected';
            });
            const client = job.clientName || job.client_name;
            const project = job.projectName || job.project_name;
            const isSwitchSource = switching?.job.id === job.id;
            return (
              <View key={job.id} style={styles.jobCard} testID={`day-job-${job.id}`}>
                <Pressable
                  style={({ pressed }) => [styles.jobHeader, pressed && { opacity: 0.7 }]}
                  onPress={() => router.push(`/job/${job.id}` as any)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobTitle} numberOfLines={1}>{job.material || 'Job'}</Text>
                    {(client || project) ? (
                      <Text style={styles.jobSub} numberOfLines={1}>
                        {[client, project].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
                </Pressable>

                {assigns.length === 0 ? (
                  <Text style={styles.noTrucksText}>No trucks assigned</Text>
                ) : (
                  assigns.map(a => {
                    const st = assignStatusLabel(a);
                    const s = String(a.status || '').toLowerCase();
                    const isActive = ACTIVE_ASSIGN.includes(s);
                    const isTheSwitcher = switching?.a.id === a.id;
                    const isSwitchTarget = !!switching && !isSwitchSource && isActive;
                    return (
                      <Pressable
                        key={a.id}
                        testID={`day-truck-${a.id}`}
                        style={({ pressed }) => [
                          styles.truckRow,
                          isTheSwitcher && styles.truckRowSwitching,
                          isSwitchTarget && styles.truckRowTarget,
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          if (switching) {
                            if (isTheSwitcher) { setSwitching(null); return; }
                            if (isSwitchTarget) confirmSwitch({ job, a });
                            return;
                          }
                          setSelected({ job, a });
                        }}
                      >
                        <Ionicons name="car" size={16} color={isSwitchTarget ? Colors.primary : Colors.textSecondary} />
                        <Text style={styles.truckName} numberOfLines={1}>{nameFor(a)}</Text>
                        <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
                          <Text style={[styles.statusPillText, { color: st.color }]}>{st.label}</Text>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Truck action sheet */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            {selected ? (
              <>
                <Text style={styles.sheetTitle}>{nameFor(selected.a)}</Text>
                <Text style={styles.sheetSub} numberOfLines={1}>
                  On: {selected.job.material || 'Job'}
                </Text>
                <Pressable
                  style={styles.sheetBtnDestructive}
                  testID="truck-remove-btn"
                  onPress={() => confirmRemove(selected.job, selected.a)}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.destructive} />
                  <Text style={styles.sheetBtnDestructiveText}>Remove from job</Text>
                </Pressable>
                {ACTIVE_ASSIGN.includes(String(selected.a.status || '').toLowerCase()) && otherJobsExist(selected.job.id) ? (
                  <Pressable
                    style={styles.sheetBtn}
                    testID="truck-switch-btn"
                    onPress={() => { setSwitching(selected); setSelected(null); }}
                  >
                    <Ionicons name="swap-horizontal" size={18} color={Colors.primary} />
                    <Text style={styles.sheetBtnText}>Switch with another truck</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.sheetCancel} onPress={() => setSelected(null)}>
                  <Text style={styles.sheetCancelText}>Cancel</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerTitle: { fontFamily: 'ChakraPetch_700Bold', fontSize: 16, color: Colors.text, letterSpacing: 1 },
  headerSub: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  switchBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary, marginHorizontal: 16, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  switchBannerText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#0E0F13' },
  switchCancel: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#0E0F13' },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: 40 },
  jobCard: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  jobHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  jobTitle: { fontFamily: 'ChakraPetch_700Bold', fontSize: 16, color: Colors.text },
  jobSub: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  noTrucksText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },
  truckRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.muted, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    marginTop: 8, borderWidth: 1, borderColor: 'transparent',
  },
  truckRowSwitching: { borderColor: Colors.primary, opacity: 0.6 },
  truckRowTarget: { borderColor: Colors.primary },
  truckName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text },
  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    padding: 20,
  },
  sheetTitle: { fontFamily: 'ChakraPetch_700Bold', fontSize: 18, color: Colors.text },
  sheetSub: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary, marginTop: 2, marginBottom: 14 },
  sheetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.muted, borderRadius: 12, padding: 14, marginTop: 10,
  },
  sheetBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text },
  sheetBtnDestructive: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,90,90,0.10)', borderRadius: 12, padding: 14,
  },
  sheetBtnDestructiveText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.destructive },
  sheetCancel: { alignItems: 'center', padding: 14, marginTop: 6 },
  sheetCancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.textSecondary },
});
