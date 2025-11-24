export interface RecentContract {
  id: number;
  studentId: number;
  studentName: string;
  contractId: number;
  subject: string;
  status: string;
  createdAt: string;
}

export interface DashboardSummary {
  needsAttentionContracts?: RecentContract[];
  recentContracts?: RecentContract[];
  studentsCount?: number;
  contractsCount?: number;
  [key: string]: unknown;
}

