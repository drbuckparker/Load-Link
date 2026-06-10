import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';

const ROLES = [
  { key: 'owner_operator', label: 'Owner Operator', desc: 'Independent driver', icon: 'car-sport' as const },
  { key: 'trucking_company', label: 'Trucking Company', desc: 'Fleet manager', icon: 'bus' as const },
  { key: 'contractor', label: 'Contractor', desc: 'Post jobs & projects', icon: 'construct' as const },
];

export default function AppleCompleteScreen() {
  const insets = useSafeAreaInsets();
  const { appleRegister } = useAuth();
  const params = useLocalSearchParams<{ token?: string; name?: string; email?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const presetEmail = typeof params.email === 'string' ? params.email : '';

  const [fullName, setFullName] = useState(typeof params.name === 'string' ? params.name : '');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('owner_operator');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!token) {
      setError('Your Apple sign-in expired. Please go back and tap Continue with Apple again.');
      return;
    }
    if (!fullName.trim() || !phone.trim()) {
      setError('Please enter your name and phone number');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await appleRegister(token, { fullName: fullName.trim(), phone: phone.trim(), role });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismissAll();
      router.replace('/(tabs)');
    } catch (e: any) {
      if (e?.message === 'apple_reauthorize_required') {
        setError('Apple isn\u2019t sharing your email anymore. Go to Settings → tap your name → Sign in with Apple → LoadLink → "Stop Using Apple ID", then sign in again.');
      } else {
        setError(e?.message || 'Could not finish creating your account');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heading}>FINISH SIGN UP</Text>
      <Text style={styles.subtitle}>
        {presetEmail ? `Creating your account for ${presetEmail}` : 'Just a couple details to set up your account'}
      </Text>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={Colors.destructive} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>YOUR ROLE</Text>
      <View style={styles.roleGrid}>
        {ROLES.map(r => (
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
        <Text style={styles.inputLabel}>Phone</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="call-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
          <TextInput style={styles.input} placeholder="(555) 123-4567" placeholderTextColor={Colors.textMuted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.createBtn, pressed && styles.createBtnPressed, loading && styles.createBtnDisabled]}
        onPress={handleCreate}
        disabled={loading}
        testID="apple-finish-signup"
      >
        {loading ? (
          <ActivityIndicator size="small" color={Colors.primaryForeground} />
        ) : (
          <Text style={styles.createBtnText}>CREATE ACCOUNT</Text>
        )}
      </Pressable>

      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>Cancel</Text>
      </Pressable>
    </ScrollView>
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
  roleGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  roleCard: {
    flex: 1,
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
  createBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 48,
    marginTop: 8,
  },
  createBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  createBtnDisabled: {
    opacity: 0.6,
  },
  createBtnText: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 15,
    color: Colors.primaryForeground,
    letterSpacing: 1,
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  backBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
