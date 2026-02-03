import apiClient from './client';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

export const contractsApi = {
  getAll: async (params?: Record<string, unknown>) => {
    // 기본 파라미터 강제 적용
    const finalParams = {
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
    const { env } = require('../config/env');
    const publicURL = env.PUBLIC_URL || 'https://passbook.today';
    return `${publicURL}/api/v1/contracts/${id}/view`;
  },
  extend: async (id: number, data: { added_sessions?: number; extension_amount?: number; extended_end_date?: string }) => {
    const response = await apiClient.patch(`/api/v1/contracts/${id}/extend`, data);
    return response.data;
  },
  /**
   * 사전 일정 변경 (특정 수업일을 다른 날로 이동)
   */
  rescheduleSession: async (
    contractId: number,
    payload: { original_date: string; new_date: string; student_id?: number; reason?: string },
  ) => {
    const response = await apiClient.post(`/api/v1/contracts/${contractId}/reschedule`, payload);
    return response.data;
  },
  // 예약 관련 API
  createReservation: async (
    contractId: number,
    payload: { reserved_date: string; reserved_time?: string | null },
  ) => {
    const response = await apiClient.post(`/api/v1/contracts/${contractId}/reservations`, payload);
    return response.data;
  },
  getReservations: async (contractId: number) => {
    const response = await apiClient.get(`/api/v1/contracts/${contractId}/reservations`);
    return response.data;
  },
  getAllReservations: async () => {
    const response = await apiClient.get('/api/v1/contracts/reservations/all');
    return response.data;
  },
  updateReservation: async (
    contractId: number,
    reservationId: number,
    payload: { reserved_date?: string; reserved_time?: string | null },
  ) => {
    const response = await apiClient.patch(`/api/v1/contracts/${contractId}/reservations/${reservationId}`, payload);
    return response.data;
  },
  deleteReservation: async (contractId: number, reservationId: number) => {
    const response = await apiClient.delete(`/api/v1/contracts/${contractId}/reservations/${reservationId}`);
    return response.data;
  },
};
