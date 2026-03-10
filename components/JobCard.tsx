import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TruckIcon from '@/components/TruckIcon';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { Job, formatRate, formatJobType, formatTruckType, getStatusColor, getJobTypeColor, timeAgo } from '@/lib/mock-data';

interface JobCardProps {
  job: Job;
  onPress: () => void;
  showStatus?: boolean;
}

export default function JobCard({ job, onPress, showStatus = false }: JobCardProps) {
  const statusColor = getStatusColor(job.status);
  const jobTypeColor = getJobTypeColor(job.jobType);

  function handlePress() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.material} numberOfLines={1}>{job.material}</Text>
          {job.requiresTarp && (
            <View style={styles.urgentBadge}>
              <Ionicons name="shield-checkmark" size={10} color={Colors.primary} />
              <Text style={styles.urgentText}>TARP</Text>
            </View>
          )}
          {job.requiresWeightTickets && (
            <View style={styles.urgentBadge}>
              <Ionicons name="document-text" size={10} color={Colors.primary} />
              <Text style={styles.urgentText}>WEIGHT TICKETS</Text>
            </View>
          )}
          {job.urgent && (
            <View style={styles.urgentBadge}>
              <Ionicons name="clipboard" size={10} color={Colors.primary} />
              <Text style={styles.urgentText}>PAPERWORK</Text>
            </View>
          )}
        </View>
        <Text style={styles.rate}>{formatRate(job.rate, job.rateType)}</Text>
      </View>

      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: jobTypeColor.bg }]}>
          <Text style={[styles.badgeText, { color: jobTypeColor.text }]}>{formatJobType(job.jobType, job.estimatedDays)}</Text>
        </View>
        <View style={styles.badge}>
          <TruckIcon size={12} />
          <Text style={styles.badgeText}>{formatTruckType(job.truckType)}</Text>
        </View>
        {job.trucksNeeded > 1 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{job.trucksNeeded} trucks</Text>
          </View>
        )}
        {showStatus && (
          <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.badgeText, { color: statusColor.text }]}>{job.status.replace('_', ' ').toUpperCase()}</Text>
          </View>
        )}
      </View>

      <View style={styles.locationRow}>
        <View style={styles.locationDot}>
          <View style={styles.dotGreen} />
          <View style={styles.dotLine} />
          <View style={styles.dotOrange} />
        </View>
        <View style={styles.locationTexts}>
          <Text style={styles.locationText} numberOfLines={1}>{job.originAddress}</Text>
          <Text style={styles.locationText} numberOfLines={1}>{job.destinationAddress}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <Ionicons name="navigate-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.footerText}>{job.distance} mi</Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.footerText}>{(() => {
            const raw = String(job.scheduledDate);
            const ds = raw.length >= 10 ? raw.substring(0, 10) : raw;
            const [y, m, d] = ds.split('-').map(Number);
            return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          })()}</Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.footerText}>{job.pickupTime}</Text>
        </View>
        <Text style={styles.timeAgo}>{timeAgo(job.createdAt)}</Text>
      </View>

      {job.contractorCompany ? (
        <View style={styles.contractorRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{job.contractorName.charAt(0)}</Text>
          </View>
          <Text style={styles.contractorText}>{job.contractorCompany}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pressed: {
    backgroundColor: Colors.cardHover,
    transform: [{ scale: 0.99 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  material: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.text,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  urgentText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  rate: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.primary,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.muted,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  badgeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.textSecondary,
  },
  locationRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  locationDot: {
    alignItems: 'center',
    width: 12,
    paddingTop: 4,
  },
  dotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  dotLine: {
    width: 1,
    height: 14,
    backgroundColor: Colors.border,
  },
  dotOrange: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  locationTexts: {
    flex: 1,
    gap: 8,
  },
  locationText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
  timeAgo: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginLeft: 'auto',
  },
  contractorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.primary,
  },
  contractorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
