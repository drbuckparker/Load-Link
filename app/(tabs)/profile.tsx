import { View, Text, ScrollView, Pressable, StyleSheet, Switch, Platform, Alert, Linking, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useRef } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import TruckIcon from '@/components/TruckIcon';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { formatTruckType } from '@/lib/mock-data';
import { apiRequest } from '@/lib/query-client';
import { queryClient } from '@/lib/query-client';
import { useQuery } from '@tanstack/react-query';
import { Earning } from '@/lib/mock-data';
import LocationPickerModal from '@/components/LocationPickerModal';

function isContractorRole(role: string): boolean {
  return role.includes('contractor') || role === 'trucking_company';
}

type SettingsTab = 'profile' | 'role' | 'earnings' | 'help' | 'account' | 'billing';

const TABS: { key: SettingsTab; label: string; icon: string }[] = [
  { key: 'profile', label: 'Profile', icon: 'person-outline' },
  { key: 'role', label: 'Role', icon: 'swap-horizontal' },
  { key: 'earnings', label: 'Earnings', icon: 'wallet-outline' },
  { key: 'help', label: 'Help', icon: 'help-circle-outline' },
  { key: 'account', label: 'Account', icon: 'shield-outline' },
  { key: 'billing', label: 'Billing', icon: 'card-outline' },
];

const ROLES = [
  { key: 'trucking_company_contractor', label: 'TRUCKING COMPANY + CONTRACTOR', desc: 'Manage fleet and post loads', icon: 'business', color: '#8b5cf6' },
  { key: 'trucking_company', label: 'TRUCKING COMPANY', desc: 'Manage fleet and assign loads', icon: 'people', color: '#f97316' },
  { key: 'contractor', label: 'CONTRACTOR', desc: 'Post loads and manage drivers', icon: 'construct', color: '#eab308' },
  { key: 'driver', label: 'DRIVER', desc: 'Haul loads and earn money', icon: 'car', color: '#22c55e' },
  { key: 'driver_contractor', label: 'DRIVER + CONTRACTOR', desc: 'Haul loads and post jobs', icon: 'git-merge', color: '#3b82f6' },
  { key: 'foreman', label: 'FOREMAN', desc: 'Manage loads for a company', icon: 'clipboard', color: '#f59e0b' },
  { key: 'driver_trucking_company', label: 'DRIVER + TRUCKING CO.', desc: 'Drive and manage fleet', icon: 'git-network', color: '#06b6d4' },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, updateUser, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [refreshing, setRefreshing] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [locationPickerType, setLocationPickerType] = useState<'primary' | 'secondary' | null>(null);
  const [editField, setEditField] = useState<{ label: string; key: string; value: string; apiKey: string; keyboard?: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [earningsPeriod, setEarningsPeriod] = useState<'week' | 'month' | 'all'>('month');

  const earningsQuery = useQuery<any>({
    queryKey: [`/api/earnings?period=${earningsPeriod}`],
    enabled: activeTab === 'earnings',
  });

  const { data: vehiclesList } = useQuery<any[]>({
    queryKey: ['/api/vehicles'],
    enabled: !!user,
  });

  function openFieldEditor(label: string, key: string, currentValue: string, apiKey: string, keyboard?: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditField({ label, key, value: currentValue, apiKey, keyboard });
    setEditValue(currentValue);
  }

  async function saveFieldEdit() {
    if (!editField) return;
    setSaving(true);
    try {
      await apiRequest('PUT', '/api/profile', { [editField.apiKey]: editValue.trim() });
      await updateUser({ [editField.key]: editValue.trim() });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditField(null);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusToggle(value: boolean) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest('PUT', '/api/profile/status', { isConnected: value });
    } catch {}
    await updateUser({ isConnected: value });
  }

  async function handleRoleSwitch(role: string) {
    if (role === user?.role) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const doSwitch = async () => {
      setSwitchingRole(true);
      try {
        const res = await apiRequest('PUT', '/api/profile/role', { role });
        const data = await res.json();
        await refreshUser();
        queryClient.invalidateQueries();
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to switch role');
      } finally {
        setSwitchingRole(false);
      }
    };

    if (Platform.OS === 'web') {
      doSwitch();
      return;
    }
    Alert.alert('Switch Role', `Switch your role to ${role.replace(/_/g, ' ')}? The app will adjust to show features for this role.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Switch', onPress: doSwitch },
    ]);
  }

  async function handleLogout() {
    if (Platform.OS === 'web') {
      await logout();
      router.replace('/(auth)/login');
      return;
    }
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  if (!user) return null;

  const radiusOptions = [50, 100, 250];

  function renderProfileTab() {
    return (
      <>
        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>{user.firstName.charAt(0)}{user.lastName.charAt(0)}</Text>
          </View>
          <Text style={styles.profileName}>{user.fullName}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{user.role.replace(/_/g, ' ').toUpperCase()}</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{user.totalJobs}</Text>
              <Text style={styles.statLabel}>Jobs</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color={Colors.warning} />
                <Text style={styles.statNumber}>{user.rating.toFixed(1)}</Text>
              </View>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{user.searchRadiusMiles}</Text>
              <Text style={styles.statLabel}>mi radius</Text>
            </View>
          </View>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusLeft}>
            <View style={[styles.statusDot, { backgroundColor: user.isConnected ? Colors.success : Colors.destructive }]} />
            <View>
              <Text style={styles.statusTitle}>{user.isConnected ? 'Online' : 'Unavailable'}</Text>
              <Text style={styles.statusSubtitle}>Toggle your availability</Text>
            </View>
          </View>
          <Switch
            value={user.isConnected}
            onValueChange={handleStatusToggle}
            trackColor={{ false: Colors.border, true: Colors.success }}
            thumbColor="#fff"
          />
        </View>

        <Text style={styles.sectionTitle}>CONTACT</Text>
        <View style={styles.infoCard}>
          <Pressable style={styles.infoRow} onPress={() => openFieldEditor('Email', 'email', user.email || '', 'email', 'email-address')}>
            <Ionicons name="mail-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{user.email}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>
          <Pressable style={styles.infoRow} onPress={() => openFieldEditor('Phone', 'phone', user.phone || '', 'phone', 'phone-pad')}>
            <Ionicons name="call-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={[styles.infoValue, !user.phone && styles.infoValueMuted]} numberOfLines={1}>{user.phone || 'Not set'}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>
          <Pressable style={styles.infoRow} onPress={() => openFieldEditor('Company', 'company', user.company || '', 'company')}>
            <Ionicons name="business-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.infoLabel}>Company</Text>
            <Text style={[styles.infoValue, !user.company && styles.infoValueMuted]} numberOfLines={1}>{user.company || 'Not set'}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>
        </View>

        <Pressable style={styles.navCard} onPress={() => router.push('/vehicles')}>
          <View style={styles.navCardLeft}>
            <View style={[styles.navIconBox, { backgroundColor: Colors.primaryLight }]}>
              <TruckIcon size={18} />
            </View>
            <Text style={styles.navCardText}>Manage Trucks</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Text style={styles.sectionTitle}>WORK LOCATIONS</Text>
        <View style={styles.infoCard}>
          <Pressable
            style={styles.infoRow}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setLocationPickerType('primary');
            }}
          >
            <Ionicons name="location" size={18} color={Colors.success} />
            <Text style={styles.infoLabel}>Work Location</Text>
            <Text style={[styles.infoValue, !user.primaryLocationAddress && styles.infoValueMuted]} numberOfLines={1}>
              {user.primaryLocationAddress || 'Tap to set'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.infoRow}>
            <Ionicons name="navigate" size={18} color={Colors.info} />
            <Text style={styles.infoLabel}>Current Location</Text>
            <Text style={[styles.infoValue, !user.secondaryLocationAddress && styles.infoValueMuted]} numberOfLines={1}>
              {user.secondaryLocationAddress || 'Auto-detected'}
            </Text>
          </View>
        </View>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, marginTop: 4, marginHorizontal: 4 }}>
          Jobs are shown within your search radius from both locations. Current location updates automatically.
        </Text>

        <Text style={styles.sectionTitle}>SEARCH RADIUS</Text>
        <View style={styles.radiusRow}>
          {radiusOptions.map(r => (
            <Pressable
              key={r}
              style={[styles.radiusChip, user.searchRadiusMiles === r && styles.radiusChipActive]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                updateUser({ searchRadiusMiles: r });
                apiRequest('PUT', '/api/profile', { search_radius_miles: r }).catch(() => {});
              }}
            >
              <Text style={[styles.radiusText, user.searchRadiusMiles === r && styles.radiusTextActive]}>
                {r} mi
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.destructive} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </>
    );
  }

  function renderRoleTab() {
    return (
      <>
        <View style={styles.roleHeader}>
          <Text style={styles.roleHeaderTitle}>SWITCH ROLE</Text>
          <Text style={styles.roleHeaderDesc}>Change how you use LoadLink. Your current role is highlighted.</Text>
        </View>

        <View style={styles.roleGrid}>
          {ROLES.map(r => {
            const isActive = user.role === r.key;
            return (
              <Pressable
                key={r.key}
                style={[
                  styles.roleCard,
                  isActive && styles.roleCardActive,
                ]}
                onPress={() => handleRoleSwitch(r.key)}
                disabled={switchingRole}
              >
                <View style={[styles.roleIcon, { backgroundColor: `${r.color}20` }]}>
                  <Ionicons name={r.icon as any} size={20} color={r.color} />
                </View>
                <Text style={[styles.roleLabel, isActive && { color: Colors.primary }]}>{r.label}</Text>
                <Text style={styles.roleDesc}>{r.desc}</Text>
                {isActive && (
                  <View style={styles.activeRoleBadge}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
                    <Text style={styles.activeRoleText}>CURRENT</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </>
    );
  }

  function renderHelpTab() {
    return (
      <>
        <Pressable style={styles.helpCard} onPress={() => Linking.openURL('mailto:support@loadlinklive.com')}>
          <View style={[styles.helpIconBox, { backgroundColor: Colors.primaryLight }]}>
            <Ionicons name="chatbubble-outline" size={22} color={Colors.primary} />
          </View>
          <View style={styles.helpCardContent}>
            <Text style={styles.helpCardTitle}>CONTACT LOADLINK</Text>
            <Text style={styles.helpCardDesc}>Get help or ask a question</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={styles.helpCard} onPress={() => Linking.openURL('https://loadlinklive.com')}>
          <View style={[styles.helpIconBox, { backgroundColor: Colors.warningBg }]}>
            <Ionicons name="bulb-outline" size={22} color={Colors.warning} />
          </View>
          <View style={styles.helpCardContent}>
            <Text style={styles.helpCardTitle}>TUTORIALS</Text>
            <Text style={styles.helpCardDesc}>Learn how to use LoadLink</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={styles.helpCard} onPress={() => Linking.openURL('mailto:feedback@loadlinklive.com?subject=App%20Suggestion')}>
          <View style={[styles.helpIconBox, { backgroundColor: Colors.successBg }]}>
            <Ionicons name="sparkles-outline" size={22} color={Colors.success} />
          </View>
          <View style={styles.helpCardContent}>
            <Text style={styles.helpCardTitle}>APP SUGGESTIONS</Text>
            <Text style={styles.helpCardDesc}>Share ideas for new features</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <View style={styles.appVersion}>
          <Text style={styles.appVersionText}>LoadLink Mobile v1.0.0</Text>
        </View>
      </>
    );
  }

  function renderAccountTab() {
    return (
      <>
        <View style={styles.comingSoonCard}>
          <View style={styles.comingSoonIcon}>
            <Ionicons name="shield-outline" size={40} color={Colors.textMuted} />
          </View>
          <Text style={styles.comingSoonTitle}>ACCOUNT MANAGEMENT</Text>
          <Text style={styles.comingSoonDesc}>Manage your security settings, connected accounts, and login methods.</Text>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonBadgeText}>Coming Soon</Text>
          </View>
        </View>

        <View style={styles.accountCard}>
          <View style={styles.accountCardIcon}>
            <Ionicons name="lock-closed-outline" size={20} color={Colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountCardTitle}>SECURITY SETTINGS</Text>
            <Text style={styles.accountCardDesc}>Password, 2FA, and login history</Text>
          </View>
        </View>

        <View style={styles.accountCard}>
          <View style={styles.accountCardIcon}>
            <Ionicons name="people-outline" size={20} color={Colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountCardTitle}>CONNECTED ACCOUNTS</Text>
            <Text style={styles.accountCardDesc}>Google, Apple, GitHub sign-in</Text>
          </View>
        </View>
      </>
    );
  }

  function renderEarningsTab() {
    const earningsData = earningsQuery.data;
    const earningsLoading = earningsQuery.isLoading;

    const earningsList = earningsData?.earnings || earningsData || [];
    const items = Array.isArray(earningsList) ? earningsList : [];
    const stats = earningsData?.stats;
    const totalEarnings = stats?.totalEarnings ?? stats?.total_earnings ?? items.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
    const pendingAmount = stats?.pendingAmount ?? stats?.pending_amount ?? items.filter((e: any) => ['open', 'issued', 'payment_sent'].includes(e.status)).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
    const paidAmount = stats?.paidAmount ?? stats?.paid_amount ?? items.filter((e: any) => e.status === 'payment_received').reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
    const totalHours = items.reduce((sum: number, e: any) => sum + (Number(e.billed_hours ?? e.billedHours) || 0), 0);

    return (
      <>
        <View style={styles.earningsStatsCard}>
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <Text style={styles.earningsLabel}>TOTAL EARNINGS</Text>
            <Text style={styles.earningsTotal}>${Number(totalEarnings).toLocaleString()}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success }} />
              <View>
                <Text style={styles.earningsStatLabel}>Paid</Text>
                <Text style={styles.earningsStatValue}>${Number(paidAmount).toLocaleString()}</Text>
              </View>
            </View>
            <View style={{ width: 1, height: 28, backgroundColor: Colors.border }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.warning }} />
              <View>
                <Text style={styles.earningsStatLabel}>Pending</Text>
                <Text style={styles.earningsStatValue}>${Number(pendingAmount).toLocaleString()}</Text>
              </View>
            </View>
            <View style={{ width: 1, height: 28, backgroundColor: Colors.border }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.info }} />
              <View>
                <Text style={styles.earningsStatLabel}>Hours</Text>
                <Text style={styles.earningsStatValue}>{totalHours.toFixed(1)}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {(['week', 'month', 'all'] as const).map(p => (
            <Pressable
              key={p}
              style={[styles.earningsPeriodChip, earningsPeriod === p && styles.earningsPeriodChipActive]}
              onPress={() => setEarningsPeriod(p)}
            >
              <Text style={[styles.earningsPeriodText, earningsPeriod === p && styles.earningsPeriodTextActive]}>
                {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.earningsSectionTitle}>EARNINGS BY JOB</Text>

        {earningsLoading ? (
          <View style={{ paddingTop: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : items.length === 0 ? (
          <View style={{ paddingTop: 40, alignItems: 'center', gap: 8 }}>
            <Ionicons name="wallet-outline" size={48} color={Colors.textMuted} />
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.text, marginTop: 8 }}>No Earnings Yet</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textMuted }}>Complete jobs to start earning</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {items.map((item: any) => {
              const rawStatus = item.status || item.payment_status || 'open';
              const statusColor = rawStatus === 'payment_received' ? Colors.success : rawStatus === 'in_progress' ? '#3b82f6' : Colors.warning;
              const statusBg = rawStatus === 'payment_received' ? Colors.successBg : rawStatus === 'in_progress' ? 'rgba(59,130,246,0.15)' : Colors.warningBg;
              const statusLabel = (rawStatus || '').replace(/_/g, ' ').toUpperCase();
              const sessions = item.sessions || 1;
              return (
              <Pressable key={item.id} style={styles.earningCard} onPress={() => router.push(`/job/${item.jobId || item.id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={[styles.earningCardIcon, rawStatus === 'in_progress' && { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                    <Ionicons name={rawStatus === 'in_progress' ? 'time' : 'briefcase'} size={16} color={rawStatus === 'in_progress' ? '#3b82f6' : Colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text }}>{item.material}</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary }}>{item.contractor_company || item.contractorCompany}</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted }}>
                      {new Date(item.date || item.completed_date || item.completedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {Number(item.billed_hours ?? item.billedHours ?? 0).toFixed(1)}h · {sessions} session{sessions !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text }}>${Number(item.amount).toLocaleString()}</Text>
                  <View style={{
                    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4,
                    backgroundColor: statusBg
                  }}>
                    <Text style={{
                      fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.5,
                      color: statusColor
                    }}>{statusLabel}</Text>
                  </View>
                </View>
              </Pressable>
              );
            })}
          </View>
        )}
      </>
    );
  }

  function renderBillingTab() {
    return (
      <>
        <View style={styles.comingSoonCard}>
          <View style={styles.comingSoonIcon}>
            <Ionicons name="card-outline" size={40} color={Colors.textMuted} />
          </View>
          <Text style={styles.comingSoonTitle}>BILLING & SUBSCRIPTIONS</Text>
          <Text style={styles.comingSoonDesc}>Manage your subscription plan, payment methods, and view invoices.</Text>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonBadgeText}>Coming Soon</Text>
          </View>
        </View>

        <View style={styles.accountCard}>
          <View style={styles.accountCardIcon}>
            <Ionicons name="card-outline" size={20} color={Colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountCardTitle}>CURRENT PLAN</Text>
            <Text style={styles.accountCardDesc}>Free tier - Upgrade for more features</Text>
          </View>
        </View>

        <View style={styles.accountCard}>
          <View style={styles.accountCardIcon}>
            <Ionicons name="wallet-outline" size={20} color={Colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountCardTitle}>PAYMENT METHODS</Text>
            <Text style={styles.accountCardDesc}>Add or update payment methods</Text>
          </View>
        </View>
      </>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Text style={styles.headerTitle}>SETTINGS</Text>
        <Text style={styles.headerSubtitle}>Manage your account and preferences</Text>
      </View>

      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarContent}>
          {TABS.map(tab => (
            <Pressable
              key={tab.key}
              style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab(tab.key);
              }}
            >
              <Ionicons name={tab.icon as any} size={16} color={activeTab === tab.key ? Colors.text : Colors.textMuted} />
              <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === 'web' ? 34 + 100 : 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await queryClient.invalidateQueries(); setRefreshing(false); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
      >
        {activeTab === 'profile' && renderProfileTab()}
        {activeTab === 'role' && renderRoleTab()}
        {activeTab === 'help' && renderHelpTab()}
        {activeTab === 'earnings' && renderEarningsTab()}
        {activeTab === 'account' && renderAccountTab()}
        {activeTab === 'billing' && renderBillingTab()}
      </ScrollView>

      <Modal
        visible={editField !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditField(null)}
      >
        <Pressable style={styles.editOverlay} onPress={() => setEditField(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.editKeyboard}>
            <Pressable style={styles.editSheet} onPress={() => {}}>
              <View style={styles.editHeader}>
                <Pressable onPress={() => setEditField(null)}>
                  <Text style={styles.editCancel}>Cancel</Text>
                </Pressable>
                <Text style={styles.editTitle}>{editField?.label || ''}</Text>
                <Pressable onPress={saveFieldEdit} disabled={saving}>
                  <Text style={[styles.editDone, saving && { opacity: 0.5 }]}>Save</Text>
                </Pressable>
              </View>
              <View style={styles.editInputWrap}>
                <TextInput
                  style={styles.editInput}
                  value={editValue}
                  onChangeText={setEditValue}
                  placeholder={`Enter ${editField?.label?.toLowerCase() || ''}`}
                  placeholderTextColor={Colors.textMuted}
                  autoFocus
                  keyboardType={(editField?.keyboard as any) || 'default'}
                  autoCapitalize={editField?.keyboard === 'email-address' ? 'none' : 'words'}
                  returnKeyType="done"
                  onSubmitEditing={saveFieldEdit}
                />
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <LocationPickerModal
        visible={locationPickerType !== null}
        onClose={() => setLocationPickerType(null)}
        title={locationPickerType === 'primary' ? 'Set Primary Location' : 'Set Secondary Location'}
        initialLat={locationPickerType === 'primary' ? user.primaryLocationLat : user.secondaryLocationLat}
        initialLng={locationPickerType === 'primary' ? user.primaryLocationLng : user.secondaryLocationLng}
        initialAddress={locationPickerType === 'primary' ? user.primaryLocationAddress : user.secondaryLocationAddress}
        onSelect={async (result) => {
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (locationPickerType === 'primary') {
            await updateUser({
              primaryLocationAddress: result.address,
              primaryLocationLat: result.lat,
              primaryLocationLng: result.lng,
            });
          } else {
            await updateUser({
              secondaryLocationAddress: result.address,
              secondaryLocationLat: result.lat,
              secondaryLocationLng: result.lng,
            });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 22,
    color: Colors.text,
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  tabBar: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabBarContent: {
    paddingHorizontal: 16,
    gap: 4,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  tabItemActive: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  tabLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.textMuted,
  },
  tabLabelActive: {
    color: Colors.text,
  },
  scrollContent: { padding: 16 },
  profileCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
    marginBottom: 12,
  },
  avatarLargeText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 24,
    color: Colors.primary,
  },
  profileName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.text,
  },
  roleBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
  },
  roleBadgeText: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 11,
    color: Colors.primary,
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    width: '100%',
    justifyContent: 'space-around',
  },
  statBlock: { alignItems: 'center', gap: 2 },
  statNumber: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statDivider: { width: 1, height: 30, backgroundColor: Colors.border },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
  },
  statusSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
  sectionTitle: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 10,
  },
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  infoLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
    width: 80,
  },
  infoValue: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
    flex: 1,
    textAlign: 'right',
  },
  infoValueMuted: {
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  navCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCardText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.primary,
  },
  radiusRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  radiusChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  radiusChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  radiusText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  radiusTextActive: {
    color: Colors.primary,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Colors.destructiveBg,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginTop: 8,
  },
  logoutText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.destructive,
  },
  roleHeader: {
    marginBottom: 20,
  },
  roleHeaderTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
    letterSpacing: 1,
  },
  roleHeaderDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  roleGrid: {
    gap: 10,
  },
  roleCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  roleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  roleLabel: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  roleDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  activeRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  activeRoleText: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 10,
    color: Colors.primary,
    letterSpacing: 1,
  },
  helpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    gap: 14,
  },
  helpIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpCardContent: {
    flex: 1,
  },
  helpCardTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 14,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  helpCardDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  appVersion: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  appVersionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
  comingSoonCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  comingSoonIcon: {
    marginBottom: 14,
  },
  comingSoonTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
    letterSpacing: 1,
    textAlign: 'center',
  },
  comingSoonDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  comingSoonBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 14,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  comingSoonBadgeText: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 12,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    gap: 14,
    opacity: 0.5,
  },
  accountCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountCardTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  accountCardDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  editOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  editKeyboard: {
    justifyContent: 'flex-end',
  },
  editSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  editTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  editCancel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.textMuted,
  },
  editDone: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.primary,
  },
  editInputWrap: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  editInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: Colors.text,
  },
  earningsStatsCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  earningsLabel: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 11,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  earningsTotal: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 36,
    color: Colors.primary,
  },
  earningsStatLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
  },
  earningsStatValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
  },
  earningsPeriodChip: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  earningsPeriodChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  earningsPeriodText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  earningsPeriodTextActive: {
    color: Colors.primary,
  },
  earningsSectionTitle: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  earningCard: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  earningCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
