import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform, Alert, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Dimensions, Linking, Image, RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import TruckIcon from '@/components/TruckIcon';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
let _Notif: typeof import('expo-notifications') | null = null;
async function getNotif() {
  if (_Notif) return _Notif;
  if (Platform.OS === 'web' || Platform.OS === 'android') return null;
  try { _Notif = await import('expo-notifications'); return _Notif; } catch { return null; }
}
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { Job, formatRate, formatJobType, formatTruckType, getStatusColor, getJobTypeColor } from '@/lib/mock-data';
import { apiRequest, queryClient, getApiUrl } from '@/lib/query-client';
import RouteMapView from '@/components/RouteMapView';

function isContractorRole(role: string): boolean {
  return role.includes('contractor') && role !== 'trucking_company';
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
  driverId: string;
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
  availableDays: number | null;
}

function mapAssignment(a: any): Assignment {
  const v = a.vehicle;
  return {
    id: a.id,
    driverId: a.driver_id ?? a.driverId ?? '',
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
    availableDays: a.available_days ?? a.availableDays ?? null,
  };
}

function formatDriverShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

function formatDriverDisplay(a: { driverName: string; driverCompany: string; truckingCompanyName: string }): string {
  const company = a.truckingCompanyName || a.driverCompany;
  const shortName = formatDriverShortName(a.driverName);
  if (company) return `${company} (${shortName})`;
  return shortName;
}

function getJobDateRange(scheduledDate: string, estimatedDays: number | string | null, includesWeekends: boolean): string[] {
  if (!scheduledDate) return [];
  const startDate = new Date(scheduledDate);
  if (isNaN(startDate.getTime())) return [];
  const days = Math.max(1, Math.ceil(parseFloat(String(estimatedDays || '1')) || 1));
  const dates: string[] = [];
  const current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  let added = 0;
  while (added < days) {
    const dow = current.getUTCDay();
    if (includesWeekends || (dow !== 0 && dow !== 6)) {
      const key = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`;
      dates.push(key);
      added++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
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
    distance: j.distance || (() => {
      const lat1 = Number(j.origin_lat ?? j.originLat ?? 0);
      const lng1 = Number(j.origin_lng ?? j.originLng ?? 0);
      const lat2 = Number(j.destination_lat ?? j.destinationLat ?? 0);
      const lng2 = Number(j.destination_lng ?? j.destinationLng ?? 0);
      if (!lat1 || !lng1 || !lat2 || !lng2) return 0;
      const R = 3958.8;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
    })(),
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
    paperworkDescription: j.paperwork_description ?? j.paperworkDescription ?? null,
    capacityNeeded: j.capacity_needed ?? j.capacityNeeded,
    totalTonsNeeded: j.total_tons_needed ?? j.totalTonsNeeded,
    createdAt: j.created_at ?? j.createdAt ?? '',
    projectName: j.project_name ?? j.projectName,
    estimatedDurationMinutes: j.estimated_duration_minutes ?? j.estimatedDurationMinutes ?? null,
    loadTimeMinutes: j.load_time_minutes ?? j.loadTimeMinutes ?? 10,
    unloadTimeMinutes: j.unload_time_minutes ?? j.unloadTimeMinutes ?? 10,
  };
}

export default function JobDetailScreen() {
  const { id, date: calendarDate } = useLocalSearchParams<{ id: string; date?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const isContractor = isContractorRole(user?.role || '');

  const { data: jobData, isLoading } = useQuery<any>({
    queryKey: [`/api/jobs/${id}`],
    enabled: !!id,
  });

  const job = jobData ? mapJob(jobData) : null;
  const isMyPostedJob = isContractor && job?.contractorId === user?.id;
  const myAssignments = (jobData?.assignments || []).filter((a: any) => a.driver_id === user?.id);
  const myAssignment = myAssignments[0] || null;
  const hasApplied = myAssignments.length > 0;
  const myAssignmentStatus = myAssignment?.status || null;

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
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showPaperworkInfo, setShowPaperworkInfo] = useState(false);
  const [showLoadsModal, setShowLoadsModal] = useState(false);
  const [loadsHauled, setLoadsHauled] = useState(1);
  const loadsScrollRef = useRef<ScrollView>(null);
  const [selectedDriver, setSelectedDriver] = useState<Assignment | null>(null);
  const [counterBidVisible, setCounterBidVisible] = useState(false);
  const [counterBidRate, setCounterBidRate] = useState('');
  const [counterBidNote, setCounterBidNote] = useState('');
  const [submittingBid, setSubmittingBid] = useState(false);
  const [truckSelectVisible, setTruckSelectVisible] = useState(false);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [selectedAvailableDays, setSelectedAvailableDays] = useState<number | null>(null);
  const [acceptingJob, setAcceptingJob] = useState(false);
  const [truckWarning, setTruckWarning] = useState<string | null>(null);
  const truckWarningTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [acceptBannerVisible, setAcceptBannerVisible] = useState(false);
  const [acceptBannerData, setAcceptBannerData] = useState<{ isFavorite: boolean; message: string } | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [weightTicketModalVisible, setWeightTicketModalVisible] = useState(false);
  const [uploadingTicket, setUploadingTicket] = useState(false);
  const [showTicketPrompt, setShowTicketPrompt] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [clockInError, setClockInError] = useState('');
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [showNextDayBanner, setShowNextDayBanner] = useState(false);
  const [nextDayDate, setNextDayDate] = useState<string>('');
  const [backingOut, setBackingOut] = useState(false);
  const [confirmBackOut, setConfirmBackOut] = useState(false);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);
  const [reassigningAssignmentId, setReassigningAssignmentId] = useState<string | null>(null);
  const [fleetTruckPickerVisible, setFleetTruckPickerVisible] = useState(false);
  const [pendingApproveAssignment, setPendingApproveAssignment] = useState<Assignment | null>(null);
  const [selectedFleetVehicleId, setSelectedFleetVehicleId] = useState<string | null>(null);
  const [approvingAssignment, setApprovingAssignment] = useState(false);
  const [fleetConflictsData, setFleetConflictsData] = useState<any>(null);
  const [loadingFleetData, setLoadingFleetData] = useState(false);
  const [confirmDeleteRunId, setConfirmDeleteRunId] = useState<string | null>(null);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [editingRun, setEditingRun] = useState<any>(null);
  const [editStartHour, setEditStartHour] = useState(0);
  const [editStartMinute, setEditStartMinute] = useState(0);
  const [editStartAmPm, setEditStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [editStartDate, setEditStartDate] = useState<Date>(new Date());
  const [editEndDate, setEditEndDate] = useState<Date>(new Date());
  const [editEndHour, setEditEndHour] = useState(0);
  const [editEndMinute, setEditEndMinute] = useState(0);
  const [editEndAmPm, setEditEndAmPm] = useState<'AM' | 'PM'>('AM');
  const [editLoads, setEditLoads] = useState(1);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState<'clock-in' | 'clock-out' | null>(null);
  const [pickerHour, setPickerHour] = useState(0);
  const [pickerMinute, setPickerMinute] = useState(0);
  const [pickerAmPm, setPickerAmPm] = useState<'AM' | 'PM'>('AM');
  const [pickerDateOffset, setPickerDateOffset] = useState(0);
  const [timeManuallyAdjusted, setTimeManuallyAdjusted] = useState(false);
  const pickerOriginalTime = useRef<{ hour: number; minute: number; amPm: 'AM' | 'PM' }>({ hour: 12, minute: 0, amPm: 'AM' });
  const hourScrollRef = useRef<ScrollView>(null);
  const minuteScrollRef = useRef<ScrollView>(null);

  const { data: vehiclesData } = useQuery<any[]>({
    queryKey: ['/api/vehicles'],
    enabled: truckSelectVisible,
  });
  const { data: conflictsData, refetch: refetchConflicts } = useQuery<any>({
    queryKey: [`/api/jobs/${id}/vehicle-conflicts`],
    enabled: truckSelectVisible && !!id,
    staleTime: 0,
    gcTime: 0,
  });
  const { data: fleetVehiclesData } = useQuery<any[]>({
    queryKey: ['/api/vehicles'],
    enabled: fleetTruckPickerVisible && isContractor,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const completedRunId = (jobData?.runs || []).find((r: any) => r.status === 'completed')?.id;
  const jobRequiresWeightTickets = job?.requiresWeightTickets === true;

  const { data: weightTicketsData } = useQuery<any[]>({
    queryKey: [`/api/jobs/${id}/weight-tickets`],
    enabled: !!id && jobRequiresWeightTickets,
  });

  const { data: favoritesData } = useQuery<any[]>({
    queryKey: ['/api/favorites'],
    enabled: isContractor,
  });

  const isFavoriteDriver = (driverId: string) => {
    return favoritesData?.some((f: any) => f.favoriteType === 'driver' && f.favoriteDriverId === driverId) || false;
  };
  const isFavoriteCompany = (companyName: string) => {
    if (!companyName) return false;
    return favoritesData?.some((f: any) => f.favoriteType === 'company' && f.favoriteCompanyName === companyName) || false;
  };
  const getFavoriteId = (type: 'driver' | 'company', value: string) => {
    if (!value) return null;
    const fav = favoritesData?.find((f: any) =>
      type === 'driver' ? (f.favoriteType === 'driver' && f.favoriteDriverId === value)
        : (f.favoriteType === 'company' && f.favoriteCompanyName === value)
    );
    return fav?.id || null;
  };

  async function doToggleFavorite(type: 'driver' | 'company', driverId?: string, companyName?: string) {
    try {
      const value = type === 'driver' ? driverId : companyName;
      const existingId = getFavoriteId(type, value || '');
      if (existingId) {
        await apiRequest('DELETE', `/api/favorites/${existingId}`);
      } else {
        await apiRequest('POST', '/api/favorites', {
          favoriteType: type,
          ...(type === 'driver' ? { favoriteDriverId: driverId } : { favoriteCompanyName: companyName }),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/favorites'] });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update favorite');
    }
  }

  function toggleFavorite(type: 'driver' | 'company', driverId?: string, companyName?: string, driverName?: string) {
    const value = type === 'driver' ? driverId : companyName;
    const existingId = getFavoriteId(type, value || '');
    doToggleFavorite(type, driverId, companyName);
  }

  useEffect(() => {
    if (job) {
      setJobStatus(job.status);
    }
  }, [job?.status]);

  const isSameLocalDay = (dateA: string | Date, dateB: string | Date) => {
    const a = new Date(dateA);
    const b = new Date(dateB);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  };

  const getRunsSecondsForDay = (referenceDate: Date) => {
    if (!jobData?.runs) return 0;
    return (jobData.runs as any[])
      .filter((r: any) => r.driver_id === user?.id && r.ended_at && isSameLocalDay(r.started_at || r.startedAt, referenceDate))
      .reduce((total: number, r: any) => {
        const start = new Date(r.started_at || r.startedAt).getTime();
        const end = new Date(r.ended_at || r.endedAt).getTime();
        return total + Math.floor((end - start) / 1000);
      }, 0);
  };

  const getCompletedRunsSeconds = () => {
    return getRunsSecondsForDay(new Date());
  };

  const getAllCompletedRunsSeconds = () => {
    if (!jobData?.runs) return 0;
    return (jobData.runs as any[])
      .filter((r: any) => r.driver_id === user?.id && r.ended_at)
      .reduce((total: number, r: any) => {
        const start = new Date(r.started_at || r.startedAt).getTime();
        const end = new Date(r.ended_at || r.endedAt).getTime();
        return total + Math.floor((end - start) / 1000);
      }, 0);
  };

  useEffect(() => {
    if (jobData?.runs && !isRunning) {
      const activeRun = (jobData.runs as any[]).find((r: any) => r.status === 'active' && !r.ended_at && !r.clock_out_time);
      if (activeRun && activeRun.driver_id === user?.id) {
        const activeStartDate = new Date(activeRun.started_at || activeRun.startedAt);
        const activeElapsed = Math.floor((Date.now() - activeStartDate.getTime()) / 1000);
        const sameDayCompleted = getRunsSecondsForDay(activeStartDate);
        setElapsedSeconds(sameDayCompleted + activeElapsed);
        setIsRunning(true);
      } else if (jobStatus === 'completed') {
        const completedTime = getAllCompletedRunsSeconds();
        if (completedTime > 0) setElapsedSeconds(completedTime);
      }
    }
  }, [jobData?.runs, user?.id]);

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

  const isUpcoming = (() => {
    if (!job.scheduledDate) return false;
    const raw = String(job.scheduledDate);
    const dateStr = raw.length >= 10 ? raw.substring(0, 10) : raw;
    const [y, m, d] = dateStr.split('-').map(Number);
    const startDate = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return startDate > today;
  })();
  const displayStatus = isUpcoming && (jobStatus === 'in_progress' || jobStatus === 'accepted') ? 'upcoming' : jobStatus;
  const statusColor = getStatusColor(displayStatus);
  const jobTypeColor = getJobTypeColor(job.jobType);
  const isMyJob = job.driverId === user?.id || (myAssignment && myAssignment.status === 'approved');
  const canAccept = (jobStatus === 'open' || jobStatus === 'pending' || jobStatus === 'accepted') && !hasApplied && !isContractor;
  const canStart = (jobStatus === 'accepted' || jobStatus === 'in_progress') && isMyJob;

  const clockInRestriction = (() => {
    if (!canStart || isRunning) return null;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayUTC = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

    if (job.scheduledDate) {
      const jobDates = getJobDateRange(
        String(job.scheduledDate),
        jobData?.listed_days || job.estimatedDays,
        jobData?.includes_weekends ?? false
      );
      const isTodayScheduled = jobDates.length === 0 || jobDates.includes(todayStr) || jobDates.includes(todayUTC);
      if (!isTodayScheduled) {
        if (calendarDate && jobDates.includes(calendarDate)) {
          const [y, m, d] = calendarDate.split('-').map(Number);
          const dt = new Date(y, m - 1, d);
          return `Available ${dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
        }
        const nextDate = jobDates.find(d => d > todayStr) || jobDates.find(d => d > todayUTC);
        if (nextDate) {
          const [y, m, d] = nextDate.split('-').map(Number);
          const dt = new Date(y, m - 1, d);
          return `Available ${dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
        }
        return 'Not a scheduled work day';
      }
    }

    if (job.pickupTime) {
      const [h, m] = job.pickupTime.split(':').map(Number);
      const jobStart = new Date(now);
      jobStart.setHours(h, m, 0, 0);
      const earliest = new Date(jobStart.getTime() - 30 * 60 * 1000);
      if (now < earliest) {
        const diff = Math.ceil((earliest.getTime() - now.getTime()) / 60000);
        const timeStr = jobStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        if (diff > 60) {
          return `Clock in opens at ${new Date(earliest.getTime()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
        }
        return `Clock in opens in ${diff} min (${timeStr} start)`;
      }
    }

    return null;
  })();

  function formatElapsed(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function getBilledMinutes(actualMinutes: number) {
    if (actualMinutes <= 60) return 60;
    const overFirst = actualMinutes - 60;
    const fullSegments = Math.floor(overFirst / 15);
    const remainder = overFirst % 15;
    const billedSegments = remainder >= 5 ? fullSegments + 1 : fullSegments;
    return 60 + billedSegments * 15;
  }

  async function handleApproveAssignment(assignmentId: string, skipTruckPicker?: boolean) {
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) return;

    if (isContractor && !skipTruckPicker) {
      setPendingApproveAssignment(assignment);
      setSelectedFleetVehicleId(assignment.vehicle?.id || null);
      setFleetConflictsData(null);
      setLoadingFleetData(true);
      setFleetTruckPickerVisible(true);

      try {
        const conflictRes = await apiRequest('GET', `/api/jobs/${id}/vehicle-conflicts`);
        const conflicts = await conflictRes.json();
        setFleetConflictsData(conflicts);
      } catch {
        setFleetConflictsData(null);
      }
      setLoadingFleetData(false);
      return;
    }

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

  function closeFleetPicker() {
    if (approvingAssignment) return;
    setFleetTruckPickerVisible(false);
    setPendingApproveAssignment(null);
    setSelectedFleetVehicleId(null);
    setFleetConflictsData(null);
    setLoadingFleetData(false);
  }

  async function handleFleetApprove() {
    if (!pendingApproveAssignment) return;

    setApprovingAssignment(true);
    try {
      await apiRequest('POST', `/api/jobs/${id}/assignments/${pendingApproveAssignment.id}/approve`, {});

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeFleetPicker();
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}/assignments`] });
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractor/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractor/calendar-capacity'] });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to approve driver');
    }
    setApprovingAssignment(false);
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

  async function handleMarkComplete() {
    const doComplete = async () => {
      try {
        const todayIso = new Date().toISOString();
        await apiRequest('PUT', `/api/jobs/${id}`, { status: 'completed', completed_date: todayIso });
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ predicate: (q) => {
          const key = q.queryKey.join('/');
          return key.includes('/api/jobs') || key.includes('/api/contractor');
        }});
        if (router.canGoBack()) router.back();
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to mark complete');
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Mark this job as completed? It will be moved to the completed section.')) {
        doComplete();
      }
      return;
    }
    Alert.alert('Mark Complete', 'Mark this job as completed? It will be moved to the completed section.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark Complete', onPress: doComplete },
    ]);
  }

  async function handleCancelJob() {
    const doCancel = async () => {
      try {
        await apiRequest('DELETE', `/api/jobs/${id}`);
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.removeQueries({ predicate: (q) => {
          const key = q.queryKey.join('/');
          return key.includes('/api/jobs') || key.includes('/api/contractor');
        }});
        if (router.canGoBack()) router.back(); else router.replace('/(tabs)' as any);
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to archive job');
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Cancel and archive this job? You can restore it later from the archived section.')) {
        doCancel();
      }
      return;
    }
    Alert.alert('Archive Job', 'Cancel and archive this job? You can restore it later from the archived section.', [
      { text: 'Keep Job', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: doCancel },
    ]);
  }

  function openTruckPicker() {
    setSelectedVehicleIds([]);
    setSelectedAvailableDays(null);
    setTruckWarning(null);
    setTruckSelectVisible(true);
    queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}/vehicle-conflicts`] });
  }

  function handleAccept() {
    const isWeekend = (jobData?.includes_weekends ?? (jobData as any)?.includesWeekends) === true;
    if (isWeekend) {
      Alert.alert(
        'Weekend work included',
        'This job includes work on weekends. Are you OK with working weekends?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes, accept', style: 'default', onPress: openTruckPicker },
        ],
      );
      return;
    }
    openTruckPicker();
  }

  async function handleConfirmAccept() {
    if (selectedVehicleIds.length === 0) {
      showTruckWarning('Please select at least one truck to assign to this job');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setAcceptingJob(true);
    try {
      if (reassigningAssignmentId) {
        await apiRequest('PUT', `/api/assignments/${reassigningAssignmentId}/vehicle`, {
          vehicleId: selectedVehicleIds[0],
        });
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTruckSelectVisible(false);
        setReassigningAssignmentId(null);
        queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
        queryClient.invalidateQueries({ queryKey: ['/api/calendar/jobs'] });
      } else {
        const res = await apiRequest('POST', `/api/jobs/${id}/accept`, {
          vehicleIds: selectedVehicleIds,
        });
        const result = await res.json();
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTruckSelectVisible(false);
        const wasAutoApproved = result.autoApproved ?? result.isFavorite ?? false;
        if (wasAutoApproved) {
          setJobStatus('accepted');
        }
        setAcceptBannerData({
          isFavorite: wasAutoApproved,
          message: result.message || (wasAutoApproved
            ? "You are assigned to this job!"
            : "The company has been notified."),
        });
        setAcceptBannerVisible(true);
        queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
        queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
        queryClient.invalidateQueries({ queryKey: ['/api/calendar/jobs'] });
      }
    } catch (e: any) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showTruckWarning(e.message || (reassigningAssignmentId ? 'Failed to reassign truck' : 'Failed to accept job'));
    }
    setAcceptingJob(false);
  }

  async function handleRemoveTruck(assignmentId: string) {
    setBackingOut(true);
    try {
      const res = await apiRequest('DELETE', `/api/jobs/${id}/assignments/${assignmentId}`);
      const result = await res.json();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRemovingAssignmentId(null);
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
      if (result.remainingAssignments === 0) {
        try {
          if (router.canGoBack()) { router.back(); return; }
        } catch {}
        router.replace('/(tabs)' as any);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to remove truck');
    }
    setBackingOut(false);
  }

  function handleBackOut() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setConfirmBackOut(true);
  }

  async function handleConfirmBackOut() {
    setBackingOut(true);
    try {
      await apiRequest('POST', `/api/jobs/${id}/withdraw`);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
      try {
        if (router.canGoBack()) { router.back(); return; }
      } catch {}
      router.replace('/(tabs)' as any);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to back out of job');
      setBackingOut(false);
      setConfirmBackOut(false);
    }
  }

  async function handleDeleteRun(runId: string) {
    setDeletingRunId(runId);
    try {
      await apiRequest('DELETE', `/api/job-runs/${runId}`);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to delete run. Please try again.');
    }
    setDeletingRunId(null);
    setConfirmDeleteRunId(null);
  }

  function openEditRun(run: any) {
    const start = new Date(run.started_at);
    let sH = start.getHours();
    const sM = start.getMinutes();
    const sAP = sH >= 12 ? 'PM' as const : 'AM' as const;
    sH = sH % 12 || 12;
    setEditStartHour(sH);
    setEditStartMinute(sM);
    setEditStartAmPm(sAP);
    setEditStartDate(new Date(start.getFullYear(), start.getMonth(), start.getDate()));
    if (run.ended_at) {
      const end = new Date(run.ended_at);
      let eH = end.getHours();
      const eM = end.getMinutes();
      const eAP = eH >= 12 ? 'PM' as const : 'AM' as const;
      eH = eH % 12 || 12;
      setEditEndHour(eH);
      setEditEndMinute(eM);
      setEditEndAmPm(eAP);
      setEditEndDate(new Date(end.getFullYear(), end.getMonth(), end.getDate()));
    }
    setEditLoads(run.loads_hauled || 1);
    setEditingRun(run);
  }

  async function handleSaveEditRun() {
    if (!editingRun) return;
    setSavingEdit(true);
    try {
      const startH24 = editStartAmPm === 'PM' ? (editStartHour === 12 ? 12 : editStartHour + 12) : (editStartHour === 12 ? 0 : editStartHour);
      const newStart = new Date(editStartDate.getFullYear(), editStartDate.getMonth(), editStartDate.getDate(), startH24, editStartMinute, 0, 0);

      const isActiveEdit = editingRun.status === 'active' && !editingRun.ended_at;
      let patchBody: any;
      if (!isActiveEdit) {
        const endH24 = editEndAmPm === 'PM' ? (editEndHour === 12 ? 12 : editEndHour + 12) : (editEndHour === 12 ? 0 : editEndHour);
        const newEnd = new Date(editEndDate.getFullYear(), editEndDate.getMonth(), editEndDate.getDate(), endH24, editEndMinute, 0, 0);

        if (newEnd.getTime() <= newStart.getTime()) {
          setSavingEdit(false);
          return;
        }
        patchBody = {
          started_at: newStart.toISOString(),
          ended_at: newEnd.toISOString(),
          loads_hauled: editLoads,
        };
      } else {
        if (newStart.getTime() > Date.now()) {
          setSavingEdit(false);
          return;
        }
        patchBody = {
          started_at: newStart.toISOString(),
        };
      }

      await apiRequest('PATCH', `/api/job-runs/${editingRun.id}`, patchBody);

      if (isActiveEdit) {
        const newElapsed = Math.max(0, Math.floor((Date.now() - newStart.getTime()) / 1000));
        const completedTime = getCompletedRunsSeconds();
        setElapsedSeconds(completedTime + newElapsed);
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      setEditingRun(null);
    } catch (e: any) {
      console.error('Edit run error:', e?.message || e);
    }
    setSavingEdit(false);
  }

  function showTruckWarning(msg: string) {
    if (truckWarningTimeout.current) clearTimeout(truckWarningTimeout.current);
    setTruckWarning(msg);
    truckWarningTimeout.current = setTimeout(() => setTruckWarning(null), 8000);
  }

  async function openRouteMap() {
    if (!job) return;
    const oLat = Number(job.originLat);
    const oLng = Number(job.originLng);
    const dLat = Number(job.destinationLat);
    const dLng = Number(job.destinationLng);
    if (!oLat && !oLng && !dLat && !dLng) {
      Alert.alert('No Coordinates', 'Location coordinates are not available for this job.');
      return;
    }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRouteCoords([]);
    setMapVisible(true);

    if (oLat && oLng && dLat && dLng) {
      try {
        const url = new URL('/api/directions/polyline', getApiUrl());
        url.searchParams.set('origin_lat', String(oLat));
        url.searchParams.set('origin_lng', String(oLng));
        url.searchParams.set('dest_lat', String(dLat));
        url.searchParams.set('dest_lng', String(dLng));
        const res = await fetch(url.toString(), { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.points && data.points.length > 0) {
            setRouteCoords(data.points.map((p: any) => ({ latitude: p.lat, longitude: p.lng })));
          }
        }
      } catch {
        setRouteCoords([]);
      }
    }
  }

  function openInMapsApp() {
    if (!job) return;
    const oLat = Number(job.originLat);
    const oLng = Number(job.originLng);
    const dLat = Number(job.destinationLat);
    const dLng = Number(job.destinationLng);
    const dest = dLat && dLng ? `${dLat},${dLng}` : `${oLat},${oLng}`;
    const origin = oLat && oLng ? `${oLat},${oLng}` : '';
    if (Platform.OS === 'ios') {
      Linking.openURL(`maps://?saddr=${origin}&daddr=${dest}`);
    } else if (Platform.OS === 'android') {
      Linking.openURL(`google.navigation:q=${dest}`);
    } else {
      Linking.openURL(`https://www.google.com/maps/dir/${origin}/${dest}`);
    }
  }

  function toggleVehicleSelection(vehicleId: string) {
    if (selectedVehicleIds.includes(vehicleId)) {
      setSelectedVehicleIds(prev => prev.filter(id => id !== vehicleId));
      setTruckWarning(null);
      return;
    }

    const vehicleConflict = conflictsData?.vehicleConflicts?.[vehicleId];
    if (vehicleConflict?.wrongType) {
      const requiredType = conflictsData?.requiredTruckType?.replace(/_/g, ' ') || 'matching';
      showTruckWarning(
        `This truck doesn't match the required type for this job. This job needs a ${requiredType} truck.`
      );
      return;
    }
    if (vehicleConflict?.lowCapacity) {
      showTruckWarning(
        `This truck doesn't have enough capacity. Job requires ${vehicleConflict.requiredTons}T minimum but this truck is rated at ${vehicleConflict.vehicleTons}T.`
      );
      return;
    }
    if (vehicleConflict?.blocked) {
      showTruckWarning(
        `This truck is already booked on ${vehicleConflict.conflictDates[0]} (${vehicleConflict.conflictJobs[0]}). It cannot be double-booked.`
      );
      return;
    }

    const vehicle = vehiclesData?.find((v: any) => v.id === vehicleId);
    if (vehicle && job) {
      const jobType = (job.truckType || '').toLowerCase().replace(/[\s_-]/g, '');
      const vType = (vehicle.truck_type || '').toLowerCase().replace(/[\s_-]/g, '');
      if (jobType && vType && jobType !== vType) {
        showTruckWarning(
          `This truck does not meet the requirements for this job. The job requires a ${formatTruckType(job.truckType)} but this truck is a ${formatTruckType(vehicle.truck_type)}.`
        );
      }
    }
    if (reassigningAssignmentId) {
      setSelectedVehicleIds([vehicleId]);
    } else {
      setSelectedVehicleIds(prev => [...prev, vehicleId]);
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

  async function getDriverLocation(): Promise<{ lat: number; lng: number }> {
    try {
      if (Platform.OS === 'web') {
        return await new Promise((resolve) => {
          if (!navigator.geolocation) return resolve({ lat: 0, lng: 0 });
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve({ lat: 0, lng: 0 }),
            { timeout: 10000, enableHighAccuracy: true }
          );
        });
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return { lat: 0, lng: 0 };
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch {
      return { lat: 0, lng: 0 };
    }
  }

  function openTimePicker(mode: 'clock-in' | 'clock-out') {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const amPm = h >= 12 ? 'PM' as const : 'AM' as const;
    setPickerHour(hour12);
    setPickerMinute(m);
    setPickerAmPm(amPm);
    setPickerDateOffset(0);
    setTimeManuallyAdjusted(false);
    pickerOriginalTime.current = { hour: hour12, minute: m, amPm };
    setShowTimePicker(mode);
    setTimeout(() => {
      hourScrollRef.current?.scrollTo({ y: (hour12 - 1) * 50, animated: false });
      minuteScrollRef.current?.scrollTo({ y: m * 50, animated: false });
    }, 100);
  }

  function getPickerDate(): Date {
    const now = new Date();
    const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + pickerDateOffset);
    let h24 = pickerAmPm === 'AM' ? (pickerHour === 12 ? 0 : pickerHour) : (pickerHour === 12 ? 12 : pickerHour + 12);
    const d = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), h24, pickerMinute, 0, 0);
    return d;
  }

  function isTimeAdjusted(): boolean {
    const orig = pickerOriginalTime.current;
    return pickerDateOffset !== 0 || pickerHour !== orig.hour || pickerMinute !== orig.minute || pickerAmPm !== orig.amPm;
  }

  async function handleStartJob() {
    openTimePicker('clock-in');
  }

  const CLOCK_OUT_REMINDER_ID = 'clock-out-reminder-6pm';

  async function scheduleClockOutReminder() {
    try {
      const N = await getNotif();
      if (!N) return;
      const { status } = await N.getPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await N.requestPermissionsAsync();
        if (newStatus !== 'granted') return;
      }
      await N.cancelScheduledNotificationAsync(CLOCK_OUT_REMINDER_ID).catch(() => {});
      const now = new Date();
      if (now.getHours() >= 18) return;
      const secondsUntil6pm = Math.max(61, Math.floor(
        (new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0).getTime() - now.getTime()) / 1000
      ));
      await N.scheduleNotificationAsync({
        identifier: CLOCK_OUT_REMINDER_ID,
        content: {
          title: 'Still on the clock?',
          body: 'It\'s 6 PM — don\'t forget to clock out if you\'re done for the day.',
          sound: true,
        },
        trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsUntil6pm },
      });
    } catch (e) {
    }
  }

  async function cancelClockOutReminder() {
    try {
      const N = await getNotif();
      if (!N) return;
      await N.cancelScheduledNotificationAsync(CLOCK_OUT_REMINDER_ID);
    } catch (e) {}
  }

  async function confirmClockIn() {
    setClockInError('');
    setShowTimePicker(null);
    try {
      const loc = await getDriverLocation();
      const adjusted = isTimeAdjusted();
      const body: any = { ...loc };
      if (adjusted) {
        body.custom_time = getPickerDate().toISOString();
        body.time_manually_entered = true;
      }
      await apiRequest('POST', `/api/jobs/${id}/clock-in`, body);
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const clockInTime = adjusted ? getPickerDate() : new Date();
      const initialElapsed = Math.max(0, Math.floor((Date.now() - clockInTime.getTime()) / 1000));
      setElapsedSeconds(initialElapsed);
      setJobStatus('in_progress');
      setIsRunning(true);
      scheduleClockOutReminder();
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
    } catch (e: any) {
      const msg = e.message || 'Failed to clock in';
      setClockInError(msg);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function handleResumeJob() {
    setShowResumeModal(false);
    openTimePicker('clock-in');
  }

  async function confirmResumeClockIn() {
    setClockInError('');
    setShowTimePicker(null);
    try {
      const loc = await getDriverLocation();
      const adjusted = isTimeAdjusted();
      const body: any = { ...loc };
      if (adjusted) {
        body.custom_time = getPickerDate().toISOString();
        body.time_manually_entered = true;
      }
      await apiRequest('POST', `/api/jobs/${id}/clock-in`, body);
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const completedTime = getCompletedRunsSeconds();
      const clockInTime = adjusted ? getPickerDate() : new Date();
      const activeElapsed = Math.max(0, Math.floor((Date.now() - clockInTime.getTime()) / 1000));
      setElapsedSeconds(completedTime + activeElapsed);
      setJobStatus('in_progress');
      setIsRunning(true);
      scheduleClockOutReminder();
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
    } catch (e: any) {
      const msg = e.message || 'Failed to resume job';
      setClockInError(msg);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  function handleStopJob() {
    openTimePicker('clock-out');
  }

  async function doStop() {
    try {
      cancelClockOutReminder();
      const runs = (jobData as any)?.runs;
      const activeRun = runs?.find?.((r: any) => !r.clock_out_time && !r.clockOutTime);
      if (activeRun) {
        const loc = await getDriverLocation();
        const body: any = { lat: loc.lat || 0, lng: loc.lng || 0, loads_hauled: loadsHauled };
        if (timeManuallyAdjusted) {
          body.custom_time = getPickerDate().toISOString();
          body.time_manually_entered = true;
        }
        await apiRequest('POST', `/api/job-runs/${activeRun.id}/clock-out`, body);
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsRunning(false);
      setJobStatus('completed');
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });

      const estDays = parseFloat(String(jobData?.estimated_days || jobData?.listed_days || '1')) || 1;
      if (estDays > 1 && jobData?.scheduled_date) {
        const scheduledDates = getJobDateRange(
          jobData.scheduled_date,
          jobData.listed_days || jobData.estimated_days,
          jobData.includes_weekends ?? false
        );
        const now = new Date();
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const todayIdx = scheduledDates.indexOf(todayKey);
        const nextScheduledDate = todayIdx >= 0 && todayIdx < scheduledDates.length - 1
          ? scheduledDates[todayIdx + 1]
          : null;
        if (nextScheduledDate) {
          const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
          const isTomorrow = nextScheduledDate === tomorrowKey;
          const nextDate = new Date(nextScheduledDate + 'T12:00:00');
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const label = isTomorrow ? dayNames[nextDate.getDay()] : `${dayNames[nextDate.getDay()]}, ${nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
          setNextDayDate(label);
          setTimeout(() => setShowNextDayBanner(true), jobRequiresWeightTickets ? 800 : 300);
        }
      }

      if (jobRequiresWeightTickets) {
        setTimeout(() => setShowTicketPrompt(true), 500);
      }
    } catch (e: any) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsRunning(false);
      setJobStatus('completed');
    }
  }

  async function pickWeightTicketPhoto(useCamera: boolean) {
    try {
      let result;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission Required', 'Camera access is needed to take weight ticket photos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          base64: true,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission Required', 'Photo library access is needed to select weight tickets.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          base64: true,
        });
      }

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setPreviewUri(asset.uri);
      setPreviewBase64(asset.base64 || null);
      setWeightTicketModalVisible(false);
    } catch (err) {
      console.error('Weight ticket pick error:', err);
      Alert.alert('Error', 'Failed to select photo. Please try again.');
    }
  }

  async function confirmAndUploadWeightTicket() {
    if (!previewBase64) return;
    const runId = completedRunId || (jobData?.runs || []).find((r: any) => r.status === 'completed' || r.status === 'active')?.id;
    if (!runId) {
      Alert.alert('Error', 'No job run found to attach this ticket to.');
      return;
    }
    try {
      setUploadingTicket(true);
      const imageBase64 = `data:image/jpeg;base64,${previewBase64}`;
      await apiRequest('POST', `/api/job-runs/${runId}/weight-tickets`, {
        image_base64: imageBase64,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}/weight-tickets`] });
      setShowTicketPrompt(false);
      setPreviewUri(null);
      setPreviewBase64(null);
      Alert.alert('Uploaded', 'Weight ticket uploaded successfully.');
    } catch (err) {
      console.error('Weight ticket upload error:', err);
      Alert.alert('Error', 'Failed to upload weight ticket. Please try again.');
    } finally {
      setUploadingTicket(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] }),
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}/assignments`] }),
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}/weight-tickets`] }),
    ]);
    setRefreshing(false);
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

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24 }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}>
        {(jobData?.includes_weekends ?? (jobData as any)?.includesWeekends) ? (
          <View style={styles.weekendBanner} testID="weekend-banner">
            <Ionicons name="warning" size={18} color="#001a00" />
            <Text style={styles.weekendBannerText}>WEEKEND WORK INCLUDED</Text>
          </View>
        ) : null}
        {isRunning && (() => {
          const allCompletedSeconds = getAllCompletedRunsSeconds();
          const activeRun = (jobData?.runs as any[])?.find((r: any) => r.status === 'active' && !r.ended_at);
          const activeStartDate = activeRun ? new Date(activeRun.started_at || activeRun.startedAt) : new Date();
          const activeRunningSeconds = activeRun ? Math.floor((Date.now() - activeStartDate.getTime()) / 1000) : 0;
          const sameDayCompletedSeconds = getRunsSecondsForDay(activeStartDate);
          const previousDaysSeconds = allCompletedSeconds - sameDayCompletedSeconds;
          const totalJobSeconds = allCompletedSeconds + activeRunningSeconds;
          const totalJobMinutes = Math.floor(totalJobSeconds / 60);
          const totalJobBilled = getBilledMinutes(totalJobMinutes);
          const showTotal = previousDaysSeconds > 0;
          return (
            <View style={styles.timerCard}>
              <Text style={styles.timerLabel}>TODAY'S TIMER</Text>
              <Text style={styles.timerDisplay}>{formatElapsed(elapsedSeconds)}</Text>
              <View style={styles.timerStats}>
                <View style={styles.timerStat}>
                  <Text style={styles.timerStatLabel}>Today</Text>
                  <Text style={styles.timerStatValue}>{actualMinutes} min</Text>
                </View>
                <View style={styles.timerStatDivider} />
                <View style={styles.timerStat}>
                  <Text style={styles.timerStatLabel}>Billed</Text>
                  <Text style={styles.timerStatValue}>{billedMinutes} min</Text>
                </View>
              </View>
              {showTotal && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary }}>
                    Total Job Time: {formatElapsed(totalJobSeconds)} ({totalJobBilled} min billed)
                  </Text>
                </View>
              )}
            </View>
          );
        })()}

        {jobStatus === 'completed' && elapsedSeconds > 0 && (
          <Pressable style={styles.completedCard} onPress={() => setShowResumeModal(true)}>
            <Ionicons name="checkmark-circle" size={32} color={Colors.success} />
            <Text style={styles.completedTitle}>JOB COMPLETED</Text>
            <Text style={styles.completedText}>
              Time worked: {formatElapsed(elapsedSeconds)} ({billedMinutes} min billed)
            </Text>
          </Pressable>
        )}

        {(() => {
          const allRuns = (jobData?.runs || []).filter((r: any) => r.status === 'completed' || r.status === 'active').sort((a: any, b: any) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
          if (allRuns.length === 0) return null;
          const completedRuns = allRuns.filter((r: any) => r.status === 'completed' && r.ended_at);
          const openLocationMap = (lat: number, lng: number) => {
            if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
            const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
            if (Platform.OS === 'ios') {
              const appleUrl = `https://maps.apple.com/?q=${lat},${lng}&ll=${lat},${lng}`;
              Linking.openURL(appleUrl).catch(() => {
                Linking.openURL(googleMapsUrl);
              });
            } else if (Platform.OS === 'android') {
              const geoUrl = `geo:${lat},${lng}?q=${lat},${lng}`;
              Linking.openURL(geoUrl).catch(() => {
                Linking.openURL(googleMapsUrl);
              });
            } else {
              Linking.openURL(googleMapsUrl);
            }
          };
          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>WORK SESSIONS</Text>
              {allRuns.map((run: any, idx: number) => {
                const startTime = new Date(run.started_at);
                const isActive = run.status === 'active' && !run.ended_at;
                const endTime = run.ended_at ? new Date(run.ended_at) : null;
                const createdAt = run.created_at ? new Date(run.created_at) : null;
                const updatedAt = run.updated_at ? new Date(run.updated_at) : null;
                const clockInManual = createdAt && Math.abs(startTime.getTime() - createdAt.getTime()) > 60000;
                const clockOutManual = !isActive && endTime && updatedAt
                  ? Math.abs(endTime.getTime() - updatedAt.getTime()) > 60000
                  : false;
                const clockOutSubmittedAt = clockOutManual ? updatedAt : null;
                const hasStartLoc = run.start_lat && run.start_lng && Number(run.start_lat) !== 0;
                const hasEndLoc = !isActive && run.end_lat && run.end_lng && Number(run.end_lat) !== 0;
                const duration = isActive ? 0 : (run.actual_duration_minutes || (endTime ? Math.round((endTime.getTime() - startTime.getTime()) / 60000) : 0));
                const hours = Math.floor(duration / 60);
                const mins = duration % 60;
                const isDriverOwner = run.driver_id === user?.id;
                const driverCompany = run.driver_company || run.driver_name || '';
                return (
                  <View key={run.id || idx} style={{ backgroundColor: isActive ? 'rgba(76,175,80,0.08)' : Colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: isActive ? 2 : 1, borderColor: isActive ? 'rgba(76,175,80,0.4)' : Colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 11, color: isActive ? Colors.success : Colors.textMuted, letterSpacing: 1 }}>
                          SESSION {idx + 1}
                        </Text>
                        {driverCompany ? (
                          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textSecondary }}>
                            — {driverCompany}
                          </Text>
                        ) : null}
                        {isActive && (
                          <View style={{ backgroundColor: 'rgba(76,175,80,0.2)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 9, color: Colors.success, letterSpacing: 0.5 }}>ACTIVE</Text>
                          </View>
                        )}
                      </View>
                      {isDriverOwner && !isContractor && (
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          <Pressable
                            onPress={() => openEditRun(run)}
                            hitSlop={8}
                            style={{ padding: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' }}
                          >
                            <Ionicons name="create-outline" size={16} color={Colors.textSecondary} />
                          </Pressable>
                          {!isActive && (
                            <Pressable
                              onPress={() => setConfirmDeleteRunId(run.id)}
                              hitSlop={8}
                              style={{ padding: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' }}
                            >
                              <Ionicons name="trash-outline" size={16} color={'#ef4444'} />
                            </Pressable>
                          )}
                        </View>
                      )}
                    </View>
                    {confirmDeleteRunId === run.id && (
                      <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#ef4444', marginBottom: 8 }}>Delete this session?</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable
                            onPress={() => setConfirmDeleteRunId(null)}
                            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}
                          >
                            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.text }}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleDeleteRun(run.id)}
                            disabled={deletingRunId === run.id}
                            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#ef4444', alignItems: 'center', opacity: deletingRunId === run.id ? 0.6 : 1 }}
                          >
                            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#fff' }}>
                              {deletingRunId === run.id ? 'Deleting...' : 'Delete'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                    {!isActive && (
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginBottom: 8 }}>
                        {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`} · {run.billed_duration_minutes || duration} min billed
                        {run.loads_hauled ? ` · ${run.loads_hauled} load${run.loads_hauled !== 1 ? 's' : ''}` : ''}
                      </Text>
                    )}
                    <Pressable onPress={isActive && isDriverOwner && !isContractor ? () => openEditRun(run) : undefined} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: isActive ? 0 : 6 }}>
                      <Ionicons name="log-in-outline" size={16} color={Colors.success} style={{ marginTop: 1, marginRight: 8 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 11, color: Colors.success, letterSpacing: 0.5 }}>CLOCK IN</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text }}>
                            {startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </Text>
                          {isActive && isDriverOwner && !isContractor && (
                            <Ionicons name="pencil" size={12} color={Colors.textMuted} />
                          )}
                        </View>
                        {clockInManual ? (
                          <Pressable
                            onPress={hasStartLoc ? () => openLocationMap(Number(run.start_lat), Number(run.start_lng)) : undefined}
                            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}
                          >
                            <Ionicons name="pencil" size={11} color={Colors.warning} />
                            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.warning, marginLeft: 3 }}>
                              Time manually entered at {createdAt!.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </Text>
                            {hasStartLoc && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6 }}>
                                <Ionicons name="location" size={11} color={Colors.info} />
                                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.info, marginLeft: 2, textDecorationLine: 'underline' }}>
                                  View location
                                </Text>
                              </View>
                            )}
                          </Pressable>
                        ) : null}
                        {!clockInManual && hasStartLoc ? (
                          <Pressable
                            onPress={() => openLocationMap(Number(run.start_lat), Number(run.start_lng))}
                            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}
                          >
                            <Ionicons name="location" size={13} color={Colors.info} />
                            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.info, marginLeft: 4, textDecorationLine: 'underline' }}>
                              View location
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </Pressable>
                    {isActive && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(76,175,80,0.2)' }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success, marginRight: 8 }} />
                        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.success }}>Currently working</Text>
                      </View>
                    )}
                    {!isActive && endTime && (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                        <Ionicons name="log-out-outline" size={16} color={Colors.primary} style={{ marginTop: 1, marginRight: 8 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 11, color: Colors.primary, letterSpacing: 0.5 }}>CLOCK OUT</Text>
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text }}>
                            {endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </Text>
                          {clockOutManual ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                              <Ionicons name="pencil" size={11} color={Colors.warning} />
                              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.warning, marginLeft: 3 }}>
                                Time manually entered{clockOutSubmittedAt ? ` at ${clockOutSubmittedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                              </Text>
                            </View>
                          ) : null}
                          {hasEndLoc ? (
                            <Pressable
                              onPress={() => openLocationMap(Number(run.end_lat), Number(run.end_lng))}
                              style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}
                            >
                              <Ionicons name="location" size={13} color={Colors.info} />
                              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.info, marginLeft: 4, textDecorationLine: 'underline' }}>
                                View location
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
              {(() => {
                const allSeconds = getAllCompletedRunsSeconds();
                if (allSeconds <= 0) return null;
                const allMinutes = Math.floor(allSeconds / 60);
                const allBilled = getBilledMinutes(allMinutes);
                const allHrs = Math.floor(allMinutes / 60);
                const allMins = allMinutes % 60;
                const totalLoads = completedRuns.reduce((sum: number, r: any) => sum + (r.loads_hauled || 0), 0);
                const dayGroups: Record<string, number> = {};
                for (const r of completedRuns) {
                  const d = new Date(r.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const start = new Date(r.started_at).getTime();
                  const end = new Date(r.ended_at).getTime();
                  dayGroups[d] = (dayGroups[d] || 0) + Math.floor((end - start) / 1000);
                }
                const dayCount = Object.keys(dayGroups).length;
                return (
                  <View style={{ backgroundColor: 'rgba(255,153,0,0.08)', borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,153,0,0.2)' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Ionicons name="stats-chart" size={14} color={Colors.primary} />
                      <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 12, color: Colors.primary, letterSpacing: 0.5 }}>TOTAL JOB SUMMARY</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text }}>{allHrs}h {allMins}m</Text>
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textSecondary }}>Total Time</Text>
                      </View>
                      <View style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text }}>{allBilled}</Text>
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textSecondary }}>Min Billed</Text>
                      </View>
                      <View style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text }}>{totalLoads}</Text>
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textSecondary }}>Loads</Text>
                      </View>
                      {dayCount > 1 && (
                        <View style={{ alignItems: 'center', flex: 1 }}>
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text }}>{dayCount}</Text>
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textSecondary }}>Days</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })()}
            </View>
          );
        })()}

        <View style={styles.headerSection}>
          {job.contractorName ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Ionicons name="business" size={18} color={Colors.primary} />
              <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 20, color: Colors.primary }}>{job.contractorName}</Text>
            </View>
          ) : null}
          {job.projectName && (
            <Text style={styles.projectName}>{job.projectName}</Text>
          )}
          <View style={styles.titleRow}>
            <Text style={styles.material}>{job.material}</Text>
          </View>
          {(job.requiresTarp || job.requiresWeightTickets || job.urgent) && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {job.requiresTarp && (
                <View style={styles.urgentBadge}>
                  <Ionicons name="shield-checkmark" size={12} color={Colors.primary} />
                  <Text style={styles.urgentText}>REQUIRES TARP</Text>
                </View>
              )}
              {job.requiresWeightTickets && (
                <View style={styles.urgentBadge}>
                  <Ionicons name="document-text" size={12} color={Colors.primary} />
                  <Text style={styles.urgentText}>WEIGHT TICKETS</Text>
                </View>
              )}
              {job.urgent && (
                <Pressable
                  style={styles.urgentBadge}
                  onPress={() => setShowPaperworkInfo(!showPaperworkInfo)}
                >
                  <Ionicons name="clipboard" size={12} color={Colors.primary} />
                  <Text style={styles.urgentText}>SPECIAL PAPERWORK</Text>
                  {job.paperworkDescription && (
                    <Ionicons name={showPaperworkInfo ? "chevron-up" : "chevron-down"} size={12} color={Colors.primary} />
                  )}
                </Pressable>
              )}
            </View>
          )}
          {showPaperworkInfo && job.urgent && job.paperworkDescription && (
            <View style={{ backgroundColor: Colors.primaryLight, borderRadius: 8, padding: 12, marginTop: 8 }}>
              <Text style={{ color: Colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 4 }}>
                Required Paperwork:
              </Text>
              <Text style={{ color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 }}>
                {job.paperworkDescription}
              </Text>
            </View>
          )}
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
            <Text style={[styles.badgeText, { color: statusColor.text }]}>{displayStatus.replace('_', ' ').toUpperCase()}</Text>
          </View>
          <View style={styles.badge}>
            <TruckIcon size={12} />
            <Text style={styles.badgeText}>{formatTruckType(job.truckType)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ROUTE</Text>
          <Pressable style={styles.routeCard} onPress={openRouteMap}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: Colors.success }]} />
              <View style={styles.routeTextBlock}>
                <Text style={styles.routeLabel}>PICKUP</Text>
                <Text style={styles.routeAddress}>{job.originAddress}</Text>
              </View>
              <Ionicons name="map-outline" size={18} color={Colors.textMuted} />
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
              <View style={styles.routeStatItem}>
                <Ionicons name="map" size={14} color={Colors.info} />
                <Text style={[styles.routeStatText, { color: Colors.info }]}>View Map</Text>
              </View>
            </View>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DETAILS</Text>
          <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
              <Ionicons name="calendar" size={16} color={Colors.textMuted} />
              <Text style={styles.detailLabel}>{(parseFloat(String(job.estimatedDays || '1')) || 1) > 1 ? 'Dates' : 'Date'}</Text>
              <Text style={styles.detailValue}>
                {(() => {
                  const raw = String(job.scheduledDate);
                  const dateStr = raw.length >= 10 ? raw.substring(0, 10) : raw;
                  const [y, m, d] = dateStr.split('-').map(Number);
                  const startDt = new Date(y, m - 1, d);
                  const estDays = parseFloat(String(job.estimatedDays || '1')) || 1;
                  if (estDays > 1) {
                    const includesWeekends = (jobData as any)?.includes_weekends ?? false;
                    const dates = getJobDateRange(dateStr, estDays, includesWeekends);
                    if (dates.length > 1) {
                      const lastDateStr = dates[dates.length - 1];
                      const [ey, em, ed] = lastDateStr.split('-').map(Number);
                      const endDt = new Date(ey, em - 1, ed);
                      const startFmt = startDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      const endFmt = endDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      return `${startFmt} – ${endFmt}`;
                    }
                  }
                  return startDt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                })()}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="time" size={16} color={Colors.textMuted} />
              <Text style={styles.detailLabel}>Pickup Time</Text>
              <Text style={styles.detailValue}>{job.pickupTime || '07:00'}</Text>
            </View>
            <View style={styles.detailItem}>
              <TruckIcon size={16} />
              <Text style={styles.detailLabel}>Trucks Needed</Text>
              <Text style={styles.detailValue}>{job.trucksNeeded}</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="scale" size={16} color={Colors.textMuted} />
              <Text style={styles.detailLabel}>Truck Capacity</Text>
              <Text style={styles.detailValue}>{job.capacityNeeded || 'Not specified'}</Text>
            </View>
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
            {(() => {
              const trips = Number(job.estimatedTrips) || 0;
              const dist = Number(job.distance) || 0;
              if (trips <= 0 || dist <= 0) return null;
              const oneWayDriveMin = (dist / 25) * 60;
              const loadMin = Number(job.loadTimeMinutes) || 10;
              const unloadMin = Number(job.unloadTimeMinutes) || 10;
              const roundTripMin = (oneWayDriveMin * 2) + loadMin + unloadMin;
              const totalHours = (roundTripMin * trips) / 60;
              return (
                <View style={styles.detailItem}>
                  <Ionicons name="hourglass" size={16} color={Colors.textMuted} />
                  <Text style={styles.detailLabel}>Est. Hours</Text>
                  <Text style={styles.detailValue}>{totalHours.toFixed(1)}</Text>
                </View>
              );
            })()}
          </View>
        </View>

        {(job.requiresTarp || job.requiresWeightTickets || job.urgent) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>REQUIREMENTS</Text>
          <View style={styles.reqRow}>
            {job.requiresTarp && (
              <View style={[styles.reqBadge, { backgroundColor: Colors.warningBg }]}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.warning} />
                <Text style={[styles.reqText, { color: Colors.warning }]}>Tarp Required</Text>
              </View>
            )}
            {job.requiresWeightTickets && (
              <View style={[styles.reqBadge, { backgroundColor: Colors.warningBg }]}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.warning} />
                <Text style={[styles.reqText, { color: Colors.warning }]}>Weight Tickets</Text>
              </View>
            )}
            {job.urgent && (
              <View style={[styles.reqBadge, { backgroundColor: Colors.warningBg }]}>
                <Ionicons name="clipboard" size={14} color={Colors.warning} />
                <Text style={[styles.reqText, { color: Colors.warning }]}>Special Paperwork</Text>
              </View>
            )}
          </View>
          {job.urgent && job.paperworkDescription && (
            <View style={{ backgroundColor: Colors.primaryLight, borderRadius: 8, padding: 12, marginTop: 10 }}>
              <Text style={{ color: Colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 4 }}>
                Required Paperwork:
              </Text>
              <Text style={{ color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 }}>
                {job.paperworkDescription}
              </Text>
            </View>
          )}
        </View>
        )}

        {jobRequiresWeightTickets && (jobStatus === 'completed' || (weightTicketsData && weightTicketsData.length > 0)) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>WEIGHT TICKETS ({weightTicketsData?.length || 0})</Text>
            {(weightTicketsData || []).map((ticket: any, idx: number) => (
              <View key={ticket.id} style={styles.weightTicketCard}>
                {ticket.image_data && (
                  <Image source={{ uri: ticket.image_data }} style={styles.weightTicketImage} resizeMode="cover" />
                )}
                <View style={styles.weightTicketInfo}>
                  <Text style={styles.weightTicketLabel}>Ticket #{idx + 1}</Text>
                  <Text style={styles.weightTicketDate}>
                    {new Date(ticket.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            ))}
            {!isContractor && completedRunId && (
              <Pressable
                style={styles.uploadTicketBtn}
                onPress={() => setWeightTicketModalVisible(true)}
              >
                <Ionicons name="camera" size={20} color={Colors.primary} />
                <Text style={styles.uploadTicketText}>Upload Weight Ticket</Text>
              </Pressable>
            )}
          </View>
        )}

        {showTicketPrompt && (
          <View style={styles.ticketPromptBanner}>
            <View style={styles.ticketPromptContent}>
              <Ionicons name="warning" size={24} color={Colors.warning} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.ticketPromptTitle}>Weight Tickets Required</Text>
                <Text style={styles.ticketPromptMsg}>Please upload weight tickets within 30 minutes.</Text>
              </View>
            </View>
            <View style={styles.ticketPromptActions}>
              <Pressable style={styles.ticketPromptUploadBtn} onPress={() => { setShowTicketPrompt(false); setWeightTicketModalVisible(true); }}>
                <Ionicons name="camera" size={18} color="#fff" />
                <Text style={styles.ticketPromptUploadText}>Upload Now</Text>
              </Pressable>
              <Pressable style={styles.ticketPromptLaterBtn} onPress={() => setShowTicketPrompt(false)}>
                <Text style={styles.ticketPromptLaterText}>Later</Text>
              </Pressable>
            </View>
          </View>
        )}

        {showNextDayBanner && (
          <View style={styles.nextDayBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={styles.nextDayIcon}>
                <Ionicons name="calendar" size={22} color={Colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.nextDayTitle}>BACK AT IT SOON</Text>
                <Text style={styles.nextDayMsg}>You're scheduled for this same job on {nextDayDate}. See you then!</Text>
              </View>
            </View>
            <Pressable onPress={() => setShowNextDayBanner(false)} hitSlop={12} style={{ padding: 4, marginLeft: 8 }}>
              <Ionicons name="close" size={20} color={Colors.textMuted} />
            </Pressable>
          </View>
        )}

        <Modal visible={!!showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(null)}>
          <View style={styles.wtModalOverlay}>
            <View style={[styles.wtModalContent, { alignItems: 'center', paddingTop: 24, paddingBottom: 24 }]} onStartShouldSetResponder={() => true}>
              <Ionicons name={showTimePicker === 'clock-in' ? 'play-circle' : 'stop-circle'} size={48} color={showTimePicker === 'clock-in' ? Colors.success : Colors.destructive} />
              <Text style={[styles.wtModalTitle, { marginTop: 12 }]}>
                {showTimePicker === 'clock-in' ? 'Clock In Time' : 'Clock Out Time'}
              </Text>
              <Text style={[styles.wtModalSubtitle, { textAlign: 'center', marginBottom: 16 }]}>
                Adjust time if needed, or confirm current time
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: Colors.textMuted, fontSize: 10, fontFamily: 'ChakraPetch_700Bold', letterSpacing: 0.5, marginBottom: 4 }}>HOUR</Text>
                  <View style={styles.loadsPickerContainer}>
                    <ScrollView
                      ref={hourScrollRef}
                      style={[styles.loadsScroller, { width: 70 }]}
                      contentContainerStyle={styles.loadsScrollContent}
                      showsVerticalScrollIndicator={false}
                      snapToInterval={50}
                      decelerationRate="fast"
                      onMomentumScrollEnd={(e) => {
                        const idx = Math.round(e.nativeEvent.contentOffset.y / 50);
                        setPickerHour(Math.max(1, Math.min(12, idx + 1)));
                        setTimeManuallyAdjusted(true);
                      }}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                        <Pressable key={num} style={styles.loadsItem} onPress={() => { setPickerHour(num); setTimeManuallyAdjusted(true); }}>
                          <Text style={[styles.loadsItemText, num === pickerHour && styles.loadsItemTextSelected]}>{num}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <View style={styles.loadsHighlight} pointerEvents="none" />
                  </View>
                </View>
                <Text style={{ fontSize: 28, color: Colors.text, fontFamily: 'ChakraPetch_700Bold', marginTop: 18 }}>:</Text>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: Colors.textMuted, fontSize: 10, fontFamily: 'ChakraPetch_700Bold', letterSpacing: 0.5, marginBottom: 4 }}>MIN</Text>
                  <View style={styles.loadsPickerContainer}>
                    <ScrollView
                      ref={minuteScrollRef}
                      style={[styles.loadsScroller, { width: 70 }]}
                      contentContainerStyle={styles.loadsScrollContent}
                      showsVerticalScrollIndicator={false}
                      snapToInterval={50}
                      decelerationRate="fast"
                      onMomentumScrollEnd={(e) => {
                        const idx = Math.round(e.nativeEvent.contentOffset.y / 50);
                        setPickerMinute(Math.max(0, Math.min(59, idx)));
                        setTimeManuallyAdjusted(true);
                      }}
                    >
                      {Array.from({ length: 60 }, (_, i) => i).map((num) => (
                        <Pressable key={num} style={styles.loadsItem} onPress={() => { setPickerMinute(num); setTimeManuallyAdjusted(true); }}>
                          <Text style={[styles.loadsItemText, num === pickerMinute && styles.loadsItemTextSelected]}>{String(num).padStart(2, '0')}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <View style={styles.loadsHighlight} pointerEvents="none" />
                  </View>
                </View>
                <View style={{ alignItems: 'center', marginLeft: 4 }}>
                  <Text style={{ color: Colors.textMuted, fontSize: 10, fontFamily: 'ChakraPetch_700Bold', letterSpacing: 0.5, marginBottom: 4 }}> </Text>
                  <View style={{ gap: 6, marginTop: 18 }}>
                    <Pressable
                      style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: pickerAmPm === 'AM' ? Colors.primary : Colors.card, borderWidth: 1, borderColor: pickerAmPm === 'AM' ? Colors.primary : Colors.border }}
                      onPress={() => { setPickerAmPm('AM'); setTimeManuallyAdjusted(true); }}
                    >
                      <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 14, color: pickerAmPm === 'AM' ? '#fff' : Colors.textMuted }}>AM</Text>
                    </Pressable>
                    <Pressable
                      style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: pickerAmPm === 'PM' ? Colors.primary : Colors.card, borderWidth: 1, borderColor: pickerAmPm === 'PM' ? Colors.primary : Colors.border }}
                      onPress={() => { setPickerAmPm('PM'); setTimeManuallyAdjusted(true); }}
                    >
                      <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 14, color: pickerAmPm === 'PM' ? '#fff' : Colors.textMuted }}>PM</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
              {showTimePicker === 'clock-out' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, width: '100%', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 10, color: Colors.textMuted, letterSpacing: 0.5, marginRight: 4 }}>DATE</Text>
                  {[
                    { offset: -2, label: (() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })() },
                    { offset: -1, label: 'Yesterday' },
                    { offset: 0, label: 'Today' },
                  ].map((item) => (
                    <Pressable
                      key={item.offset}
                      onPress={() => { setPickerDateOffset(item.offset); if (item.offset !== 0) setTimeManuallyAdjusted(true); }}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                        backgroundColor: pickerDateOffset === item.offset ? Colors.primary : Colors.card,
                        borderWidth: 1, borderColor: pickerDateOffset === item.offset ? Colors.primary : Colors.border,
                      }}
                    >
                      <Text style={{
                        fontFamily: 'Inter_600SemiBold', fontSize: 12,
                        color: pickerDateOffset === item.offset ? '#fff' : Colors.textMuted,
                      }}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {isTimeAdjusted() && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, backgroundColor: 'rgba(245,158,11,0.12)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                  <Ionicons name="time-outline" size={14} color={Colors.warning} />
                  <Text style={{ color: Colors.warning, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                    {pickerDateOffset !== 0
                      ? `Time & date manually adjusted`
                      : 'Time manually adjusted'}
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                <Pressable
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}
                  onPress={() => setShowTimePicker(null)}
                >
                  <Text style={{ color: Colors.text, fontFamily: 'ChakraPetch_700Bold', fontSize: 14 }}>CANCEL</Text>
                </Pressable>
                <Pressable
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: showTimePicker === 'clock-in' ? Colors.success : Colors.destructive, alignItems: 'center' }}
                  onPress={() => {
                    setTimeManuallyAdjusted(isTimeAdjusted());
                    if (showTimePicker === 'clock-in') {
                      confirmClockIn();
                    } else {
                      setShowTimePicker(null);
                      setShowLoadsModal(true);
                    }
                  }}
                >
                  <Text style={{ color: '#fff', fontFamily: 'ChakraPetch_700Bold', fontSize: 14 }}>
                    {showTimePicker === 'clock-in' ? 'CLOCK IN' : 'NEXT'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={!!editingRun} transparent animationType="fade" onRequestClose={() => setEditingRun(null)}>
          <View style={styles.wtModalOverlay}>
            <View style={[styles.wtModalContent, { paddingTop: 20, paddingBottom: 20 }]} onStartShouldSetResponder={() => true}>
              <Text style={[styles.wtModalTitle, { marginBottom: 16 }]}>{editingRun?.ended_at ? 'Edit Session' : 'Adjust Clock In Time'}</Text>
              <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 11, color: Colors.success, letterSpacing: 0.5, marginBottom: 6 }}>CLOCK IN TIME</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                {[
                  { offset: -2, label: (() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })() },
                  { offset: -1, label: 'Yesterday' },
                  { offset: 0, label: 'Today' },
                ].map((item) => {
                  const d = new Date(); d.setDate(d.getDate() + item.offset);
                  const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                  const isSelected = editStartDate.getTime() === itemDate.getTime();
                  return (
                    <Pressable key={item.offset} onPress={() => setEditStartDate(itemDate)}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isSelected ? Colors.success : Colors.background, borderWidth: 1, borderColor: isSelected ? Colors.success : Colors.border }}>
                      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 10, color: isSelected ? '#fff' : Colors.textMuted }}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border }}>
                  <Pressable onPress={() => setEditStartHour(h => h >= 12 ? 1 : h + 1)} style={{ padding: 8 }}>
                    <Ionicons name="chevron-up" size={16} color={Colors.text} />
                  </Pressable>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.text, minWidth: 24, textAlign: 'center' }}>{editStartHour}</Text>
                  <Pressable onPress={() => setEditStartHour(h => h <= 1 ? 12 : h - 1)} style={{ padding: 8 }}>
                    <Ionicons name="chevron-down" size={16} color={Colors.text} />
                  </Pressable>
                </View>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text }}>:</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border }}>
                  <Pressable onPress={() => setEditStartMinute(m => m >= 59 ? 0 : m + 1)} style={{ padding: 8 }}>
                    <Ionicons name="chevron-up" size={16} color={Colors.text} />
                  </Pressable>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.text, minWidth: 24, textAlign: 'center' }}>{editStartMinute.toString().padStart(2, '0')}</Text>
                  <Pressable onPress={() => setEditStartMinute(m => m <= 0 ? 59 : m - 1)} style={{ padding: 8 }}>
                    <Ionicons name="chevron-down" size={16} color={Colors.text} />
                  </Pressable>
                </View>
                <Pressable onPress={() => setEditStartAmPm(v => v === 'AM' ? 'PM' : 'AM')} style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary }}>{editStartAmPm}</Text>
                </Pressable>
              </View>
              {editingRun?.ended_at && (
                <>
                  <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 11, color: Colors.primary, letterSpacing: 0.5, marginBottom: 6 }}>CLOCK OUT TIME</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                    {[
                      { offset: -2, label: (() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })() },
                      { offset: -1, label: 'Yesterday' },
                      { offset: 0, label: 'Today' },
                    ].map((item) => {
                      const d = new Date(); d.setDate(d.getDate() + item.offset);
                      const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                      const isSelected = editEndDate.getTime() === itemDate.getTime();
                      return (
                        <Pressable key={item.offset} onPress={() => setEditEndDate(itemDate)}
                          style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isSelected ? Colors.primary : Colors.background, borderWidth: 1, borderColor: isSelected ? Colors.primary : Colors.border }}>
                          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 10, color: isSelected ? '#fff' : Colors.textMuted }}>{item.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border }}>
                      <Pressable onPress={() => setEditEndHour(h => h >= 12 ? 1 : h + 1)} style={{ padding: 8 }}>
                        <Ionicons name="chevron-up" size={16} color={Colors.text} />
                      </Pressable>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.text, minWidth: 24, textAlign: 'center' }}>{editEndHour}</Text>
                      <Pressable onPress={() => setEditEndHour(h => h <= 1 ? 12 : h - 1)} style={{ padding: 8 }}>
                        <Ionicons name="chevron-down" size={16} color={Colors.text} />
                      </Pressable>
                    </View>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text }}>:</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border }}>
                      <Pressable onPress={() => setEditEndMinute(m => m >= 59 ? 0 : m + 1)} style={{ padding: 8 }}>
                        <Ionicons name="chevron-up" size={16} color={Colors.text} />
                      </Pressable>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.text, minWidth: 24, textAlign: 'center' }}>{editEndMinute.toString().padStart(2, '0')}</Text>
                      <Pressable onPress={() => setEditEndMinute(m => m <= 0 ? 59 : m - 1)} style={{ padding: 8 }}>
                        <Ionicons name="chevron-down" size={16} color={Colors.text} />
                      </Pressable>
                    </View>
                    <Pressable onPress={() => setEditEndAmPm(v => v === 'AM' ? 'PM' : 'AM')} style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border }}>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary }}>{editEndAmPm}</Text>
                    </Pressable>
                  </View>
                  <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 11, color: Colors.textSecondary, letterSpacing: 0.5, marginBottom: 6 }}>LOADS HAULED</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <Pressable onPress={() => setEditLoads(l => Math.max(0, l - 1))} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="remove" size={18} color={Colors.text} />
                    </Pressable>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.text, minWidth: 30, textAlign: 'center' }}>{editLoads}</Text>
                    <Pressable onPress={() => setEditLoads(l => l + 1)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="add" size={18} color={Colors.text} />
                    </Pressable>
                  </View>
                </>
              )}
              {!editingRun?.ended_at && <View style={{ height: 20 }} />}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => setEditingRun(null)} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text }}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSaveEditRun} disabled={savingEdit} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center', opacity: savingEdit ? 0.6 : 1 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#000' }}>{savingEdit ? 'Saving...' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showLoadsModal} transparent animationType="fade" onRequestClose={() => setShowLoadsModal(false)}>
          <View style={styles.wtModalOverlay}>
            <View style={[styles.wtModalContent, { alignItems: 'center', paddingTop: 24, paddingBottom: 24 }]} onStartShouldSetResponder={() => true}>
              <Ionicons name="cube-outline" size={48} color={Colors.primary} />
              <Text style={[styles.wtModalTitle, { marginTop: 12 }]}>How Many Loads?</Text>
              <Text style={[styles.wtModalSubtitle, { textAlign: 'center', marginBottom: 16 }]}>
                How many loads did you haul this session?
              </Text>
              <View style={styles.loadsPickerContainer}>
                <ScrollView
                  ref={loadsScrollRef}
                  style={styles.loadsScroller}
                  contentContainerStyle={styles.loadsScrollContent}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={50}
                  decelerationRate="fast"
                  onMomentumScrollEnd={(e) => {
                    const idx = Math.round(e.nativeEvent.contentOffset.y / 50);
                    setLoadsHauled(Math.max(1, Math.min(100, idx + 1)));
                  }}
                  onLayout={() => {
                    if (loadsScrollRef.current) {
                      loadsScrollRef.current.scrollTo({ y: (loadsHauled - 1) * 50, animated: false });
                    }
                  }}
                >
                  {Array.from({ length: 100 }, (_, i) => i + 1).map((num) => (
                    <Pressable
                      key={num}
                      style={styles.loadsItem}
                      onPress={() => {
                        setLoadsHauled(num);
                        loadsScrollRef.current?.scrollTo({ y: (num - 1) * 50, animated: true });
                      }}
                    >
                      <Text style={[
                        styles.loadsItemText,
                        num === loadsHauled && styles.loadsItemTextSelected
                      ]}>{num}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.loadsHighlight} pointerEvents="none" />
              </View>
              <Text style={{ color: '#aaa', fontSize: 13, marginTop: 8, marginBottom: 16 }}>
                {loadsHauled} {loadsHauled === 1 ? 'load' : 'loads'} selected
              </Text>
              <Pressable
                style={[styles.ticketPromptUploadBtn, { width: '100%', paddingVertical: 16, borderRadius: 12, backgroundColor: Colors.primary }]}
                onPress={() => {
                  setShowLoadsModal(false);
                  doStop();
                }}
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 8, fontFamily: 'ChakraPetch_700Bold' }}>OK</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={showResumeModal} transparent animationType="fade" onRequestClose={() => setShowResumeModal(false)}>
          <Pressable style={styles.wtModalOverlay} onPress={() => setShowResumeModal(false)}>
            <View style={[styles.wtModalContent, { alignItems: 'center', paddingTop: 20 }]} onStartShouldSetResponder={() => true}>
              <Pressable style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }} onPress={() => setShowResumeModal(false)}>
                <Ionicons name="close" size={24} color="#999" />
              </Pressable>
              <Ionicons name="time-outline" size={48} color={Colors.primary} />
              <Text style={[styles.wtModalTitle, { marginTop: 12 }]}>Resume This Job?</Text>
              <Text style={[styles.wtModalSubtitle, { textAlign: 'center', marginBottom: 20 }]}>
                The clock will continue from where you left off ({formatElapsed(elapsedSeconds)}).
              </Text>
              <Pressable
                style={[styles.ticketPromptUploadBtn, { width: '100%', paddingVertical: 16, borderRadius: 12, backgroundColor: Colors.success }]}
                onPress={handleResumeJob}
              >
                <Ionicons name="play" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 8, fontFamily: 'ChakraPetch_700Bold' }}>Continue Work</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        <Modal visible={weightTicketModalVisible} transparent animationType="fade" onRequestClose={() => setWeightTicketModalVisible(false)}>
          <Pressable style={styles.wtModalOverlay} onPress={() => setWeightTicketModalVisible(false)}>
            <View style={styles.wtModalContent} onStartShouldSetResponder={() => true}>
              <Text style={styles.wtModalTitle}>Upload Weight Ticket</Text>
              <Text style={styles.wtModalSubtitle}>Take a photo or choose from your library</Text>
              <View style={styles.wtModalButtons}>
                <Pressable style={styles.wtModalBtn} onPress={() => pickWeightTicketPhoto(true)}>
                  <Ionicons name="camera" size={32} color={Colors.primary} />
                  <Text style={styles.wtModalBtnText}>Take Photo</Text>
                </Pressable>
                <Pressable style={styles.wtModalBtn} onPress={() => pickWeightTicketPhoto(false)}>
                  <Ionicons name="images" size={32} color={Colors.primary} />
                  <Text style={styles.wtModalBtnText}>Choose Photo</Text>
                </Pressable>
              </View>
              <Pressable style={styles.wtModalCancel} onPress={() => setWeightTicketModalVisible(false)}>
                <Text style={styles.wtModalCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        <Modal visible={!!previewUri} transparent animationType="fade" onRequestClose={() => { setPreviewUri(null); setPreviewBase64(null); }}>
          <View style={styles.wtModalOverlay}>
            <View style={styles.previewModalContent}>
              <Text style={styles.wtModalTitle}>Review Photo</Text>
              <Text style={styles.wtModalSubtitle}>Is this photo clear and readable?</Text>
              {previewUri && (
                <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
              )}
              {uploadingTicket ? (
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={[styles.wtModalSubtitle, { marginTop: 8 }]}>Uploading...</Text>
                </View>
              ) : (
                <View style={styles.previewActions}>
                  <Pressable style={styles.previewConfirmBtn} onPress={confirmAndUploadWeightTicket}>
                    <Ionicons name="checkmark-circle" size={22} color="#fff" />
                    <Text style={styles.previewConfirmText}>Looks Good</Text>
                  </Pressable>
                  <Pressable style={styles.previewRetakeBtn} onPress={() => { setPreviewUri(null); setPreviewBase64(null); setWeightTicketModalVisible(true); }}>
                    <Ionicons name="refresh" size={20} color={Colors.primary} />
                    <Text style={styles.previewRetakeText}>Retake</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </Modal>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>POSTED BY</Text>
          <View style={styles.contractorCard}>
            <View style={styles.contractorAvatar}>
              <Text style={styles.contractorAvatarText}>{job.contractorName.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contractorName}>{job.contractorName}</Text>
              <Text style={styles.contractorCompany}>{job.contractorCompany}</Text>
            </View>
            {myAssignments.some((a: any) => a.status === 'approved') && (
              <Pressable
                style={styles.contractorMsgBtn}
                onPress={() => router.push(`/chat/${id}`)}
              >
                <Ionicons name="chatbubble-ellipses" size={20} color={Colors.primary} />
              </Pressable>
            )}
          </View>
        </View>

        {isMyPostedJob && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DRIVER APPLICATIONS ({assignments.length})</Text>
            {assignments.length > 0 ? (
              <>
                {approvedAssignments.map(a => {
                  const companyName = a.truckingCompanyName || a.driverCompany || '';
                  const displayName = companyName || a.driverName;
                  const capacity = a.vehicle?.maxCapacityTons;
                  return (
                  <Pressable key={a.id} style={[styles.assignmentCard, { borderColor: 'rgba(34, 197, 94, 0.3)' }]} onPress={() => setSelectedDriver(a)}>
                    <View style={styles.assignmentInfo}>
                      <View style={[styles.driverAvatar, { borderColor: Colors.success }]}>
                        <Text style={[styles.driverAvatarText, { color: Colors.success }]}>{displayName.charAt(0)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.driverNameText}>{displayName}</Text>
                        <View style={styles.driverMeta}>
                          <View style={styles.driverMetaItem}>
                            <Ionicons name="person" size={12} color={Colors.textMuted} />
                            <Text style={styles.driverMetaText}>{a.driverName}{capacity ? ` · ${capacity}T` : ''}</Text>
                          </View>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ marginRight: 4 }} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      <View style={[styles.badge, { backgroundColor: Colors.successBg }]}>
                        <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                        <Text style={[styles.badgeText, { color: Colors.success }]}>APPROVED</Text>
                      </View>
                    </View>
                  </Pressable>
                  );
                })}
                {pendingAssignments.map(a => {
                  const companyName = a.truckingCompanyName || a.driverCompany || '';
                  const displayName = companyName || a.driverName;
                  const capacity = a.vehicle?.maxCapacityTons;
                  return (
                  <Pressable key={a.id} style={styles.assignmentCard} onPress={() => setSelectedDriver(a)}>
                    <View style={styles.assignmentInfo}>
                      <View style={styles.driverAvatar}>
                        <Text style={styles.driverAvatarText}>{displayName.charAt(0)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.driverNameText}>{displayName}</Text>
                        <View style={styles.driverMeta}>
                          <View style={styles.driverMetaItem}>
                            <Ionicons name="person" size={12} color={Colors.textMuted} />
                            <Text style={styles.driverMetaText}>{a.driverName}{capacity ? ` · ${capacity}T` : ''}</Text>
                          </View>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ marginRight: 4 }} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
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
                    </View>
                  </Pressable>
                  );
                })}
              </>
            ) : (
              <View style={styles.noAssignments}>
                <Ionicons name="person-outline" size={24} color={Colors.textMuted} />
                <Text style={styles.noAssignmentsText}>No driver applications yet</Text>
              </View>
            )}
          </View>
        )}

        {isMyPostedJob && jobStatus !== 'completed' && jobStatus !== 'cancelled' && (
          <View style={{ gap: 10, marginHorizontal: 16, marginTop: 10 }}>
            <Pressable
              style={({ pressed }) => [styles.completeJobBtn, pressed && { opacity: 0.85 }]}
              onPress={handleMarkComplete}
            >
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={styles.completeJobBtnText}>MARK JOB COMPLETED</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.editJobBtn, pressed && { opacity: 0.85 }]}
              onPress={() => router.push(`/edit-job/${id}`)}
            >
              <Ionicons name="create-outline" size={20} color={Colors.primary} />
              <Text style={styles.editJobBtnText}>EDIT JOB</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.cancelJobBtn, pressed && { opacity: 0.85 }]}
              onPress={handleCancelJob}
            >
              <Ionicons name="close-circle" size={20} color={Colors.destructive} />
              <Text style={styles.cancelJobBtnText}>ARCHIVE JOB</Text>
            </Pressable>
          </View>
        )}

        {hasApplied && !isContractor && (
          <View style={{ marginHorizontal: 16, gap: 8 }}>
            <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 12, color: Colors.textSecondary, letterSpacing: 1, marginBottom: 4 }}>
              YOUR TRUCKS ({myAssignments.length})
            </Text>
            {myAssignments.map((a: any) => {
              const isApproved = a.status === 'approved' || a.status === 'accepted';
              const truckLabel = a.vehicle
                ? `${a.vehicle.truck_number ? '#' + a.vehicle.truck_number + ' — ' : ''}${[a.vehicle.year, a.vehicle.make, a.vehicle.model].filter(Boolean).join(' ')}`
                : 'No truck assigned';
              const truckType = a.vehicle?.truck_type?.replace(/_/g, ' ') || '';
              return (
                <Pressable
                  key={a.id}
                  onPress={() => {
                    if (jobStatus === 'completed' || jobStatus === 'cancelled' || isRunning) return;
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setReassigningAssignmentId(a.id);
                    setSelectedVehicleIds(a.vehicle_id ? [a.vehicle_id] : []);
                    setTruckSelectVisible(true);
                    refetchConflicts();
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: isApproved ? 'rgba(34,197,94,0.08)' : 'rgba(255,153,0,0.08)',
                    borderRadius: 12, padding: 12,
                    borderWidth: 1,
                    borderColor: isApproved ? 'rgba(34,197,94,0.25)' : 'rgba(255,153,0,0.25)',
                    opacity: pressed ? 0.85 : 1,
                  })}>
                  <Ionicons
                    name={isApproved ? "checkmark-circle" : "time"}
                    size={20}
                    color={isApproved ? Colors.success : Colors.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 13, color: Colors.text }}>
                      {truckLabel}
                    </Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, marginTop: 1 }}>
                      {isApproved ? 'Confirmed' : 'Pending approval'}{truckType ? ` · ${truckType}` : ''}
                      {jobStatus !== 'completed' && jobStatus !== 'cancelled' && !isRunning ? '  ·  Tap to reassign' : ''}
                    </Text>
                  </View>
                  {jobStatus !== 'completed' && jobStatus !== 'cancelled' && !isRunning && (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setRemovingAssignmentId(a.id);
                      }}
                      style={({ pressed }) => ({
                        padding: 8, borderRadius: 8,
                        backgroundColor: removingAssignmentId === a.id ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Ionicons name="close-circle" size={20} color="#ef4444" />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
            {job && myAssignments.length < (job.trucksNeeded || 1) && jobStatus !== 'completed' && jobStatus !== 'cancelled' && !isRunning && (
              <Pressable
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: 'rgba(255,153,0,0.1)',
                  borderWidth: 1, borderColor: 'rgba(255,153,0,0.3)', borderStyle: 'dashed' as const,
                  borderRadius: 12, padding: 14, marginTop: 4,
                  opacity: pressed ? 0.8 : 1,
                })}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleAccept();
                }}
              >
                <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
                <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 13, color: Colors.primary, letterSpacing: 0.5 }}>
                  ASSIGN MORE TRUCKS
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary }}>
                  ({myAssignments.length}/{job.trucksNeeded})
                </Text>
              </Pressable>
            )}
          </View>
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
          <View>
            {clockInRestriction ? (
              <View style={styles.clockInRestricted}>
                <Ionicons name="lock-closed" size={16} color={Colors.textMuted} />
                <Text style={styles.clockInRestrictedText}>{clockInRestriction}</Text>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                onPress={handleStartJob}
              >
                <Ionicons name="play-circle" size={20} color="#fff" />
                <Text style={styles.startBtnText}>
                  {(() => {
                    const days = parseFloat(String(jobData?.estimated_days || jobData?.listed_days || job.estimatedDays || '1')) || 1;
                    if (days > 1) {
                      const now = new Date();
                      return `CLOCK IN FOR ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}`;
                    }
                    return 'CLOCK IN';
                  })()}
                </Text>
              </Pressable>
            )}
            {clockInError ? (
              <View style={styles.clockInErrorRow}>
                <Ionicons name="warning" size={14} color={Colors.destructive} />
                <Text style={styles.clockInErrorText}>{clockInError}</Text>
              </View>
            ) : null}
          </View>
        )}

        {isRunning && !isContractor && (
          <Pressable
            style={({ pressed }) => [styles.stopBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
            onPress={handleStopJob}
          >
            <Ionicons name="stop-circle" size={20} color="#fff" />
            <Text style={styles.stopBtnText}>CLOCK OUT</Text>
          </Pressable>
        )}

        {removingAssignmentId && !isRunning && !isContractor && jobStatus !== 'completed' && jobStatus !== 'cancelled' && (
          <View style={styles.backOutConfirmRow}>
            <Text style={styles.backOutConfirmText}>Remove this truck from the job?</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                style={({ pressed }) => [styles.backOutCancelBtn, pressed && { opacity: 0.8 }]}
                onPress={() => setRemovingAssignmentId(null)}
                disabled={backingOut}
              >
                <Text style={styles.backOutCancelBtnText}>KEEP</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.backOutConfirmBtn, pressed && { opacity: 0.8 }]}
                onPress={() => handleRemoveTruck(removingAssignmentId)}
                disabled={backingOut}
              >
                {backingOut ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.backOutConfirmBtnText}>YES, REMOVE</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {hasApplied && !isRunning && !isContractor && jobStatus !== 'completed' && jobStatus !== 'cancelled' && myAssignments.length > 1 && !removingAssignmentId && (
          confirmBackOut ? (
            <View style={styles.backOutConfirmRow}>
              <Text style={styles.backOutConfirmText}>Remove ALL trucks from this job?</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  style={({ pressed }) => [styles.backOutCancelBtn, pressed && { opacity: 0.8 }]}
                  onPress={() => setConfirmBackOut(false)}
                  disabled={backingOut}
                >
                  <Text style={styles.backOutCancelBtnText}>CANCEL</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.backOutConfirmBtn, pressed && { opacity: 0.8 }]}
                  onPress={handleConfirmBackOut}
                  disabled={backingOut}
                >
                  {backingOut ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.backOutConfirmBtnText}>YES, REMOVE ALL</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.backOutBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              onPress={handleBackOut}
            >
              <Ionicons name="exit-outline" size={20} color="#ef4444" />
              <Text style={styles.backOutBtnText}>BACK OUT ALL TRUCKS</Text>
            </Pressable>
          )
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

                {isContractor && (
                  <View style={{ gap: 8, marginBottom: 12 }}>
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: isFavoriteDriver(selectedDriver.driverId) ? Colors.warning : Colors.border, backgroundColor: isFavoriteDriver(selectedDriver.driverId) ? 'rgba(255,193,7,0.08)' : 'transparent', gap: 10 }}
                      onPress={() => toggleFavorite('driver', selectedDriver.driverId, undefined, selectedDriver.driverName)}
                    >
                      <Ionicons name={isFavoriteDriver(selectedDriver.driverId) ? 'star' : 'star-outline'} size={20} color={isFavoriteDriver(selectedDriver.driverId) ? Colors.warning : Colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: isFavoriteDriver(selectedDriver.driverId) ? Colors.warning : Colors.text }}>
                          {isFavoriteDriver(selectedDriver.driverId) ? 'Favorited Driver' : 'Favorite Driver'}
                        </Text>
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                          {isFavoriteDriver(selectedDriver.driverId) ? 'This driver is auto-approved on your jobs' : 'Auto-approve this driver on your jobs'}
                        </Text>
                      </View>
                    </Pressable>
                    {(selectedDriver.truckingCompanyName || selectedDriver.driverCompany) ? (
                      <Pressable
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: isFavoriteCompany(selectedDriver.truckingCompanyName || selectedDriver.driverCompany) ? Colors.warning : Colors.border, backgroundColor: isFavoriteCompany(selectedDriver.truckingCompanyName || selectedDriver.driverCompany) ? 'rgba(255,193,7,0.08)' : 'transparent', gap: 10 }}
                        onPress={() => toggleFavorite('company', undefined, selectedDriver.truckingCompanyName || selectedDriver.driverCompany)}
                      >
                        <Ionicons name={isFavoriteCompany(selectedDriver.truckingCompanyName || selectedDriver.driverCompany) ? 'star' : 'star-outline'} size={20} color={isFavoriteCompany(selectedDriver.truckingCompanyName || selectedDriver.driverCompany) ? Colors.warning : Colors.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: isFavoriteCompany(selectedDriver.truckingCompanyName || selectedDriver.driverCompany) ? Colors.warning : Colors.text }}>
                            {isFavoriteCompany(selectedDriver.truckingCompanyName || selectedDriver.driverCompany) ? 'Favorited Company' : 'Favorite Company'}
                          </Text>
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                            {isFavoriteCompany(selectedDriver.truckingCompanyName || selectedDriver.driverCompany)
                              ? `All trucks from ${selectedDriver.truckingCompanyName || selectedDriver.driverCompany} are auto-approved`
                              : `Auto-approve any truck from ${selectedDriver.truckingCompanyName || selectedDriver.driverCompany}`}
                          </Text>
                        </View>
                      </Pressable>
                    ) : null}
                  </View>
                )}

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
                      <TruckIcon size={28} />
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

                {selectedDriver.status === 'approved' && (
                  <Pressable
                    style={styles.messageDriverBtn}
                    onPress={() => { setSelectedDriver(null); router.push(`/chat/${id}`); }}
                  >
                    <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
                    <Text style={styles.messageDriverBtnText}>MESSAGE</Text>
                  </Pressable>
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

      <Modal
        visible={truckSelectVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setTruckSelectVisible(false); setReassigningAssignmentId(null); }}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { setTruckSelectVisible(false); setReassigningAssignmentId(null); }}>
          <Pressable style={styles.truckSelectSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.truckSelectTitle}>{reassigningAssignmentId ? 'REASSIGN TRUCK' : `SELECT YOUR TRUCK${job.trucksNeeded > 1 ? 'S' : ''}`}</Text>
            <Text style={styles.truckSelectSubtitle}>
              {reassigningAssignmentId
                ? 'Select a different truck to assign to this job.'
                : job.trucksNeeded > 1
                  ? `This job needs ${job.trucksNeeded} trucks. Select which to assign.`
                  : 'Choose which truck to assign to this job.'}
            </Text>

            {truckWarning && (
              <View style={styles.truckWarningBanner}>
                <Ionicons name="warning" size={20} color="#fff" />
                <Text style={styles.truckWarningText}>{truckWarning}</Text>
                <Pressable onPress={() => setTruckWarning(null)} hitSlop={8}>
                  <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
                </Pressable>
              </View>
            )}

            {!vehiclesData ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : vehiclesData.length === 0 ? (
              <View style={styles.noTrucksBox}>
                <TruckIcon size={32} />
                <Text style={styles.noTrucksText}>No trucks found</Text>
                <Pressable
                  style={styles.addTruckBtn}
                  onPress={() => {
                    setTruckSelectVisible(false);
                    router.push('/vehicles');
                  }}
                >
                  <Ionicons name="add-circle" size={18} color={Colors.primary} />
                  <Text style={styles.addTruckBtnText}>ADD A TRUCK</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false} bounces={false}>
                {vehiclesData.map((v: any) => {
                  const vId = v.id;
                  const isSelected = selectedVehicleIds.includes(vId);
                  const isAlreadyOnJob = myAssignments.some((a: any) => a.vehicle_id === vId);
                  const truckLabel = [v.year, v.make, v.model].filter(Boolean).join(' ');
                  const truckTypeLabel = v.truck_type ? formatTruckType(v.truck_type) : '';
                  const conflict = conflictsData?.vehicleConflicts?.[vId];
                  const isWrongType = conflict?.wrongType === true;
                  const isLowCapacity = conflict?.lowCapacity === true;
                  const isUnavailable = conflict?.unavailable === true;
                  const isNoTarp = conflict?.noTarp === true;
                  const isBlocked = (conflict?.blocked === true) || isAlreadyOnJob;
                  return (
                    <Pressable
                      key={vId}
                      style={[
                        styles.truckOption,
                        isSelected && styles.truckOptionSelected,
                        isAlreadyOnJob && { backgroundColor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.2)', borderWidth: 1 },
                        (isBlocked && !isAlreadyOnJob) && styles.truckOptionBlocked,
                      ]}
                      onPress={() => {
                        if (isAlreadyOnJob) {
                          showTruckWarning('This truck is already assigned to this job. Remove it from the truck list above first.');
                          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                          return;
                        }
                        if (isBlocked && !isAlreadyOnJob) {
                          const reasons: string[] = [];
                          if (isLowCapacity) reasons.push(`needs ${conflict.requiredTons}T capacity (truck has ${conflict.vehicleTons}T)`);
                          if (isNoTarp) reasons.push('job requires a tarp');
                          if (isWrongType) reasons.push('wrong truck type');
                          if (isUnavailable) reasons.push('marked unavailable for this date');
                          if (reasons.length === 0 && conflict?.conflictDates?.length > 0) reasons.push('already booked on conflicting dates');
                          showTruckWarning(`This truck can't be assigned: ${reasons.join(', ')}.`);
                          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                          return;
                        }
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        toggleVehicleSelection(vId);
                      }}
                    >
                      <View style={[styles.truckCheckbox, isSelected && styles.truckCheckboxSelected, isAlreadyOnJob && { backgroundColor: Colors.success, borderColor: Colors.success }, (isBlocked && !isAlreadyOnJob) && styles.truckCheckboxBlocked]}>
                        {(isSelected || isAlreadyOnJob) && <Ionicons name="checkmark" size={16} color="#fff" />}
                        {isBlocked && !isSelected && !isAlreadyOnJob && <Ionicons name="close" size={14} color="#cc3300" />}
                      </View>
                      <TruckIcon size={24} color={isAlreadyOnJob ? Colors.success : isUnavailable ? '#ef4444' : isBlocked ? '#cc3300' : isSelected ? Colors.primary : Colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.truckOptionName, isSelected && { color: Colors.text }, isAlreadyOnJob && { color: Colors.text }, (isBlocked && !isAlreadyOnJob) && { color: Colors.textMuted }]}>
                            {truckLabel || 'Unnamed Truck'}
                          </Text>
                          {isAlreadyOnJob && (
                            <View style={[styles.bookedBadge, { backgroundColor: 'rgba(34,197,94,0.15)' }]}>
                              <Text style={[styles.bookedBadgeText, { color: Colors.success }]}>ON THIS JOB</Text>
                            </View>
                          )}
                          {isWrongType && !isAlreadyOnJob && (
                            <View style={[styles.bookedBadge, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
                              <Text style={[styles.bookedBadgeText, { color: '#8b5cf6' }]}>WRONG TYPE</Text>
                            </View>
                          )}
                          {isLowCapacity && !isAlreadyOnJob && (
                            <View style={[styles.bookedBadge, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
                              <Text style={[styles.bookedBadgeText, { color: '#8b5cf6' }]}>LOW CAPACITY</Text>
                            </View>
                          )}
                          {isNoTarp && !isAlreadyOnJob && (
                            <View style={[styles.bookedBadge, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                              <Text style={[styles.bookedBadgeText, { color: '#ef4444' }]}>NO TARP</Text>
                            </View>
                          )}
                          {isUnavailable && !isAlreadyOnJob && (
                            <View style={[styles.bookedBadge, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                              <Text style={[styles.bookedBadgeText, { color: '#ef4444' }]}>UNAVAILABLE</Text>
                            </View>
                          )}
                          {conflict?.blocked && !isWrongType && !isLowCapacity && !isNoTarp && !isUnavailable && !isAlreadyOnJob && (
                            <View style={[styles.bookedBadge, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
                              <Text style={[styles.bookedBadgeText, { color: '#8b5cf6' }]}>ALREADY BOOKED</Text>
                            </View>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                          {truckTypeLabel ? (
                            <Text style={styles.truckOptionMeta}>{truckTypeLabel}</Text>
                          ) : null}
                          {v.license_plate ? (
                            <Text style={styles.truckOptionMeta}>Plate: {v.license_plate}</Text>
                          ) : null}
                          {v.truck_number ? (
                            <Text style={styles.truckOptionMeta}>#{v.truck_number}</Text>
                          ) : null}
                          {v.max_capacity_tons ? (
                            <Text style={styles.truckOptionMeta}>{v.max_capacity_tons}T</Text>
                          ) : null}
                        </View>
                        {isLowCapacity && !isAlreadyOnJob && (
                          <Text style={[styles.truckConflictInfo, { color: '#8b5cf6' }]}>
                            Needs {conflict.requiredTons}T min · This truck: {conflict.vehicleTons}T
                          </Text>
                        )}
                        {isBlocked && !isWrongType && !isLowCapacity && !isAlreadyOnJob && conflict?.conflictDates?.length > 0 && (
                          <Text style={styles.truckConflictInfo}>
                            {conflict.conflictJobs?.[0] ? `Assigned to ${conflict.conflictJobs[0]} job` : 'Assigned to another job'} · {conflict.conflictDates.slice(0, 2).map((d: string) => {
                              const dt = new Date(d + 'T12:00:00Z');
                              return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            }).join(', ')}{conflict.conflictDates.length > 2 ? ` +${conflict.conflictDates.length - 2} more days` : ''}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            

            {vehiclesData && vehiclesData.length > 0 && (
              <Pressable
                style={({ pressed }) => [
                  styles.confirmAcceptBtn,
                  selectedVehicleIds.length === 0 && { opacity: 0.5 },
                  pressed && { opacity: 0.85 },
                  acceptingJob && { opacity: 0.6 },
                ]}
                onPress={handleConfirmAccept}
                disabled={acceptingJob || selectedVehicleIds.length === 0}
              >
                {acceptingJob ? (
                  <ActivityIndicator size="small" color={Colors.primaryForeground} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.primaryForeground} />
                    <Text style={styles.confirmAcceptText}>
                      {reassigningAssignmentId
                        ? `REASSIGN TO ${selectedVehicleIds.length === 1 ? 'THIS TRUCK' : 'SELECTED TRUCK'}`
                        : `ACCEPT WITH ${selectedVehicleIds.length} TRUCK${selectedVehicleIds.length !== 1 ? 'S' : ''}`}
                    </Text>
                  </>
                )}
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={fleetTruckPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={closeFleetPicker}
      >
        <Pressable style={styles.modalOverlay} onPress={closeFleetPicker}>
          <Pressable style={styles.truckSelectSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.truckSelectTitle}>APPROVE ASSIGNMENT</Text>
            <Text style={styles.truckSelectSubtitle}>
              {pendingApproveAssignment
                ? `${pendingApproveAssignment.truckingCompanyName || pendingApproveAssignment.driverCompany || pendingApproveAssignment.driverName} wants to haul this job.`
                : 'Review the assigned truck and driver details.'}
            </Text>

            {pendingApproveAssignment?.vehicle && (
              <View style={{ backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)' }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.info, letterSpacing: 0.5, marginBottom: 8 }}>ASSIGNED TRUCK</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TruckIcon size={28} color={Colors.info} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text }}>
                        {[pendingApproveAssignment.vehicle.year, pendingApproveAssignment.vehicle.make, pendingApproveAssignment.vehicle.model].filter(Boolean).join(' ')}
                      </Text>
                      {pendingApproveAssignment.vehicle.truckNumber ? (
                        <View style={{ backgroundColor: 'rgba(255,153,0,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: Colors.primary }}>#{pendingApproveAssignment.vehicle.truckNumber}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
                      {pendingApproveAssignment.vehicle.truckType ? (
                        <Text style={styles.truckOptionMeta}>{formatTruckType(pendingApproveAssignment.vehicle.truckType)}</Text>
                      ) : null}
                      {pendingApproveAssignment.vehicle.licensePlate ? (
                        <Text style={styles.truckOptionMeta}>Plate: {pendingApproveAssignment.vehicle.licensePlate}</Text>
                      ) : null}
                      {pendingApproveAssignment.vehicle.maxCapacityTons ? (
                        <Text style={styles.truckOptionMeta}>{pendingApproveAssignment.vehicle.maxCapacityTons}T</Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            )}

            {(pendingApproveAssignment?.driverName && pendingApproveAssignment.driverName !== 'Unknown') ? (
              <View style={{ backgroundColor: 'rgba(59,130,246,0.05)', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(59,130,246,0.12)' }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.info, letterSpacing: 0.5, marginBottom: 8 }}>DRIVER</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(59,130,246,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person" size={18} color={Colors.info} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text }}>{pendingApproveAssignment.driverName}</Text>
                    {pendingApproveAssignment.driverPhone ? (
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>{pendingApproveAssignment.driverPhone}</Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ) : null}

            {(pendingApproveAssignment?.truckingCompanyName || pendingApproveAssignment?.driverCompany) ? (
              <View style={{ backgroundColor: 'rgba(255,153,0,0.05)', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,153,0,0.12)' }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.primary, letterSpacing: 0.5, marginBottom: 4 }}>COMPANY</Text>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.text }}>
                  {pendingApproveAssignment.truckingCompanyName || pendingApproveAssignment.driverCompany}
                </Text>
              </View>
            ) : null}

            {!pendingApproveAssignment?.vehicle && (
              <View style={{ backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: 10, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(234,179,8,0.25)' }}>
                <Ionicons name="warning" size={20} color={Colors.warning} />
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.warning, flex: 1 }}>A truck must be assigned before approval. The driver needs to select a truck first.</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable
                style={[styles.confirmAcceptBtn, { flex: 1, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.border }]}
                onPress={closeFleetPicker}
              >
                <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 14, color: Colors.textSecondary }}>CANCEL</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmAcceptBtn,
                  { flex: 2, backgroundColor: Colors.success },
                  (approvingAssignment || !pendingApproveAssignment?.vehicle) && { opacity: 0.4 },
                ]}
                onPress={handleFleetApprove}
                disabled={approvingAssignment || !pendingApproveAssignment?.vehicle}
              >
                {approvingAssignment ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={[styles.confirmAcceptText, { color: '#fff' }]}>APPROVE</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={acceptBannerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAcceptBannerVisible(false)}
      >
        <Pressable style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]} onPress={() => setAcceptBannerVisible(false)}>
          <Pressable style={styles.acceptBannerSheet} onPress={() => {}}>
            <View style={{
              width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
              backgroundColor: acceptBannerData?.isFavorite ? 'rgba(34,197,94,0.15)' : 'rgba(255,153,0,0.15)',
              marginBottom: 16, alignSelf: 'center',
            }}>
              <Ionicons
                name={acceptBannerData?.isFavorite ? "checkmark-circle" : "time"}
                size={40}
                color={acceptBannerData?.isFavorite ? Colors.success : Colors.primary}
              />
            </View>
            <Text style={styles.acceptBannerTitle}>
              {acceptBannerData?.isFavorite ? "You're Assigned!" : "Application Sent"}
            </Text>
            <Text style={styles.acceptBannerMessage}>
              {acceptBannerData?.message}
            </Text>
            {!acceptBannerData?.isFavorite && (
              <View style={styles.acceptBannerPendingNote}>
                <Ionicons name="notifications-outline" size={16} color={Colors.primary} />
                <Text style={styles.acceptBannerPendingText}>
                  Your calendar will show this job as pending until the company approves you.
                </Text>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.acceptBannerDismiss,
                { backgroundColor: acceptBannerData?.isFavorite ? Colors.success : Colors.primary },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => {
                setAcceptBannerVisible(false);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text style={styles.acceptBannerDismissText}>GOT IT</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={mapVisible}
        animationType="slide"
        onRequestClose={() => { setMapVisible(false); setRouteCoords([]); }}
      >
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8, paddingHorizontal: 16, paddingBottom: 12,
            backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
          }}>
            <Pressable onPress={() => { setMapVisible(false); setRouteCoords([]); }} style={{ padding: 6 }}>
              <Ionicons name="close" size={26} color={Colors.text} />
            </Pressable>
            <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 16, color: Colors.text, letterSpacing: 1 }}>ROUTE MAP</Text>
            <Pressable onPress={openInMapsApp} style={{ padding: 6 }}>
              <Ionicons name="navigate-outline" size={22} color={Colors.primary} />
            </Pressable>
          </View>

          {job && (() => {
            const oLat = Number(job.originLat);
            const oLng = Number(job.originLng);
            const dLat = Number(job.destinationLat);
            const dLng = Number(job.destinationLng);
            const hasOrigin = !!(oLat && oLng);
            const hasDest = !!(dLat && dLng);
            const midLat = hasOrigin && hasDest ? (oLat + dLat) / 2 : hasOrigin ? oLat : dLat;
            const midLng = hasOrigin && hasDest ? (oLng + dLng) / 2 : hasOrigin ? oLng : dLng;
            const latDelta = hasOrigin && hasDest ? Math.abs(oLat - dLat) * 1.6 + 0.05 : 0.1;
            const lngDelta = hasOrigin && hasDest ? Math.abs(oLng - dLng) * 1.6 + 0.05 : 0.1;

            return (
              <View style={{ flex: 1 }}>
                <RouteMapView
                  oLat={oLat} oLng={oLng} dLat={dLat} dLng={dLng}
                  hasOrigin={hasOrigin} hasDest={hasDest}
                  midLat={midLat} midLng={midLng} latDelta={latDelta} lngDelta={lngDelta}
                  originAddress={job.originAddress} destinationAddress={job.destinationAddress}
                  routeCoords={routeCoords}
                />

                <View style={{
                  position: 'absolute', bottom: Platform.OS === 'web' ? 34 : insets.bottom + 8,
                  left: 16, right: 16,
                  backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
                  borderWidth: 1, borderColor: Colors.border,
                  gap: 10,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 10, color: Colors.success, letterSpacing: 1 }}>PICKUP</Text>
                      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.text }} numberOfLines={2}>{job.originAddress}</Text>
                    </View>
                  </View>
                  <View style={{ height: 1, backgroundColor: Colors.border, marginLeft: 20 }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 10, color: Colors.primary, letterSpacing: 1 }}>DROPOFF</Text>
                      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.text }} numberOfLines={2}>{job.destinationAddress}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="navigate" size={14} color={Colors.primary} />
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.textSecondary }}>{job.distance} miles</Text>
                    </View>
                    <Pressable
                      onPress={openInMapsApp}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Ionicons name="navigate" size={16} color="#fff" />
                      <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 12, color: '#fff', letterSpacing: 0.5 }}>DIRECTIONS</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })()}
        </View>
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
  weekendBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#39ff14',
    borderColor: '#a4ff7a',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 12,
    shadowColor: '#39ff14',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  weekendBannerText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    letterSpacing: 1.2,
    color: '#001a00',
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
  loadsPickerContainer: {
    height: 150,
    width: 120,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    position: 'relative',
  },
  loadsScroller: {
    height: 150,
  },
  loadsScrollContent: {
    paddingVertical: 50,
  },
  loadsItem: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadsItemText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 24,
    color: '#666',
  },
  loadsItemTextSelected: {
    fontSize: 32,
    color: Colors.primary,
  },
  loadsHighlight: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    height: 50,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 0,
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
  contractorMsgBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 153, 0, 0.15)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
  clockInRestricted: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(107, 112, 128, 0.15)',
    borderRadius: 12,
    height: 52,
    gap: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(107, 112, 128, 0.3)',
  },
  clockInRestrictedText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.textMuted,
  },
  clockInErrorRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  clockInErrorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.destructive,
    flex: 1,
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
  backOutBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 12,
    height: 48,
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 32,
  },
  backOutBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: '#ef4444',
    letterSpacing: 1,
  },
  backOutConfirmRow: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 32,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center' as const,
    gap: 12,
  },
  backOutConfirmText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: '#ef4444',
    letterSpacing: 0.5,
  },
  backOutCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  backOutCancelBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  backOutConfirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  backOutConfirmBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
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
  completeJobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderRadius: 12,
    height: 48,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  completeJobBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: Colors.success,
    letterSpacing: 1,
  },
  editJobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,153,0,0.1)',
    borderRadius: 12,
    height: 48,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,153,0,0.3)',
  },
  editJobBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: Colors.primary,
    letterSpacing: 1,
  },
  cancelJobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.destructiveBg,
    borderRadius: 12,
    height: 48,
    gap: 8,
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
  messageDriverBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    gap: 8,
    marginTop: 8,
  },
  messageDriverBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: '#fff',
    letterSpacing: 1,
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
  truckWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#cc3300',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  truckWarningText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#fff',
    lineHeight: 18,
  },
  truckSelectSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    width: '100%',
  },
  truckSelectTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 8,
  },
  truckSelectSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  noTrucksBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  noTrucksText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.textMuted,
  },
  addTruckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 10,
  },
  addTruckBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  truckOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: 8,
    gap: 12,
  },
  truckOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(255, 153, 0, 0.08)',
  },
  truckOptionBlocked: {
    borderColor: 'rgba(204, 51, 0, 0.3)',
    backgroundColor: 'rgba(204, 51, 0, 0.05)',
    opacity: 0.7,
  },
  truckCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  truckCheckboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  truckCheckboxBlocked: {
    borderColor: '#cc3300',
  },
  truckOptionName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.textSecondary,
  },
  truckOptionMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
  truckConflictInfo: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: '#cc3300',
    marginTop: 4,
  },
  bookedBadge: {
    backgroundColor: '#cc3300',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bookedBadgeText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 9,
    color: '#fff',
    letterSpacing: 0.5,
  },
  confirmAcceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 52,
    gap: 8,
    marginTop: 16,
  },
  confirmAcceptText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 15,
    color: Colors.primaryForeground,
    letterSpacing: 1,
  },
  acceptBannerSheet: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 28,
    width: '85%',
    maxWidth: 360,
    alignItems: 'center',
  },
  acceptBannerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 22,
    color: Colors.text,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 8,
  },
  acceptBannerMessage: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  acceptBannerPendingNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(255,153,0,0.08)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,153,0,0.2)',
  },
  acceptBannerPendingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 17,
  },
  acceptBannerDismiss: {
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  acceptBannerDismissText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 15,
    color: Colors.primaryForeground,
    letterSpacing: 1,
  },
  weightTicketCard: {
    flexDirection: 'row',
    backgroundColor: Colors.muted,
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  weightTicketImage: {
    width: 80,
    height: 80,
  },
  weightTicketInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  weightTicketLabel: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: Colors.text,
  },
  weightTicketDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  uploadTicketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.muted,
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
  },
  uploadTicketText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: Colors.primary,
    marginLeft: 8,
  },
  ticketPromptBanner: {
    backgroundColor: '#2a2000',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  ticketPromptContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ticketPromptTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 15,
    color: Colors.warning,
  },
  ticketPromptMsg: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  ticketPromptActions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
  },
  ticketPromptUploadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  ticketPromptUploadText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: '#fff',
  },
  ticketPromptLaterBtn: {
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: Colors.muted,
    padding: 12,
  },
  ticketPromptLaterText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  wtModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  wtModalContent: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  wtModalTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  wtModalSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  wtModalButtons: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 24,
  },
  wtModalBtn: {
    flex: 1,
    backgroundColor: Colors.muted,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  wtModalBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
    color: Colors.text,
  },
  wtModalCancel: {
    marginTop: 16,
    padding: 12,
  },
  wtModalCancelText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.textMuted,
  },
  previewModalContent: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 24,
    width: Dimensions.get('window').width - 48,
    maxHeight: Dimensions.get('window').height * 0.8,
    alignItems: 'center' as const,
  },
  previewImage: {
    width: '100%' as any,
    height: 300,
    borderRadius: 12,
    marginVertical: 16,
    backgroundColor: '#000',
  },
  previewActions: {
    width: '100%' as any,
    gap: 10,
  },
  previewConfirmBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#2d6a3e',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  previewConfirmText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: '#fff',
  },
  previewRetakeBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  previewRetakeText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.primary,
  },
  nextDayBanner: {
    backgroundColor: '#0d2818',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2d6a3e',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  nextDayIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,153,0,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextDayTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: '#4ade80',
    letterSpacing: 0.5,
  },
  nextDayMsg: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 3,
    lineHeight: 18,
  },
});
