import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Platform, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { Notification, timeAgo } from '@/lib/mock-data';
import { apiRequest, queryClient } from '@/lib/query-client';
import { setAppBadgeCount } from '@/lib/notifications';

function mapNotification(n: any): Notification {
  return {
    id: n.id,
    type: n.type ?? '',
    title: n.title ?? '',
    message: n.message ?? '',
    jobId: n.job_id ?? n.jobId,
    isRead: n.is_read ?? n.isRead ?? false,
    createdAt: n.created_at ?? n.createdAt ?? '',
    pendingAssignmentIds: n.pending_assignment_ids ?? n.pendingAssignmentIds ?? [],
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

// Alert.alert buttons are a no-op on react-native-web, so use window.confirm there.
function confirmDialog(title: string, msg: string, okLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${msg}`)) onConfirm();
    return;
  }
  Alert.alert(title, msg, [
    { text: 'Not now', style: 'cancel' },
    { text: okLabel, onPress: onConfirm },
  ]);
}

function infoDialog(title: string, msg: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${msg}`);
    return;
  }
  Alert.alert(title, msg);
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data: notifsData, isLoading } = useQuery<any[]>({
    queryKey: ['/api/notifications'],
  });

  const notifications = (notifsData || []).map(mapNotification);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const assignmentResponseMutation = useMutation({
    mutationFn: async ({ assignmentId, action }: { assignmentId: string; action: 'confirm' | 'decline' }) =>
      apiRequest('POST', `/api/assignments/${assignmentId}/${action}`, {}),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      infoDialog(
        vars.action === 'confirm' ? 'Job confirmed' : 'Broker notified',
        vars.action === 'confirm'
          ? "You're confirmed for this job."
          : "The broker knows you can't take this job and can reassign the truck."
      );
    },
    onError: (e: any) => {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      infoDialog('Could not respond', e?.message || 'Please try again.');
    },
  });

  // Pending roster invites — tapping a roster-invite notification lets the
  // user accept right here. (The My Jobs invite banner is driver-only; company
  // and broker accounts never see that tab, so the notification tap must work
  // for every role.)
  const pendingInvitesQuery = useQuery<any[]>({
    queryKey: ['/api/invitations/pending', '?type=broker_roster'],
    retry: false,
  });
  const pendingInvites = Array.isArray(pendingInvitesQuery.data) ? pendingInvitesQuery.data : [];

  const acceptInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => apiRequest('POST', `/api/invitations/${inviteId}/accept`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invitations/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      infoDialog('Invite accepted', "You're on the roster now.");
    },
    onError: (e: any) => {
      infoDialog('Could not accept invite', e?.message || 'Please try again.');
    },
  });

  // Keep the red app-icon badge in sync with the real unread count.
  useEffect(() => {
    if (notifsData) setAppBadgeCount(unreadCount);
  }, [notifsData, unreadCount]);

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
      return;
    }
    if (notif.jobId) {
      router.push({ pathname: '/job/[id]', params: { id: notif.jobId } });
      return;
    }
    // Roster notifications carry no job — route them somewhere useful.
    const text = `${notif.title} ${notif.message}`.toLowerCase();
    if (text.includes('joined your roster') || text.includes('invitation accepted')) {
      router.push({ pathname: '/broker', params: { tab: 'roster' } } as any);
      return;
    }
    if (text.includes('roster') && text.includes('invit')) {
      // A roster invite for this account — offer to accept it right here.
      // (Can't rely on the My Jobs banner: that tab is hidden for company
      // and broker accounts.)
      const inviteName = (inv: any) =>
        inv.inviterName || inv.inviter_name || inv.brokerName || inv.broker_name || '';
      // Match this notification to its invite by the inviter's name in the
      // notification text, so we never accept the wrong one.
      const matched = pendingInvites.filter(inv => {
        const n = inviteName(inv).toLowerCase().trim();
        return n.length > 0 && text.includes(n);
      });
      const candidates = matched.length > 0 ? matched : pendingInvites;
      if (candidates.length === 1) {
        const invite = candidates[0];
        const from = inviteName(invite) || 'A broker';
        confirmDialog(
          'Roster Invite',
          `${from} wants to add you to their roster. Accept?`,
          'Accept',
          () => {
            if (!acceptInviteMutation.isPending) acceptInviteMutation.mutate(invite.id);
          }
        );
      } else if (candidates.length > 1) {
        // Ambiguous — let the user pick which invite this is.
        if (Platform.OS === 'web') {
          // Ask about each invite in turn so the user picks the right one.
          if (typeof window !== 'undefined') {
            for (const inv of candidates) {
              // eslint-disable-next-line no-alert
              if (window.confirm(`Accept roster invite from ${inviteName(inv) || 'a broker'}?`)) {
                acceptInviteMutation.mutate(inv.id);
                break;
              }
            }
          }
          return;
        }
        Alert.alert(
          'Roster Invites',
          'You have more than one pending roster invite. Which one do you want to accept?',
          [
            ...candidates.slice(0, 2).map((inv: any) => ({
              text: `Accept ${inviteName(inv) || 'invite'}`,
              onPress: () => {
                if (!acceptInviteMutation.isPending) acceptInviteMutation.mutate(inv.id);
              },
            })),
            { text: 'Not now', style: 'cancel' as const },
          ]
        );
      } else if (pendingInvitesQuery.isLoading) {
        infoDialog('One moment', 'Still loading your invites — try tapping again in a second.');
      } else {
        infoDialog('Roster Invite', 'This invite has already been handled — nothing left to accept.');
      }
    }
  }

  return (
    <View testID="notifications-screen" style={styles.container}>
      <View style={[styles.topBar, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <Pressable
          testID="notifications-back"
          style={styles.backBtn}
          onPress={() => {
            try {
              if (router.canGoBack()) { router.back(); return; }
            } catch {}
            router.replace('/(tabs)' as any);
          }}
        >
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
          const pendingAssignmentIds = item.pendingAssignmentIds || [];

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
                {pendingAssignmentIds.map((pendingAssignmentId: string, index: number) => (
                  <View key={pendingAssignmentId} style={styles.assignmentResponseBlock}>
                    {pendingAssignmentIds.length > 1 ? (
                      <Text style={styles.assignmentResponseLabel}>TRUCK {index + 1} — PLEASE RESPOND</Text>
                    ) : null}
                    <View style={styles.assignmentActions} testID={`notification-confirm-${pendingAssignmentId}`}>
                    <Pressable
                      disabled={assignmentResponseMutation.isPending}
                      style={({ pressed }) => [
                        styles.assignmentAction,
                        styles.assignmentDecline,
                        (pressed || assignmentResponseMutation.isPending) && styles.assignmentActionPressed,
                      ]}
                      onPress={(event) => {
                        event.stopPropagation?.();
                        assignmentResponseMutation.mutate({
                          assignmentId: pendingAssignmentId,
                          action: 'decline',
                        });
                      }}
                    >
                      <Ionicons name="thumbs-down" size={16} color={Colors.destructive} />
                      <Text style={styles.assignmentDeclineText}>CAN'T DO IT</Text>
                    </Pressable>
                    <Pressable
                      disabled={assignmentResponseMutation.isPending}
                      style={({ pressed }) => [
                        styles.assignmentAction,
                        styles.assignmentConfirm,
                        (pressed || assignmentResponseMutation.isPending) && styles.assignmentActionPressed,
                      ]}
                      onPress={(event) => {
                        event.stopPropagation?.();
                        assignmentResponseMutation.mutate({
                          assignmentId: pendingAssignmentId,
                          action: 'confirm',
                        });
                      }}
                    >
                      <Ionicons name="thumbs-up" size={16} color={Colors.primaryForeground} />
                      <Text style={styles.assignmentConfirmText}>CONFIRM</Text>
                    </Pressable>
                    </View>
                  </View>
                ))}
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
  assignmentActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  assignmentResponseBlock: {
    marginTop: 12,
  },
  assignmentResponseLabel: {
    color: Colors.primary,
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  assignmentAction: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
  },
  assignmentDecline: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: Colors.destructive,
  },
  assignmentConfirm: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  assignmentActionPressed: {
    opacity: 0.65,
  },
  assignmentDeclineText: {
    color: Colors.destructive,
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  assignmentConfirmText: {
    color: Colors.primaryForeground,
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 11,
    letterSpacing: 0.4,
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
