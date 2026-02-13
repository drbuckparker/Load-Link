import { useState, useRef } from 'react';
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { MOCK_MESSAGES, MOCK_JOBS, Message } from '@/lib/mock-data';

export default function ChatScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES[jobId || ''] || []);
  const flatListRef = useRef<FlatList>(null);

  const job = MOCK_JOBS.find(j => j.id === jobId);
  const invertedMessages = [...messages].reverse();

  function handleSend() {
    if (!messageText.trim() || !user) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const newMsg: Message = {
      id: 'm_' + Date.now().toString(),
      jobId: jobId || '',
      senderId: user.id,
      senderName: user.fullName,
      body: messageText.trim(),
      read: false,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, newMsg]);
    setMessageText('');
  }

  function renderMessage({ item }: { item: Message }) {
    const isMe = item.senderId === user?.id;

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
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.topBarInfo}>
          <Text style={styles.topBarName} numberOfLines={1}>
            {job?.contractorName || 'Chat'}
          </Text>
          {job && (
            <Text style={styles.topBarSub}>{job.material}</Text>
          )}
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
          <View style={styles.emptyChat}>
            <Ionicons name="chatbubble-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyChatText}>Start a conversation</Text>
          </View>
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
