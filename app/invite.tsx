import { View, Text, TextInput, Pressable, StyleSheet, Platform, Alert, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import Colors from '@/constants/colors';
import { apiRequest, queryClient } from '@/lib/query-client';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAuth } from '@/contexts/AuthContext';

type InviteType = 'driver' | 'foreman';

interface Invitation {
  id: string;
  driver_email: string;
  driver_name: string | null;
  driver_first_name: string | null;
  driver_last_name: string | null;
  invitation_type: InviteType;
  status: string;
  created_at: string;
}

const EMPTY_FORM = {
  type: 'driver' as InviteType,
  email: '',
  firstName: '',
  lastName: '',
  phone: '',
  message: '',
};

function statusColor(status: string): { bg: string; fg: string } {
  switch ((status || '').toLowerCase()) {
    case 'accepted':
      return { bg: Colors.successBg, fg: Colors.success };
    case 'declined':
    case 'expired':
      return { bg: Colors.destructiveBg, fg: Colors.destructive };
    default:
      return { bg: Colors.warningBg, fg: Colors.warning };
  }
}

export default function InviteScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const role = (user?.role || '') as string;
  const canInviteDriver = role.includes('trucking_company');
  const canInviteForeman = role.includes('contractor');
  const allowedTypes: InviteType[] = [
    ...(canInviteDriver ? (['driver'] as InviteType[]) : []),
    ...(canInviteForeman ? (['foreman'] as InviteType[]) : []),
  ];
  const inviteTypes: InviteType[] = allowedTypes.length ? allowedTypes : (['driver', 'foreman'] as InviteType[]);
  const defaultInviteType: InviteType = inviteTypes[0];
  const inviteNoun = inviteTypes.length === 1 ? (inviteTypes[0] === 'driver' ? 'a driver' : 'a foreman') : 'a driver or foreman';
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, type: defaultInviteType }));
  const [error, setError] = useState('');
  const effectiveType: InviteType = inviteTypes.includes(form.type) ? form.type : defaultInviteType;
  const [refreshing, setRefreshing] = useState(false);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const { data: _invites, isLoading } = useQuery<Invitation[]>({
    queryKey: ['/api/driver-invitations'],
  });
  const invites = _invites || [];

  const sendMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/driver-invitations', {
        type: effectiveType,
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        message: form.message.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver-invitations'] });
      const label = effectiveType === 'foreman' ? 'Foreman' : 'Driver';
      const sentTo = form.email.trim();
      setForm({ ...EMPTY_FORM, type: defaultInviteType });
      setError('');
      if (Platform.OS === 'web') {
        window.alert(`${label} invitation sent to ${sentTo}.`);
      } else {
        Alert.alert('Invitation Sent', `We emailed an invite to ${sentTo}. They'll get a link to set up their LoadLink profile.`);
      }
    },
    onError: (e: any) => {
      setError(e?.message || 'Could not send the invitation. Please try again.');
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      return apiRequest('DELETE', `/api/driver-invitations/${inviteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver-invitations'] });
    },
    onError: (e: any) => {
      const msg = e?.message || 'Could not remove the invitation. Please try again.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Remove Failed', msg);
    },
  });

  function confirmRemove(inv: Invitation) {
    const who = inv.driver_name || [inv.driver_first_name, inv.driver_last_name].filter(Boolean).join(' ').trim() || inv.driver_email || 'this invitation';
    const body = `Remove the invitation to ${who} from your list? If they already got the email, their invite link will still work.`;
    if (Platform.OS === 'web') {
      if (window.confirm(body)) removeMutation.mutate(String(inv.id));
    } else {
      Alert.alert('Remove Invitation', body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate(String(inv.id)) },
      ]);
    }
  }

  function handleSend() {
    setError('');
    const email = form.email.trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    sendMutation.mutate();
  }

  async function onRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['/api/driver-invitations'] });
    setRefreshing(false);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>INVITE TO LOADLINK</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 32 }]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>Send an Invitation</Text>
          <Text style={styles.formSubtitle}>
            Invite {inviteNoun} by email. They'll get a link to create their LoadLink profile and be automatically linked to your account.
          </Text>

          <Text style={styles.fieldLabel}>WHO ARE YOU INVITING?</Text>
          <View style={styles.chipRow}>
            {inviteTypes.map((t) => (
              <Pressable
                key={t}
                style={[styles.chip, effectiveType === t && styles.chipActive]}
                onPress={() => setForm((f) => ({ ...f, type: t }))}
              >
                <Ionicons
                  name={t === 'driver' ? 'car-outline' : 'clipboard-outline'}
                  size={16}
                  color={effectiveType === t ? Colors.primary : Colors.textSecondary}
                />
                <Text style={[styles.chipText, effectiveType === t && styles.chipTextActive]}>
                  {t === 'driver' ? 'Driver' : 'Foreman'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>EMAIL ADDRESS *</Text>
          <TextInput
            style={styles.input}
            placeholder="name@example.com"
            placeholderTextColor={Colors.textMuted}
            value={form.email}
            onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.formRow}>
            <View style={styles.formHalf}>
              <Text style={styles.fieldLabel}>FIRST NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="First"
                placeholderTextColor={Colors.textMuted}
                value={form.firstName}
                onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))}
              />
            </View>
            <View style={styles.formHalf}>
              <Text style={styles.fieldLabel}>LAST NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="Last"
                placeholderTextColor={Colors.textMuted}
                value={form.lastName}
                onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>PHONE (OPTIONAL)</Text>
          <TextInput
            style={styles.input}
            placeholder="(555) 555-0100"
            placeholderTextColor={Colors.textMuted}
            value={form.phone}
            onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
            keyboardType="phone-pad"
          />

          <Text style={styles.fieldLabel}>PERSONAL MESSAGE (OPTIONAL)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Add a note to your invitation..."
            placeholderTextColor={Colors.textMuted}
            value={form.message}
            onChangeText={(v) => setForm((f) => ({ ...f, message: v }))}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            style={[styles.saveBtn, sendMutation.isPending && styles.saveBtnDisabled]}
            onPress={handleSend}
            disabled={sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator color={Colors.primaryForeground} />
            ) : (
              <>
                <Ionicons name="paper-plane-outline" size={18} color={Colors.primaryForeground} />
                <Text style={styles.saveBtnText}>Send Invitation</Text>
              </>
            )}
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>SENT INVITATIONS</Text>
        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
        ) : invites.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="mail-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No invitations sent yet</Text>
          </View>
        ) : (
          invites.map((inv) => {
            const sc = statusColor(inv.status);
            const name = inv.driver_name || [inv.driver_first_name, inv.driver_last_name].filter(Boolean).join(' ').trim();
            return (
              <View key={inv.id} style={styles.inviteCard}>
                <View style={styles.inviteIconBox}>
                  <Ionicons
                    name={inv.invitation_type === 'foreman' ? 'clipboard-outline' : 'car-outline'}
                    size={18}
                    color={Colors.primary}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.inviteName} numberOfLines={1}>{name || inv.driver_email}</Text>
                  <Text style={styles.inviteEmail} numberOfLines={1}>
                    {name ? inv.driver_email : (inv.invitation_type === 'foreman' ? 'Foreman' : 'Driver')}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                  <Text style={[styles.statusText, { color: sc.fg }]}>
                    {(inv.status || 'pending').toUpperCase()}
                  </Text>
                </View>
                <Pressable
                  onPress={() => confirmRemove(inv)}
                  hitSlop={8}
                  style={styles.removeBtn}
                  disabled={removeMutation.isPending}
                  testID={`remove-invite-${inv.id}`}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
                </Pressable>
              </View>
            );
          })
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 1,
  },
  content: { padding: 16 },

  formContainer: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  formTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
  },
  formSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 16,
    letterSpacing: 0.5,
  },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.muted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  chipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  chipTextActive: { color: Colors.primary },
  formRow: { flexDirection: 'row', gap: 10 },
  formHalf: { flex: 1 },
  input: {
    backgroundColor: Colors.muted,
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.text,
  },
  textArea: { height: 90, paddingTop: 12 },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.destructive,
    marginTop: 10,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    marginTop: 20,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.primaryForeground,
  },

  sectionTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  inviteIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  inviteEmail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  removeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(107,112,128,0.12)',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
