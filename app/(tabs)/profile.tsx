import { View, Text, ScrollView, Pressable, StyleSheet, Switch, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { formatTruckType } from '@/lib/mock-data';
import { apiRequest } from '@/lib/query-client';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, updateUser } = useAuth();

  async function handleStatusToggle(value: boolean) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest('PUT', '/api/profile/status', { isConnected: value });
    } catch {}
    await updateUser({ isConnected: value });
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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Text style={styles.headerTitle}>PROFILE</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === 'web' ? 34 + 100 : 100 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>{user.firstName.charAt(0)}{user.lastName.charAt(0)}</Text>
          </View>
          <Text style={styles.profileName}>{user.fullName}</Text>
          <Text style={styles.profileRole}>{user.role.replace(/_/g, ' ').toUpperCase()}</Text>

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
              <Text style={styles.statusSubtitle}>Toggle your driver status</Text>
            </View>
          </View>
          <Switch
            value={user.isConnected}
            onValueChange={handleStatusToggle}
            trackColor={{ false: Colors.border, true: Colors.success }}
            thumbColor="#fff"
          />
        </View>

        <Text style={styles.sectionTitle}>VEHICLE</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="dump-truck" size={18} color={Colors.textMuted} />
            <Text style={styles.infoLabel}>Type</Text>
            <Text style={styles.infoValue}>{user.truckType ? formatTruckType(user.truckType) : 'Not set'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="car" size={18} color={Colors.textMuted} />
            <Text style={styles.infoLabel}>Truck</Text>
            <Text style={styles.infoValue}>
              {user.truckYear && user.truckMake ? `${user.truckYear} ${user.truckMake} ${user.truckModel || ''}`.trim() : 'Not set'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="card-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.infoLabel}>Plate</Text>
            <Text style={styles.infoValue}>{user.licensePlate || 'Not set'}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>WORK LOCATIONS</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="location" size={18} color={Colors.success} />
            <Text style={styles.infoLabel}>Primary</Text>
            <Text style={styles.infoValue}>{user.primaryLocationAddress || 'Not set'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={18} color={Colors.info} />
            <Text style={styles.infoLabel}>Secondary</Text>
            <Text style={styles.infoValue}>{user.secondaryLocationAddress || 'Not set'}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>SEARCH RADIUS</Text>
        <View style={styles.radiusRow}>
          {radiusOptions.map(r => (
            <Pressable
              key={r}
              style={[styles.radiusChip, user.searchRadiusMiles === r && styles.radiusChipActive]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                updateUser({ searchRadiusMiles: r });
              }}
            >
              <Text style={[styles.radiusText, user.searchRadiusMiles === r && styles.radiusTextActive]}>
                {r} mi
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>CONTACT</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user.email}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>{user.phone}</Text>
          </View>
          {user.company && (
            <View style={styles.infoRow}>
              <Ionicons name="business-outline" size={18} color={Colors.textMuted} />
              <Text style={styles.infoLabel}>Company</Text>
              <Text style={styles.infoValue}>{user.company}</Text>
            </View>
          )}
        </View>

        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.destructive} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
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
  profileRole: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 11,
    color: Colors.primary,
    letterSpacing: 1,
    marginTop: 4,
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
});
