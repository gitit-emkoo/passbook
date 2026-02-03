import apiClient from './client';

export interface InquiryItem {
  id: number;
  user_id: number;
  title: string | null;
  content: string;
  status: 'pending' | 'answered';
  created_at: string;
  updated_at: string;
  answered_at: string | null;
  answer: string | null;
}

export interface CreateInquiryDto {
  title?: string;
  content: string;
}

export const inquiriesApi = {
  /**
   * 내 문의 내역 조회
   */
  getMyInquiries: async (): Promise<InquiryItem[]> => {
    const response = await apiClient.get<InquiryItem[]>('/api/v1/me/inquiries');
    return response.data;
  },

  /**
   * 문의 생성
   */
  create: async (dto: CreateInquiryDto): Promise<InquiryItem> => {
    const response = await apiClient.post<InquiryItem>('/api/v1/inquiries', dto);
    return response.data;
  },
};





