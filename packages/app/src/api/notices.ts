import apiClient from './client';

export interface Notice {
  id: number;
  title: string;
  content: string;
  is_important: boolean;
  created_at: string;
  updated_at: string;
}

export const noticesApi = {
  /**
   * 공지사항 목록 조회
   */
  findAll: async (): Promise<Notice[]> => {
    const response = await apiClient.get('/api/v1/notices');
    return response.data;
  },

  /**
   * 공지사항 상세 조회
   */
  findOne: async (id: number): Promise<Notice> => {
    const response = await apiClient.get(`/api/v1/notices/${id}`);
    return response.data;
  },
};


