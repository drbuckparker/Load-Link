import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform, View, StyleSheet, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorFallback } from "@/components/ErrorFallback";
import Colors from "@/constants/colors";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/contexts/AuthContext";
import { StatusBar } from "expo-status-bar";
import { useFonts, ChakraPetch_600SemiBold, ChakraPetch_700Bold } from "@expo-google-fonts/chakra-petch";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { playNotificationSound, playTruckHornSound, playCashRegisterSound } from "@/lib/sounds";
import { resumeClockOutMonitor } from "@/lib/clockout-monitor";
import PersistentQuickActions from "@/components/PersistentQuickActions";
import { useAuth } from "@/contexts/AuthContext";

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason: any = event.reason;
    const msg: string = (reason && (reason.message || String(reason))) || '';
    if (/ms timeout exceeded/i.test(msg) || /fontfaceobserver/i.test(msg)) {
      event.preventDefault();
    }
  });
  // fontfaceobserver throws its "6000ms timeout exceeded" inside a setTimeout,
  // which surfaces as a plain uncaught error (not a rejection) and triggers the
  // red dev overlay on slow connections. Fonts still swap in when they arrive,
  // so this error is harmless — suppress it.
  window.addEventListener('error', (event) => {
    const msg = String(event.message || event.error?.message || '');
    // "<n>ms timeout exceeded" only comes from fontfaceobserver in this bundle.
    if (/ms timeout exceeded/i.test(msg)) {
      event.preventDefault();
    }
  }, true);
}

SplashScreen.preventAutoHideAsync();

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ErrorFallback error={error} resetError={() => { void retry(); }} />;
}

const APP_MAX_WIDTH = 520;

function RootLayoutNav() {
  const { width } = useWindowDimensions();
  const segments = useSegments();
  const { isAuthenticated, isLoading } = useAuth();
  const isWide = width > APP_MAX_WIDTH;
  const rootSegment = segments[0];
  const showQuickActions = !isLoading
    && isAuthenticated
    && rootSegment !== '(tabs)'
    && rootSegment !== '(auth)';

  const stack = (
    <View style={styles.appShell}>
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="(auth)"
          options={{
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen name="job/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[jobId]" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="create-job" options={{ headerShown: false }} />
        <Stack.Screen name="vehicles" options={{ headerShown: false }} />
        <Stack.Screen name="earnings" options={{ headerShown: false }} />
        <Stack.Screen name="jobs-browse" options={{ headerShown: false }} />
        <Stack.Screen name="edit-job/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="invoice/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="review" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="vehicle-jobs/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="invite" options={{ headerShown: false }} />
        <Stack.Screen name="broker" options={{ headerShown: false }} />
      </Stack>
      {showQuickActions && <PersistentQuickActions />}
    </View>
  );

  if (!isWide) return stack;

  return (
    <View style={styles.wideRoot}>
      <View style={styles.wideFrame}>{stack}</View>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ChakraPetch_600SemiBold,
    ChakraPetch_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (Platform.OS === 'web' || Platform.OS === 'android') return;
    resumeClockOutMonitor();
    let notifSub: any = null;
    let responseSub: any = null;
    let cancelled = false;

    (async () => {
      try {
        const N = await import('expo-notifications');
        if (cancelled) return;
        notifSub = N.addNotificationReceivedListener((notification) => {
          const data = notification?.request?.content?.data as any;
          if (data?.type === 'new_job') {
            // Truck horn alerts drivers to a new job in their area.
            playTruckHornSound();
          } else if (data?.type === 'job_awarded') {
            // Cash register: the driver was awarded/approved for a job.
            playCashRegisterSound();
          } else {
            playNotificationSound();
          }
          queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        });
        responseSub = N.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as any;
          if (data?.type === 'clockout_reminder') {
            // "Still working" keeps the clock running (no-op); the "Clock out"
            // button and tapping the reminder open the job to finish clocking out.
            if (response.actionIdentifier === 'still_working') return;
            if (data?.jobId) router.push(`/job/${data.jobId}?action=clockout`);
            return;
          }
          if (data?.type === 'message' && data?.jobId) {
            router.push(`/chat/${data.jobId}`);
          } else if (data?.jobId) {
            router.push(`/job/${data.jobId}`);
          } else {
            router.push('/notifications');
          }
        });
      } catch {}
    })();

    return () => {
      cancelled = true;
      if (notifSub?.remove) notifSub.remove();
      if (responseSub?.remove) responseSub.remove();
    };
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView>
        <KeyboardProvider>
          <AuthProvider>
            <StatusBar style="light" />
            <RootLayoutNav />
          </AuthProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  wideRoot: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
  },
  wideFrame: {
    flex: 1,
    width: "100%",
    maxWidth: APP_MAX_WIDTH,
    backgroundColor: Colors.background,
  },
});
