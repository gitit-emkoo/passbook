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
    amount?: number; // 차감 금액 (금액권) 또는 사용 횟수 (횟수권, 기본값 1)
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

  /**
   * 사용처리 완료 안내 페이지 링크 생성
   */
  getViewLink: (id: number): string => {
    const baseURL = apiClient.defaults.baseURL || '';
    return `${baseURL}/api/v1/attendance/${id}/view`;
  },

  /**
   * SMS 전송 완료 표시
   */
  markSmsSent: async (id: number) => {
    const response = await apiClient.patch(`/api/v1/attendance/${id}/sms-sent`);
    return response.data;
  },
};







