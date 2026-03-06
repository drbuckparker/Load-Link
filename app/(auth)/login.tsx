import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Link, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/query-client';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  async function handleLogin() {
    if (!email || !password) {
      setError('Please enter your email and password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismissAll();
      router.replace('/(tabs)');
    } catch (e: any) {
      const msg = e.message || 'Login failed';
      if (msg.includes('different login method')) {
        setNeedsPassword(true);
        setPassword('');
        setError('');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword() {
    if (!email || !password) {
      setError('Please enter your email and a new password');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest('POST', '/api/auth/set-password', { email, password });
      const data = await res.json();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNeedsPassword(false);
      setPassword('');
      setConfirmPassword('');
      setSuccessMsg('Password created! You can now sign in.');
    } catch (e: any) {
      setError(e.message || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 + insets.top : insets.top }]}>
      <LinearGradient
        colors={['rgba(255, 153, 0, 0.08)', 'transparent']}
        style={styles.gradientBg}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.4 }}
      />

      <View style={styles.gridOverlay}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={[styles.gridLine, { top: i * 40 }]} />
        ))}
      </View>

      <View style={styles.content}>
        <View style={styles.logoSection}>
          <View style={styles.logoContainer}>
            <Ionicons name="cube" size={32} color={Colors.primary} />
          </View>
          <Text style={styles.logoText}>LOADLINK</Text>
          <Text style={styles.tagline}>Built for Construction Hauls</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{needsPassword ? 'SET MOBILE PASSWORD' : 'WELCOME BACK'}</Text>
          <Text style={styles.formSubtitle}>
            {needsPassword
              ? 'Your web account uses a different login. Create a password for mobile access.'
              : 'Sign in to continue to LoadLink'}
          </Text>

          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={Colors.destructive} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {successMsg ? (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={(t) => { setEmail(t); setSuccessMsg(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!needsPassword}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>{needsPassword ? 'New Password' : 'Password'}</Text>
              {!needsPassword && (
                <Link href="/(auth)/forgot-password" asChild>
                  <Pressable>
                    <Text style={styles.forgotLink}>Forgot password?</Text>
                  </Pressable>
                </Link>
              )}
            </View>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={needsPassword ? 'Create a password (min 6 chars)' : 'Enter your password'}
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.textMuted} />
              </Pressable>
            </View>
          </View>

          {needsPassword && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm your password"
                  placeholderTextColor={Colors.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                />
              </View>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.loginBtn, pressed && styles.loginBtnPressed, loading && styles.loginBtnDisabled]}
            onPress={needsPassword ? handleSetPassword : handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={Colors.primaryForeground} />
            ) : (
              <>
                <Text style={styles.loginBtnText}>{needsPassword ? 'CREATE PASSWORD' : 'SIGN IN'}</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.primaryForeground} />
              </>
            )}
          </Pressable>

          {needsPassword && (
            <Pressable onPress={() => { setNeedsPassword(false); setPassword(''); setConfirmPassword(''); setError(''); }} style={styles.backBtn}>
              <Text style={styles.backBtnText}>Back to Sign In</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account?</Text>
          <Link href="/(auth)/register" asChild>
            <Pressable>
              <Text style={styles.footerLink}>Create one</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  gradientBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
    opacity: 0.3,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoText: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 28,
    color: Colors.text,
    letterSpacing: 3,
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  formCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.borderMedium,
  },
  formTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 1,
    marginBottom: 4,
  },
  formSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 20,
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
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successBg,
    borderRadius: 8,
    padding: 10,
    gap: 8,
    marginBottom: 16,
  },
  successText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.success,
    flex: 1,
  },
  backBtn: {
    alignItems: 'center',
    marginTop: 12,
    padding: 8,
  },
  backBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  inputGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text,
    marginBottom: 6,
  },
  forgotLink: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.primary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
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
  eyeBtn: {
    padding: 12,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 48,
    gap: 8,
    marginTop: 8,
  },
  loginBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 15,
    color: Colors.primaryForeground,
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    gap: 4,
  },
  footerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  footerLink: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.primary,
  },
});
