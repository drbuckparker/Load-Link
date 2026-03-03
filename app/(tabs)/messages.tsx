import { useState, useRef, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Platform, ActivityIndicator, RefreshControl, Animated, PanResponder } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { Conversation, timeAgo } from '@/lib/mock-data';
import { queryClient, apiRequest } from '@/lib/query-client';

function mapConversation(c: any): Conversation {
  return {
    id: c.id,
    jobId: c.job_id ?? c.jobId ?? '',
    jobMaterial: c.job_material ?? c.jobMaterial ?? '',
    contractorName: c.contractor_name ?? c.contractorName ?? '',
    contractorCompany: c.contractor_company ?? c.contractorCompany ?? '',
    lastMessage: c.last_message ?? c.lastMessage ?? '',
    lastMessageAt: c.last_message_at ?? c.lastMessageAt ?? '',
    unreadCount: c.unread_count ?? c.unreadCount ?? 0,
  };
}

function PendingReviewsBanner() {
  const { data: pendingReviews } = useQuery<any[]>({
    queryKey: ['/api/reviews/pending'],
  });

  const items = pendingReviews || [];
  if (items.length === 0) return null;

  return (
    <View style={msgStyles.reviewBanner}>
      <View style={msgStyles.reviewBannerIcon}>
        <Ionicons name="star" size={18} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={msgStyles.reviewBannerTitle}>
          {items.length} review{items.length > 1 ? 's' : ''} pending
        </Text>
        <Text style={msgStyles.reviewBannerText}>Rate your recent job experience</Text>
      </View>
      <Pressable
        style={msgStyles.reviewBannerBtn}
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          const first = items[0];
          router.push({
            pathname: '/review',
            params: {
              jobId: first.jobId,
              revieweeId: first.reviewee?.id || '',
              revieweeName: first.reviewee?.full_name || first.reviewee?.company || '',
              revieweeCompany: first.reviewee?.company || '',
              material: first.material || '',
            },
          });
        }}
      >
        <Text style={msgStyles.reviewBannerBtnText}>Review</Text>
        <Ionicons name="chevron-forward" size={14} color="#000" />
      </Pressable>
    </View>
  );
}

function SwipeableConversation({ item, onArchive, onDelete, onPress }: {
  item: Conversation;
  onArchive: () => void;
  onDelete: () => void;
  onPress: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwipedOpen = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 20;
      },
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        const currentOffset = isSwipedOpen.current ? -150 : 0;
        const newValue = Math.min(0, Math.max(-150, currentOffset + gestureState.dx));
        translateX.setValue(newValue);
      },
      onPanResponderRelease: (_, gestureState) => {
        const currentOffset = isSwipedOpen.current ? -150 : 0;
        const finalPosition = currentOffset + gestureState.dx;

        if (finalPosition < -75) {
          Animated.spring(translateX, { toValue: -150, useNativeDriver: true, friction: 8 }).start();
          isSwipedOpen.current = true;
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
          isSwipedOpen.current = false;
        }
      },
    })
  ).current;

  const closeSwipe = useCallback(() => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
    isSwipedOpen.current = false;
  }, []);

  return (
    <View style={swipeStyles.container}>
      <View style={swipeStyles.actionsContainer}>
        <Pressable
          style={[swipeStyles.actionButton, swipeStyles.archiveButton]}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            closeSwipe();
            onArchive();
          }}
        >
          <Ionicons name="archive-outline" size={22} color="#fff" />
          <Text style={swipeStyles.actionText}>Archive</Text>
        </Pressable>
        <Pressable
          style={[swipeStyles.actionButton, swipeStyles.deleteButton]}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            closeSwipe();
            onDelete();
          }}
        >
          <Ionicons name="trash-outline" size={22} color="#fff" />
          <Text style={swipeStyles.actionText}>Delete</Text>
        </Pressable>
      </View>

      <Animated.View
        style={[swipeStyles.foreground, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable
          style={({ pressed }) => [styles.convCard, pressed && styles.convCardPressed]}
          onPress={onPress}
        >
          <View style={styles.convAvatar}>
            <Text style={styles.convAvatarText}>{item.contractorName.charAt(0)}</Text>
          </View>
          <View style={styles.convContent}>
            <View style={styles.convTop}>
              <Text style={styles.convName} numberOfLines={1}>{item.contractorName}</Text>
              <Text style={styles.convTime}>{timeAgo(item.lastMessageAt)}</Text>
            </View>
            <Text style={styles.convCompany}>{item.contractorCompany}</Text>
            <View style={styles.convBottom}>
              <View style={styles.jobTag}>
                <Ionicons name="briefcase-outline" size={10} color={Colors.textMuted} />
                <Text style={styles.jobTagText}>{item.jobMaterial}</Text>
              </View>
              <Text style={[styles.convMessage, item.unreadCount > 0 && styles.convMessageUnread]} numberOfLines={1}>
                {item.lastMessage}
              </Text>
            </View>
          </View>
          {item.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unreadCount}</Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const { data: convsData, isLoading } = useQuery<any[]>({
    queryKey: ['/api/conversations'],
  });

  const { data: archivedData, isLoading: archivedLoading } = useQuery<any[]>({
    queryKey: ['/api/conversations/archived'],
  });

  const conversations = (convsData || []).map(mapConversation);
  const archivedConversations = (archivedData || []).map(mapConversation);

  const archiveMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest('POST', `/api/conversations/${jobId}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations/archived'] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest('POST', `/api/conversations/${jobId}/unarchive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations/archived'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest('POST', `/api/conversations/${jobId}/delete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations/archived'] });
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    await queryClient.invalidateQueries({ queryKey: ['/api/conversations/archived'] });
    await queryClient.invalidateQueries({ queryKey: ['/api/reviews/pending'] });
    setRefreshing(false);
  };

  if (showArchived) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
          <Pressable onPress={() => setShowArchived(false)} style={styles.backButton} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>ARCHIVED</Text>
          <View style={{ width: 32 }} />
        </View>

        <FlatList
          data={archivedConversations}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
          renderItem={({ item }) => (
            <SwipeableConversation
              item={item}
              onArchive={() => unarchiveMutation.mutate(item.jobId)}
              onDelete={() => deleteMutation.mutate(item.jobId)}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: '/chat/[jobId]', params: { jobId: item.jobId } });
              }}
            />
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            archivedLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="archive-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No Archived Messages</Text>
                <Text style={styles.emptyText}>Swipe left on a conversation to archive it</Text>
              </View>
            )
          }
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Text style={styles.headerTitle}>MESSAGES</Text>
      </View>

      <PendingReviewsBanner />

      <FlatList
        data={conversations}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
        renderItem={({ item }) => (
          <SwipeableConversation
            item={item}
            onArchive={() => archiveMutation.mutate(item.jobId)}
            onDelete={() => deleteMutation.mutate(item.jobId)}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: '/chat/[jobId]', params: { jobId: item.jobId } });
            }}
          />
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListFooterComponent={
          archivedConversations.length > 0 ? (
            <Pressable
              style={styles.archivedFolder}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowArchived(true);
              }}
            >
              <Ionicons name="archive-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.archivedFolderText}>Archived</Text>
              <View style={styles.archivedCount}>
                <Text style={styles.archivedCountText}>{archivedConversations.length}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No Messages</Text>
              <Text style={styles.emptyText}>Messages from active jobs will appear here</Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 12,
  },
  actionsContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    width: 150,
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  archiveButton: {
    backgroundColor: Colors.info,
  },
  deleteButton: {
    backgroundColor: Colors.destructive,
  },
  actionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: '#fff',
  },
  foreground: {
    backgroundColor: Colors.background,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 2,
  },
  listContent: { padding: 16 },
  convCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  convCardPressed: {
    backgroundColor: Colors.cardHover,
  },
  convAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  convAvatarText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.primary,
  },
  convContent: {
    flex: 1,
    gap: 3,
  },
  convTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  convName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
    flex: 1,
  },
  convTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
  },
  convCompany: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  convBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  jobTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.muted,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  jobTagText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: Colors.textMuted,
  },
  convMessage: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
  },
  convMessageUnread: {
    color: Colors.text,
    fontFamily: 'Inter_500Medium',
  },
  unreadBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: Colors.primaryForeground,
  },
  separator: { height: 10 },
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
  archivedFolder: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  archivedFolderText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.textSecondary,
  },
  archivedCount: {
    backgroundColor: Colors.muted,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  archivedCountText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

const msgStyles = StyleSheet.create({
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 153, 0, 0.08)',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 153, 0, 0.25)',
  },
  reviewBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewBannerTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.text,
  },
  reviewBannerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textSecondary,
  },
  reviewBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 2,
  },
  reviewBannerBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#000',
  },
});
