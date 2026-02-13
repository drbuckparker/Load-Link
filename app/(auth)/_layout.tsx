import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: "minimal",
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontFamily: 'ChakraPetch_600SemiBold' },
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="login" options={{ title: "Sign In", headerShown: false }} />
      <Stack.Screen name="register" options={{ title: "Create Account" }} />
      <Stack.Screen name="forgot-password" options={{ title: "Reset Password" }} />
    </Stack>
  );
}
