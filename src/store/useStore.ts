import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persist, createJSONStorage } from 'zustand/middleware';
import { env } from '../config/env';

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
  setAccessToken: (token: string) => Promise<void>;
  /**
   * AsyncStorage 연결 확인용 임시 값
   */
  persistTestValue: string;
  hydratePersistTest: () => Promise<void>;
  savePersistTest: (value: string) => Promise<void>;
  apiBaseUrl: string;
  setApiBaseUrl: (value: string) => Promise<void>;
}

/**
 * Zustand 스토어: 인증 상태 관리 + AsyncStorage persist 테스트
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      persistTestValue: '',
      apiBaseUrl: env.API_URL,

      login: async (token, user) => {
        // 로그인 시 모든 데이터 스토어 초기화 (이전 사용자 데이터 제거)
        // 순환 참조 방지를 위해 동적 import 사용
        try {
          const { useDashboardStore } = await import('./useDashboardStore');
          const { useInvoicesStore } = await import('./useInvoicesStore');
          const { useStudentsStore } = await import('./useStudentsStore');
          useDashboardStore.getState().reset();
          useInvoicesStore.getState().reset();
          useStudentsStore.getState().reset();
        } catch (error) {
          console.error('[AuthStore] Failed to reset stores', error);
        }
        
        set({ user, accessToken: token, isAuthenticated: true });
        // 로그인 성공 시 이전 로그인 기록도 업데이트
        try {
          await AsyncStorage.setItem('last-logged-in-user', JSON.stringify(user));
        } catch (error) {
          console.error('[AuthStore] Failed to save last logged in user', error);
        }
      },

      logout: async () => {
        // 로그아웃 시에도 이전 로그인 기록을 유지하기 위해 별도로 저장
        const currentUser = get().user;
        if (currentUser) {
          try {
            await AsyncStorage.setItem('last-logged-in-user', JSON.stringify(currentUser));
          } catch (error) {
            console.error('[AuthStore] Failed to save last logged in user', error);
          }
        }
        
        // 로그아웃 시 모든 데이터 스토어 초기화
        // 순환 참조 방지를 위해 동적 import 사용
        try {
          const { useDashboardStore } = await import('./useDashboardStore');
          const { useInvoicesStore } = await import('./useInvoicesStore');
          const { useStudentsStore } = await import('./useStudentsStore');
          useDashboardStore.getState().reset();
          useInvoicesStore.getState().reset();
          useStudentsStore.getState().reset();
        } catch (error) {
          console.error('[AuthStore] Failed to reset stores', error);
        }
        
        set({ user: null, accessToken: null, isAuthenticated: false });
      },

      setAccessToken: async (token) => {
        const trimmed = token.trim();
        set({ accessToken: trimmed, isAuthenticated: !!trimmed && !!get().user });
      },

      loadAuth: async () => {
        // persist에서 자동으로 복원된 상태 확인
        const state = get();
        // accessToken과 user가 모두 있으면 자동 로그인
        if (state.accessToken && state.user) {
          set({ isAuthenticated: true });
        } else {
          set({ isAuthenticated: false });
        }
        await get().hydratePersistTest();
      },

      hydratePersistTest: async () => {
        try {
          const stored = await AsyncStorage.getItem('persist:test');
          if (stored) {
            set({ persistTestValue: stored });
            return;
          }
          const initialValue = 'initialized';
          await AsyncStorage.setItem('persist:test', initialValue);
          set({ persistTestValue: initialValue });
        } catch (error) {
          console.error('Failed to hydrate persist:test', error);
        }
      },

      savePersistTest: async (value: string) => {
        try {
          await AsyncStorage.setItem('persist:test', value);
          set({ persistTestValue: value });
        } catch (error) {
          console.error('Failed to save persist:test', error);
        }
      },

      setApiBaseUrl: async (value: string) => {
        const trimmed = value.trim();
        const normalized = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
        set({ apiBaseUrl: normalized });
        try {
          await AsyncStorage.setItem('api-base-url', normalized);
        } catch (error) {
          console.error('Failed to save api base url', error);
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        // isAuthenticated는 계산된 값이므로 저장하지 않음
        persistTestValue: state.persistTestValue,
        apiBaseUrl: state.apiBaseUrl,
      }),
      onRehydrateStorage: () => (state) => {
        // 복원 후 isAuthenticated 계산
        if (state && state.accessToken && state.user) {
          state.isAuthenticated = true;
        } else {
          if (state) {
            state.isAuthenticated = false;
          }
        }
      },
    }
  )
);

