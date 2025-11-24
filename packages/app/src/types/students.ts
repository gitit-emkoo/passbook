export interface StudentSummary {
  id: number;
  name: string;
  phone: string;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  latest_contract: {
    id: number;
    subject: string;
    billing_type: string;
    absence_policy: string;
    monthly_amount: number;
    day_of_week: string[];
    time: string | null;
    status: string;
    started_at: string | null;
    ended_at: string | null;
    policy_snapshot: Record<string, unknown>;
    sessions_used: number;
  } | null;
  this_month_invoice: {
    id: number;
    final_amount: number;
    base_amount: number;
    send_status: string;
  } | null;
  this_month_status_summary: string;
  class_info: string;
}

export interface StudentContractDetail {
  id: number;
  subject: string;
  billing_type: string;
  absence_policy: string;
  monthly_amount: number;
  day_of_week: string[];
  time: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  policy_snapshot: Record<string, unknown>;
  sessions_used?: number;
  recipient_policy: string;
  recipient_targets: string[];
  attendance_requires_signature: boolean;
  teacher_signature: string | null;
  student_signature: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentAttendanceLog {
  id: number;
  contract_id: number;
  occurred_at: string;
  status: string;
  substitute_at: string | null;
  memo_public: string | null;
  memo_internal: string | null;
  recorded_at: string;
  recorded_by: number;
  modified_at: string | null;
  modified_by: number | null;
  change_reason: string | null;
  voided: boolean;
  void_reason: string | null;
  user?: {
    id: number;
    name: string | null;
  };
}

export interface StudentDetail {
  id: number;
  name: string;
  phone: string;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  contracts: StudentContractDetail[];
  attendance_logs: StudentAttendanceLog[];
  invoices: Array<{
    id: number;
    year: number;
    month: number;
    final_amount: number;
    base_amount: number;
    send_status: string;
    contract: {
      id: number;
      billing_type: string;
    };
  }>;
}

