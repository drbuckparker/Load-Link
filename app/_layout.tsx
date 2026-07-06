import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform, View, StyleSheet, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Colors from "@/constants/colors";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/contexts/AuthContext";
import { StatusBar } from "expo-status-bar";
import { useFonts, ChakraPetch_600SemiBold, ChakraPetch_700Bold } from "@expo-google-fonts/chakra-petch";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { playNotificationSound, playTruckHornSound } from "@/lib/sounds";
import { resumeClockOutMonitor } from "@/lib/clockout-monitor";

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason: any = event.reason;
    const msg: string = (reason && (reason.message || String(reason))) || '';
    if (/ms timeout exceeded/i.test(msg) || /fontfaceobserver/i.test(msg)) {
      event.preventDefault();
    }
  });
}

SplashScreen.preventAutoHideAsync();

const APP_MAX_WIDTH = 520;

function RootLayoutNav() {
  const { width } = useWindowDimensions();
  const isWide = width > APP_MAX_WIDTH;

  const stack = (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="(auth)"
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="job/[id]"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="chat/[jobId]"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="create-job"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="vehicles"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen name="earnings" options={{ headerShown: false }} />
      <Stack.Screen name="jobs-browse" options={{ headerShown: false }} />
      <Stack.Screen name="edit-job/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="invoice/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="review" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="vehicle-jobs/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="invite" options={{ headerShown: false }} />
    </Stack>
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
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
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
