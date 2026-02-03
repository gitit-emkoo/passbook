import apiClient from './client';

export interface Popup {
  id: number;
  title: string;
  content: string;
  image_url: string | null;
  link_url: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export const popupsApi = {
  /**
   * 활성 팝업 목록 조회
   * - is_active = true
   * - 현재 시각이 starts_at ~ ends_at 범위 내
   */
  findActive: async (): Promise<Popup[]> => {
    const response = await apiClient.get<Popup[]>('/api/v1/popups');
    return response.data;
  },
};

