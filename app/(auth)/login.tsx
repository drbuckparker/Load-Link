import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Link, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/query-client';

try {
  const WebBrowser = require('expo-web-browser');
  WebBrowser.maybeCompleteAuthSession();
} catch (e) {
}

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const isExpoGo = Constants.appOwnership === 'expo' || __DEV__;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, socialLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | null>(null);
  const [error, setError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  async function handleSocialAuth(provider: 'google', token: string, authEmail?: string) {
    setError('');
    setSocialLoading(provider);
    try {
      await socialLogin(provider, token, authEmail);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      while (router.canGoBack()) {
        router.back();
      }
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message || 'Google sign in failed');
    } finally {
      setSocialLoading(null);
    }
  }

  async function handleGoogleSignIn() {
    if (!GOOGLE_CLIENT_ID) {
      setError('Google sign in is not configured yet. Please use email/password.');
      return;
    }
    setError('');
    setSocialLoading('google');
    try {
      const { makeRedirectUri, AuthRequest, ResponseType } = await import('expo-auth-session');
      const redirectUri = makeRedirectUri({
        scheme: 'loadlink',
        ...(isExpoGo ? { useProxy: true } : {}),
      });
      const discovery = {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
      };
      const request = new AuthRequest({
        clientId: GOOGLE_CLIENT_ID,
        redirectUri,
        responseType: ResponseType.Token,
        scopes: ['openid', 'profile', 'email'],
        usePKCE: false,
      });
      const result = await request.promptAsync(discovery, {
        showInRecents: true,
        ...(isExpoGo ? { useProxy: true } : {}),
      });
      if (result.type === 'success') {
        const token = result.params.access_token || result.params.id_token;
        if (token) {
          await handleSocialAuth('google', token);
        } else {
          setError('No token received from Google');
          setSocialLoading(null);
        }
      } else {
        setSocialLoading(null);
      }
    } catch (e: any) {
      if (!e.message?.includes('cancel') && !e.message?.includes('dismiss')) {
        setError(e.message || 'Google sign in failed');
      }
      setSocialLoading(null);
    }
  }

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
      while (router.canGoBack()) {
        router.back();
      }
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

  const isAnyLoading = loading || !!socialLoading;

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
            style={({ pressed }) => [styles.loginBtn, pressed && styles.loginBtnPressed, isAnyLoading && styles.loginBtnDisabled]}
            onPress={needsPassword ? handleSetPassword : handleLogin}
            disabled={isAnyLoading}
            testID="sign-in-btn"
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

          {!needsPassword && (
            <View style={styles.socialSection}>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable
                style={({ pressed }) => [styles.socialBtn, pressed && styles.socialBtnPressed, isAnyLoading && styles.socialBtnDisabled]}
                onPress={handleGoogleSignIn}
                disabled={isAnyLoading}
                testID="google-sign-in"
              >
                {socialLoading === 'google' ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <>
                    <View style={styles.googleIconWrap}>
                      <Text style={styles.googleG}>G</Text>
                    </View>
                    <Text style={styles.socialBtnText}>Continue with Google</Text>
                  </>
                )}
              </Pressable>
            </View>
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
  socialSection: {
    marginTop: 16,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 8,
    gap: 10,
    marginBottom: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderMedium,
  },
  socialBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
    backgroundColor: Colors.cardHover,
  },
  socialBtnDisabled: {
    opacity: 0.5,
  },
  googleIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  socialBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.borderMedium,
  },
  dividerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textMuted,
    marginHorizontal: 12,
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
