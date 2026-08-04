import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, Platform, ActivityIndicator,
  Modal, TextInput, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, queryClient } from '@/lib/query-client';
import { playNotificationSound } from '@/lib/sounds';

type BrokerTab = 'today' | 'clients' | 'jobs' | 'roster';

interface AssignmentStats {
  assigned?: number;
  sent?: number;
  held?: number;
  confirmed?: number;
  declined?: number;
  trucksNeeded?: number;
}

interface BrokerJob {
  id: string;
  material?: string;
  originAddress?: string;
  origin_address?: string;
  destinationAddress?: string;
  destination_address?: string;
  scheduledDate?: string;
  scheduled_date?: string;
  estimatedDays?: string | number;
  estimated_days?: string | number;
  includesWeekends?: boolean;
  includes_weekends?: boolean;
  includesSaturday?: boolean;
  includes_saturday?: boolean;
  includesSunday?: boolean;
  includes_sunday?: boolean;
  status?: string;
  rate?: string | number;
  rateType?: string;
  billRate?: string | number;
  billRateType?: string;
  clientName?: string;
  client_name?: string;
  clientEmail?: string;
  client_email?: string;
  clientUserId?: string;
  client_user_id?: string;
  marginPerTruck?: string | number;
  assignmentStats?: AssignmentStats;
  assignments?: {
    id: string;
    driverId?: string;
    driverName?: string;
    driver_name?: string;
    status?: string;
    sentAt?: string | null;
    sent_at?: string | null;
    confirmedAt?: string | null;
    confirmed_at?: string | null;
  }[];
}

interface RosterTruck {
  id: string;
  truckNumber?: string | number;
  year?: string | number;
  make?: string;
  model?: string;
  truckType?: string;
  capacity?: string | number;
  licensePlate?: string;
}

interface RosterDriver {
  id: string;
  driverId?: string;
  driver_id?: string;
  name?: string;
  driverName?: string;
  driver_name?: string;
  email?: string;
  status?: string;
  companyName?: string;
  company_name?: string;
  trucks?: RosterTruck[];
}

function truckTypeLabel(t?: string): string {
  if (!t) return '';
  return t.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function truckTitle(t: RosterTruck): string {
  const s = [t.year, t.make, t.model].filter(Boolean).join(' ');
  return s || `Truck ${t.truckNumber ?? ''}`.trim();
}

interface BrokerClient {
  id?: string;
  invitationId?: string;
  invitation_id?: string;
  name?: string;
  clientName?: string;
  client_name?: string;
  companyName?: string;
  company_name?: string;
  email?: string;
  status?: string;
  clientUserId?: string;
  client_user_id?: string;
  createdAt?: string;
  created_at?: string;
  activeJobsCount?: number;
  active_jobs_count?: number;
  unpaidInvoiceCount?: number;
  unpaid_invoice_count?: number;
  unpaidInvoiceTotal?: string | number;
  unpaid_invoice_total?: string | number;
}

function clientKey(c: BrokerClient): string {
  return c.invitationId || c.invitation_id || c.id || c.email || '';
}

function clientDisplayName(c: BrokerClient): string {
  return c.name || c.clientName || c.client_name || c.companyName || c.company_name || c.email || 'Client';
}

function jobMatchesClient(j: BrokerJob, c: BrokerClient): boolean {
  // Prefer stable identifiers, then email, then normalized name as last resort.
  const jobUserId = j.clientUserId || j.client_user_id;
  const clientUserId = c.clientUserId || c.client_user_id;
  if (jobUserId && clientUserId) return jobUserId === clientUserId;
  const jobEmail = (j.clientEmail || j.client_email || '').trim().toLowerCase();
  const clientEmail = (c.email || '').trim().toLowerCase();
  if (jobEmail && clientEmail) return jobEmail === clientEmail;
  const jobName = (j.clientName || j.client_name || '').trim().toLowerCase();
  const clientName = clientDisplayName(c).trim().toLowerCase();
  return !!jobName && !!clientName && jobName === clientName;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function jobDateKey(j: BrokerJob): string {
  const raw = j.scheduledDate || j.scheduled_date || '';
  if (!raw) return '';
  // scheduled_date is a calendar day stored as midnight ("2026-08-04T00:00:00.000Z"
  // from the website, or "2026-08-04 00:00:00" locally). Converting through
  // new Date() shifts it into the previous local day for US timezones, which
  // made the Day Plan show "no jobs" while the Jobs tab had them. The first
  // 10 chars ARE the scheduled day — use them directly.
  return raw.slice(0, 10);
}

// A multi-day job works on `dateKey` if it falls inside the job's working-day
// span: estimated_days consecutive working days from scheduled_date, skipping
// weekend days the job excludes. Mirrors the server's getJobDateRange used by
// the week-in-review, so both surfaces agree on which days a job covers.
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
  // Walk forward one calendar day at a time, counting only working days,
  // until we've covered the job's span (capped for safety).
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

// Alert.alert buttons are a no-op on react-native-web, so use window.confirm there.
function confirmRemoveTruck(onConfirm: () => void) {
  const title = 'Remove truck from job?';
  const msg = 'This frees the truck for other jobs and opens the spot back up on every remaining day of this job.';
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${msg}`)) onConfirm();
    return;
  }
  Alert.alert(title, msg, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onConfirm },
  ]);
}

function isTodayDate(d?: string): boolean {
  if (!d) return false;
  const dt = new Date(d.includes('T') ? d : `${d}T12:00:00`);
  const now = new Date();
  return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth() && dt.getDate() === now.getDate();
}

function fmt(n: string | number | undefined | null): string {
  const v = Number(n);
  if (!n || isNaN(v)) return '—';
  return `$${v.toFixed(2)}`;
}

function haptic(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  if (Platform.OS !== 'web') Haptics.impactAsync(style);
}

export default function BrokerDashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const params = useLocalSearchParams<{ assign?: string; tab?: string; date?: string }>();
  const [tab, setTab] = useState<BrokerTab>(
    params.tab === 'today' || params.tab === 'jobs' || params.tab === 'roster' ? (params.tab as BrokerTab) : 'clients'
  );
  const [clientFilter, setClientFilter] = useState<BrokerClient | null>(null);
  const [assignJob, setAssignJob] = useState<BrokerJob | null>(null);
  const handledAssignRef = useRef<string | null>(null);
  const handledDateRef = useRef<string | null>(null);
  const [inviteVisible, setInviteVisible] = useState<'roster' | 'clients' | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : localDateKey(new Date())
  );
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);

  const soundEnabled = !!(user as any)?.confirmationSoundEnabled;
  const prevConfirmedRef = useRef<number | null>(null);

  const jobsQuery = useQuery<BrokerJob[]>({
    queryKey: ['/api/broker/jobs'],
    refetchInterval: 15000,
    enabled: !!user,
  });
  const rosterQuery = useQuery<RosterDriver[]>({
    queryKey: ['/api/broker/roster'],
    enabled: !!user,
  });
  const clientsQuery = useQuery<BrokerClient[]>({
    queryKey: ['/api/broker/clients'],
    enabled: !!user,
  });

  // When the assign sheet is open, check which roster drivers marked
  // themselves unavailable on the job's date.
  const assignJobDate = (assignJob?.scheduledDate || assignJob?.scheduled_date || '').slice(0, 10);
  const rosterDriverIds = (Array.isArray(rosterQuery.data) ? rosterQuery.data : [])
    .map((d: any) => d.driverId || d.driver_id || d.id)
    .filter(Boolean);
  const availabilityQuery = useQuery<Record<string, { unavailable: boolean; notes: string | null }>>({
    queryKey: ['/api/broker/roster-availability', assignJobDate],
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/broker/roster-availability?date=${encodeURIComponent(assignJobDate)}`
      );
      return res.json();
    },
    enabled: !!user && !!assignJob && /^\d{4}-\d{2}-\d{2}$/.test(assignJobDate) && rosterDriverIds.length > 0,
  });
  const availabilityMap = availabilityQuery.data || {};

  const jobs = Array.isArray(jobsQuery.data) ? jobsQuery.data : [];
  const todayJobs = jobs.filter(j => jobCoversDay(j, selectedDate));
  const roster = Array.isArray(rosterQuery.data) ? rosterQuery.data : [];
  const clients = Array.isArray(clientsQuery.data) ? clientsQuery.data : [];

  useEffect(() => {
    const dateParam = typeof params.date === 'string' ? params.date : undefined;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && handledDateRef.current !== dateParam) {
      handledDateRef.current = dateParam;
      setSelectedDate(dateParam);
      setTab('today');
      router.setParams({ date: undefined } as any);
    }
    const assignId = typeof params.assign === 'string' ? params.assign : undefined;
    if (!assignId || handledAssignRef.current === assignId) return;
    const job = jobs.find(j => j.id === assignId);
    if (job) {
      handledAssignRef.current = assignId;
      setTab('jobs');
      setAssignJob(job);
      router.setParams({ assign: undefined } as any);
    }
  }, [params.assign, params.date, jobs]);

  const totalConfirmed = jobs.reduce((sum, j) => sum + (j.assignmentStats?.confirmed || 0), 0);
  useEffect(() => {
    if (jobsQuery.isLoading) return;
    if (prevConfirmedRef.current !== null && totalConfirmed > prevConfirmedRef.current && soundEnabled) {
      playNotificationSound();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    prevConfirmedRef.current = totalConfirmed;
  }, [totalConfirmed, soundEnabled, jobsQuery.isLoading]);

  const chimeMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest('PUT', '/api/profile', { confirmationSoundEnabled: enabled });
    },
    onSuccess: (_res, enabled) => {
      updateUser({ confirmationSoundEnabled: enabled } as any);
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ jobId, driverId, sendNow }: { jobId: string; driverId: string; sendNow: boolean }) => {
      return apiRequest('POST', `/api/broker/jobs/${jobId}/assign`, { driverId, sendNow });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/broker/jobs'] });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert('Error', e.message || 'Failed to assign driver'),
  });

  const [selectedAssign, setSelectedAssign] = useState<Set<string>>(new Set());

  const toggleAssignSelect = (driverId: string) => {
    haptic();
    setSelectedAssign(prev => {
      const next = new Set(prev);
      if (next.has(driverId)) next.delete(driverId); else next.add(driverId);
      return next;
    });
  };

  const assignSelected = async (sendNow: boolean) => {
    if (!assignJob || selectedAssign.size === 0) return;
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    const count = selectedAssign.size;
    let ok = 0;
    for (const driverId of Array.from(selectedAssign)) {
      try {
        await assignMutation.mutateAsync({ jobId: assignJob.id, driverId, sendNow });
        ok++;
      } catch {
        // assignMutation.onError already alerts; keep going for the rest.
      }
    }
    setSelectedAssign(new Set());
    if (ok > 0) {
      // Close the sheet and tell the user where the held sends went.
      setAssignJob(null);
      const msg = sendNow
        ? `Instructions sent to ${ok} truck${ok === 1 ? '' : 's'}.`
        : `${ok} truck${ok === 1 ? '' : 's'} added to this job. Send the instructions from the Truck Confirmations card on your home screen, or from the Day Plan.`;
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.alert(msg);
      } else {
        Alert.alert(sendNow ? 'Instructions Sent' : 'Trucks Added', msg);
      }
    } else if (count > 0) {
      // all failed — assignMutation.onError already surfaced the reason
    }
  };

  const removeAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return apiRequest('DELETE', `/api/broker/assignments/${assignmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/broker/jobs'] });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert('Error', e.message || 'Failed to remove truck'),
  });

  const sendMutation = useMutation({
    mutationFn: async ({ jobId, assignmentId }: { jobId: string; assignmentId: string }) => {
      return apiRequest('POST', `/api/broker/jobs/${jobId}/send`, { assignmentId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/broker/jobs'] }),
    onError: (e: any) => Alert.alert('Error', e.message || 'Failed to send assignment'),
  });

  const sendAllMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return apiRequest('POST', `/api/broker/jobs/${jobId}/send-all`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/broker/jobs'] });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert('Error', e.message || 'Failed to send assignments'),
  });

  // Day plan: pending scheduled auto-send for the selected date.
  const scheduledSendQuery = useQuery<{ id: string; date: string; sendAt: string; status: string }[]>({
    queryKey: ['/api/broker/scheduled-sends', selectedDate],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/broker/scheduled-sends?date=${selectedDate}`);
      return res.json();
    },
    enabled: !!user && tab === 'today',
  });
  const pendingSchedule = (scheduledSendQuery.data || [])[0];

  const scheduleMutation = useMutation({
    mutationFn: async (sendAtIso: string) => {
      return apiRequest('POST', '/api/broker/scheduled-sends', { date: selectedDate, sendAt: sendAtIso, tzOffsetMin: new Date().getTimezoneOffset() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/broker/scheduled-sends'] });
      setScheduleModalVisible(false);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert('Error', e.message || 'Failed to schedule send'),
  });

  const cancelScheduleMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('DELETE', `/api/broker/scheduled-sends/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/broker/scheduled-sends'] }),
    onError: (e: any) => Alert.alert('Error', e.message || 'Failed to cancel'),
  });

  // Send held instructions on every job of the selected day, in one tap.
  const sendDayMutation = useMutation({
    mutationFn: async (jobIds: string[]) => {
      for (const id of jobIds) {
        await apiRequest('POST', `/api/broker/jobs/${id}/send-all`, {});
      }
      return jobIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['/api/broker/jobs'] });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Instructions sent', `Sent instructions on ${count} job${count === 1 ? '' : 's'}.`);
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/broker/jobs'] });
      Alert.alert('Error', e.message || 'Some instructions failed to send');
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ kind, email, name }: { kind: 'roster' | 'clients'; email: string; name: string }) => {
      return apiRequest('POST', `/api/broker/${kind}/invite`, { email: email.trim(), name: name.trim() });
    },
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/broker/${vars.kind}`] });
      setInviteVisible(null);
      setInviteEmail('');
      setInviteName('');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert('Error', e.message || 'Failed to send invite'),
  });

  function renderJob({ item }: { item: BrokerJob }) {
    const stats = item.assignmentStats || {};
    const held = stats.held || 0;
    const heldAssignments = (item.assignments || []).filter(
      a => (a.sentAt ?? a.sent_at) == null && a.status !== 'declined' && a.status !== 'withdrawn'
    );
    return (
      <View style={styles.jobCard} testID={`broker-job-${item.id}`}>
        <View style={styles.jobHeader}>
          <Text style={styles.jobMaterial} numberOfLines={1}>{item.material || 'Job'}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{(item.status || 'open').replace('_', ' ').toUpperCase()}</Text>
          </View>
        </View>
        {(item.clientName || item.client_name) ? (
          <View style={styles.infoRow}>
            <Ionicons name="business-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.infoText}>{item.clientName || item.client_name}</Text>
          </View>
        ) : null}
        {(item.originAddress || item.origin_address) ? (
          <View style={styles.infoRow}>
            <Ionicons name="location" size={14} color={Colors.success} />
            <Text style={styles.infoText} numberOfLines={1}>{item.originAddress || item.origin_address}</Text>
          </View>
        ) : null}
        {(item.destinationAddress || item.destination_address) ? (
          <View style={styles.infoRow}>
            <Ionicons name="flag" size={14} color={Colors.destructive} />
            <Text style={styles.infoText} numberOfLines={1}>{item.destinationAddress || item.destination_address}</Text>
          </View>
        ) : null}

        <View style={styles.ratesRow}>
          <View style={styles.rateBox}>
            <Text style={styles.rateLabel}>PAY RATE</Text>
            <Text style={styles.rateValue}>{fmt(item.rate)}{item.rateType ? `/${item.rateType === 'flat_rate' ? 'flat' : item.rateType === 'per_ton' ? 'ton' : 'hr'}` : ''}</Text>
          </View>
          <View style={styles.rateBox}>
            <Text style={styles.rateLabel}>BILL RATE</Text>
            <Text style={[styles.rateValue, { color: Colors.primary }]}>{fmt(item.billRate)}{item.billRateType ? `/${item.billRateType === 'flat_rate' ? 'flat' : item.billRateType === 'per_ton' ? 'ton' : 'hr'}` : ''}</Text>
          </View>
          <View style={styles.rateBox}>
            <Text style={styles.rateLabel}>MARGIN</Text>
            <Text style={[styles.rateValue, { color: Colors.success }]}>{fmt(item.marginPerTruck)}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <Text style={styles.statChip}>Assigned {stats.assigned ?? 0}/{stats.trucksNeeded ?? '—'}</Text>
          {(stats.sent ?? 0) > 0 ? <Text style={[styles.statChip, { color: Colors.warning }]}>Awaiting {stats.sent}</Text> : <Text style={styles.statChip}>Sent 0</Text>}
          {held > 0 ? <Text style={[styles.statChip, { color: Colors.info }]}>Held {held}</Text> : null}
          <Text style={[styles.statChip, { color: Colors.success }]}>Confirmed {stats.confirmed ?? 0}</Text>
          {(stats.declined ?? 0) > 0 ? <Text style={[styles.statChip, { color: Colors.destructive }]}>Declined {stats.declined}</Text> : null}
        </View>

        {heldAssignments.length > 0 && (
          <View style={{ gap: 6, marginTop: 8 }}>
            {heldAssignments.map(a => (
              <View key={a.id} style={styles.heldRow}>
                <Ionicons name="pause-circle-outline" size={16} color={Colors.info} />
                <Text style={styles.heldName} numberOfLines={1}>{a.driverName || a.driver_name || 'Driver'}</Text>
                <Pressable
                  testID={`send-assignment-${a.id}`}
                  disabled={sendMutation.isPending}
                  style={({ pressed }) => [styles.smallBtn, (pressed || sendMutation.isPending) && { opacity: 0.7 }]}
                  onPress={() => { haptic(); sendMutation.mutate({ jobId: item.id, assignmentId: a.id }); }}
                >
                  <Text style={styles.smallBtnText}>SEND</Text>
                </Pressable>
                <Pressable
                  testID={`remove-assignment-${a.id}`}
                  disabled={removeAssignmentMutation.isPending}
                  style={({ pressed }) => [(pressed || removeAssignmentMutation.isPending) && { opacity: 0.6 }, { padding: 4 }]}
                  onPress={() => { haptic(); confirmRemoveTruck(() => removeAssignmentMutation.mutate(a.id)); }}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.destructive} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={styles.jobActions}>
          <Pressable
            testID={`assign-btn-${item.id}`}
            style={({ pressed }) => [styles.assignBtn, pressed && { opacity: 0.8 }]}
            onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); setAssignJob(item); }}
          >
            <Ionicons name="person-add" size={16} color={Colors.primaryForeground} />
            <Text style={styles.assignBtnText}>ASSIGN TRUCKS</Text>
          </Pressable>
          {held > 0 && (
            <Pressable
              testID={`send-all-btn-${item.id}`}
              disabled={sendAllMutation.isPending}
              style={({ pressed }) => [styles.sendAllBtn, (pressed || sendAllMutation.isPending) && { opacity: 0.7 }]}
              onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); sendAllMutation.mutate(item.id); }}
            >
              {sendAllMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="send" size={16} color={Colors.primary} />
              )}
              <Text style={styles.sendAllBtnText}>SEND ALL ({held})</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  function renderPersonRow(name: string, email: string | undefined, status: string | undefined, key: string) {
    return (
      <View key={key} style={styles.personRow}>
        <View style={styles.personAvatar}>
          <Ionicons name="person" size={18} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.personName} numberOfLines={1}>{name}</Text>
          {email ? <Text style={styles.personEmail} numberOfLines={1}>{email}</Text> : null}
        </View>
        {status ? (
          <Text style={[styles.personStatus, status === 'pending' && { color: Colors.warning }]}>
            {status.toUpperCase()}
          </Text>
        ) : null}
      </View>
    );
  }

  function renderClientCard(c: BrokerClient) {
    const name = clientDisplayName(c);
    const activeJobs = c.activeJobsCount ?? c.active_jobs_count ?? 0;
    const unpaidCount = c.unpaidInvoiceCount ?? c.unpaid_invoice_count ?? 0;
    const unpaidTotal = Number(c.unpaidInvoiceTotal ?? c.unpaid_invoice_total ?? 0);
    const status = (c.status || '').toLowerCase();
    const key = clientKey(c);
    return (
      <View key={key} style={styles.clientCard} testID={`client-card-${key}`}>
        <View style={styles.clientHeader}>
          <View style={styles.personAvatar}>
            <Ionicons name="business" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.personName} numberOfLines={1}>{name}</Text>
            {c.email ? <Text style={styles.personEmail} numberOfLines={1}>{c.email}</Text> : null}
          </View>
          <Text style={[styles.personStatus, status === 'pending' && { color: Colors.warning }]}>
            {status ? status.toUpperCase() : ''}
          </Text>
        </View>

        <View style={styles.clientBadgeRow}>
          <Pressable
            testID={`client-jobs-badge-${key}`}
            style={({ pressed }) => [styles.clientBadge, activeJobs > 0 && styles.clientBadgeActive, pressed && { opacity: 0.7 }]}
            onPress={() => { haptic(); setClientFilter(c); setTab('jobs'); }}
          >
            <Ionicons name="briefcase-outline" size={13} color={activeJobs > 0 ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.clientBadgeText, activeJobs > 0 && { color: Colors.primary }]}>
              {activeJobs} active job{activeJobs === 1 ? '' : 's'}
            </Text>
          </Pressable>
          <View style={[styles.clientBadge, unpaidCount > 0 && styles.clientBadgeUnpaid]}>
            <Ionicons name="cash-outline" size={13} color={unpaidCount > 0 ? Colors.warning : Colors.textMuted} />
            <Text style={[styles.clientBadgeText, unpaidCount > 0 && { color: Colors.warning }]}>
              {unpaidCount > 0 ? `${unpaidCount} unpaid · $${unpaidTotal.toFixed(2)}` : 'No unpaid invoices'}
            </Text>
          </View>
        </View>

        <Pressable
          testID={`client-post-job-${key}`}
          style={({ pressed }) => [styles.postJobBtn, { marginTop: 10 }, pressed && { opacity: 0.8 }]}
          onPress={() => {
            haptic(Haptics.ImpactFeedbackStyle.Medium);
            router.push({ pathname: '/create-job', params: { clientName: name, clientEmail: c.email || '' } } as any);
          }}
        >
          <Ionicons name="add-circle-outline" size={16} color={Colors.primaryForeground} />
          <Text style={styles.postJobBtnText}>POST JOB</Text>
        </Pressable>
      </View>
    );
  }

  const assignedDriverIds = new Set(
    (assignJob?.assignments || [])
      .filter(a => a.status !== 'declined' && a.status !== 'withdrawn')
      .map(a => a.driverId)
      .filter(Boolean)
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => { haptic(); if (router.canGoBack()) router.back(); else router.replace('/(tabs)' as any); }} testID="broker-back-btn">
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>BROKER DASHBOARD</Text>
        <Pressable
          testID="chime-toggle"
          style={styles.chimeBtn}
          disabled={chimeMutation.isPending}
          onPress={() => { haptic(); chimeMutation.mutate(!soundEnabled); }}
        >
          <Ionicons name={soundEnabled ? 'volume-high' : 'volume-mute'} size={20} color={soundEnabled ? Colors.primary : Colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.tabRow}>
        {(['today', 'clients', 'jobs', 'roster'] as BrokerTab[]).map(t => (
          <Pressable
            key={t}
            testID={`broker-tab-${t}`}
            style={[styles.tabChip, tab === t && styles.tabChipActive]}
            onPress={() => { haptic(); if (t !== 'jobs') setClientFilter(null); setTab(t); }}
          >
            <Text style={[styles.tabChipText, tab === t && styles.tabChipTextActive]} numberOfLines={1}>
              {t === 'today' ? `Day Plan (${todayJobs.length})`
                : t === 'clients' ? `Clients (${clients.length})`
                : t === 'jobs' ? `Jobs (${jobs.length})`
                : `Roster (${roster.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {(tab === 'jobs' || tab === 'today') && (
        <FlatList
          data={tab === 'today' ? todayJobs : (clientFilter ? jobs.filter(j => jobMatchesClient(j, clientFilter)) : jobs)}
          renderItem={renderJob}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === 'web' ? 60 : insets.bottom + 24 }]}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          showsVerticalScrollIndicator={false}
          scrollEnabled={jobs.length > 0}
          ListEmptyComponent={
            jobsQuery.isLoading ? (
              <View style={styles.emptyState}><ActivityIndicator size="large" color={Colors.primary} /></View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name={tab === 'today' ? 'sunny-outline' : 'briefcase-outline'} size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>
                  {tab === 'today' ? 'No jobs scheduled for today'
                    : clientFilter ? `No jobs for ${clientDisplayName(clientFilter)}`
                    : 'No broker jobs yet'}
                </Text>
                {tab === 'jobs' && (
                  <Pressable style={styles.postJobBtn} onPress={() => router.push('/create-job' as any)} testID="broker-post-job-btn">
                    <Text style={styles.postJobBtnText}>POST A JOB</Text>
                  </Pressable>
                )}
              </View>
            )
          }
          ListHeaderComponent={
            <>
              {tab === 'today' ? (() => {
                const dayHeld = todayJobs.reduce((sum, j) => sum + (j.assignmentStats?.held || 0), 0);
                const heldJobIds = todayJobs.filter(j => (j.assignmentStats?.held || 0) > 0).map(j => j.id);
                const totalNeeded = todayJobs.reduce((sum, j) => sum + (j.assignmentStats?.trucksNeeded || 0), 0);
                const totalAssigned = todayJobs.reduce((sum, j) => sum + (j.assignmentStats?.assigned || 0), 0);
                const allFilled = totalNeeded > 0 && totalAssigned >= totalNeeded;
                const dsel = new Date(`${selectedDate}T12:00:00`);
                const shift = (days: number) => {
                  const d = new Date(dsel); d.setDate(d.getDate() + days);
                  setSelectedDate(localDateKey(d));
                };
                return (
                  <View style={{ marginBottom: 12 }}>
                    <View style={styles.dateNavRow}>
                      <Pressable onPress={() => { haptic(); shift(-1); }} style={styles.dateNavBtn} testID="day-prev">
                        <Ionicons name="chevron-back" size={20} color={Colors.text} />
                      </Pressable>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.dateNavTitle}>
                          {dsel.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                        </Text>
                        {selectedDate !== localDateKey(new Date()) && (
                          <Pressable onPress={() => setSelectedDate(localDateKey(new Date()))}>
                            <Text style={styles.dateNavToday}>Back to today</Text>
                          </Pressable>
                        )}
                      </View>
                      <Pressable onPress={() => { haptic(); shift(1); }} style={styles.dateNavBtn} testID="day-next">
                        <Ionicons name="chevron-forward" size={20} color={Colors.text} />
                      </Pressable>
                    </View>
                    {todayJobs.length > 0 && (
                      <View style={styles.daySummaryCard}>
                        <View style={styles.daySummaryRow}>
                          <Text style={styles.daySummaryText}>
                            {todayJobs.length} job{todayJobs.length === 1 ? '' : 's'} · {totalAssigned}/{totalNeeded || '—'} trucks assigned
                          </Text>
                          {allFilled && (
                            <View style={styles.filledBadge}>
                              <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                              <Text style={styles.filledBadgeText}>ALL SPOTS FILLED</Text>
                            </View>
                          )}
                        </View>
                        {pendingSchedule ? (
                          <View style={styles.scheduleBanner}>
                            <Ionicons name="time-outline" size={16} color={Colors.primary} />
                            <Text style={styles.scheduleBannerText}>
                              Instructions go out at {new Date(pendingSchedule.sendAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                            </Text>
                            <Pressable onPress={() => { haptic(); cancelScheduleMutation.mutate(pendingSchedule.id); }} testID="cancel-schedule">
                              <Text style={styles.scheduleCancelText}>CANCEL</Text>
                            </Pressable>
                          </View>
                        ) : null}
                        {dayHeld > 0 && (
                          <View style={styles.dayActionRow}>
                            <Pressable
                              testID="send-day-btn"
                              disabled={sendDayMutation.isPending}
                              style={({ pressed }) => [styles.dayPrimaryBtn, (pressed || sendDayMutation.isPending) && { opacity: 0.7 }]}
                              onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); sendDayMutation.mutate(heldJobIds); }}
                            >
                              {sendDayMutation.isPending ? (
                                <ActivityIndicator size="small" color={Colors.primaryForeground} />
                              ) : (
                                <Ionicons name="send" size={16} color={Colors.primaryForeground} />
                              )}
                              <Text style={styles.dayPrimaryBtnText}>SEND ALL INSTRUCTIONS ({dayHeld})</Text>
                            </Pressable>
                            <Pressable
                              testID="schedule-day-btn"
                              style={({ pressed }) => [styles.daySecondaryBtn, pressed && { opacity: 0.7 }]}
                              onPress={() => { haptic(); setScheduleModalVisible(true); }}
                            >
                              <Ionicons name="alarm-outline" size={16} color={Colors.primary} />
                              <Text style={styles.daySecondaryBtnText}>SEND AT…</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })() : null}
              {tab === 'jobs' && clientFilter ? (
                <View style={styles.filterBanner}>
                  <Ionicons name="funnel-outline" size={14} color={Colors.primary} />
                  <Text style={styles.filterBannerText} numberOfLines={1}>Jobs for {clientDisplayName(clientFilter)}</Text>
                  <Pressable onPress={() => { haptic(); setClientFilter(null); }} testID="clear-client-filter" style={styles.filterClearBtn}>
                    <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
                  </Pressable>
                </View>
              ) : null}
              {tab === 'jobs' && jobs.length > 0 ? (
                <Pressable style={[styles.postJobBtn, { marginBottom: 12, alignSelf: 'stretch' }]} onPress={() => router.push('/create-job' as any)} testID="broker-post-job-btn-top">
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primaryForeground} />
                  <Text style={styles.postJobBtnText}>POST A JOB</Text>
                </Pressable>
              ) : null}
            </>
          }
        />
      )}

      {(tab === 'roster' || tab === 'clients') && (
        <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === 'web' ? 60 : insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
          <Pressable
            style={styles.postJobBtn}
            testID={`invite-${tab}-btn`}
            onPress={() => { haptic(); setInviteVisible(tab === 'roster' ? 'roster' : 'clients'); }}
          >
            <Ionicons name="mail-outline" size={18} color={Colors.primaryForeground} />
            <Text style={styles.postJobBtnText}>{tab === 'roster' ? 'INVITE DRIVER' : 'INVITE CLIENT'}</Text>
          </Pressable>
          <View style={{ height: 12 }} />
          {tab === 'roster' && (
            rosterQuery.isLoading ? <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} /> :
            roster.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No drivers on your roster yet</Text>
              </View>
            ) : roster.map(d => {
              const driverName = d.name || d.driverName || d.driver_name || d.email || 'Driver';
              const companyName = d.companyName || d.company_name || '';
              return (
                <View key={d.id}>
                  {renderPersonRow(
                    driverName,
                    [companyName, d.email].filter(Boolean).join(' · ') || d.email,
                    d.status, d.id
                  )}
                  {(d.trucks || []).map(t => (
                    <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 46, paddingBottom: 8 }}>
                      <Ionicons name="bus-outline" size={14} color={Colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.personName} numberOfLines={1}>{truckTitle(t)}</Text>
                        <Text style={styles.personEmail} numberOfLines={1}>
                          {[
                            t.capacity ? `${t.capacity}T` : '',
                            truckTypeLabel(t.truckType),
                            t.truckNumber ? `#${t.truckNumber}` : '',
                            t.licensePlate ? `Plate: ${t.licensePlate}` : '',
                          ].filter(Boolean).join('  ')}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })
          )}
          {tab === 'clients' && (
            clientsQuery.isLoading ? <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} /> :
            clientsQuery.isError ? (
              <View style={styles.emptyState}>
                <Ionicons name="alert-circle-outline" size={40} color={Colors.destructive} />
                <Text style={styles.emptyText}>Couldn't load clients. Pull to retry or check your connection.</Text>
              </View>
            ) :
            clients.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="business-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No client companies yet. Invite your first client to get started.</Text>
              </View>
            ) : clients.map(c => renderClientCard(c))
          )}
        </ScrollView>
      )}

      <Modal visible={!!assignJob} transparent animationType="slide" onRequestClose={() => { setAssignJob(null); setSelectedAssign(new Set()); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ASSIGN TRUCKS FROM YOUR ROSTER</Text>
              <Pressable onPress={() => { setAssignJob(null); setSelectedAssign(new Set()); }} style={styles.modalClose} testID="assign-modal-close">
                <Ionicons name="close" size={22} color={Colors.text} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle} numberOfLines={1}>{assignJob?.material || ''}</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {roster.length === 0 ? (
                <View style={{ alignItems: 'center', marginVertical: 24, gap: 14 }}>
                  <Text style={styles.emptyText}>No roster drivers yet.</Text>
                  <Pressable
                    testID="assign-invite-drivers"
                    style={({ pressed }) => [styles.postJobBtn, { alignSelf: 'stretch' }, pressed && { opacity: 0.8 }]}
                    onPress={() => {
                      haptic(Haptics.ImpactFeedbackStyle.Medium);
                      setAssignJob(null);
                      setTab('roster');
                      setInviteVisible('roster');
                    }}
                  >
                    <Ionicons name="person-add" size={16} color={Colors.primaryForeground} />
                    <Text style={styles.postJobBtnText}>INVITE DRIVERS</Text>
                  </Pressable>
                  <Text style={styles.personEmail}>
                    Invited drivers sign up on LoadLink, then appear here once they accept.
                  </Text>
                </View>
              ) : roster.flatMap(d => {
                const driverId = String(d.driverId || d.driver_id || d.id);
                const already = assignedDriverIds.has(driverId);
                const pendingInvite = d.status === 'pending';
                const unavailable = !!availabilityMap[driverId]?.unavailable;
                const selectable = !already && !pendingInvite && !unavailable;
                const checked = selectedAssign.has(driverId);
                const driverName = d.name || d.driverName || d.driver_name || d.email || 'Driver';
                const companyName = d.companyName || d.company_name || '';
                const trucks: (RosterTruck | null)[] = (d.trucks && d.trucks.length > 0) ? d.trucks : [null];
                return trucks.map((t, ti) => {
                  const rowKey = `${d.id}-${t?.id || ti}`;
                  return (
                    <Pressable
                      key={rowKey}
                      testID={`assign-truck-${rowKey}`}
                      disabled={!selectable}
                      style={[styles.assignRow, (unavailable || pendingInvite) && { opacity: 0.55 }]}
                      onPress={() => toggleAssignSelect(driverId)}
                    >
                      <Ionicons
                        name={checked ? 'checkbox' : 'square-outline'}
                        size={24}
                        color={checked ? Colors.primary : (selectable ? Colors.textMuted : 'rgba(255,255,255,0.2)')}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.personName} numberOfLines={1}>
                          {[companyName, driverName].filter(Boolean).join(' - ') || driverName}
                        </Text>
                        {t ? (
                          <Text style={styles.personEmail} numberOfLines={1}>{truckTitle(t)}</Text>
                        ) : null}
                        {t ? (
                          <Text style={styles.personEmail} numberOfLines={1}>
                            {[
                              t.capacity ? `${t.capacity}T` : '',
                              truckTypeLabel(t.truckType),
                              t.truckNumber ? `#${t.truckNumber}` : '',
                              t.licensePlate ? `Plate: ${t.licensePlate}` : '',
                            ].filter(Boolean).join('  ')}
                          </Text>
                        ) : null}
                        {already ? <Text style={[styles.personEmail, { color: Colors.success }]}>On this job — every day until removed</Text> :
                         pendingInvite ? <Text style={[styles.personEmail, { color: Colors.warning }]}>Invite pending</Text> :
                         unavailable ? (
                          <Text style={[styles.personEmail, { color: Colors.destructive }]}>
                            Unavailable this day{availabilityMap[driverId]?.notes ? ` — ${availabilityMap[driverId]!.notes}` : ''}
                          </Text>
                         ) : null}
                      </View>
                      {already && ti === 0 && (
                        <Pressable
                          testID={`assign-remove-${d.id}`}
                          disabled={removeAssignmentMutation.isPending}
                          style={({ pressed }) => [styles.holdBtn, (pressed || removeAssignmentMutation.isPending) && { opacity: 0.7 }]}
                          onPress={() => {
                            const a = (assignJob?.assignments || []).find(
                              x => x.driverId === driverId && x.status !== 'declined' && x.status !== 'withdrawn'
                            );
                            if (!a) return;
                            haptic();
                            confirmRemoveTruck(() => removeAssignmentMutation.mutate(a.id));
                          }}
                        >
                          <Text style={styles.holdBtnText}>REMOVE</Text>
                        </Pressable>
                      )}
                    </Pressable>
                  );
                });
              })}
            </ScrollView>
            {roster.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Pressable
                  testID="assign-selected-hold"
                  disabled={selectedAssign.size === 0 || assignMutation.isPending}
                  style={({ pressed }) => [styles.holdBtn, { flex: 1, alignItems: 'center', paddingVertical: 12 },
                    (selectedAssign.size === 0 || assignMutation.isPending || pressed) && { opacity: 0.6 }]}
                  onPress={() => assignSelected(false)}
                >
                  <Text style={styles.holdBtnText}>SEND LATER ({selectedAssign.size})</Text>
                </Pressable>
                <Pressable
                  testID="assign-selected-send"
                  disabled={selectedAssign.size === 0 || assignMutation.isPending}
                  style={({ pressed }) => [styles.smallBtn, { flex: 1, alignItems: 'center', paddingVertical: 12 },
                    (selectedAssign.size === 0 || assignMutation.isPending || pressed) && { opacity: 0.6 }]}
                  onPress={() => assignSelected(true)}
                >
                  <Text style={styles.smallBtnText}>SEND NOW ({selectedAssign.size})</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={scheduleModalVisible} transparent animationType="slide" onRequestClose={() => setScheduleModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>SEND INSTRUCTIONS AT…</Text>
              <Pressable onPress={() => setScheduleModalVisible(false)} style={styles.modalClose} testID="schedule-modal-close">
                <Ionicons name="close" size={22} color={Colors.text} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>
              All held trucks on {new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} get their job instructions automatically at this time.
            </Text>
            <View style={styles.timeChipWrap}>
              {[
                { label: '8:00 PM the night before', hour: 20, dayOffset: -1 },
                { label: '4:00 AM', hour: 4, dayOffset: 0 },
                { label: '5:00 AM', hour: 5, dayOffset: 0 },
                { label: '6:00 AM', hour: 6, dayOffset: 0 },
                { label: '7:00 AM', hour: 7, dayOffset: 0 },
                { label: '8:00 AM', hour: 8, dayOffset: 0 },
              ].map(opt => {
                const t = new Date(`${selectedDate}T12:00:00`);
                t.setDate(t.getDate() + opt.dayOffset);
                t.setHours(opt.hour, 0, 0, 0);
                const past = t.getTime() < Date.now() + 60_000;
                return (
                  <Pressable
                    key={opt.label}
                    disabled={past || scheduleMutation.isPending}
                    style={({ pressed }) => [styles.timeChip, past && { opacity: 0.35 }, pressed && { opacity: 0.7 }]}
                    onPress={() => { haptic(); scheduleMutation.mutate(t.toISOString()); }}
                    testID={`schedule-time-${opt.hour}-${opt.dayOffset}`}
                  >
                    <Text style={styles.timeChipText}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.scheduleNote}>
              Trucks you assign with SEND LATER stay invisible to drivers until this time. You can cancel the timer any time before it fires.
            </Text>
          </View>
        </View>
      </Modal>

      <Modal visible={!!inviteVisible} transparent animationType="slide" onRequestClose={() => setInviteVisible(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{inviteVisible === 'roster' ? 'INVITE DRIVER' : 'INVITE CLIENT'}</Text>
              <Pressable onPress={() => setInviteVisible(null)} style={styles.modalClose} testID="invite-modal-close">
                <Ionicons name="close" size={22} color={Colors.text} />
              </Pressable>
            </View>
            <Text style={styles.inputLabel}>NAME</Text>
            <TextInput
              style={styles.input}
              value={inviteName}
              onChangeText={setInviteName}
              placeholder={inviteVisible === 'roster' ? 'Driver name' : 'Company / contact name'}
              placeholderTextColor={Colors.textMuted}
              testID="invite-name-input"
            />
            <Text style={styles.inputLabel}>EMAIL</Text>
            <TextInput
              style={styles.input}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="email@example.com"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              testID="invite-email-input"
            />
            <Pressable
              testID="invite-submit-btn"
              disabled={inviteMutation.isPending || !inviteEmail.trim()}
              style={({ pressed }) => [
                styles.postJobBtn,
                { marginTop: 16 },
                (!inviteEmail.trim() || inviteMutation.isPending) && { opacity: 0.5 },
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => {
                haptic(Haptics.ImpactFeedbackStyle.Medium);
                inviteMutation.mutate({ kind: inviteVisible!, email: inviteEmail, name: inviteName });
              }}
            >
              {inviteMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.primaryForeground} />
              ) : (
                <Text style={styles.postJobBtnText}>SEND INVITE</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1, fontFamily: 'ChakraPetch_700Bold', fontSize: 18,
    color: Colors.text, letterSpacing: 1,
  },
  chimeBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  tabChip: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
  },
  tabChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabChipText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 12, color: Colors.textSecondary, letterSpacing: 0.3 },
  tabChipTextActive: { color: Colors.primaryForeground },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  jobCard: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  jobHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  jobMaterial: { flex: 1, fontFamily: 'ChakraPetch_700Bold', fontSize: 15, color: Colors.text },
  statusBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: 'rgba(255,153,0,0.12)',
  },
  statusText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 10, color: Colors.primary, letterSpacing: 0.5 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  infoText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary },
  ratesRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  rateBox: {
    flex: 1, backgroundColor: Colors.background, borderRadius: 10, padding: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  rateLabel: { fontFamily: 'ChakraPetch_700Bold', fontSize: 9, color: Colors.textMuted, letterSpacing: 0.5 },
  rateValue: { fontFamily: 'ChakraPetch_700Bold', fontSize: 14, color: Colors.text, marginTop: 2 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  statChip: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.textSecondary },
  heldRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(59,130,246,0.06)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)',
  },
  heldName: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.text },
  smallBtn: {
    backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 12,
    minHeight: 36, alignItems: 'center', justifyContent: 'center',
  },
  smallBtnText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 11, color: Colors.primaryForeground, letterSpacing: 0.5 },
  holdBtn: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12,
    minHeight: 36, alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  holdBtnText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 11, color: Colors.textSecondary, letterSpacing: 0.5 },
  unavailableBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  unavailableBadgeText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 10, color: Colors.destructive, letterSpacing: 0.5 },
  dateNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  dateNavBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  dateNavTitle: { fontFamily: 'ChakraPetch_700Bold', fontSize: 15, color: Colors.text, letterSpacing: 0.5 },
  dateNavToday: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.primary, marginTop: 2 },
  daySummaryCard: { backgroundColor: Colors.card, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 10 },
  daySummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  daySummaryText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  filledBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  filledBadgeText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 10, color: Colors.success, letterSpacing: 0.5 },
  scheduleBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,153,0,0.1)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  scheduleBannerText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.text },
  scheduleCancelText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 11, color: Colors.destructive, letterSpacing: 0.5 },
  dayActionRow: { flexDirection: 'row', gap: 8 },
  dayPrimaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: 10, height: 44 },
  dayPrimaryBtnText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 12, color: Colors.primaryForeground, letterSpacing: 0.5 },
  daySecondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, height: 44, paddingHorizontal: 14, borderWidth: 1, borderColor: Colors.primary },
  daySecondaryBtnText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 12, color: Colors.primary, letterSpacing: 0.5 },
  timeChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  timeChip: { borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, paddingHorizontal: 14, height: 42, alignItems: 'center', justifyContent: 'center' },
  timeChipText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 12, color: Colors.text, letterSpacing: 0.5 },
  scheduleNote: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, marginTop: 14, lineHeight: 17 },
  jobActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  assignBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 10, minHeight: 44,
  },
  assignBtnText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 12, color: Colors.primaryForeground, letterSpacing: 0.5 },
  sendAllBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.primary, borderRadius: 10, minHeight: 44,
  },
  sendAllBtnText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 12, color: Colors.primary, letterSpacing: 0.5 },
  clientCard: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  clientHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clientBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  clientBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  clientBadgeActive: { borderColor: 'rgba(255,153,0,0.4)', backgroundColor: 'rgba(255,153,0,0.08)' },
  clientBadgeUnpaid: { borderColor: 'rgba(245,158,11,0.4)', backgroundColor: 'rgba(245,158,11,0.08)' },
  clientBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.textMuted },
  filterBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10,
    backgroundColor: 'rgba(255,153,0,0.08)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,153,0,0.3)',
  },
  filterBannerText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.text },
  filterClearBtn: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  personRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  personAvatar: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,153,0,0.12)',
  },
  personName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text },
  personEmail: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  personStatus: { fontFamily: 'ChakraPetch_700Bold', fontSize: 10, color: Colors.success, letterSpacing: 0.5 },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
  postJobBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 10, minHeight: 44, paddingHorizontal: 20,
  },
  postJobBtnText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 13, color: Colors.primaryForeground, letterSpacing: 0.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, borderWidth: 1, borderColor: Colors.border,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle: { fontFamily: 'ChakraPetch_700Bold', fontSize: 16, color: Colors.text, letterSpacing: 0.5 },
  modalClose: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  modalSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginBottom: 12 },
  assignRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  inputLabel: { fontFamily: 'ChakraPetch_700Bold', fontSize: 11, color: Colors.textMuted, letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, minHeight: 48, color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 14,
  },
});
