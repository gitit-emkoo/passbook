export interface InvoiceSummary {
  id: number;
  student_id: number;
  contract_id: number;
  year: number;
  month: number;
  base_amount: number;
  auto_adjustment: number;
  manual_adjustment: number | null;
  manual_reason: string | null;
  final_amount: number;
  send_status: string;
  payment_status?: boolean; // 입금 확인 여부
  planned_count?: number | null; // 계획된 횟수
  period_start?: string | null;
  period_end?: string | null;
  display_period_start?: string | null; // 전송 시점에 저장된 표시 기간 시작일
  display_period_end?: string | null; // 전송 시점에 저장된 표시 기간 종료일
  invoice_number?: number; // 청구서 번호 (1=첫 청구서, 2 이상=연장 청구서)
  student?: {
    id: number;
    name: string;
    phone: string;
  };
  contract?: {
    id: number;
    subject: string;
    billing_type: string;
    absence_policy?: string;
    started_at?: string | null;
    ended_at?: string | null;
    policy_snapshot?: any;
    sessions_used?: number;
    target_sessions?: number; // 해당 정산서의 목표 회차 (연장 정산서의 경우 연장한 회차)
    payment_schedule?: 'monthly' | 'lump_sum' | null; // 납부 방식: 월납 / 일시납
  };
}

export interface InvoiceHistoryGroup {
  year: number;
  month: number;
  invoices: InvoiceSummary[];
}

export interface MonthlySettlement {
  year: number;
  month: number;
  invoices: InvoiceSummary[];
  totalAmount: number;
  totalCount: number;
  sendStatus: 'draft' | 'partial' | 'sent';
  sentCount: number;
  notSentCount: number;
}

