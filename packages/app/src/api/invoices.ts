import apiClient from './client';

export const invoicesApi = {
  /**
   * 이번 달 정산 목록 조회 (on-demand 생성)
   */
  getCurrent: async () => {
    const response = await apiClient.get('/api/v1/invoices/current');
    return response.data;
  },

  /**
   * 지난 정산 목록 조회
   */
  getHistory: async (months?: number) => {
    const response = await apiClient.get('/api/v1/invoices/history', {
      params: months ? { months } : undefined,
    });
    return response.data;
  },

  /**
   * Invoice 수정 (manual_adjustment)
   */
  update: async (id: number, manualAdjustment: number, manualReason?: string) => {
    const response = await apiClient.patch(`/api/v1/invoices/${id}`, {
      manual_adjustment: manualAdjustment,
      manual_reason: manualReason,
    });
    return response.data;
  },

  /**
   * 전송 가능한 Invoice 목록 조회
   */
  getSendable: async () => {
    const response = await apiClient.get('/api/v1/invoices/sendable');
    return response.data;
  },

  /**
   * 청구서 전송
   */
  send: async (invoiceIds: number[], channel: 'sms' | 'kakao' | 'link') => {
    const response = await apiClient.post('/api/v1/invoices/send', {
      invoice_ids: invoiceIds,
      channel,
    });
    return response.data;
  },
  /**
   * 정산 섹션별 조회 (정산중/오늘청구/전송한청구서)
   */
  getBySections: async () => {
    const response = await apiClient.get('/api/v1/invoices/sections');
    return response.data;
  },
  /**
   * 청구서 링크 생성
   */
  getViewLink: (id: number): string => {
    const baseURL = apiClient.defaults.baseURL || '';
    return `${baseURL}/api/v1/invoices/${id}/view`;
  },
  /**
   * 청구서를 오늘청구로 이동 (조기 청구)
   */
  moveToTodayBilling: async (id: number) => {
    const response = await apiClient.patch(`/api/v1/invoices/${id}/move-to-today-billing`);
    return response.data;
  },
};

