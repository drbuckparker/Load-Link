import { View, Text, FlatList, Pressable, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { MOCK_CONVERSATIONS, timeAgo } from '@/lib/mock-data';

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8 }]}>
        <Text style={styles.headerTitle}>MESSAGES</Text>
      </View>

      <FlatList
        data={MOCK_CONVERSATIONS}
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
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Messages</Text>
            <Text style={styles.emptyText}>Messages from active jobs will appear here</Text>
          </View>
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
