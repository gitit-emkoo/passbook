import axios from 'axios';
import { env } from '../config/env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/useStore';

/**
 * API 클라이언트 설정
 * JWT 토큰 자동 포함 및 에러 처리
 */
const apiClient = axios.create({
  baseURL: env.API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 요청 인터셉터: JWT 토큰 자동 추가
apiClient.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// 응답 인터셉터: 에러 처리
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      // 토큰 만료 시 로그아웃 처리
      const logout = useAuthStore.getState().logout;
      await logout();
    }
    return Promise.reject(error);
  },
);

export default apiClient;

