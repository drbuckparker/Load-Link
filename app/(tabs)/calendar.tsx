import { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, Modal, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/query-client';
import { queryClient, getApiUrl } from '@/lib/query-client';

function isContractorRole(role: string): boolean {
  return role.includes('contractor');
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type AvailabilityStatus = 'available' | 'unavailable' | 'committed' | null;

interface DayData {
  date: number;
  month: number;
  year: number;
  status: AvailabilityStatus;
  commitmentName?: string;
  shift?: string;
  notes?: string;
  startTime?: string;
  endTime?: string;
}

const SHIFTS = [
  { key: 'day', label: 'Day Shift', icon: 'sunny-outline' as const, start: '06:00', end: '18:00' },
  { key: 'night', label: 'Night Shift', icon: 'moon-outline' as const, start: '18:00', end: '06:00' },
  { key: '24hr', label: '24 Hours', icon: 'time-outline' as const, start: '00:00', end: '23:59' },
];

const AVAILABILITY_TYPES = [
  { key: 'available_day', label: 'Available - This Day Only' },
  { key: 'available_weekdays', label: 'Available - All Month Weekdays' },
  { key: 'available_weekends', label: 'Available - All Month Weekends' },
  { key: 'unavailable_day', label: 'Unavailable - This Day Only' },
  { key: 'unavailable_weekdays', label: 'Unavailable - All Month Weekdays' },
  { key: 'unavailable_weekends', label: 'Unavailable - All Month Weekends' },
];

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [refreshing, setRefreshing] = useState(false);
  const [availability, setAvailability] = useState<Record<string, { status: AvailabilityStatus; name?: string; shift?: string; notes?: string; startTime?: string; endTime?: string }>>({});

  const [modalVisible, setModalVisible] = useState(false);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalShift, setModalShift] = useState('day');
  const [modalType, setModalType] = useState('available_day');
  const [modalNotes, setModalNotes] = useState('');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trucksExpanded, setTrucksExpanded] = useState(true);
  const [savingQuick, setSavingQuick] = useState<string | null>(null);

  const isContractor = user?.role ? isContractorRole(user.role) : false;

  const availQuery = useQuery<any[]>({
    queryKey: ['/api/availability', `?month=${currentMonth + 1}&year=${currentYear}`],
    enabled: !!user,
  });

  const capacityQuery = useQuery<{ fleetSize: number; dailyCapacity: Record<string, { booked: number; needed: number; jobCount: number }>; dailyJobs: Record<string, any[]> }>({
    queryKey: ['/api/contractor/calendar-capacity', `?month=${currentMonth + 1}&year=${currentYear}`],
    enabled: !!user && isContractor,
  });

  const vehiclesQuery = useQuery<any[]>({
    queryKey: ['/api/vehicles'],
    enabled: !!user && !isContractor,
  });
  const totalVehicles = vehiclesQuery.data?.length || 0;

  const [cleanupDone, setCleanupDone] = useState(false);

  useEffect(() => {
    if (availQuery.data) {
      const mapped: Record<string, { status: AvailabilityStatus; name?: string; shift?: string; notes?: string; startTime?: string; endTime?: string }> = {};
      for (const item of availQuery.data) {
        const d = new Date(item.date);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        if (item.job_id || item.commitment_type) {
          mapped[key] = { status: 'committed', name: item.commitment_company_name || 'Job' };
        } else if (item.is_available) {
          mapped[key] = {
            status: 'available',
            shift: getShiftFromTimes(item.start_time, item.end_time),
            notes: item.notes || '',
            startTime: item.start_time,
            endTime: item.end_time,
          };
        } else {
          mapped[key] = {
            status: 'unavailable',
            shift: getShiftFromTimes(item.start_time, item.end_time),
            notes: item.notes || '',
            startTime: item.start_time,
            endTime: item.end_time,
          };
        }
      }
      setAvailability(mapped);
    }
  }, [availQuery.data]);

  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [selectedDate, setSelectedDate] = useState<string | null>(todayKey);

  const calendarJobsQuery = useQuery<{
    dailyJobs: Record<string, {
      id: string; material: string; projectName: string; pickup: string; dropoff: string;
      pickupTime: string; status: string; assignmentStatus: string; truckType: string;
      contractorName: string; rate: string; rateType: string;
      vehicle: { id: string; make: string; model: string; year: number; licensePlate: string; truckType: string } | null;
    }[]>;
    jobDates: string[];
  }>({
    queryKey: ['/api/calendar/jobs', `?month=${currentMonth + 1}&year=${currentYear}`],
    enabled: !!user && !isContractor,
  });

  const dateJobsQuery = useQuery<any[]>({
    queryKey: ['/api/jobs', `?date=${selectedDate}&status=open`],
    enabled: !!user && !!selectedDate && !isContractor,
  });

  useEffect(() => {
    if (cleanupDone || isContractor || !calendarJobsQuery.data || !vehiclesQuery.data) return;
    const dailyJobs = calendarJobsQuery.data.dailyJobs || {};
    const fleet = vehiclesQuery.data.length || 1;
    let hasConflict = false;
    for (const [, dayJobs] of Object.entries(dailyJobs)) {
      if (dayJobs.length > fleet) { hasConflict = true; break; }
    }
    if (hasConflict) {
      setCleanupDone(true);
      apiRequest('POST', '/api/cleanup-duplicate-assignments').then(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/calendar/jobs'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }).catch(() => {});
    }
  }, [calendarJobsQuery.data, vehiclesQuery.data, isContractor, cleanupDone]);

  const bookedVehiclesPerDay = useMemo(() => {
    const result: Record<string, { count: number; vehicleIds: Set<string> }> = {};
    const dailyJobs = calendarJobsQuery.data?.dailyJobs || {};
    for (const [dateKey, dayJobs] of Object.entries(dailyJobs)) {
      const vehicleIds = new Set<string>();
      for (const job of dayJobs) {
        if (job.vehicle?.id) vehicleIds.add(job.vehicle.id);
      }
      result[dateKey] = { count: dayJobs.length, vehicleIds };
    }
    return result;
  }, [calendarJobsQuery.data]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const days: (DayData | null)[] = [];

    for (let i = 0; i < firstDay; i++) days.push(null);

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const avail = availability[key];
      days.push({
        date: d,
        month: currentMonth,
        year: currentYear,
        status: avail?.status || null,
        commitmentName: avail?.name,
        shift: avail?.shift,
        notes: avail?.notes,
        startTime: avail?.startTime,
        endTime: avail?.endTime,
      });
    }
    return days;
  }, [currentMonth, currentYear, availability]);

  function getShiftFromTimes(start?: string, end?: string): string {
    if (!start || !end) return 'day';
    if (start === '00:00' && (end === '23:59' || end === '24:00')) return '24hr';
    if (start === '18:00' || start === '19:00' || start === '20:00') return 'night';
    return 'day';
  }

  function openModal(day: DayData) {
    const key = `${day.year}-${String(day.month + 1).padStart(2, '0')}-${String(day.date).padStart(2, '0')}`;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setSelectedDate(key);
    setModalDate(key);

    const existing = availability[key];
    if (existing && existing.status !== 'committed') {
      setModalShift(existing.shift || 'day');
      setModalNotes(existing.notes || '');
      if (existing.status === 'unavailable') {
        setModalType('unavailable_day');
      } else {
        setModalType('available_day');
      }
    } else {
      setModalShift('day');
      setModalType('available_day');
      setModalNotes('');
    }
    setShowTypeDropdown(false);
    setModalVisible(true);
  }

  function getDatesToSave(): string[] {
    if (modalType.endsWith('_day')) {
      return modalDate ? [modalDate] : [];
    }

    const isWeekdays = modalType.includes('weekdays');
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const dates: string[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(currentYear, currentMonth, d);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if ((isWeekdays && !isWeekend) || (!isWeekdays && isWeekend)) {
        const key = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const existing = availability[key];
        if (!existing || existing.status !== 'committed') {
          dates.push(key);
        }
      }
    }
    return dates;
  }

  async function handleSave() {
    if (!modalDate) return;
    setSaving(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const shiftData = SHIFTS.find(s => s.key === modalShift) || SHIFTS[0];
    const isAvailable = modalType.startsWith('available');
    const datesToSave = getDatesToSave();

    try {
      const promises = datesToSave.map(date =>
        apiRequest('POST', '/api/availability', {
          date,
          isAvailable,
          startTime: shiftData.start,
          endTime: shiftData.end,
          notes: modalNotes.trim() || undefined,
          shift: modalShift,
          recurrence: 'none',
        })
      );
      await Promise.all(promises);

      setAvailability(prev => {
        const updated = { ...prev };
        for (const date of datesToSave) {
          updated[date] = {
            status: isAvailable ? 'available' : 'unavailable',
            shift: modalShift,
            notes: modalNotes.trim(),
            startTime: shiftData.start,
            endTime: shiftData.end,
          };
        }
        return updated;
      });

      queryClient.invalidateQueries({ queryKey: ['/api/availability'] });
      setModalVisible(false);
    } catch (e) {
      console.log('Failed to save availability:', e);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setModalVisible(false);
  }

  function handleRemove() {
    if (!modalDate) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setAvailability(prev => {
      const { [modalDate]: _, ...rest } = prev;
      return rest;
    });

    apiRequest('POST', '/api/availability', {
      date: modalDate,
      isAvailable: false,
      remove: true,
    }).catch(() => {});

    queryClient.invalidateQueries({ queryKey: ['/api/availability'] });
    setModalVisible(false);
  }

  async function quickSetAvailability(dateKey: string, isAvailable: boolean) {
    setSavingQuick(isAvailable ? 'available' : 'unavailable');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest('POST', '/api/availability', {
        date: dateKey,
        isAvailable,
        startTime: '06:00',
        endTime: '18:00',
        shift: 'day',
        recurrence: 'none',
      });
      setAvailability(prev => ({
        ...prev,
        [dateKey]: {
          status: isAvailable ? 'available' : 'unavailable',
          shift: 'day',
          startTime: '06:00',
          endTime: '18:00',
        },
      }));
      queryClient.invalidateQueries({ queryKey: ['/api/availability'] });
    } catch (e) {
      console.log('Failed to set availability:', e);
    } finally {
      setSavingQuick(null);
    }
  }

  async function bulkSetAvailability(type: 'weekdays' | 'weekends', isAvailable: boolean) {
    setSavingQuick(type);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const dates: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(currentYear, currentMonth, d);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      if ((type === 'weekdays' && !isWeekend) || (type === 'weekends' && isWeekend)) {
        const key = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const existing = availability[key];
        if (!existing || existing.status !== 'committed') {
          dates.push(key);
        }
      }
    }
    try {
      const promises = dates.map(date =>
        apiRequest('POST', '/api/availability', {
          date,
          isAvailable,
          startTime: '06:00',
          endTime: '18:00',
          shift: 'day',
          recurrence: 'none',
        })
      );
      await Promise.all(promises);
      setAvailability(prev => {
        const updated = { ...prev };
        for (const date of dates) {
          updated[date] = {
            status: isAvailable ? 'available' : 'unavailable',
            shift: 'day',
            startTime: '06:00',
            endTime: '18:00',
          };
        }
        return updated;
      });
      queryClient.invalidateQueries({ queryKey: ['/api/availability'] });
    } catch (e) {
      console.log('Failed to bulk set availability:', e);
    } finally {
      setSavingQuick(null);
    }
  }

  function navigateMonth(dir: number) {
    let m = currentMonth + dir;
    let y = currentYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setCurrentMonth(m);
    setCurrentYear(y);
  }

  function formatModalDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  const selectedAvail = selectedDate ? availability[selectedDate] : null;
  const selectedType = AVAILABILITY_TYPES.find(t => t.key === modalType);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Text style={styles.headerTitle}>{isContractor ? 'SCHEDULED JOBS' : 'AVAILABILITY'}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === 'web' ? 134 : 100 }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await queryClient.invalidateQueries({ queryKey: ['/api/availability'] }); await queryClient.invalidateQueries({ queryKey: ['/api/calendar/jobs'] }); setRefreshing(false); }} tintColor={Colors.primary} colors={[Colors.primary]} />}>
        <View style={styles.monthNav}>
          <Pressable onPress={() => navigateMonth(-1)} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.text} />
          </Pressable>
          <Text style={styles.monthTitle}>{MONTHS[currentMonth]} {currentYear}</Text>
          <Pressable onPress={() => navigateMonth(1)} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={Colors.text} />
          </Pressable>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.dayHeaders}>
            {DAYS.map(d => (
              <Text key={d} style={styles.dayHeaderText}>{d}</Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {calendarDays.map((day, i) => {
              if (!day) return <View key={`empty-${i}`} style={styles.dayCell} />;

              const isToday = day.date === now.getDate() && day.month === now.getMonth() && day.year === now.getFullYear();
              const key = `${day.year}-${String(day.month + 1).padStart(2, '0')}-${String(day.date).padStart(2, '0')}`;
              const isSelected = selectedDate === key;

              if (isContractor) {
                const cap = capacityQuery.data?.dailyCapacity?.[key];
                const fleetSize = capacityQuery.data?.fleetSize || 0;
                const booked = cap?.booked || 0;
                const needed = cap?.needed || 0;
                const jobCount = cap?.jobCount || 0;
                const dayAvail = availability[key];
                const isUnavailable = dayAvail?.status === 'unavailable';
                let capacityStatus: 'full' | 'partial' | 'open' | null = null;
                if (jobCount > 0) {
                  if (fleetSize > 0 && booked >= fleetSize) capacityStatus = 'full';
                  else if (booked > 0) capacityStatus = 'partial';
                  else capacityStatus = 'open';
                }

                return (
                  <Pressable
                    key={key}
                    style={[styles.dayCell, isSelected && styles.dayCellSelected, isUnavailable && !isSelected && { opacity: 0.5 }]}
                    onPress={() => { setSelectedDate(key); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Text style={[
                      styles.dayNumber,
                      isToday && styles.dayNumberToday,
                      isUnavailable && { color: Colors.destructive },
                    ]}>
                      {day.date}
                    </Text>
                    {isUnavailable && !capacityStatus && (
                      <View style={styles.capacityDotsRow}>
                        <View style={[styles.statusDot, { backgroundColor: Colors.destructive }]} />
                      </View>
                    )}
                    {capacityStatus === 'full' && (
                      <View style={styles.capacityDotsRow}>
                        <View style={[styles.statusDot, { backgroundColor: Colors.destructive }]} />
                      </View>
                    )}
                    {capacityStatus === 'partial' && (
                      <View style={styles.capacityDotsRow}>
                        <View style={[styles.statusDot, { backgroundColor: Colors.warning }]} />
                      </View>
                    )}
                    {capacityStatus === 'open' && (
                      <View style={styles.capacityDotsRow}>
                        <View style={[styles.statusDot, { backgroundColor: Colors.success }]} />
                      </View>
                    )}
                    {jobCount > 0 && (
                      <Text style={styles.truckCountBadge}>{booked}/{needed}</Text>
                    )}
                    {isToday && <View style={styles.todayIndicator} />}
                  </Pressable>
                );
              }

              const assignedJobCount = calendarJobsQuery.data?.dailyJobs?.[key]?.length || 0;
              const dayBooked = bookedVehiclesPerDay[key];
              const bookedCount = dayBooked?.vehicleIds?.size || assignedJobCount;
              const allTrucksBooked = totalVehicles > 0 && bookedCount >= totalVehicles;
              const hasJobs = assignedJobCount > 0;

              const dotColor = hasJobs
                ? (allTrucksBooked ? '#fff' : Colors.info)
                : day.status === 'available' ? Colors.success
                : day.status === 'unavailable' ? Colors.destructive
                : day.status === 'committed' ? Colors.info
                : null;

              return (
                <Pressable
                  key={key}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                    allTrucksBooked && styles.dayCellAllBooked,
                  ]}
                  onPress={() => {
                    setSelectedDate(key);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  onLongPress={() => {
                    setSelectedDate(key);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                >
                  <Text style={[
                    styles.dayNumber,
                    isToday && styles.dayNumberToday,
                    hasJobs && { color: Colors.info },
                    allTrucksBooked && { color: '#fff' },
                  ]}>
                    {day.date}
                  </Text>
                  {dotColor && (
                    <View style={styles.capacityDotsRow}>
                      <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                    </View>
                  )}
                  {hasJobs && (
                    <Text style={[styles.truckCountBadge, allTrucksBooked && { color: '#fff' }]}>{assignedJobCount}</Text>
                  )}
                  {isToday && <View style={styles.todayIndicator} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        {isContractor ? (
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
              <Text style={styles.legendText}>Open</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.warning }]} />
              <Text style={styles.legendText}>Partial</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.destructive }]} />
              <Text style={styles.legendText}>Unavail</Text>
            </View>
          </View>
        ) : (
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
              <Text style={styles.legendText}>Available</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.destructive }]} />
              <Text style={styles.legendText}>Unavailable</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.info }]} />
              <Text style={styles.legendText}>Booked</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: 'rgba(59,130,246,0.25)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.4)' }} />
              <Text style={styles.legendText}>Full</Text>
            </View>
          </View>
        )}

        {isContractor && selectedDate && (() => {
          const dateJobs = capacityQuery.data?.dailyJobs?.[selectedDate] || [];
          const currentDayAvail = availability[selectedDate];
          const isCurrentlyAvailable = currentDayAvail?.status === 'available';
          const isCurrentlyUnavailable = currentDayAvail?.status === 'unavailable';

          return (
            <View style={styles.capacityCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.detailDate}>
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
                {currentDayAvail && currentDayAvail.status !== 'committed' && (
                  <View style={[{
                    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
                    backgroundColor: isCurrentlyAvailable ? Colors.successBg : Colors.destructiveBg
                  }]}>
                    <Text style={{
                      fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.5,
                      color: isCurrentlyAvailable ? Colors.success : Colors.destructive
                    }}>
                      {currentDayAvail.status?.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>

              {dateJobs.length === 0 && !currentDayAvail ? (
                <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>No jobs scheduled for this date</Text>
                </View>
              ) : dateJobs.length === 0 ? null : (
                <View style={{ gap: 10, marginTop: 4 }}>
                  {dateJobs.map((job) => (
                    <Pressable
                      key={job.id}
                      style={styles.calJobCard}
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push(`/job/${job.id}` as any);
                      }}
                    >
                      {job.projectName ? (
                        <Text style={styles.calJobProject} numberOfLines={1}>{job.projectName.toUpperCase()}</Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={styles.calJobMaterial} numberOfLines={1}>{job.material}</Text>
                        <View style={[styles.calJobStatusBadge, {
                          backgroundColor: job.status === 'open' || job.status === 'pending' ? Colors.successBg :
                            job.status === 'in_progress' ? Colors.warningBg : Colors.infoBg
                        }]}>
                          <Text style={[styles.calJobStatusText, {
                            color: job.status === 'open' || job.status === 'pending' ? Colors.success :
                              job.status === 'in_progress' ? Colors.warning : Colors.info
                          }]}>{job.status === 'in_progress' ? 'Active' : job.status.charAt(0).toUpperCase() + job.status.slice(1)}</Text>
                        </View>
                      </View>

                      <View style={styles.calJobTruckRow}>
                        <View style={styles.calJobTruckStat}>
                          <MaterialCommunityIcons name="dump-truck" size={16} color={Colors.primary} />
                          <Text style={styles.calJobTruckLabel}>{job.approved || 0}/{job.trucksNeeded} trucks</Text>
                        </View>
                        <View style={styles.calJobTruckStat}>
                          <Ionicons name="people" size={16} color={job.applied > 0 ? Colors.info : Colors.textMuted} />
                          <Text style={[styles.calJobTruckLabel, job.applied > 0 && { color: Colors.info }]}>{job.applied} applied</Text>
                        </View>
                      </View>
                      {job.assignedVehicles && job.assignedVehicles.length > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, paddingLeft: 2, flexWrap: 'wrap' }}>
                          <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.success }} numberOfLines={1}>
                            {job.assignedVehicles.map((v: any) => `${v.driverName || ''} - ${[v.year, v.make].filter(Boolean).join(' ')}`).join(', ')}
                          </Text>
                        </View>
                      )}

                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ position: 'absolute', right: 12, top: '50%' }} />
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <Pressable
                  style={[{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, minHeight: 44,
                    borderColor: Colors.success,
                  }, isCurrentlyAvailable && { backgroundColor: Colors.success, borderColor: Colors.success }]}
                  onPress={() => quickSetAvailability(selectedDate, true)}
                  disabled={!!savingQuick}
                >
                  {savingQuick === 'available' ? (
                    <ActivityIndicator size="small" color={Colors.success} />
                  ) : (
                    <>
                      <Ionicons name={isCurrentlyAvailable ? "checkmark-circle" : "checkmark-circle-outline"} size={18} color={isCurrentlyAvailable ? '#fff' : Colors.success} />
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: isCurrentlyAvailable ? '#fff' : Colors.success }}>
                        {isCurrentlyAvailable ? 'Available' : 'Mark Available'}
                      </Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={[{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, minHeight: 44,
                    borderColor: Colors.destructive,
                  }, isCurrentlyUnavailable && { backgroundColor: Colors.destructive, borderColor: Colors.destructive }]}
                  onPress={() => quickSetAvailability(selectedDate, false)}
                  disabled={!!savingQuick}
                >
                  {savingQuick === 'unavailable' ? (
                    <ActivityIndicator size="small" color={Colors.destructive} />
                  ) : (
                    <>
                      <Ionicons name={isCurrentlyUnavailable ? "close-circle" : "close-circle-outline"} size={18} color={isCurrentlyUnavailable ? '#fff' : Colors.destructive} />
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: isCurrentlyUnavailable ? '#fff' : Colors.destructive }}>
                        {isCurrentlyUnavailable ? 'Unavailable' : 'Mark Unavailable'}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
                <Text style={{ fontFamily: 'ChakraPetch_600SemiBold', fontSize: 10, color: Colors.textMuted, letterSpacing: 1 }}>BULK ACTIONS</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  style={[{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 6, paddingVertical: 10, borderRadius: 8, minHeight: 44,
                    backgroundColor: 'rgba(34, 197, 94, 0.08)', borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.2)',
                  }, savingQuick === 'weekdays' && { opacity: 0.6 }]}
                  onPress={() => bulkSetAvailability('weekdays', true)}
                  disabled={!!savingQuick}
                >
                  {savingQuick === 'weekdays' ? (
                    <ActivityIndicator size="small" color={Colors.success} />
                  ) : (
                    <>
                      <Ionicons name="briefcase-outline" size={16} color={Colors.success} />
                      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.success }}>All Weekdays Available</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={[{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 6, paddingVertical: 10, borderRadius: 8, minHeight: 44,
                    backgroundColor: 'rgba(239, 68, 68, 0.08)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)',
                  }, savingQuick === 'weekends' && { opacity: 0.6 }]}
                  onPress={() => bulkSetAvailability('weekends', false)}
                  disabled={!!savingQuick}
                >
                  {savingQuick === 'weekends' ? (
                    <ActivityIndicator size="small" color={Colors.destructive} />
                  ) : (
                    <>
                      <Ionicons name="sunny-outline" size={16} color={Colors.destructive} />
                      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.destructive }}>All Weekends Unavailable</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })()}

        {!isContractor && selectedDate && (() => {
          const assignedJobs = calendarJobsQuery.data?.dailyJobs?.[selectedDate] || [];
          const dayBookedInfo = bookedVehiclesPerDay[selectedDate];
          const dayBookedCount = dayBookedInfo?.vehicleIds?.size || assignedJobs.length;
          const dayAllBooked = totalVehicles > 0 && dayBookedCount >= totalVehicles;
          const currentDayAvail = availability[selectedDate];
          const isCurrentlyAvailable = currentDayAvail?.status === 'available';
          const isCurrentlyUnavailable = currentDayAvail?.status === 'unavailable';

          return (
            <View style={styles.detailCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.detailDate}>
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
                {currentDayAvail && currentDayAvail.status !== 'committed' && (
                  <View style={[{
                    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
                    backgroundColor: isCurrentlyAvailable ? Colors.successBg : Colors.destructiveBg
                  }]}>
                    <Text style={{
                      fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.5,
                      color: isCurrentlyAvailable ? Colors.success : Colors.destructive
                    }}>
                      {currentDayAvail.status?.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>

              {selectedAvail?.shift && (
                <Text style={[styles.detailShift, { marginTop: 4 }]}>
                  {SHIFTS.find(s => s.key === selectedAvail.shift)?.label || selectedAvail.shift}
                </Text>
              )}

              {assignedJobs.length > 0 && (
                <View style={{
                  backgroundColor: dayAllBooked ? Colors.infoBg : 'rgba(59,130,246,0.08)',
                  borderRadius: 12, marginTop: 8, overflow: 'hidden',
                  borderWidth: 1, borderColor: dayAllBooked ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.15)',
                }}>
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}
                    onPress={() => {
                      setTrucksExpanded(!trucksExpanded);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <MaterialCommunityIcons name="dump-truck" size={22} color={Colors.info} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 14, color: Colors.info }}>
                        {assignedJobs.length} JOB{assignedJobs.length !== 1 ? 'S' : ''} BOOKED
                      </Text>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 1 }}>
                        {dayAllBooked ? 'All trucks committed' : `${dayBookedCount} of ${totalVehicles} truck${totalVehicles !== 1 ? 's' : ''} assigned`}
                      </Text>
                    </View>
                    {dayAllBooked && (
                      <View style={{ backgroundColor: Colors.info, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 10, color: '#fff', letterSpacing: 0.5 }}>FULL</Text>
                      </View>
                    )}
                    <Ionicons name={trucksExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.info} />
                  </Pressable>

                  {trucksExpanded && (
                    <View style={{ gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
                      {assignedJobs.map((job, idx) => (
                        <Pressable
                          key={`${job.id}-${idx}`}
                          style={[styles.calJobCard, job.assignmentStatus === 'pending' && { borderColor: Colors.warning, borderWidth: 1, borderStyle: 'dashed' as any }]}
                          onPress={() => {
                            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push(`/job/${job.id}` as any);
                          }}
                        >
                          {job.projectName ? (
                            <Text style={styles.calJobProject} numberOfLines={1}>{job.projectName.toUpperCase()}</Text>
                          ) : null}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.calJobMaterial} numberOfLines={1}>{job.material}</Text>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              {job.isMultiDay && (
                                <View style={[styles.calJobStatusBadge, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
                                  <Text style={[styles.calJobStatusText, { color: '#8b5cf6' }]}>DAY {job.dayNumber}/{job.totalDays}</Text>
                                </View>
                              )}
                              {job.assignmentStatus === 'pending' ? (
                                <View style={[styles.calJobStatusBadge, { backgroundColor: Colors.warningBg }]}>
                                  <Text style={[styles.calJobStatusText, { color: Colors.warning }]}>PENDING</Text>
                                </View>
                              ) : (
                                <View style={[styles.calJobStatusBadge, {
                                  backgroundColor: job.status === 'in_progress' ? Colors.warningBg : Colors.successBg
                                }]}>
                                  <Text style={[styles.calJobStatusText, {
                                    color: job.status === 'in_progress' ? Colors.warning : Colors.success
                                  }]}>{job.status === 'in_progress' ? 'Active' : 'Confirmed'}</Text>
                                </View>
                              )}
                            </View>
                          </View>

                          {job.contractorName ? (
                            <View style={styles.calJobTruckStat}>
                              <Ionicons name="business-outline" size={14} color={Colors.textSecondary} />
                              <Text style={styles.calJobTruckLabel}>{job.contractorName}</Text>
                            </View>
                          ) : null}

                          {job.vehicle ? (
                            <View style={styles.truckAssignmentRow}>
                              <MaterialCommunityIcons name="dump-truck" size={16} color={Colors.primary} />
                              <Text style={styles.truckAssignmentText}>
                                {job.vehicle.year} {job.vehicle.make} {job.vehicle.model}
                              </Text>
                              {job.vehicle.licensePlate ? (
                                <View style={styles.licensePlateBadge}>
                                  <Text style={styles.licensePlateText}>{job.vehicle.licensePlate}</Text>
                                </View>
                              ) : null}
                            </View>
                          ) : (
                            <View style={styles.calJobTruckStat}>
                              <MaterialCommunityIcons name="dump-truck" size={16} color={Colors.textMuted} />
                              <Text style={[styles.calJobTruckLabel, { color: Colors.textMuted, fontStyle: 'italic' }]}>No truck assigned</Text>
                            </View>
                          )}

                          {(job.pickup || job.dropoff) ? (
                            <View style={{ gap: 4 }}>
                              {job.pickup ? (
                                <View style={styles.calJobTruckStat}>
                                  <Ionicons name="location" size={14} color={Colors.success} />
                                  <Text style={styles.calJobTruckLabel} numberOfLines={1}>{job.pickup}</Text>
                                </View>
                              ) : null}
                              {job.dropoff ? (
                                <View style={styles.calJobTruckStat}>
                                  <Ionicons name="flag" size={14} color={Colors.destructive} />
                                  <Text style={styles.calJobTruckLabel} numberOfLines={1}>{job.dropoff}</Text>
                                </View>
                              ) : null}
                            </View>
                          ) : null}

                          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ position: 'absolute', right: 12, top: '50%' }} />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {assignedJobs.length === 0 && !currentDayAvail && (
                <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>No jobs or availability set</Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <Pressable
                  style={[{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, minHeight: 44,
                    borderColor: Colors.success,
                  }, isCurrentlyAvailable && { backgroundColor: Colors.success, borderColor: Colors.success }]}
                  onPress={() => quickSetAvailability(selectedDate, true)}
                  disabled={!!savingQuick}
                >
                  {savingQuick === 'available' ? (
                    <ActivityIndicator size="small" color={Colors.success} />
                  ) : (
                    <>
                      <Ionicons name={isCurrentlyAvailable ? "checkmark-circle" : "checkmark-circle-outline"} size={18} color={isCurrentlyAvailable ? '#fff' : Colors.success} />
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: isCurrentlyAvailable ? '#fff' : Colors.success }}>
                        {isCurrentlyAvailable ? 'Available' : 'Mark Available'}
                      </Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={[{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, minHeight: 44,
                    borderColor: Colors.destructive,
                  }, isCurrentlyUnavailable && { backgroundColor: Colors.destructive, borderColor: Colors.destructive }]}
                  onPress={() => quickSetAvailability(selectedDate, false)}
                  disabled={!!savingQuick}
                >
                  {savingQuick === 'unavailable' ? (
                    <ActivityIndicator size="small" color={Colors.destructive} />
                  ) : (
                    <>
                      <Ionicons name={isCurrentlyUnavailable ? "close-circle" : "close-circle-outline"} size={18} color={isCurrentlyUnavailable ? '#fff' : Colors.destructive} />
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: isCurrentlyUnavailable ? '#fff' : Colors.destructive }}>
                        {isCurrentlyUnavailable ? 'Unavailable' : 'Mark Unavailable'}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
                <Text style={{ fontFamily: 'ChakraPetch_600SemiBold', fontSize: 10, color: Colors.textMuted, letterSpacing: 1 }}>BULK ACTIONS</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  style={[{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 6, paddingVertical: 10, borderRadius: 8, minHeight: 44,
                    backgroundColor: 'rgba(34, 197, 94, 0.08)', borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.2)',
                  }, savingQuick === 'weekdays' && { opacity: 0.6 }]}
                  onPress={() => bulkSetAvailability('weekdays', true)}
                  disabled={!!savingQuick}
                >
                  {savingQuick === 'weekdays' ? (
                    <ActivityIndicator size="small" color={Colors.success} />
                  ) : (
                    <>
                      <Ionicons name="briefcase-outline" size={16} color={Colors.success} />
                      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.success }}>All Weekdays Available</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={[{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 6, paddingVertical: 10, borderRadius: 8, minHeight: 44,
                    backgroundColor: 'rgba(239, 68, 68, 0.08)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)',
                  }, savingQuick === 'weekends' && { opacity: 0.6 }]}
                  onPress={() => bulkSetAvailability('weekends', false)}
                  disabled={!!savingQuick}
                >
                  {savingQuick === 'weekends' ? (
                    <ActivityIndicator size="small" color={Colors.destructive} />
                  ) : (
                    <>
                      <Ionicons name="sunny-outline" size={16} color={Colors.destructive} />
                      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.destructive }}>All Weekends Unavailable</Text>
                    </>
                  )}
                </Pressable>
              </View>

              <Pressable
                style={[styles.detailJobsBtn, { marginTop: 8 }]}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({ pathname: '/jobs-browse', params: { date: selectedDate || '' } } as any);
                }}
              >
                <Ionicons name="search-outline" size={16} color={Colors.primary} />
                <Text style={styles.detailJobsBtnText}>
                  {dateJobsQuery.isLoading ? 'Checking jobs...' :
                    dateJobsQuery.data?.length ? `${dateJobsQuery.data.length} open job${dateJobsQuery.data.length !== 1 ? 's' : ''} on this date` :
                    'Browse jobs on this date'}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
              </Pressable>
            </View>
          );
        })()}

        <Text style={styles.helpText}>
          {isContractor
            ? 'Tap a date to manage availability and view scheduled jobs.'
            : 'Tap a date to manage availability and view booked jobs.'}
        </Text>
      </ScrollView>

      {!isContractor && <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <Pressable style={styles.modalOverlay} onPress={handleCancel}>
          <Pressable style={styles.modalContent} onPress={() => setShowTypeDropdown(false)}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ADD AVAILABILITY</Text>
              <Pressable onPress={handleCancel} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </Pressable>
            </View>

            {modalDate && (
              <View style={styles.modalDateBanner}>
                <Text style={styles.modalDateText}>{formatModalDate(modalDate)}</Text>
              </View>
            )}

            <Text style={styles.modalSectionLabel}>SHIFT</Text>
            <View style={styles.shiftRow}>
              {SHIFTS.map(shift => {
                const active = modalShift === shift.key;
                return (
                  <Pressable
                    key={shift.key}
                    style={[styles.shiftBtn, active && styles.shiftBtnActive]}
                    onPress={() => {
                      setModalShift(shift.key);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Ionicons
                      name={shift.icon}
                      size={18}
                      color={active ? Colors.primary : Colors.textMuted}
                    />
                    <Text style={[styles.shiftBtnText, active && styles.shiftBtnTextActive]}>
                      {shift.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.modalSectionLabel}>TYPE</Text>
            <Pressable
              style={styles.typeSelector}
              onPress={() => setShowTypeDropdown(!showTypeDropdown)}
            >
              <Text style={styles.typeSelectorText}>{selectedType?.label}</Text>
              <Ionicons
                name={showTypeDropdown ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={Colors.textMuted}
              />
            </Pressable>
            {showTypeDropdown && (
              <View style={styles.typeDropdown}>
                {AVAILABILITY_TYPES.map(type => (
                  <Pressable
                    key={type.key}
                    style={[styles.typeOption, modalType === type.key && styles.typeOptionActive]}
                    onPress={() => {
                      setModalType(type.key);
                      setShowTypeDropdown(false);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={[styles.typeOptionText, modalType === type.key && styles.typeOptionTextActive]}>
                      {type.label}
                    </Text>
                    {modalType === type.key && (
                      <Ionicons name="checkmark" size={16} color={Colors.primary} />
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={styles.modalSectionLabel}>NOTES (OPTIONAL)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="e.g., Prefer local jobs only"
              placeholderTextColor={Colors.textMuted}
              value={modalNotes}
              onChangeText={setModalNotes}
              multiline
            />

            <Pressable
              style={styles.checkJobsBtn}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setModalVisible(false);
                router.push({ pathname: '/jobs-browse', params: { date: modalDate || '' } } as any);
              }}
            >
              <Ionicons name="search-outline" size={18} color={Colors.primary} />
              <Text style={styles.checkJobsBtnText}>Check for Jobs on This Date</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>

            <View style={styles.modalFooter}>
              {selectedDate && availability[selectedDate] && availability[selectedDate].status !== 'committed' && (
                <Pressable style={styles.removeBtn} onPress={handleRemove}>
                  <Ionicons name="trash-outline" size={16} color={Colors.destructive} />
                </Pressable>
              )}
              <View style={{ flex: 1 }} />
              <Pressable style={styles.cancelBtn} onPress={handleCancel}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Ionicons name="save-outline" size={16} color={Colors.primaryForeground} />
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 2,
  },
  fleetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  fleetBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.primary,
  },
  scrollContent: { padding: 16 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
  },
  monthTitle: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 18,
    color: Colors.text,
  },
  calendarCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayHeaderText: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.textMuted,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dayCellSelected: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
  },
  dayCellAllBooked: {
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  dayCellSomeBooked: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderStyle: 'dashed' as any,
  },
  dayNumber: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  dayNumberToday: {
    color: Colors.primary,
    fontFamily: 'Inter_700Bold',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  todayIndicator: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  detailCard: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  detailDate: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  detailBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  detailShift: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  detailCompany: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  detailNotes: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  detailJobsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primaryLight,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginTop: 4,
  },
  detailJobsBtnText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.primary,
  },
  helpText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
    letterSpacing: 1,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDateBanner: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 153, 0, 0.2)',
  },
  modalDateText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
    textAlign: 'center',
  },
  modalSectionLabel: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  shiftRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  shiftBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
  },
  shiftBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  shiftBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.textMuted,
  },
  shiftBtnTextActive: {
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
  },
  typeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 4,
  },
  typeSelectorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  typeDropdown: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  typeOptionActive: {
    backgroundColor: Colors.primaryLight,
  },
  typeOptionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  typeOptionTextActive: {
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
  },
  checkJobsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.primaryLight,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 8,
  },
  checkJobsBtnText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.primary,
  },
  notesInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.text,
    minHeight: 44,
    marginBottom: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  removeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.destructive,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.primaryForeground,
  },
  capacityDotsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 1,
  },
  truckCountBadge: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 8,
    color: Colors.textMuted,
    marginTop: 1,
  },
  capacityCard: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  capacityBarOuter: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  capacityBarInner: {
    height: '100%',
    borderRadius: 4,
    minWidth: 2,
  },
  capacityStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  capacityStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  capacityStatValue: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 20,
    color: Colors.text,
  },
  capacityStatLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  capacityStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },
  noFleetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  noFleetText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.warning,
    flex: 1,
  },
  calJobCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    paddingRight: 32,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  calJobProject: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 11,
    color: Colors.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  calJobMaterial: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 15,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  calJobStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  calJobStatusText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  calJobTruckRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    flexWrap: 'wrap' as const,
  },
  calJobTruckStat: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
  },
  calJobTruckLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  assignedJobsTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  truckAssignmentRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  truckAssignmentText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.primary,
    flex: 1,
  },
  licensePlateBadge: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  licensePlateText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: Colors.text,
    letterSpacing: 0.5,
  },
});
