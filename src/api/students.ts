import apiClient from './client';

/**
 * 수강생 API
 */
export const studentsApi = {
  /**
   * 수강생 목록 조회
   */
  getAll: async (params?: Record<string, unknown>) => {
    try {
      const response = await apiClient.get('/api/v1/students', { params });
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return [];
      }
      throw error;
    }
  },

  /**
   * 수강생 상세 조회
   */
  getById: async (id: number) => {
    const response = await apiClient.get(`/api/v1/students/${id}`);
    return response.data;
  },

  /**
   * 수강생 생성
   */
  create: async (data: {
    name: string;
    phone: string;
    guardian_name?: string;
    guardian_phone?: string;
  }) => {
    const response = await apiClient.post('/api/v1/students', data);
    return response.data;
  },

  /**
   * 수강생 수정
   */
  update: async (id: number, data: {
    name?: string;
    phone?: string;
    guardian_name?: string;
    guardian_phone?: string;
  }) => {
    const response = await apiClient.patch(`/api/v1/students/${id}`, data);
    return response.data;
  },
};







