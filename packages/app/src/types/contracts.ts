export interface ContractSummary {
  id: number;
  title: string;
  status: string;
  startedAt?: string;
  endedAt?: string;
  amount?: number;
}

export interface ContractsListResponseShape {
  items?: ContractSummary[];
  data?: ContractSummary[];
  results?: ContractSummary[];
  total?: number;
  count?: number;
  meta?: {
    total?: number;
  };
}





