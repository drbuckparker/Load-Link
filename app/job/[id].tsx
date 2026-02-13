import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { MOCK_JOBS, formatRate, formatJobType, formatTruckType, getStatusColor, getJobTypeColor } from '@/lib/mock-data';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const job = MOCK_JOBS.find(j => j.id === id);

  const [jobStatus, setJobStatus] = useState(job?.status || 'open');
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  if (!job) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.errorText}>Job not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={{ color: Colors.primary, fontFamily: 'Inter_500Medium' }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const statusColor = getStatusColor(jobStatus);
  const jobTypeColor = getJobTypeColor(job.jobType);
  const isMyJob = job.driverId === user?.id;
  const canAccept = jobStatus === 'open' && !isMyJob;
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

  function handleAccept() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setJobStatus('accepted');
  }

  function handleStartJob() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setJobStatus('in_progress');
    setIsRunning(true);
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

  function doStop() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsRunning(false);
    setJobStatus('completed');
  }

  const actualMinutes = Math.floor(elapsedSeconds / 60);
  const billedMinutes = getBilledMinutes(actualMinutes);

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
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
                <Text style={styles.detailValue}>{job.capacityNeeded}</Text>
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

        {canAccept && (
          <Pressable
            style={({ pressed }) => [styles.acceptBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
            onPress={handleAccept}
          >
            <Ionicons name="checkmark-circle" size={20} color={Colors.primaryForeground} />
            <Text style={styles.acceptBtnText}>ACCEPT JOB</Text>
          </Pressable>
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
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 52,
    gap: 8,
    marginTop: 8,
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
});
