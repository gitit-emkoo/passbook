import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id: number;
  phone: string;
  name?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  loadAuth: () => Promise<void>;
}

/**
 * Zustand 스토어: 인증 상태 관리
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,

  login: async (token, user) => {
    await AsyncStorage.setItem('accessToken', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    set({ user, accessToken: token, isAuthenticated: true });
  },

  logout: async () => {
    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('user');
    set({ user: null, accessToken: null, isAuthenticated: false });
  },

  loadAuth: async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const userStr = await AsyncStorage.getItem('user');
      if (token && userStr) {
        const user = JSON.parse(userStr);
        set({ user, accessToken: token, isAuthenticated: true });
      }
    } catch (error) {
      console.error('Failed to load auth:', error);
    }
  },
}));

