import { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/query-client';
import { queryClient, getApiUrl } from '@/lib/query-client';

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
  const [availability, setAvailability] = useState<Record<string, { status: AvailabilityStatus; name?: string; shift?: string; notes?: string; startTime?: string; endTime?: string }>>({});

  const [modalVisible, setModalVisible] = useState(false);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalShift, setModalShift] = useState('day');
  const [modalType, setModalType] = useState('available_day');
  const [modalNotes, setModalNotes] = useState('');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [saving, setSaving] = useState(false);

  const availQuery = useQuery<any[]>({
    queryKey: ['/api/availability', `?month=${currentMonth + 1}&year=${currentYear}`],
    enabled: !!user,
  });

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

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const dateJobsQuery = useQuery<any[]>({
    queryKey: ['/api/jobs', `?date=${selectedDate}&status=open`],
    enabled: !!user && !!selectedDate,
  });

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
        <Text style={styles.headerTitle}>AVAILABILITY</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === 'web' ? 134 : 100 }]} showsVerticalScrollIndicator={false}>
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

              return (
                <Pressable
                  key={key}
                  style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                  onPress={() => openModal(day)}
                >
                  <Text style={[
                    styles.dayNumber,
                    isToday && styles.dayNumberToday,
                    day.status === 'committed' && { color: Colors.info },
                  ]}>
                    {day.date}
                  </Text>
                  {day.status === 'available' && <View style={[styles.statusDot, { backgroundColor: Colors.success }]} />}
                  {day.status === 'unavailable' && <View style={[styles.statusDot, { backgroundColor: Colors.destructive }]} />}
                  {day.status === 'committed' && <View style={[styles.statusDot, { backgroundColor: Colors.info }]} />}
                  {isToday && <View style={styles.todayIndicator} />}
                </Pressable>
              );
            })}
          </View>
        </View>

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
            <Text style={styles.legendText}>Committed</Text>
          </View>
        </View>

        {selectedDate && selectedAvail && (
          <View style={styles.detailCard}>
            <Text style={styles.detailDate}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
            <View style={styles.detailRow}>
              <View style={[styles.detailBadge, {
                backgroundColor: selectedAvail.status === 'committed' ? Colors.infoBg :
                  selectedAvail.status === 'available' ? Colors.successBg : Colors.destructiveBg
              }]}>
                <Text style={[styles.detailBadgeText, {
                  color: selectedAvail.status === 'committed' ? Colors.info :
                    selectedAvail.status === 'available' ? Colors.success : Colors.destructive
                }]}>
                  {selectedAvail.status?.toUpperCase()}
                </Text>
              </View>
              {selectedAvail.shift && (
                <Text style={styles.detailShift}>
                  {SHIFTS.find(s => s.key === selectedAvail.shift)?.label || selectedAvail.shift}
                </Text>
              )}
            </View>
            {selectedAvail.name && (
              <Text style={styles.detailCompany}>{selectedAvail.name}</Text>
            )}
            {selectedAvail.notes ? (
              <Text style={styles.detailNotes}>{selectedAvail.notes}</Text>
            ) : null}

            <Pressable
              style={styles.detailJobsBtn}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: '/jobs-browse', params: { date: selectedDate || '' } } as any);
              }}
            >
              <Ionicons name="search-outline" size={16} color={Colors.primary} />
              <Text style={styles.detailJobsBtnText}>
                {dateJobsQuery.isLoading ? 'Checking jobs...' :
                  dateJobsQuery.data?.length ? `${dateJobsQuery.data.length} open job${dateJobsQuery.data.length !== 1 ? 's' : ''} on this date` :
                  'Check for jobs on this date'}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </Pressable>
          </View>
        )}

        <Text style={styles.helpText}>
          Tap a date to set your availability. Committed days are locked to accepted jobs.
        </Text>
      </ScrollView>

      <Modal
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
      </Modal>
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
});
