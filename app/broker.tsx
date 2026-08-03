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

interface RosterDriver {
  id: string;
  driverId?: string;
  driver_id?: string;
  name?: string;
  driverName?: string;
  driver_name?: string;
  email?: string;
  status?: string;
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
  const params = useLocalSearchParams<{ assign?: string; tab?: string }>();
  const [tab, setTab] = useState<BrokerTab>(
    params.tab === 'today' || params.tab === 'jobs' || params.tab === 'roster' ? (params.tab as BrokerTab) : 'clients'
  );
  const [clientFilter, setClientFilter] = useState<BrokerClient | null>(null);
  const [assignJob, setAssignJob] = useState<BrokerJob | null>(null);
  const handledAssignRef = useRef<string | null>(null);
  const [inviteVisible, setInviteVisible] = useState<'roster' | 'clients' | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');

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

  const jobs = Array.isArray(jobsQuery.data) ? jobsQuery.data : [];
  const todayJobs = jobs.filter(j => isTodayDate(j.scheduledDate || j.scheduled_date));
  const roster = Array.isArray(rosterQuery.data) ? rosterQuery.data : [];
  const clients = Array.isArray(clientsQuery.data) ? clientsQuery.data : [];

  useEffect(() => {
    const assignId = typeof params.assign === 'string' ? params.assign : undefined;
    if (!assignId || handledAssignRef.current === assignId) return;
    const job = jobs.find(j => j.id === assignId);
    if (job) {
      handledAssignRef.current = assignId;
      setTab('jobs');
      setAssignJob(job);
      router.setParams({ assign: undefined } as any);
    }
  }, [params.assign, jobs]);

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
              {t === 'today' ? `Today (${todayJobs.length})`
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
            ) : roster.map(d => renderPersonRow(
              d.name || d.driverName || d.driver_name || d.email || 'Driver',
              d.email, d.status, d.id
            ))
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

      <Modal visible={!!assignJob} transparent animationType="slide" onRequestClose={() => setAssignJob(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ASSIGN TRUCKS FROM YOUR ROSTER</Text>
              <Pressable onPress={() => setAssignJob(null)} style={styles.modalClose} testID="assign-modal-close">
                <Ionicons name="close" size={22} color={Colors.text} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle} numberOfLines={1}>{assignJob?.material || ''}</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {roster.length === 0 ? (
                <Text style={[styles.emptyText, { marginVertical: 24 }]}>No roster drivers. Invite drivers first.</Text>
              ) : roster.map(d => {
                const driverId = d.driverId || d.driver_id || d.id;
                const already = assignedDriverIds.has(driverId);
                const pendingInvite = d.status === 'pending';
                return (
                  <View key={d.id} style={styles.assignRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personName} numberOfLines={1}>{d.name || d.driverName || d.driver_name || d.email || 'Driver'}</Text>
                      {already ? <Text style={styles.personEmail}>Already assigned</Text> :
                       pendingInvite ? <Text style={styles.personEmail}>Invite pending</Text> : null}
                    </View>
                    {!already && !pendingInvite && (
                      <>
                        <Pressable
                          testID={`assign-hold-${d.id}`}
                          disabled={assignMutation.isPending}
                          style={({ pressed }) => [styles.holdBtn, (pressed || assignMutation.isPending) && { opacity: 0.7 }]}
                          onPress={() => { haptic(); assignMutation.mutate({ jobId: assignJob!.id, driverId, sendNow: false }); }}
                        >
                          <Text style={styles.holdBtnText}>HOLD</Text>
                        </Pressable>
                        <Pressable
                          testID={`assign-send-${d.id}`}
                          disabled={assignMutation.isPending}
                          style={({ pressed }) => [styles.smallBtn, (pressed || assignMutation.isPending) && { opacity: 0.7 }]}
                          onPress={() => { haptic(); assignMutation.mutate({ jobId: assignJob!.id, driverId, sendNow: true }); }}
                        >
                          <Text style={styles.smallBtnText}>SEND NOW</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                );
              })}
            </ScrollView>
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
