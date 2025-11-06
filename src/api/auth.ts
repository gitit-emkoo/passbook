import apiClient from './client';

export const authApi = {
  /**
   * 인증 코드 요청
   */
  requestCode: async (phone: string) => {
    const response = await apiClient.post('/auth/request-code', { phone });
    return response.data;
  },

  /**
   * 인증 코드 검증 및 로그인
   */
  verifyCode: async (phone: string, code: string) => {
    const response = await apiClient.post('/auth/verify-code', { phone, code });
    return response.data;
  },
};




