import apiClient from './client';

/**
 * 출결 API
 */
export const attendanceApi = {
  /**
   * 출결 기록 생성
   */
  create: async (data: {
    student_id: number;
    contract_id: number;
    occurred_at: string;
    status: 'present' | 'absent' | 'substitute' | 'vanish';
    substitute_at?: string;
    memo_public?: string;
    memo_internal?: string;
    signature_data?: string; // 출석 서명 데이터 (base64)
  }) => {
    const response = await apiClient.post('/api/v1/attendance', data);
    return response.data;
  },

  /**
   * 출결 기록 수정
   */
  update: async (id: number, data: {
    status?: 'present' | 'absent' | 'substitute' | 'vanish';
    substitute_at?: string;
    memo_public?: string;
    memo_internal?: string;
    change_reason: string;
  }) => {
    const response = await apiClient.patch(`/api/v1/attendance/${id}`, data);
    return response.data;
  },

  /**
   * 출결 기록 삭제 (void)
   */
  void: async (id: number, voidReason: string) => {
    const response = await apiClient.patch(`/api/v1/attendance/${id}/void`, { void_reason: voidReason });
    return response.data;
  },

  /**
   * 미처리 출결 조회
   */
  getUnprocessed: async () => {
    const response = await apiClient.get('/api/v1/attendance/unprocessed');
    return response.data;
  },

  /**
   * 미처리 출결 개수 조회
   */
  getUnprocessedCount: async () => {
    const response = await apiClient.get('/api/v1/attendance/unprocessed/count');
    return response.data.count;
  },
};







