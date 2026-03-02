import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest, getApiUrl } from '@/lib/query-client';
import { fetch } from 'expo/fetch';
import { registerForPushNotifications } from '@/lib/notifications';

export interface User {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  company?: string;
  profileImageUrl?: string;
  truckType?: string;
  truckYear?: number;
  truckMake?: string;
  truckModel?: string;
  licensePlate?: string;
  searchRadiusMiles: number;
  isConnected: boolean;
  rating: number;
  totalJobs: number;
  primaryLocationAddress?: string;
  primaryLocationLat?: number;
  primaryLocationLng?: number;
  secondaryLocationAddress?: string;
  secondaryLocationLat?: number;
  secondaryLocationLng?: number;
  tertiaryLocationAddress?: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; fullName: string; phone: string; role: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapDbUser(dbUser: any): User {
  return {
    id: dbUser.id,
    fullName: dbUser.full_name || dbUser.fullName || `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.trim() || 'Unknown',
    firstName: dbUser.first_name || dbUser.firstName || '',
    lastName: dbUser.last_name || dbUser.lastName || '',
    email: dbUser.email || '',
    phone: dbUser.phone || '',
    role: dbUser.role || 'driver',
    company: dbUser.company,
    profileImageUrl: dbUser.profile_image_url || dbUser.profileImageUrl,
    truckType: dbUser.truck_type || dbUser.truckType,
    truckYear: dbUser.truck_year || dbUser.truckYear,
    truckMake: dbUser.truck_make || dbUser.truckMake,
    truckModel: dbUser.truck_model || dbUser.truckModel,
    licensePlate: dbUser.license_plate || dbUser.licensePlate,
    searchRadiusMiles: dbUser.search_radius_miles ?? dbUser.searchRadiusMiles ?? 50,
    isConnected: dbUser.is_connected ?? dbUser.isConnected ?? true,
    rating: Number(dbUser.rating) || 0,
    totalJobs: dbUser.total_jobs ?? dbUser.totalJobs ?? 0,
    primaryLocationAddress: dbUser.primary_location_address || dbUser.primaryLocationAddress,
    primaryLocationLat: dbUser.primary_location_lat ? Number(dbUser.primary_location_lat) : undefined,
    primaryLocationLng: dbUser.primary_location_lng ? Number(dbUser.primary_location_lng) : undefined,
    secondaryLocationAddress: dbUser.secondary_location_address || dbUser.secondaryLocationAddress,
    secondaryLocationLat: dbUser.secondary_location_lat ? Number(dbUser.secondary_location_lat) : undefined,
    secondaryLocationLng: dbUser.secondary_location_lng ? Number(dbUser.secondary_location_lng) : undefined,
    tertiaryLocationAddress: dbUser.tertiary_location_address || dbUser.tertiaryLocationAddress,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function safeStore(user: User) {
    try {
      await AsyncStorage.setItem('loadlink_user', JSON.stringify(user));
    } catch (e) {
      try {
        await AsyncStorage.clear();
        await AsyncStorage.setItem('loadlink_user', JSON.stringify(user));
      } catch {}
    }
  }

  async function checkAuth() {
    try {
      const stored = await AsyncStorage.getItem('loadlink_user');
      if (stored) {
        setUser(JSON.parse(stored));
      }

      const baseUrl = getApiUrl();
      const res = await fetch(new URL('/api/auth/me', baseUrl).toString(), {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        const mapped = mapDbUser(data.user);
        await safeStore(mapped);
        setUser(mapped);
      } else {
        await AsyncStorage.removeItem('loadlink_user').catch(() => {});
        setUser(null);
      }
    } catch (e) {
      console.log('Auth check failed (offline?):', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const res = await apiRequest('POST', '/api/auth/login', { email, password });
    const data = await res.json();
    const mapped = mapDbUser(data.user);
    await safeStore(mapped);
    setUser(mapped);
    registerForPushNotifications().catch(() => {});
  }

  async function register(data: { email: string; password: string; fullName: string; phone: string; role: string }) {
    const res = await apiRequest('POST', '/api/auth/register', data);
    const responseData = await res.json();
    const mapped = mapDbUser(responseData.user);
    await safeStore(mapped);
    setUser(mapped);
    registerForPushNotifications().catch(() => {});
  }

  async function logout() {
    try {
      await apiRequest('POST', '/api/auth/logout');
    } catch {}
    await AsyncStorage.removeItem('loadlink_user');
    setUser(null);
  }

  async function updateUser(updates: Partial<User>) {
    if (!user) return;

    const dbUpdates: any = {};
    if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName;
    if (updates.firstName !== undefined) dbUpdates.first_name = updates.firstName;
    if (updates.lastName !== undefined) dbUpdates.last_name = updates.lastName;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.company !== undefined) dbUpdates.company = updates.company;
    if (updates.truckType !== undefined) dbUpdates.truck_type = updates.truckType;
    if (updates.truckMake !== undefined) dbUpdates.truck_make = updates.truckMake;
    if (updates.truckModel !== undefined) dbUpdates.truck_model = updates.truckModel;
    if (updates.truckYear !== undefined) dbUpdates.truck_year = updates.truckYear;
    if (updates.licensePlate !== undefined) dbUpdates.license_plate = updates.licensePlate;
    if (updates.searchRadiusMiles !== undefined) dbUpdates.search_radius_miles = updates.searchRadiusMiles;
    if (updates.primaryLocationAddress !== undefined) dbUpdates.primary_location_address = updates.primaryLocationAddress;
    if (updates.primaryLocationLat !== undefined) dbUpdates.primary_location_lat = updates.primaryLocationLat;
    if (updates.primaryLocationLng !== undefined) dbUpdates.primary_location_lng = updates.primaryLocationLng;
    if (updates.secondaryLocationAddress !== undefined) dbUpdates.secondary_location_address = updates.secondaryLocationAddress;
    if (updates.secondaryLocationLat !== undefined) dbUpdates.secondary_location_lat = updates.secondaryLocationLat;
    if (updates.secondaryLocationLng !== undefined) dbUpdates.secondary_location_lng = updates.secondaryLocationLng;
    if (updates.tertiaryLocationAddress !== undefined) dbUpdates.tertiary_location_address = updates.tertiaryLocationAddress;

    try {
      const res = await apiRequest('PUT', '/api/profile', dbUpdates);
      const data = await res.json();
      const mapped = mapDbUser(data);
      await safeStore(mapped);
      setUser(mapped);
    } catch (e) {
      const updated = { ...user, ...updates };
      await safeStore(updated);
      setUser(updated);
    }
  }

  async function refreshUser() {
    try {
      const res = await apiRequest('GET', '/api/profile');
      const data = await res.json();
      const mapped = mapDbUser(data);
      await safeStore(mapped);
      setUser(mapped);
    } catch {}
  }

  const value = useMemo(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    updateUser,
    refreshUser,
  }), [user, isLoading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
