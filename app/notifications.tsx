import { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { Notification, timeAgo } from '@/lib/mock-data';
import { apiRequest, queryClient } from '@/lib/query-client';

function mapNotification(n: any): Notification {
  return {
    id: n.id,
    type: n.type ?? '',
    title: n.title ?? '',
    message: n.message ?? '',
    jobId: n.job_id ?? n.jobId,
    isRead: n.is_read ?? n.isRead ?? false,
    createdAt: n.created_at ?? n.createdAt ?? '',
  };
}

function getNotifIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'new_load': return 'briefcase';
    case 'load_accepted': return 'checkmark-circle';
    case 'load_approved': return 'checkmark-done';
    case 'load_rejected': return 'close-circle';
    case 'load_completed': return 'star';
    case 'message': return 'chatbubble';
    case 'job_expired': return 'time';
    default: return 'notifications';
  }
}

function getNotifColor(type: string): string {
  switch (type) {
    case 'new_load': return Colors.primary;
    case 'load_accepted': return Colors.success;
    case 'load_approved': return Colors.success;
    case 'load_rejected': return Colors.destructive;
    case 'load_completed': return Colors.success;
    case 'message': return Colors.info;
    default: return Colors.textMuted;
  }
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data: notifsData, isLoading } = useQuery<any[]>({
    queryKey: ['/api/notifications'],
  });

  const notifications = (notifsData || []).map(mapNotification);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  async function markAllRead() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await apiRequest('POST', '/api/notifications/mark-read');
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    } catch (e) {
      console.log('Failed to mark notifications read:', e);
    }
  }

  function handleNotifPress(notif: Notification) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (notif.type === 'load_completed' && notif.jobId) {
      router.push({ pathname: '/review', params: { jobId: notif.jobId } });
    } else if (notif.jobId) {
      router.push({ pathname: '/job/[id]', params: { id: notif.jobId } });
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>NOTIFICATIONS</Text>
        {unreadCount > 0 ? (
          <Pressable onPress={markAllRead} style={styles.markReadBtn}>
            <Ionicons name="checkmark-done" size={20} color={Colors.primary} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <FlatList
        data={notifications}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await queryClient.invalidateQueries({ queryKey: ['/api/notifications'] }); setRefreshing(false); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
        renderItem={({ item }) => {
          const iconName = getNotifIcon(item.type);
          const iconColor = getNotifColor(item.type);

          return (
            <Pressable
              style={({ pressed }) => [
                styles.notifCard,
                !item.isRead && styles.notifCardUnread,
                pressed && styles.notifCardPressed,
              ]}
              onPress={() => handleNotifPress(item)}
            >
              <View style={[styles.notifIcon, { backgroundColor: iconColor + '20' }]}>
                <Ionicons name={iconName} size={18} color={iconColor} />
              </View>
              <View style={styles.notifContent}>
                <View style={styles.notifTop}>
                  <Text style={[styles.notifTitle, !item.isRead && styles.notifTitleUnread]}>{item.title}</Text>
                  <Text style={styles.notifTime}>{timeAgo(item.createdAt)}</Text>
                </View>
                <Text style={styles.notifMessage} numberOfLines={2}>{item.message}</Text>
              </View>
              {!item.isRead && <View style={styles.unreadDot} />}
            </Pressable>
          );
        }}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No Notifications</Text>
              <Text style={styles.emptyText}>You're all caught up</Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
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
  markReadBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { padding: 16 },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notifCardUnread: {
    borderColor: Colors.primaryLight,
    backgroundColor: 'rgba(255, 153, 0, 0.04)',
  },
  notifCardPressed: {
    backgroundColor: Colors.cardHover,
  },
  notifIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifContent: {
    flex: 1,
    gap: 3,
  },
  notifTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notifTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  notifTitleUnread: {
    fontFamily: 'Inter_600SemiBold',
  },
  notifTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginLeft: 8,
  },
  notifMessage: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.text,
    marginTop: 8,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
  },
});
