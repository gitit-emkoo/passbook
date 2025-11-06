import apiClient from '../api/client';

/**
 * 계약서 API
 */
export const contractsApi = {
  /**
   * 오늘 수업 조회
   */
  getTodayClasses: async () => {
    const response = await apiClient.get('/api/v1/contracts/today');
    return response.data;
  },

  /**
   * 모든 계약서 조회
   */
  getAll: async () => {
    const response = await apiClient.get('/api/v1/contracts');
    return response.data;
  },

  /**
   * 계약서 생성
   */
  create: async (data: any) => {
    const response = await apiClient.post('/api/v1/contracts', data);
    return response.data;
  },
};




