import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform, Alert, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { Job, formatRate, formatJobType, formatTruckType, getStatusColor, getJobTypeColor } from '@/lib/mock-data';
import { apiRequest, queryClient } from '@/lib/query-client';

function isContractorRole(role: string): boolean {
  return role.includes('contractor');
}

interface VehicleInfo {
  id: string;
  truckType: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  truckNumber: string;
  maxCapacityTons: string;
}

interface Assignment {
  id: string;
  driverName: string;
  driverPhone: string;
  driverEmail: string;
  driverTruckType: string;
  driverRating: number;
  driverCompany: string;
  driverDotNumber: string;
  driverMcNumber: string;
  driverCdlNumber: string;
  driverCdlState: string;
  driverProfileImage: string;
  truckingCompanyName: string;
  vehicle: VehicleInfo | null;
  status: string;
  appliedAt: string;
}

function mapAssignment(a: any): Assignment {
  const v = a.vehicle;
  return {
    id: a.id,
    driverName: a.driver_name ?? a.driverName ?? 'Unknown',
    driverPhone: a.driver_phone ?? a.driverPhone ?? '',
    driverEmail: a.driver_email ?? a.driverEmail ?? '',
    driverTruckType: a.driver_truck_type ?? a.driverTruckType ?? '',
    driverRating: Number(a.driver_rating ?? a.driverRating ?? 0),
    driverCompany: a.driver_company ?? a.driverCompany ?? '',
    driverDotNumber: a.driver_dot_number ?? a.driverDotNumber ?? '',
    driverMcNumber: a.driver_mc_number ?? a.driverMcNumber ?? '',
    driverCdlNumber: a.driver_cdl_number ?? a.driverCdlNumber ?? '',
    driverCdlState: a.driver_cdl_state ?? a.driverCdlState ?? '',
    driverProfileImage: a.driver_profile_image ?? a.driverProfileImage ?? '',
    truckingCompanyName: a.trucking_company_name ?? a.truckingCompanyName ?? '',
    vehicle: v ? {
      id: v.id,
      truckType: v.truck_type ?? v.truckType ?? '',
      make: v.make ?? '',
      model: v.model ?? '',
      year: v.year ?? 0,
      licensePlate: v.license_plate ?? v.licensePlate ?? '',
      truckNumber: v.truck_number ?? v.truckNumber ?? '',
      maxCapacityTons: v.max_capacity_tons ?? v.maxCapacityTons ?? '',
    } : null,
    status: a.status ?? 'pending',
    appliedAt: a.applied_at ?? a.appliedAt ?? a.created_at ?? '',
  };
}

function mapJob(j: any): Job {
  return {
    id: j.id,
    contractorId: j.contractor_id ?? j.contractorId ?? '',
    contractorName: j.contractor_name ?? j.contractorName ?? '',
    contractorCompany: j.contractor_company ?? j.contractorCompany ?? '',
    driverId: j.driver_id ?? j.driverId,
    jobType: j.job_type ?? j.jobType ?? 'single_load',
    material: j.material ?? '',
    originAddress: j.origin_address ?? j.originAddress ?? '',
    originLat: j.origin_lat ?? j.originLat ?? 0,
    originLng: j.origin_lng ?? j.originLng ?? 0,
    destinationAddress: j.destination_address ?? j.destinationAddress ?? '',
    destinationLat: j.destination_lat ?? j.destinationLat ?? 0,
    destinationLng: j.destination_lng ?? j.destinationLng ?? 0,
    distance: j.distance ?? 0,
    rate: Number(j.rate) || 0,
    rateType: j.rate_type ?? j.rateType ?? 'per_hour',
    truckType: j.truck_type ?? j.truckType ?? 'end_dump',
    trucksNeeded: j.trucks_needed ?? j.trucksNeeded ?? 1,
    status: j.status ?? 'open',
    urgent: j.urgent ?? false,
    scheduledDate: j.scheduled_date ?? j.scheduledDate ?? '',
    pickupTime: j.pickup_time ?? j.pickupTime ?? '',
    estimatedDays: j.estimated_days ?? j.estimatedDays,
    estimatedTrips: j.estimated_trips ?? j.estimatedTrips,
    estimatedCost: j.estimated_cost != null ? Number(j.estimated_cost) : j.estimatedCost != null ? Number(j.estimatedCost) : undefined,
    requiresTarp: j.requires_tarp ?? j.requiresTarp ?? false,
    requiresWeightTickets: j.requires_weight_tickets ?? j.requiresWeightTickets ?? false,
    capacityNeeded: j.capacity_needed ?? j.capacityNeeded,
    totalTonsNeeded: j.total_tons_needed ?? j.totalTonsNeeded,
    createdAt: j.created_at ?? j.createdAt ?? '',
    projectName: j.project_name ?? j.projectName,
  };
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const isContractor = isContractorRole(user?.role || '');

  const { data: jobData, isLoading } = useQuery<any>({
    queryKey: [`/api/jobs/${id}`],
    enabled: !!id,
  });

  const job = jobData ? mapJob(jobData) : null;
  const isMyPostedJob = isContractor && job?.contractorId === user?.id;

  const { data: assignmentsData } = useQuery<any[]>({
    queryKey: [`/api/jobs/${id}/assignments`],
    enabled: !!id && isMyPostedJob,
  });

  const assignments: Assignment[] = (assignmentsData || []).map(mapAssignment);
  const pendingAssignments = assignments.filter(a => a.status === 'pending');
  const approvedAssignments = assignments.filter(a => a.status === 'approved');

  const [jobStatus, setJobStatus] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedDriver, setSelectedDriver] = useState<Assignment | null>(null);
  const [counterBidVisible, setCounterBidVisible] = useState(false);
  const [counterBidRate, setCounterBidRate] = useState('');
  const [counterBidNote, setCounterBidNote] = useState('');
  const [submittingBid, setSubmittingBid] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (job) {
      setJobStatus(job.status);
    }
  }, [job?.status]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.errorText}>Job not found</Text>
        <Pressable onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)');
          }
        }} style={styles.backLink}>
          <Text style={{ color: Colors.primary, fontFamily: 'Inter_500Medium' }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const statusColor = getStatusColor(jobStatus);
  const jobTypeColor = getJobTypeColor(job.jobType);
  const isMyJob = job.driverId === user?.id;
  const canAccept = (jobStatus === 'open' || jobStatus === 'pending') && !isMyJob && !isMyPostedJob;
  const canStart = (jobStatus === 'accepted' || jobStatus === 'in_progress') && isMyJob;

  function formatElapsed(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function getBilledMinutes(actualMinutes: number) {
    if (actualMinutes <= 60) return 60;
    return 60 + Math.ceil((actualMinutes - 60) / 15) * 15;
  }

  async function handleApproveAssignment(assignmentId: string) {
    try {
      await apiRequest('POST', `/api/jobs/${id}/assignments/${assignmentId}/approve`);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}/assignments`] });
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractor/jobs'] });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to approve driver');
    }
  }

  async function handleRejectAssignment(assignmentId: string) {
    const doReject = async () => {
      try {
        await apiRequest('POST', `/api/jobs/${id}/assignments/${assignmentId}/reject`);
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}/assignments`] });
        queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to reject driver');
      }
    };
    if (Platform.OS === 'web') {
      doReject();
      return;
    }
    Alert.alert('Reject Driver', 'Are you sure you want to reject this driver?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: doReject },
    ]);
  }

  async function handleCancelJob() {
    const doCancel = async () => {
      try {
        await apiRequest('DELETE', `/api/jobs/${id}`);
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ['/api/contractor/jobs'] });
        router.back();
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to cancel job');
      }
    };
    if (Platform.OS === 'web') {
      doCancel();
      return;
    }
    Alert.alert('Cancel Job', 'Are you sure you want to cancel this job? This cannot be undone.', [
      { text: 'Keep Job', style: 'cancel' },
      { text: 'Cancel Job', style: 'destructive', onPress: doCancel },
    ]);
  }

  async function handleAccept() {
    try {
      await apiRequest('POST', `/api/jobs/${id}/accept`);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setJobStatus('accepted');
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to accept job');
    }
  }

  async function handleCounterBid() {
    if (!counterBidRate || isNaN(Number(counterBidRate)) || Number(counterBidRate) <= 0) {
      Alert.alert('Invalid Rate', 'Please enter a valid rate amount');
      return;
    }
    setSubmittingBid(true);
    try {
      await apiRequest('POST', `/api/jobs/${id}/counter-bid`, {
        rate: counterBidRate,
        note: counterBidNote.trim() || undefined,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCounterBidVisible(false);
      setCounterBidRate('');
      setCounterBidNote('');
      Alert.alert('Bid Submitted', 'Your counter bid has been sent to the contractor');
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit counter bid');
    }
    setSubmittingBid(false);
  }

  async function handleStartJob() {
    try {
      await apiRequest('POST', `/api/jobs/${id}/clock-in`, { lat: 0, lng: 0 });
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setJobStatus('in_progress');
      setIsRunning(true);
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to clock in');
    }
  }

  function handleStopJob() {
    if (Platform.OS === 'web') {
      doStop();
      return;
    }
    Alert.alert('Clock Out', 'Are you sure you want to clock out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clock Out', style: 'destructive', onPress: doStop },
    ]);
  }

  async function doStop() {
    try {
      const runs = (jobData as any)?.runs;
      const activeRun = runs?.find?.((r: any) => !r.clock_out_time && !r.clockOutTime);
      if (activeRun) {
        await apiRequest('POST', `/api/job-runs/${activeRun.id}/clock-out`, { lat: 0, lng: 0 });
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsRunning(false);
      setJobStatus('completed');
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
    } catch (e: any) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsRunning(false);
      setJobStatus('completed');
    }
  }

  const actualMinutes = Math.floor(elapsedSeconds / 60);
  const billedMinutes = getBilledMinutes(actualMinutes);

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <Pressable onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)');
          }
        }} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>JOB DETAILS</Text>
        <Pressable style={styles.msgBtn} onPress={() => router.push({ pathname: '/chat/[jobId]', params: { jobId: job.id } })}>
          <Ionicons name="chatbubble-outline" size={20} color={Colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        {isRunning && (
          <View style={styles.timerCard}>
            <Text style={styles.timerLabel}>ACTIVE JOB TIMER</Text>
            <Text style={styles.timerDisplay}>{formatElapsed(elapsedSeconds)}</Text>
            <View style={styles.timerStats}>
              <View style={styles.timerStat}>
                <Text style={styles.timerStatLabel}>Actual</Text>
                <Text style={styles.timerStatValue}>{actualMinutes} min</Text>
              </View>
              <View style={styles.timerStatDivider} />
              <View style={styles.timerStat}>
                <Text style={styles.timerStatLabel}>Billed</Text>
                <Text style={styles.timerStatValue}>{billedMinutes} min</Text>
              </View>
            </View>
          </View>
        )}

        {jobStatus === 'completed' && elapsedSeconds > 0 && (
          <View style={styles.completedCard}>
            <Ionicons name="checkmark-circle" size={32} color={Colors.success} />
            <Text style={styles.completedTitle}>JOB COMPLETED</Text>
            <Text style={styles.completedText}>
              Time worked: {formatElapsed(elapsedSeconds)} ({billedMinutes} min billed)
            </Text>
          </View>
        )}

        <View style={styles.headerSection}>
          {job.projectName && (
            <Text style={styles.projectName}>{job.projectName}</Text>
          )}
          <View style={styles.titleRow}>
            <Text style={styles.material}>{job.material}</Text>
            {job.urgent && (
              <View style={styles.urgentBadge}>
                <Ionicons name="flash" size={12} color={Colors.primary} />
                <Text style={styles.urgentText}>URGENT</Text>
              </View>
            )}
          </View>
          <Text style={styles.rateDisplay}>{formatRate(job.rate, job.rateType)}</Text>
          {job.estimatedCost && (
            <Text style={styles.estimatedCost}>Est. total: ${job.estimatedCost.toLocaleString()}</Text>
          )}
        </View>

        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: jobTypeColor.bg }]}>
            <Text style={[styles.badgeText, { color: jobTypeColor.text }]}>{formatJobType(job.jobType, job.estimatedDays)}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.badgeText, { color: statusColor.text }]}>{jobStatus.replace('_', ' ').toUpperCase()}</Text>
          </View>
          <View style={styles.badge}>
            <MaterialCommunityIcons name="dump-truck" size={12} color={Colors.textSecondary} />
            <Text style={styles.badgeText}>{formatTruckType(job.truckType)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ROUTE</Text>
          <View style={styles.routeCard}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: Colors.success }]} />
              <View style={styles.routeTextBlock}>
                <Text style={styles.routeLabel}>PICKUP</Text>
                <Text style={styles.routeAddress}>{job.originAddress}</Text>
              </View>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: Colors.primary }]} />
              <View style={styles.routeTextBlock}>
                <Text style={styles.routeLabel}>DROPOFF</Text>
                <Text style={styles.routeAddress}>{job.destinationAddress}</Text>
              </View>
            </View>
            <View style={styles.routeStats}>
              <View style={styles.routeStatItem}>
                <Ionicons name="navigate" size={14} color={Colors.primary} />
                <Text style={styles.routeStatText}>{job.distance} miles</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DETAILS</Text>
          <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
              <Ionicons name="calendar" size={16} color={Colors.textMuted} />
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>
                {new Date(job.scheduledDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="time" size={16} color={Colors.textMuted} />
              <Text style={styles.detailLabel}>Pickup Time</Text>
              <Text style={styles.detailValue}>{job.pickupTime}</Text>
            </View>
            <View style={styles.detailItem}>
              <MaterialCommunityIcons name="dump-truck" size={16} color={Colors.textMuted} />
              <Text style={styles.detailLabel}>Trucks Needed</Text>
              <Text style={styles.detailValue}>{job.trucksNeeded}</Text>
            </View>
            {job.capacityNeeded && (
              <View style={styles.detailItem}>
                <Ionicons name="scale" size={16} color={Colors.textMuted} />
                <Text style={styles.detailLabel}>Capacity</Text>
                <Text style={styles.detailValue}>{job.capacityNeeded} tons</Text>
              </View>
            )}
            {job.totalTonsNeeded && (
              <View style={styles.detailItem}>
                <Ionicons name="cube" size={16} color={Colors.textMuted} />
                <Text style={styles.detailLabel}>Total Tons</Text>
                <Text style={styles.detailValue}>{job.totalTonsNeeded}</Text>
              </View>
            )}
            {job.estimatedTrips && (
              <View style={styles.detailItem}>
                <Ionicons name="repeat" size={16} color={Colors.textMuted} />
                <Text style={styles.detailLabel}>Est. Trips</Text>
                <Text style={styles.detailValue}>{job.estimatedTrips}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>REQUIREMENTS</Text>
          <View style={styles.reqRow}>
            <View style={[styles.reqBadge, { backgroundColor: job.requiresTarp ? Colors.warningBg : Colors.muted }]}>
              <Ionicons name={job.requiresTarp ? "checkmark-circle" : "close-circle"} size={14} color={job.requiresTarp ? Colors.warning : Colors.textMuted} />
              <Text style={[styles.reqText, { color: job.requiresTarp ? Colors.warning : Colors.textMuted }]}>Tarp Required</Text>
            </View>
            <View style={[styles.reqBadge, { backgroundColor: job.requiresWeightTickets ? Colors.warningBg : Colors.muted }]}>
              <Ionicons name={job.requiresWeightTickets ? "checkmark-circle" : "close-circle"} size={14} color={job.requiresWeightTickets ? Colors.warning : Colors.textMuted} />
              <Text style={[styles.reqText, { color: job.requiresWeightTickets ? Colors.warning : Colors.textMuted }]}>Weight Tickets</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>POSTED BY</Text>
          <View style={styles.contractorCard}>
            <View style={styles.contractorAvatar}>
              <Text style={styles.contractorAvatarText}>{job.contractorName.charAt(0)}</Text>
            </View>
            <View>
              <Text style={styles.contractorName}>{job.contractorName}</Text>
              <Text style={styles.contractorCompany}>{job.contractorCompany}</Text>
            </View>
          </View>
        </View>

        {isMyPostedJob && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DRIVER APPLICATIONS ({assignments.length})</Text>
            {pendingAssignments.length > 0 ? (
              pendingAssignments.map(a => (
                <Pressable key={a.id} style={styles.assignmentCard} onPress={() => setSelectedDriver(a)}>
                  <View style={styles.assignmentInfo}>
                    <View style={styles.driverAvatar}>
                      <Text style={styles.driverAvatarText}>{a.driverName.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      {a.truckingCompanyName ? (
                        <Text style={styles.companyLabel}>{a.truckingCompanyName}</Text>
                      ) : null}
                      <Text style={styles.driverNameText}>{a.driverName}</Text>
                      <View style={styles.driverMeta}>
                        {a.driverTruckType ? (
                          <View style={styles.driverMetaItem}>
                            <MaterialCommunityIcons name="dump-truck" size={12} color={Colors.textMuted} />
                            <Text style={styles.driverMetaText}>{formatTruckType(a.driverTruckType)}</Text>
                          </View>
                        ) : null}
                        {a.driverRating > 0 && (
                          <View style={styles.driverMetaItem}>
                            <Ionicons name="star" size={12} color={Colors.warning} />
                            <Text style={styles.driverMetaText}>{a.driverRating.toFixed(1)}</Text>
                          </View>
                        )}
                        {a.vehicle ? (
                          <View style={styles.driverMetaItem}>
                            <Ionicons name="car" size={12} color={Colors.textMuted} />
                            <Text style={styles.driverMetaText}>
                              {[a.vehicle.year, a.vehicle.make, a.vehicle.model].filter(Boolean).join(' ')}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ marginRight: 4 }} />
                  </View>
                  <View style={styles.assignmentActions}>
                    <Pressable
                      style={styles.approveBtn}
                      onPress={(e) => { e.stopPropagation(); handleApproveAssignment(a.id); }}
                    >
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    </Pressable>
                    <Pressable
                      style={styles.rejectBtn}
                      onPress={(e) => { e.stopPropagation(); handleRejectAssignment(a.id); }}
                    >
                      <Ionicons name="close" size={20} color="#fff" />
                    </Pressable>
                  </View>
                </Pressable>
              ))
            ) : approvedAssignments.length > 0 ? (
              approvedAssignments.map(a => (
                <Pressable key={a.id} style={[styles.assignmentCard, { borderColor: 'rgba(34, 197, 94, 0.3)' }]} onPress={() => setSelectedDriver(a)}>
                  <View style={styles.assignmentInfo}>
                    <View style={[styles.driverAvatar, { borderColor: Colors.success }]}>
                      <Text style={[styles.driverAvatarText, { color: Colors.success }]}>{a.driverName.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      {a.truckingCompanyName ? (
                        <Text style={styles.companyLabel}>{a.truckingCompanyName}</Text>
                      ) : null}
                      <Text style={styles.driverNameText}>{a.driverName}</Text>
                      <Text style={[styles.driverMetaText, { color: Colors.success }]}>Approved</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </View>
                  <View style={[styles.badge, { backgroundColor: Colors.successBg }]}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                    <Text style={[styles.badgeText, { color: Colors.success }]}>APPROVED</Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <View style={styles.noAssignments}>
                <Ionicons name="person-outline" size={24} color={Colors.textMuted} />
                <Text style={styles.noAssignmentsText}>No driver applications yet</Text>
              </View>
            )}
          </View>
        )}

        {isMyPostedJob && jobStatus !== 'completed' && jobStatus !== 'cancelled' && (
          <Pressable
            style={({ pressed }) => [styles.cancelJobBtn, pressed && { opacity: 0.85 }]}
            onPress={handleCancelJob}
          >
            <Ionicons name="close-circle" size={20} color={Colors.destructive} />
            <Text style={styles.cancelJobBtnText}>CANCEL JOB</Text>
          </Pressable>
        )}

        {canAccept && (
          <View style={styles.acceptRow}>
            <Pressable
              style={({ pressed }) => [styles.counterBidBtn, { flex: 1 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCounterBidRate(job.rate?.toString() || '');
                setCounterBidNote('');
                setCounterBidVisible(true);
              }}
            >
              <Ionicons name="swap-horizontal" size={20} color={Colors.primary} />
              <Text style={styles.counterBidBtnText}>COUNTER OFFER</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.acceptBtn, { flex: 1 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              onPress={handleAccept}
            >
              <Ionicons name="checkmark-circle" size={20} color={Colors.primaryForeground} />
              <Text style={styles.acceptBtnText}>ACCEPT JOB</Text>
            </Pressable>
          </View>
        )}

        {canStart && !isRunning && jobStatus !== 'completed' && (
          <Pressable
            style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
            onPress={handleStartJob}
          >
            <Ionicons name="play-circle" size={20} color="#fff" />
            <Text style={styles.startBtnText}>CLOCK IN</Text>
          </Pressable>
        )}

        {isRunning && (
          <Pressable
            style={({ pressed }) => [styles.stopBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
            onPress={handleStopJob}
          >
            <Ionicons name="stop-circle" size={20} color="#fff" />
            <Text style={styles.stopBtnText}>CLOCK OUT</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal
        visible={selectedDriver !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedDriver(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedDriver(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            {selectedDriver && (
              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalAvatar}>
                    <Text style={styles.modalAvatarText}>{selectedDriver.driverName.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    {selectedDriver.truckingCompanyName ? (
                      <View style={styles.modalCompanyRow}>
                        <Ionicons name="business" size={13} color={Colors.primary} />
                        <Text style={styles.modalCompanyText}>{selectedDriver.truckingCompanyName}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.modalDriverName}>{selectedDriver.driverName}</Text>
                    {selectedDriver.driverRating > 0 && (
                      <View style={styles.modalRatingRow}>
                        <Ionicons name="star" size={14} color={Colors.warning} />
                        <Text style={styles.modalRatingText}>{selectedDriver.driverRating.toFixed(1)} rating</Text>
                      </View>
                    )}
                  </View>
                </View>

                {(selectedDriver.driverPhone || selectedDriver.driverEmail) && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>CONTACT</Text>
                    {selectedDriver.driverPhone ? (
                      <View style={styles.modalDetailRow}>
                        <Ionicons name="call" size={16} color={Colors.textMuted} />
                        <Text style={styles.modalDetailText}>{selectedDriver.driverPhone}</Text>
                      </View>
                    ) : null}
                    {selectedDriver.driverEmail ? (
                      <View style={styles.modalDetailRow}>
                        <Ionicons name="mail" size={16} color={Colors.textMuted} />
                        <Text style={styles.modalDetailText}>{selectedDriver.driverEmail}</Text>
                      </View>
                    ) : null}
                  </View>
                )}

                {selectedDriver.vehicle && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>VEHICLE</Text>
                    <View style={styles.modalVehicleCard}>
                      <MaterialCommunityIcons name="dump-truck" size={28} color={Colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalVehicleTitle}>
                          {[selectedDriver.vehicle.year, selectedDriver.vehicle.make, selectedDriver.vehicle.model].filter(Boolean).join(' ')}
                        </Text>
                        {selectedDriver.vehicle.truckType ? (
                          <Text style={styles.modalVehicleMeta}>{formatTruckType(selectedDriver.vehicle.truckType)}</Text>
                        ) : null}
                        <View style={styles.modalVehicleDetails}>
                          {selectedDriver.vehicle.licensePlate ? (
                            <View style={styles.modalVehicleTag}>
                              <Text style={styles.modalVehicleTagText}>Plate: {selectedDriver.vehicle.licensePlate}</Text>
                            </View>
                          ) : null}
                          {selectedDriver.vehicle.truckNumber ? (
                            <View style={styles.modalVehicleTag}>
                              <Text style={styles.modalVehicleTagText}>#{selectedDriver.vehicle.truckNumber}</Text>
                            </View>
                          ) : null}
                          {selectedDriver.vehicle.maxCapacityTons ? (
                            <View style={styles.modalVehicleTag}>
                              <Text style={styles.modalVehicleTagText}>{selectedDriver.vehicle.maxCapacityTons}T</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </View>
                )}

                {(selectedDriver.driverCdlNumber || selectedDriver.driverDotNumber || selectedDriver.driverMcNumber) && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>CREDENTIALS</Text>
                    {selectedDriver.driverCdlNumber ? (
                      <View style={styles.modalDetailRow}>
                        <Ionicons name="card" size={16} color={Colors.textMuted} />
                        <Text style={styles.modalDetailText}>CDL: {selectedDriver.driverCdlNumber}{selectedDriver.driverCdlState ? ` (${selectedDriver.driverCdlState})` : ''}</Text>
                      </View>
                    ) : null}
                    {selectedDriver.driverDotNumber ? (
                      <View style={styles.modalDetailRow}>
                        <Ionicons name="shield-checkmark" size={16} color={Colors.textMuted} />
                        <Text style={styles.modalDetailText}>DOT: {selectedDriver.driverDotNumber}</Text>
                      </View>
                    ) : null}
                    {selectedDriver.driverMcNumber ? (
                      <View style={styles.modalDetailRow}>
                        <Ionicons name="document-text" size={16} color={Colors.textMuted} />
                        <Text style={styles.modalDetailText}>MC: {selectedDriver.driverMcNumber}</Text>
                      </View>
                    ) : null}
                  </View>
                )}

                {selectedDriver.status === 'pending' && (
                  <View style={styles.modalActions}>
                    <Pressable
                      style={[styles.modalActionBtn, { backgroundColor: Colors.success }]}
                      onPress={() => { handleApproveAssignment(selectedDriver.id); setSelectedDriver(null); }}
                    >
                      <Ionicons name="checkmark" size={20} color="#fff" />
                      <Text style={styles.modalActionText}>APPROVE</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalActionBtn, { backgroundColor: Colors.destructive }]}
                      onPress={() => { handleRejectAssignment(selectedDriver.id); setSelectedDriver(null); }}
                    >
                      <Ionicons name="close" size={20} color="#fff" />
                      <Text style={styles.modalActionText}>REJECT</Text>
                    </Pressable>
                  </View>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={counterBidVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCounterBidVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.cbOverlay} onPress={() => setCounterBidVisible(false)}>
            <Pressable style={styles.cbSheet} onPress={() => {}}>
              <View style={styles.cbHandle} />
              <Text style={styles.cbTitle}>COUNTER BID</Text>
              <Text style={styles.cbSubtitle}>
                Listed rate: ${job.rate ? Number(job.rate).toFixed(2) : '0.00'}/{job.rateType === 'per_hour' ? 'hr' : job.rateType === 'per_ton' ? 'ton' : 'load'}
              </Text>

              <View style={styles.cbField}>
                <Text style={styles.cbLabel}>Your Rate</Text>
                <View style={styles.cbInputRow}>
                  <Text style={styles.cbDollar}>$</Text>
                  <TextInput
                    style={styles.cbInput}
                    value={counterBidRate}
                    onChangeText={setCounterBidRate}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={Colors.textMuted}
                    autoFocus
                  />
                  <Text style={styles.cbUnit}>/{job.rateType === 'per_hour' ? 'hr' : job.rateType === 'per_ton' ? 'ton' : 'load'}</Text>
                </View>
              </View>

              <View style={styles.cbField}>
                <Text style={styles.cbLabel}>Note (optional)</Text>
                <TextInput
                  style={styles.cbNoteInput}
                  value={counterBidNote}
                  onChangeText={setCounterBidNote}
                  placeholder="Why this rate?"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              <Pressable
                style={({ pressed }) => [styles.cbSubmitBtn, pressed && { opacity: 0.85 }, submittingBid && { opacity: 0.6 }]}
                onPress={handleCounterBid}
                disabled={submittingBid}
              >
                {submittingBid ? (
                  <ActivityIndicator size="small" color={Colors.primaryForeground} />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color={Colors.primaryForeground} />
                    <Text style={styles.cbSubmitText}>SUBMIT BID</Text>
                  </>
                )}
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 14,
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  msgBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { padding: 16 },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: Colors.textSecondary,
  },
  backLink: { marginTop: 12 },
  timerCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.info,
    marginBottom: 16,
  },
  timerLabel: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 11,
    color: Colors.info,
    letterSpacing: 1,
    marginBottom: 8,
  },
  timerDisplay: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 42,
    color: Colors.text,
    textShadowColor: 'rgba(59, 130, 246, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  timerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginTop: 12,
  },
  timerStat: { alignItems: 'center' },
  timerStatLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted },
  timerStatValue: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text },
  timerStatDivider: { width: 1, height: 24, backgroundColor: Colors.border },
  completedCard: {
    backgroundColor: Colors.successBg,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    marginBottom: 16,
    gap: 8,
  },
  completedTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.success,
    letterSpacing: 1,
  },
  completedText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.text,
  },
  headerSection: { marginBottom: 16 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  projectName: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: Colors.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  material: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.text,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  urgentText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  rateDisplay: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 28,
    color: Colors.primary,
    textShadowColor: 'rgba(255, 153, 0, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  estimatedCost: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.muted,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  badgeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.textSecondary,
  },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 10,
  },
  routeCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 3,
  },
  routeTextBlock: { flex: 1 },
  routeLabel: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  routeAddress: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  routeLine: {
    width: 1,
    height: 16,
    backgroundColor: Colors.border,
    marginLeft: 5.5,
    marginVertical: 4,
  },
  routeStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  routeStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routeStatText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text,
  },
  detailsGrid: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  detailLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
  },
  detailValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  reqRow: {
    flexDirection: 'row',
    gap: 10,
  },
  reqBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  reqText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  contractorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  contractorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractorAvatarText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.primary,
  },
  contractorName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
  },
  contractorCompany: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  stickyBottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.background,
  },
  acceptRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  counterBidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 12,
    height: 52,
    gap: 6,
    paddingHorizontal: 16,
  },
  counterBidBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 52,
    gap: 8,
  },
  acceptBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.primaryForeground,
    letterSpacing: 1,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    borderRadius: 12,
    height: 52,
    gap: 8,
    marginTop: 8,
  },
  startBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: '#fff',
    letterSpacing: 1,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.destructive,
    borderRadius: 12,
    height: 52,
    gap: 8,
    marginTop: 8,
  },
  stopBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: '#fff',
    letterSpacing: 1,
  },
  assignmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  assignmentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  driverAvatarText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.primary,
  },
  driverNameText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  driverMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  driverMetaText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
  },
  assignmentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  approveBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noAssignments: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  noAssignmentsText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
  },
  companyLabel: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 10,
    color: Colors.primary,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    marginBottom: 1,
  },
  cancelJobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.destructiveBg,
    borderRadius: 12,
    height: 48,
    gap: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  cancelJobBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: Colors.destructive,
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  modalAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  modalAvatarText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 22,
    color: Colors.primary,
  },
  modalCompanyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  modalCompanyText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 11,
    color: Colors.primary,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
  modalDriverName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.text,
  },
  modalRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  modalRatingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  modalSection: {
    marginBottom: 18,
  },
  modalSectionTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  modalDetailText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.text,
  },
  modalVehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalVehicleTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
  },
  modalVehicleMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  modalVehicleDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  modalVehicleTag: {
    backgroundColor: Colors.card,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalVehicleTagText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textSecondary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 10,
    gap: 6,
  },
  modalActionText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: '#fff',
    letterSpacing: 1,
  },
  cbOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  cbSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  cbHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  cbTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 2,
    textAlign: 'center',
  },
  cbSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  cbField: {
    gap: 6,
  },
  cbLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  cbInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 52,
  },
  cbDollar: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 22,
    color: Colors.primary,
    marginRight: 4,
  },
  cbInput: {
    flex: 1,
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 22,
    color: Colors.text,
    padding: 0,
  },
  cbUnit: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
    marginLeft: 6,
  },
  cbNoteInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.text,
    minHeight: 80,
  },
  cbSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 52,
    gap: 8,
    marginTop: 4,
  },
  cbSubmitText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 15,
    color: Colors.primaryForeground,
    letterSpacing: 1,
  },
});
