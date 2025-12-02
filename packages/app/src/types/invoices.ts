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
  period_start?: string | null;
  period_end?: string | null;
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

