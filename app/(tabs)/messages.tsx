import { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { Conversation, timeAgo } from '@/lib/mock-data';
import { queryClient } from '@/lib/query-client';

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

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data: convsData, isLoading } = useQuery<any[]>({
    queryKey: ['/api/conversations'],
  });

  const conversations = (convsData || []).map(mapConversation);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Text style={styles.headerTitle}>MESSAGES</Text>
      </View>

      <PendingReviewsBanner />

      <FlatList
        data={conversations}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await queryClient.invalidateQueries({ queryKey: ['/api/conversations'] }); await queryClient.invalidateQueries({ queryKey: ['/api/reviews/pending'] }); setRefreshing(false); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.convCard, pressed && styles.convCardPressed]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: '/chat/[jobId]', params: { jobId: item.jobId } });
            }}
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
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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
