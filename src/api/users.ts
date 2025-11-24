import apiClient from './client';

/**
 * 사용자 API
 */
export const usersApi = {
  /**
   * 현재 사용자 정보 조회
   */
  getMe: async () => {
    const response = await apiClient.get('/api/v1/users/me');
    return response.data;
  },

  /**
   * 사용자 이름 업데이트
   */
  updateName: async (name: string) => {
    const response = await apiClient.patch('/api/v1/users/me', { name });
    return response.data;
  },

  /**
   * 사용자 상호명 업데이트
   */
  updateOrgCode: async (orgCode: string) => {
    const response = await apiClient.patch('/api/v1/users/me', { org_code: orgCode });
    return response.data;
  },

  /**
   * 사용자 설정 업데이트
   */
  updateSettings: async (settings: Record<string, unknown>) => {
    const response = await apiClient.patch('/api/v1/users/me/settings', { settings });
    return response.data;
  },
};

