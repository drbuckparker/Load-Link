import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/query-client';

const ROLES = [
  { key: 'trucking_company', label: 'Trucking Company', desc: 'Fleet manager', icon: 'bus' as const },
  { key: 'contractor', label: 'Contractor', desc: 'Post jobs & projects', icon: 'construct' as const },
  { key: 'trucking_company_contractor', label: 'Trucking Co. + Contractor', desc: 'Fleet & post jobs', icon: 'business' as const },
];

// Shown only when the entered email has a pending invitation of that type —
// invited drivers/foremen get their role preselected instead of defaulting
// to Trucking Company.
const INVITED_ROLES: Record<string, { key: string; label: string; desc: string; icon: 'car' | 'clipboard' }> = {
  driver: { key: 'driver', label: 'Driver', desc: 'You were invited as a driver', icon: 'car' },
  foreman: { key: 'foreman', label: 'Foreman', desc: 'You were invited as a foreman', icon: 'clipboard' },
};

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('trucking_company');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [invitedAs, setInvitedAs] = useState<string | null>(null);
  const inviteCheckTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // When the typed email has a pending driver/foreman invitation, surface
  // that role card and select it automatically.
  useEffect(() => {
    if (inviteCheckTimeout.current) clearTimeout(inviteCheckTimeout.current);
    const candidate = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate)) { setInvitedAs(null); return; }
    inviteCheckTimeout.current = setTimeout(async () => {
      try {
        const resp = await apiRequest('GET', `/api/auth/invited-role?email=${encodeURIComponent(candidate)}`);
        const data = await resp.json();
        const t = data?.invitedAs && INVITED_ROLES[data.invitedAs] ? data.invitedAs : null;
        setInvitedAs(t);
        if (t) setRole(t);
      } catch { setInvitedAs(null); }
    }, 500);
    return () => { if (inviteCheckTimeout.current) clearTimeout(inviteCheckTimeout.current); };
  }, [email]);

  const roleOptions = invitedAs ? [INVITED_ROLES[invitedAs], ...ROLES] : ROLES;

  async function handleRegister() {
    if (!fullName || !email || !password || !phone) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await register({ email, password, fullName, phone, role });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismissAll();
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAwareScrollViewCompat
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={40}
    >
      <Text style={styles.heading}>CREATE ACCOUNT</Text>
      <Text style={styles.subtitle}>Join the LoadLink network</Text>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={Colors.destructive} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>YOUR ROLE</Text>
      {invitedAs && (
        <View style={styles.invitedBanner}>
          <Ionicons name="mail-open-outline" size={16} color={Colors.primary} />
          <Text style={styles.invitedBannerText}>
            This email was invited as a {invitedAs === 'driver' ? 'driver' : 'foreman'} — we've selected that for you.
          </Text>
        </View>
      )}
      <View style={styles.roleGrid}>
        {roleOptions.map(r => (
          <Pressable
            key={r.key}
            style={[styles.roleCard, role === r.key && styles.roleCardActive]}
            onPress={() => setRole(r.key)}
          >
            <Ionicons name={r.icon} size={24} color={role === r.key ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.roleLabel, role === r.key && styles.roleLabelActive]}>{r.label}</Text>
            <Text style={styles.roleDesc}>{r.desc}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Full Name</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="person-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
          <TextInput style={styles.input} placeholder="John Smith" placeholderTextColor={Colors.textMuted} value={fullName} onChangeText={setFullName} />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Email</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="mail-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
          <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={Colors.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Phone</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="call-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
          <TextInput style={styles.input} placeholder="(555) 123-4567" placeholderTextColor={Colors.textMuted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Password</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
          <TextInput style={styles.input} placeholder="Create a password" placeholderTextColor={Colors.textMuted} value={password} onChangeText={setPassword} secureTextEntry />
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.registerBtn, pressed && styles.registerBtnPressed, loading && styles.registerBtnDisabled]}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={Colors.primaryForeground} />
        ) : (
          <Text style={styles.registerBtnText}>CREATE ACCOUNT</Text>
        )}
      </Pressable>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    padding: 24,
  },
  heading: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 22,
    color: Colors.text,
    letterSpacing: 1,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 24,
    marginTop: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.destructiveBg,
    borderRadius: 8,
    padding: 10,
    gap: 8,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.destructive,
    flex: 1,
  },
  sectionLabel: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 10,
  },
  invitedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  invitedBannerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.primary,
    flex: 1,
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  roleCard: {
    flex: 1,
    minWidth: '28%',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: 6,
  },
  roleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  roleLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.text,
    textAlign: 'center',
  },
  roleLabelActive: {
    color: Colors.primary,
  },
  roleDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.input,
    height: 48,
  },
  inputIcon: {
    marginLeft: 12,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.text,
    paddingHorizontal: 10,
    height: '100%',
  },
  registerBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 48,
    marginTop: 8,
  },
  registerBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  registerBtnDisabled: {
    opacity: 0.6,
  },
  registerBtnText: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 15,
    color: Colors.primaryForeground,
    letterSpacing: 1,
  },
});
