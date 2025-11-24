import apiClient from './client';

export const notificationsApi = {
  /**
   * 알림 목록 조회
   */
  getAll: async (filter?: string) => {
    const response = await apiClient.get('/api/v1/notifications', {
      params: filter ? { filter } : {},
    });
    return response.data;
  },

  /**
   * 알림 읽음 처리
   */
  markAsRead: async (id: number) => {
    const response = await apiClient.patch(`/api/v1/notifications/${id}/read`);
    return response.data;
  },

  /**
   * 모든 알림 읽음 처리
   */
  markAllAsRead: async () => {
    const response = await apiClient.patch('/api/v1/notifications/read-all');
    return response.data;
  },
};







