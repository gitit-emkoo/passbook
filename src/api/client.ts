import axios from 'axios';
import { env } from '../config/env';
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

const applyBaseUrl = () => {
  const { apiBaseUrl } = useAuthStore.getState();
  apiClient.defaults.baseURL = apiBaseUrl || env.API_URL;
};

applyBaseUrl();
useAuthStore.subscribe((state) => {
  apiClient.defaults.baseURL = state.apiBaseUrl || env.API_URL;
});

apiClient.interceptors.request.use((config) => {
  const { apiBaseUrl, accessToken } = useAuthStore.getState();
  const finalBaseURL = apiBaseUrl || env.API_URL;
  config.baseURL = finalBaseURL;

  // 이미 Authorization 헤더가 설정되어 있으면 (예: temporaryToken) 덮어쓰지 않음
  if (config.headers?.Authorization) {
    return config;
  }

  // accessToken이 있으면 Authorization 헤더 설정
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

// 응답 인터셉터: 에러 처리
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // 401 Unauthorized 에러 처리
    if (error?.response?.status === 401) {
      const { isAuthenticated, logout } = useAuthStore.getState();
      
      // 이미 로그아웃된 상태면 무시 (로그아웃 과정에서 발생하는 401 에러)
      if (!isAuthenticated) {
        // 에러 오버레이를 표시하지 않도록 조용히 reject
        return Promise.reject(error);
      }
      
      // 개발 모드에서만 로그 출력 (에러 오버레이 방지)
      if (__DEV__) {
        console.log('[HTTP] 401 Unauthorized (handled)', {
          url: error.config?.url,
          message: '인증 토큰이 유효하지 않습니다.',
        });
      }
      
      // 토큰이 유효하지 않으면 로그아웃 처리
      logout().catch((err) => {
        if (__DEV__) {
          console.log('[HTTP] Logout error (handled)', err);
        }
      });
    }
    
    // 400 Bad Request 에러 메시지 처리
    if (error?.response?.status === 400) {
      const responseData = error.response?.data;
      
      // class-validator 에러 메시지 추출
      if (Array.isArray(responseData?.message)) {
        // 첫 번째 validation 에러 메시지만 사용
        const firstError = responseData.message[0];
        if (typeof firstError === 'string') {
          error.message = `잘못된 요청입니다: ${firstError}`;
        } else if (firstError?.constraints) {
          const constraintMessages = Object.values(firstError.constraints);
          error.message = `잘못된 요청입니다: ${constraintMessages[0]}`;
        } else {
          error.message = `잘못된 요청입니다: ${JSON.stringify(firstError)}`;
        }
      } else if (typeof responseData?.message === 'string') {
        error.message = `잘못된 요청입니다: ${responseData.message}`;
      } else if (!error.message || error.message === 'Request failed with status code 400') {
        error.message = '잘못된 요청입니다. 입력값을 확인해주세요.';
      }
      
      console.error('[HTTP] 400 Bad Request', {
        url: error.config?.url,
        message: error.message,
        data: responseData,
      });
    }
    
    return Promise.reject(error);
  },
);

export default apiClient;

