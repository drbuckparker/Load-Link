import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  truckYear?: string;
  truckMake?: string;
  truckModel?: string;
  licensePlate?: string;
  searchRadiusMiles: number;
  isConnected: boolean;
  rating: number;
  totalJobs: number;
  primaryLocationAddress?: string;
  secondaryLocationAddress?: string;
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
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_USER: User = {
  id: 'usr_demo_001',
  fullName: 'Marcus Rivera',
  firstName: 'Marcus',
  lastName: 'Rivera',
  email: 'marcus@loadlink.com',
  phone: '(555) 234-5678',
  role: 'owner_operator',
  company: 'Rivera Hauling LLC',
  truckType: 'end_dump',
  truckYear: '2022',
  truckMake: 'Peterbilt',
  truckModel: '567',
  licensePlate: 'TRK-4521',
  searchRadiusMiles: 50,
  isConnected: true,
  rating: 4.8,
  totalJobs: 147,
  primaryLocationAddress: 'Phoenix, AZ',
  secondaryLocationAddress: 'Mesa, AZ',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const stored = await AsyncStorage.getItem('loadlink_user');
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load user:', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(_email: string, _password: string) {
    await AsyncStorage.setItem('loadlink_user', JSON.stringify(DEMO_USER));
    setUser(DEMO_USER);
  }

  async function register(data: { email: string; password: string; fullName: string; phone: string; role: string }) {
    const names = data.fullName.split(' ');
    const newUser: User = {
      ...DEMO_USER,
      id: 'usr_' + Date.now().toString(),
      email: data.email,
      fullName: data.fullName,
      firstName: names[0] || '',
      lastName: names.slice(1).join(' ') || '',
      phone: data.phone,
      role: data.role,
      totalJobs: 0,
      rating: 0,
    };
    await AsyncStorage.setItem('loadlink_user', JSON.stringify(newUser));
    setUser(newUser);
  }

  async function logout() {
    await AsyncStorage.removeItem('loadlink_user');
    setUser(null);
  }

  async function updateUser(updates: Partial<User>) {
    if (!user) return;
    const updated = { ...user, ...updates };
    await AsyncStorage.setItem('loadlink_user', JSON.stringify(updated));
    setUser(updated);
  }

  const value = useMemo(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    updateUser,
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
