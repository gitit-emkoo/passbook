import apiClient from './client';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

export const contractsApi = {
  getAll: async (params?: Record<string, unknown>) => {
    // 기본 파라미터 강제 적용
    const finalParams = {
      page: DEFAULT_PAGE,
      limit: DEFAULT_LIMIT,
      ...params,
      // page와 limit는 항상 숫자로 변환
      page: Number(params?.page ?? DEFAULT_PAGE),
      limit: Number(params?.limit ?? DEFAULT_LIMIT),
    };

    try {
      const response = await apiClient.get('/api/v1/contracts', { params: finalParams });
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return [];
      }
      throw error;
    }
  },
  create: async (data: unknown) => {
    const response = await apiClient.post('/api/v1/contracts', data);
    return response.data;
  },
  updateStatus: async (
    id: number,
    status: string,
    options?: { teacherSignature?: string | null; studentSignature?: string | null },
  ) => {
    const payload: Record<string, unknown> = { status };
    if (options && 'teacherSignature' in options) {
      payload.teacher_signature = options.teacherSignature;
    }
    if (options && 'studentSignature' in options) {
      payload.student_signature = options.studentSignature;
    }
    const response = await apiClient.patch(`/api/v1/contracts/${id}/status`, payload);
    return response.data;
  },
  getById: async (id: number) => {
    const response = await apiClient.get(`/api/v1/contracts/${id}`);
    return response.data;
  },
  getTodayClasses: async () => {
    try {
      const response = await apiClient.get('/api/v1/contracts/today');
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return [];
      }
      throw error;
    }
  },
  getViewLink: (id: number): string => {
    const baseURL = apiClient.defaults.baseURL || '';
    return `${baseURL}/api/v1/contracts/${id}/view`;
  },
  extend: async (id: number, data: { added_sessions?: number; extended_end_date?: string }) => {
    const response = await apiClient.patch(`/api/v1/contracts/${id}/extend`, data);
    return response.data;
  },
};
