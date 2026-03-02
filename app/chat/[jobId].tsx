import { useState, useRef } from 'react';
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, Platform, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { Message } from '@/lib/mock-data';
import { apiRequest, queryClient } from '@/lib/query-client';

function mapMessage(m: any): Message {
  return {
    id: m.id,
    jobId: m.job_id ?? m.jobId ?? '',
    senderId: m.sender_id ?? m.senderId ?? '',
    senderName: m.sender_name ?? m.senderName ?? '',
    body: m.body ?? '',
    read: m.read ?? false,
    createdAt: m.created_at ?? m.createdAt ?? '',
  };
}

export default function ChatScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [messageText, setMessageText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const { data: messagesData, isLoading: messagesLoading } = useQuery<any[]>({
    queryKey: [`/api/messages/${jobId}`],
    enabled: !!jobId,
  });

  const { data: jobData } = useQuery<any>({
    queryKey: [`/api/jobs/${jobId}`],
    enabled: !!jobId,
  });

  const messages = (messagesData || []).map(mapMessage);
  const invertedMessages = [...messages].reverse();

  const isMyPostedJob = user?.id && (jobData?.contractor_id === user.id || jobData?.contractorId === user.id);
  const chatPartnerName = isMyPostedJob
    ? (jobData?.driver_name ?? jobData?.driverName ?? 'Driver')
    : (jobData?.contractor_name ?? jobData?.contractorName ?? 'Chat');
  const jobMaterial = jobData?.material ?? '';

  async function handleSend() {
    if (!messageText.trim() || !user) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const text = messageText.trim();
    setMessageText('');

    try {
      await apiRequest('POST', `/api/messages/${jobId}`, { body: text });
      queryClient.invalidateQueries({ queryKey: [`/api/messages/${jobId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    } catch (e) {
      console.log('Failed to send message:', e);
    }
  }

  const autoMessagePattern = /approved|applied|backing out|rejected|auto-assigned|removed.*truck|cancelled|would like to work/i;

  function renderMessage({ item }: { item: Message }) {
    const isMe = item.senderId === user?.id;
    const isAutoMessage = autoMessagePattern.test(item.body);

    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        {!isMe && (
          <View style={styles.msgAvatar}>
            <Text style={styles.msgAvatarText}>{item.senderName.charAt(0)}</Text>
          </View>
        )}
        <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
          {!isMe && <Text style={styles.msgSender}>{item.senderName}</Text>}
          <Text style={[styles.msgBody, isMe && styles.msgBodyMe]}>{item.body}</Text>
          {isAutoMessage && (
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/job/${jobId}` as any);
              }}
              style={{ marginTop: 6, paddingVertical: 4 }}
            >
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: isMe ? 'rgba(0,0,0,0.7)' : Colors.primary, textDecorationLine: 'underline' }}>
                View Job Details →
              </Text>
            </Pressable>
          )}
          <Text style={[styles.msgTime, isMe && styles.msgTimeMe]}>
            {new Date(item.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.topBar, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
        <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/messages' as any); }} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.topBarInfo}>
          <Text style={styles.topBarName} numberOfLines={1}>
            {chatPartnerName}
          </Text>
          {jobMaterial ? (
            <Text style={styles.topBarSub}>{jobMaterial}</Text>
          ) : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={invertedMessages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        inverted
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListEmptyComponent={
          messagesLoading ? (
            <View style={styles.emptyChat}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubble-outline" size={32} color={Colors.textMuted} />
              <Text style={styles.emptyChatText}>Start a conversation</Text>
            </View>
          )
        }
      />

      <View style={[styles.inputBar, { paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 8) }]}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor={Colors.textMuted}
            value={messageText}
            onChangeText={setMessageText}
            multiline
            maxLength={500}
          />
          <Pressable
            style={[styles.sendBtn, !messageText.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!messageText.trim()}
          >
            <Ionicons name="send" size={18} color={messageText.trim() ? Colors.primaryForeground : Colors.textMuted} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.card,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarInfo: {
    flex: 1,
    alignItems: 'center',
  },
  topBarName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.text,
  },
  topBarSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  messagesList: {
    padding: 16,
    gap: 8,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 4,
  },
  msgRowMe: {
    flexDirection: 'row-reverse',
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgAvatarText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.primary,
  },
  msgBubble: {
    maxWidth: '75%',
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  msgBubbleMe: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  msgBubbleOther: {
    backgroundColor: Colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  msgSender: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.primary,
  },
  msgBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.text,
    lineHeight: 20,
  },
  msgBodyMe: {
    color: Colors.primaryForeground,
  },
  msgTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.textMuted,
    alignSelf: 'flex-end',
  },
  msgTimeMe: {
    color: 'rgba(22, 26, 34, 0.6)',
  },
  emptyChat: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 8,
    transform: [{ scaleY: -1 }],
  },
  emptyChatText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
  },
  inputBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.background,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  textInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.text,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: Colors.muted,
  },
});
