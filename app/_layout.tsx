import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/contexts/AuthContext";
import { StatusBar } from "expo-status-bar";
import { useFonts, ChakraPetch_600SemiBold, ChakraPetch_700Bold } from "@expo-google-fonts/chakra-petch";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import * as Notifications from "expo-notifications";
import { playNotificationSound } from "@/lib/sounds";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
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
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ChakraPetch_600SemiBold,
    ChakraPetch_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const notifListener = Notifications.addNotificationReceivedListener(() => {
      playNotificationSound();
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'message' && data?.jobId) {
        router.push(`/chat/${data.jobId}`);
      } else if (data?.jobId) {
        router.push(`/job/${data.jobId}`);
      } else {
        router.push('/notifications');
      }
    });

    return () => {
      if (notifListener?.remove) notifListener.remove();
      else if (Notifications.removeNotificationSubscription) Notifications.removeNotificationSubscription(notifListener);
      if (responseListener?.remove) responseListener.remove();
      else if (Notifications.removeNotificationSubscription) Notifications.removeNotificationSubscription(responseListener);
    };
  }, []);

  if (!fontsLoaded) return null;

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
