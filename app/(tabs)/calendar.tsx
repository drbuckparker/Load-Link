import { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/query-client';
import { queryClient } from '@/lib/query-client';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type AvailabilityStatus = 'available' | 'unavailable' | 'committed' | null;

interface DayData {
  date: number;
  month: number;
  year: number;
  status: AvailabilityStatus;
  commitmentName?: string;
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [availability, setAvailability] = useState<Record<string, { status: AvailabilityStatus; name?: string }>>({});

  const availQuery = useQuery<any[]>({
    queryKey: ['/api/availability', `?month=${currentMonth + 1}&year=${currentYear}`],
    enabled: !!user,
  });

  useEffect(() => {
    if (availQuery.data) {
      const mapped: Record<string, { status: AvailabilityStatus; name?: string }> = {};
      for (const item of availQuery.data) {
        const d = new Date(item.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (item.job_id || item.commitment_type) {
          mapped[key] = { status: 'committed', name: item.commitment_company_name || 'Job' };
        } else if (item.is_available) {
          mapped[key] = { status: 'available' };
        } else {
          mapped[key] = { status: 'unavailable' };
        }
      }
      setAvailability(mapped);
    }
  }, [availQuery.data]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
      });
    }
    return days;
  }, [currentMonth, currentYear, availability]);

  async function toggleAvailability(day: DayData) {
    if (day.status === 'committed') return;
    const key = `${day.year}-${String(day.month + 1).padStart(2, '0')}-${String(day.date).padStart(2, '0')}`;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const current = availability[key]?.status;
    let next: AvailabilityStatus;
    if (!current) next = 'available';
    else if (current === 'available') next = 'unavailable';
    else next = null;

    setAvailability(prev => {
      if (next === null) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: { status: next } };
    });
    setSelectedDate(key);

    try {
      await apiRequest('POST', '/api/availability', {
        date: key,
        isAvailable: next === 'available',
        startTime: '06:00',
        endTime: '18:00',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/availability'] });
    } catch (e) {
      console.log('Failed to save availability:', e);
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

  const selectedAvail = selectedDate ? availability[selectedDate] : null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Text style={styles.headerTitle}>AVAILABILITY</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
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
                  onPress={() => toggleAvailability(day)}
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
            {selectedAvail.name && (
              <Text style={styles.detailCompany}>{selectedAvail.name}</Text>
            )}
          </View>
        )}

        <Text style={styles.helpText}>
          Tap a date to toggle availability. Committed days are locked to accepted jobs.
        </Text>
      </ScrollView>
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
  detailCompany: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  helpText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});
