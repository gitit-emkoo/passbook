import apiClient from './client';

export interface VerifyCodeResponse {
  accessToken?: string;
  user?: {
    id: number;
    phone: string;
    name: string;
    org_code: string;
  };
  temporaryToken?: string;
  isNewUser: boolean;
}

export interface CompleteSignupRequest {
  name: string;
  org_code: string;
  settings?: {
    default_billing_type?: 'prepaid' | 'postpaid';
    default_absence_policy?: 'carry_over' | 'deduct_next' | 'vanish';
    default_send_target?: 'student_only' | 'guardian_only' | 'both';
    bank_name?: string;
    bank_account?: string;
    bank_holder?: string;
  };
}

export interface CompleteSignupResponse {
  accessToken: string;
  user: {
    id: number;
    phone: string;
    name: string;
    org_code: string;
  };
}

export const authApi = {
  /**
   * 인증 코드 요청
   */
  requestCode: async (phone: string) => {
    const response = await apiClient.post('/auth/request-code', { phone });
    return response.data;
  },

  /**
   * 인증 코드 검증 및 로그인/회원가입 분기
   * - 이미 가입한 사용자: accessToken 반환 (로그인)
   * - 신규 사용자: temporaryToken 반환 (회원가입)
   */
  verifyCode: async (phone: string, code: string): Promise<VerifyCodeResponse> => {
    const response = await apiClient.post('/auth/verify-code', { phone, code });
    return response.data;
  },

  /**
   * 회원가입 완료 및 정식 accessToken 발급
   */
  completeSignup: async (
    temporaryToken: string,
    data: CompleteSignupRequest,
  ): Promise<CompleteSignupResponse> => {
    const response = await apiClient.post(
      '/auth/complete-signup',
      {
        name: data.name,
        org_code: data.org_code,
        settings: data.settings,
      },
      {
        headers: {
          Authorization: `Bearer ${temporaryToken}`,
        },
      },
    );
    return response.data;
  },
};







