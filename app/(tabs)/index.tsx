import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform, Switch, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, queryClient } from '@/lib/query-client';
import { timeAgo } from '@/lib/mock-data';
import MapSection from '@/components/MapSection';

function isContractorRole(role: string): boolean {
  return role.includes('contractor');
}

interface DashboardData {
  userName: string;
  role: string;
  activeJobs: number;
  isConnected: boolean;
  quickJob: { material: string; address: string } | null;
  earnings: { total: number; awaiting: number; thisMonth: number; thisWeek: number };
  location: { lat: number | null; lng: number | null; address: string | null };
  upcomingDays: { date: string; dayName: string; dayNum: number; status: string; jobs?: { id: string; material: string; projectName: string; contractorName?: string; trucksNeeded: number; applied?: number; assigned?: number; status: string; assignmentStatus?: string; assignedVehicles?: any[] }[] }[];
  recentActivity: { id: string; type: string; title: string; message: string; createdAt: string; isRead: boolean }[];
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  const role = user?.role || 'driver';
  const contractor = isContractorRole(role);
  const { data: notifsData } = useQuery<any[]>({
    queryKey: ['/api/notifications'],
  });

  const { data: dashboard, isLoading } = useQuery<DashboardData>({
    queryKey: ['/api/dashboard'],
  });

  const { data: contractorJobs } = useQuery<any[]>({
    queryKey: ['/api/contractor/jobs'],
    enabled: contractor,
  });

  const unreadCount = (notifsData || []).filter((n: any) => !(n.is_read ?? n.isRead)).length;

  const [switchingRole, setSwitchingRole] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deviceLat, setDeviceLat] = useState<number | null>(null);
  const [deviceLng, setDeviceLng] = useState<number | null>(null);
  const [deviceAddress, setDeviceAddress] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'web') {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setDeviceLat(pos.coords.latitude);
                setDeviceLng(pos.coords.longitude);
              },
              () => {}
            );
          }
          return;
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setDeviceLat(loc.coords.latitude);
        setDeviceLng(loc.coords.longitude);
        try {
          const [geo] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          if (geo) {
            const parts = [geo.city, geo.region].filter(Boolean);
            setDeviceAddress(parts.join(', ') || geo.name || null);
          }
        } catch {}
        try {
          await apiRequest('PUT', '/api/profile', {
            last_latitude: loc.coords.latitude,
            last_longitude: loc.coords.longitude,
          });
        } catch {}
      } catch {}
    })();
  }, []);

  const mapLat = deviceLat || dashboard?.location?.lat || undefined;
  const mapLng = deviceLng || dashboard?.location?.lng || undefined;
  const mapAddress = deviceAddress || dashboard?.location?.address || undefined;

  async function handleStatusToggle(value: boolean) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest('PUT', '/api/profile/status', { isConnected: value });
    } catch {}
    await updateUser({ isConnected: value });
    queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
  }

  async function handleRoleToggle(newRole: string) {
    if (newRole === role || switchingRole) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSwitchingRole(true);
    try {
      await apiRequest('PUT', '/api/profile/role', { role: newRole });
      await updateUser({ role: newRole });
      queryClient.invalidateQueries();
    } catch {}
    setSwitchingRole(false);
  }

  if (!user) return null;

  function renderEarningsStats() {
    const stats = dashboard?.earnings || { total: 0, awaiting: 0, thisMonth: 0, thisWeek: 0 };
    const items = [
      { label: 'TOTAL EARNINGS', value: stats.total, sub: 'Total Earnings', tab: 'earnings' },
      { label: 'AWAITING PAYMENT', value: stats.awaiting, sub: 'Pending Jobs', tab: 'earnings' },
      { label: 'THIS MONTH', value: stats.thisMonth, sub: 'Earnings', tab: 'earnings' },
      { label: 'THIS WEEK', value: stats.thisWeek, sub: 'Earnings', tab: 'earnings' },
    ];
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroll}>
        {items.map((item, i) => (
          <Pressable
            key={i}
            style={styles.statCard}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/earnings' as any);
            }}
          >
            <Text style={styles.statLabel}>{item.label}</Text>
            <View style={styles.statValueRow}>
              <Text style={styles.statValue}>${item.value.toFixed(2)}</Text>
              <Ionicons name="cash-outline" size={18} color={Colors.primary} />
            </View>
            <Text style={styles.statSub}>{item.sub}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={styles.statChevron} />
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  function renderContractorStats() {
    const jobs = contractorJobs || [];
    const openJobs = jobs.filter((j: any) => j.status === 'open').length;
    const inProgress = jobs.filter((j: any) => j.status === 'in_progress' || j.status === 'accepted').length;
    const completed = jobs.filter((j: any) => j.status === 'completed').length;
    const totalApps = jobs.reduce((sum: number, j: any) => sum + (Number(j.application_count) || 0), 0);

    const items = [
      { label: 'OPEN JOBS', value: openJobs.toString(), sub: 'Active Postings', icon: 'briefcase-outline' as const, filter: 'Open' },
      { label: 'IN PROGRESS', value: inProgress.toString(), sub: 'Being Worked', icon: 'play-circle-outline' as const, filter: 'In Progress' },
      { label: 'APPLICATIONS', value: totalApps.toString(), sub: 'Total Received', icon: 'people-outline' as const, filter: 'All' },
      { label: 'COMPLETED', value: completed.toString(), sub: 'Total Jobs', icon: 'checkmark-circle-outline' as const, filter: 'Completed' },
    ];
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroll}>
        {items.map((item, i) => (
          <Pressable
            key={i}
            style={styles.statCard}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: '/jobs-browse', params: { filter: item.filter } } as any);
            }}
          >
            <Text style={styles.statLabel}>{item.label}</Text>
            <View style={styles.statValueRow}>
              <Text style={styles.statValue}>{item.value}</Text>
              <Ionicons name={item.icon} size={18} color={Colors.primary} />
            </View>
            <Text style={styles.statSub}>{item.sub}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={styles.statChevron} />
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.logoMark}>
            <Ionicons name="cube" size={20} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>DASHBOARD</Text>
            <Text style={styles.headerSubtitle}>Welcome Back, {user.firstName}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.findLoadsBtn}
            onPress={() => router.push('/jobs-browse' as any)}
          >
            <Text style={styles.findLoadsBtnText}>{contractor ? 'MY JOBS' : 'FIND LOADS'}</Text>
          </Pressable>
          <Pressable style={styles.notifBtn} onPress={() => router.push('/notifications')}>
            <Ionicons name="notifications-outline" size={22} color={Colors.text} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.roleToggleContainer}>
        <Pressable
          style={[styles.roleToggleBtn, role === 'trucking_company' && styles.roleToggleBtnActive]}
          onPress={() => handleRoleToggle('trucking_company')}
          disabled={switchingRole}
        >
          <MaterialCommunityIcons name="dump-truck" size={16} color={role === 'trucking_company' ? Colors.primaryForeground : Colors.textMuted} />
          <Text style={[styles.roleToggleText, role === 'trucking_company' && styles.roleToggleTextActive]}>Fleet Manager</Text>
        </Pressable>
        <Pressable
          style={[styles.roleToggleBtn, isContractorRole(role) && styles.roleToggleBtnActive]}
          onPress={() => handleRoleToggle('contractor')}
          disabled={switchingRole}
        >
          <Ionicons name="construct" size={16} color={isContractorRole(role) ? Colors.primaryForeground : Colors.textMuted} />
          <Text style={[styles.roleToggleText, isContractorRole(role) && styles.roleToggleTextActive]}>Construction Co</Text>
        </Pressable>
        {switchingRole && <ActivityIndicator size="small" color={Colors.primary} style={styles.roleSpinner} />}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === 'web' ? 34 + 100 : 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await queryClient.invalidateQueries(); setRefreshing(false); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
      >
        {!contractor && dashboard?.quickJob ? (
          <Pressable
            style={styles.quickJobCard}
            onPress={() => router.push('/jobs-browse' as any)}
          >
            <View style={styles.quickJobIcon}>
              <Ionicons name="flash" size={22} color={Colors.primary} />
            </View>
            <View style={styles.quickJobContent}>
              <Text style={styles.quickJobTitle}>QUICK JOB</Text>
              <Text style={styles.quickJobText} numberOfLines={1}>
                {dashboard.quickJob.material} - {dashboard.quickJob.address}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
        ) : !contractor ? (
          <View style={styles.quickJobCard}>
            <View style={styles.quickJobIcon}>
              <Ionicons name="flash" size={22} color={Colors.primary} />
            </View>
            <View style={styles.quickJobContent}>
              <Text style={styles.quickJobTitle}>QUICK JOB</Text>
              <Text style={styles.quickJobText}>No open jobs nearby right now</Text>
            </View>
          </View>
        ) : null}

        {!contractor && (
          <Text style={styles.sectionHint}>Check back later or expand your search radius in Settings</Text>
        )}

        {contractor ? renderContractorStats() : renderEarningsStats()}

        <View style={styles.mapStatusRow}>
          <View style={styles.mapContainer}>
            <View style={styles.mapSectionHeader}>
              <Ionicons name="location" size={14} color={Colors.text} />
              <Text style={styles.mapSectionTitle}>CURRENT LOCATION</Text>
            </View>
            <MapSection
              address={mapAddress || null}
              defaultLat={mapLat}
              defaultLng={mapLng}
            />
          </View>

          <View style={styles.statusCard}>
            <Text style={styles.statusSectionTitle}>STATUS</Text>
            <Text style={styles.statusLabel}>CURRENT STATUS</Text>
            <Text style={styles.statusValue}>{user.isConnected ? 'AVAILABLE' : 'OFFLINE'}</Text>
            <View style={styles.statusDivider} />
            <Text style={styles.statusLabel}>CONNECTION</Text>
            <View style={styles.statusConnRow}>
              <View style={[styles.connDot, { backgroundColor: user.isConnected ? Colors.success : Colors.destructive }]} />
              <Text style={styles.connText}>{user.isConnected ? 'Online' : 'Offline'}</Text>
            </View>
            <View style={{ marginTop: 10 }}>
              <Switch
                value={user.isConnected}
                onValueChange={handleStatusToggle}
                trackColor={{ false: Colors.border, true: Colors.success }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        <View style={styles.upcomingSection}>
          <View style={styles.upcomingHeader}>
            <View style={styles.upcomingHeaderLeft}>
              <Ionicons name="calendar-outline" size={16} color={Colors.text} />
              <Text style={styles.upcomingSectionTitle}>UPCOMING JOBS</Text>
            </View>
            <Pressable onPress={() => router.push('/(tabs)/calendar')}>
              <Text style={styles.scheduleLink}>Schedule</Text>
            </Pressable>
          </View>

          {(dashboard?.upcomingDays || getDefaultDays()).map((day, i) => {
            const hasJobs = day.jobs && day.jobs.length > 0;
            return (
              <View key={i}>
                <Pressable
                  style={styles.upcomingRow}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (hasJobs) {
                      router.push('/(tabs)/calendar');
                    } else if (day.status === 'available' || day.status === 'unavailable') {
                      router.push('/(tabs)/calendar');
                    } else {
                      router.push('/jobs-browse' as any);
                    }
                  }}
                >
                  <View style={styles.dateBox}>
                    <Text style={styles.dateDay}>{day.dayName}</Text>
                    <Text style={styles.dateNum}>{day.dayNum}</Text>
                  </View>
                  {!hasJobs ? (
                    <>
                      <Text style={styles.upcomingStatus}>
                        {day.status === 'available' ? 'Available' : day.status === 'unavailable' ? 'Unavailable' : day.status}
                      </Text>
                      <View style={styles.openBadge}>
                        <Text style={styles.openBadgeText}>OPEN</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                    </>
                  ) : (
                    <View style={{ flex: 1 }}>
                      {day.jobs!.map((job) => (
                        <Pressable
                          key={job.id}
                          style={styles.weekJobItem}
                          onPress={() => {
                            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push(`/job/${job.id}` as any);
                          }}
                        >
                          {job.projectName ? (
                            <Text style={styles.weekJobProject} numberOfLines={1}>{job.projectName.toUpperCase()}</Text>
                          ) : null}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.weekJobMaterial} numberOfLines={1}>{job.material}</Text>
                            {contractor ? (
                              <View style={[styles.weekJobStatusBadge, {
                                backgroundColor: job.status === 'open' || job.status === 'pending' ? Colors.successBg :
                                  job.status === 'in_progress' ? Colors.warningBg : Colors.infoBg
                              }]}>
                                <Text style={[styles.weekJobStatusText, {
                                  color: job.status === 'open' || job.status === 'pending' ? Colors.success :
                                    job.status === 'in_progress' ? Colors.warning : Colors.info
                                }]}>{job.status === 'in_progress' ? 'ACTIVE' : job.status.toUpperCase()}</Text>
                              </View>
                            ) : (
                              <View style={[styles.weekJobStatusBadge, {
                                backgroundColor: job.assignmentStatus === 'pending' ? Colors.warningBg :
                                  job.status === 'in_progress' ? Colors.warningBg : Colors.successBg
                              }]}>
                                <Text style={[styles.weekJobStatusText, {
                                  color: job.assignmentStatus === 'pending' ? Colors.warning :
                                    job.status === 'in_progress' ? Colors.warning : Colors.success
                                }]}>
                                  {job.assignmentStatus === 'pending' ? 'PENDING' :
                                    job.status === 'in_progress' ? 'ACTIVE' : 'CONFIRMED'}
                                </Text>
                              </View>
                            )}
                          </View>
                          {contractor ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <MaterialCommunityIcons name="dump-truck" size={13} color={Colors.primary} />
                              <Text style={styles.weekJobStat}>{job.assigned || 0}/{job.trucksNeeded} trucks</Text>
                              <Ionicons name="people" size={13} color={(job.applied || 0) > 0 ? Colors.info : Colors.textMuted} />
                              <Text style={[styles.weekJobStat, (job.applied || 0) > 0 && { color: Colors.info }]}>{job.applied || 0} applied</Text>
                            </View>
                          ) : (
                            job.contractorName ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Ionicons name="business-outline" size={13} color={Colors.textSecondary} />
                                <Text style={styles.weekJobStat} numberOfLines={1}>{job.contractorName}</Text>
                              </View>
                            ) : null
                          )}
                          {job.assignedVehicles && job.assignedVehicles.length > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                              <Ionicons name="checkmark-circle" size={11} color={Colors.success} />
                              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.success }}>
                                {job.assignedVehicles.map((v: any) => [v.year, v.make, v.model].filter(Boolean).join(' ')).join(', ')}
                              </Text>
                            </View>
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

        {(dashboard?.recentActivity || []).length > 0 && (
          <View style={styles.activitySection}>
            <View style={styles.activityHeader}>
              <Text style={styles.activityTitle}>RECENT ACTIVITY</Text>
              <Pressable onPress={() => router.push('/notifications')}>
                <Text style={styles.scheduleLink}>View All</Text>
              </Pressable>
            </View>
            {(dashboard?.recentActivity || []).map(a => (
              <Pressable
                key={a.id}
                style={styles.activityRow}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/notifications');
                }}
              >
                <View style={[styles.activityDot, { backgroundColor: a.isRead ? Colors.textMuted : Colors.primary }]} />
                <View style={styles.activityContent}>
                  <Text style={styles.activityText}>{a.title}</Text>
                  <Text style={styles.activityTime}>{timeAgo(a.createdAt)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}

        {contractor && (
          <Pressable
            style={styles.createJobBtn}
            onPress={() => router.push('/create-job' as any)}
          >
            <Ionicons name="add-circle" size={20} color={Colors.primaryForeground} />
            <Text style={styles.createJobBtnText}>POST NEW JOB</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function getDefaultDays() {
  const days = [];
  const now = new Date();
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  for (let i = 0; i < 5; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    days.push({
      date: d.toISOString().split('T')[0],
      dayName: dayNames[d.getDay()],
      dayNum: d.getDate(),
      status: 'available',
    });
  }
  return days;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  roleToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  roleToggleBtnActive: {
    backgroundColor: Colors.primary,
  },
  roleToggleText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 12,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  roleToggleTextActive: {
    color: Colors.primaryForeground,
  },
  roleSpinner: {
    position: 'absolute',
    right: 12,
  },
  findLoadsBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  findLoadsBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 11,
    color: Colors.primaryForeground,
    letterSpacing: 1,
  },
  notifBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: '#fff',
  },
  scrollContent: { padding: 16 },
  quickJobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
    marginBottom: 6,
  },
  quickJobIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickJobContent: { flex: 1 },
  quickJobTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  quickJobText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  sectionHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  statsScroll: {
    gap: 10,
    paddingBottom: 4,
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    width: 150,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statLabel: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.text,
  },
  statSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  statChevron: {
    position: 'absolute',
    top: 14,
    right: 12,
  },
  mapStatusRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  mapContainer: {
    flex: 1,
  },
  mapSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  mapSectionTitle: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 12,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  statusCard: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 14,
  },
  statusSectionTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
    color: Colors.primaryForeground,
    letterSpacing: 1,
    marginBottom: 10,
  },
  statusLabel: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 9,
    color: 'rgba(22, 26, 34, 0.6)',
    letterSpacing: 0.5,
  },
  statusValue: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.primaryForeground,
    marginBottom: 6,
  },
  statusDivider: {
    height: 1,
    backgroundColor: 'rgba(22, 26, 34, 0.15)',
    marginVertical: 8,
  },
  statusConnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  connDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.primaryForeground,
  },
  upcomingSection: {
    marginBottom: 16,
  },
  upcomingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  upcomingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  upcomingSectionTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  scheduleLink: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.primary,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 6,
    gap: 14,
  },
  dateBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  dateNum: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.text,
  },
  upcomingStatus: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
  },
  openBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  openBadgeText: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  weekJobItem: {
    paddingVertical: 6,
    borderBottomWidth: 0,
    gap: 3,
  },
  weekJobProject: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 10,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  weekJobMaterial: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  weekJobStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  weekJobStatusText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    letterSpacing: 0.3,
  },
  weekJobStat: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textSecondary,
  },
  activitySection: {
    marginBottom: 16,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  activityTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  activityContent: { flex: 1 },
  activityText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text,
  },
  activityTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  createJobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 50,
    gap: 8,
  },
  createJobBtnText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: Colors.primaryForeground,
    letterSpacing: 1,
  },
});
