import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';

function isContractorRole(role: string): boolean {
  return role.includes('contractor') || role === 'trucking_company' || role === 'broker';
}

export default function PersistentQuickActions() {
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const role = user?.role || 'driver';
  const contractor = isContractorRole(role);
  const { data } = useQuery<{ count: number }>({
    queryKey: ['/api/messages/unread-count'],
    enabled: isAuthenticated,
    refetchInterval: 15000,
  });

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (keyboardVisible) return null;

  const actions = [
    { label: 'Home', icon: 'home' as const, route: '/(tabs)' },
    { label: 'Calendar', icon: 'calendar' as const, route: '/(tabs)/calendar' },
    { label: 'Messages', icon: 'chatbubbles' as const, route: '/(tabs)/messages', badge: data?.count || 0 },
    contractor
      ? { label: 'Invoices', icon: 'document-text' as const, route: '/(tabs)/invoices' }
      : { label: 'Jobs', icon: 'briefcase' as const, route: '/(tabs)/my-jobs' },
    { label: 'Profile', icon: 'person' as const, route: '/(tabs)/profile' },
  ];

  return (
    <View
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 10 : 6) }]}
      testID="persistent-quick-actions"
    >
      {actions.map(action => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          testID={`quick-action-${action.label.toLowerCase()}`}
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.65 }]}
          onPress={() => router.replace(action.route as any)}
        >
          <View>
            <Ionicons name={action.icon} size={25} color={Colors.textMuted} />
            {!!action.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{action.badge > 99 ? '99+' : action.badge}</Text>
              </View>
            )}
          </View>
          <Text style={styles.label}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 9,
    minHeight: 62,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  label: {
    color: Colors.textMuted,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  badge: {
    position: 'absolute',
    right: -9,
    top: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#cc3300',
  },
  badgeText: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
});