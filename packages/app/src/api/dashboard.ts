import apiClient from './client';

export const EMPTY_DASHBOARD_SUMMARY = {
  needsAttentionContracts: [],
  recentContracts: [],
  studentsCount: 0,
  contractsCount: 0,
};

export const dashboardApi = {
  getSummary: async () => {
    try {
      const response = await apiClient.get('/api/v1/dashboard/summary');
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return EMPTY_DASHBOARD_SUMMARY;
      }
      throw error;
    }
  },
  getStatistics: async () => {
    try {
      const response = await apiClient.get('/api/v1/dashboard/statistics');
      return response.data;
    } catch (error: any) {
      console.error('[Dashboard] getStatistics error', error);
      return {
        thisMonthRevenue: 0,
        thisMonthContracts: 0,
        thisMonthUsageAmount: 0,
        thisMonthUsageCount: 0,
        activeContracts: 0,
        endedContracts: 0,
        amountBasedUsageRate: 0,
        sessionBasedUsageRate: 0,
      };
    }
  },
  getMonthlyRevenue: async () => {
    try {
      const response = await apiClient.get('/api/v1/dashboard/statistics/revenue/monthly');
      return response.data;
    } catch (error: any) {
      console.error('[Dashboard] getMonthlyRevenue error', error);
      return [];
    }
  },
  getMonthlyContracts: async () => {
    try {
      const response = await apiClient.get('/api/v1/dashboard/statistics/contracts/monthly');
      return response.data;
    } catch (error: any) {
      console.error('[Dashboard] getMonthlyContracts error', error);
      return [];
    }
  },
  getMonthlyUsageAmount: async () => {
    try {
      const response = await apiClient.get('/api/v1/dashboard/statistics/usage-amount/monthly');
      return response.data;
    } catch (error: any) {
      console.error('[Dashboard] getMonthlyUsageAmount error', error);
      return [];
    }
  },
  getMonthlyUsageCount: async () => {
    try {
      const response = await apiClient.get('/api/v1/dashboard/statistics/usage-count/monthly');
      return response.data;
    } catch (error: any) {
      console.error('[Dashboard] getMonthlyUsageCount error', error);
      return [];
    }
  },
};

export const normalizeDashboardSummary = (data: unknown) => {
  if (!data || typeof data !== 'object') {
    return EMPTY_DASHBOARD_SUMMARY;
  }
  
  const summary = data as Record<string, unknown>;
  return {
    needsAttentionContracts: Array.isArray(summary.needsAttentionContracts)
      ? summary.needsAttentionContracts
      : [],
    recentContracts: Array.isArray(summary.recentContracts)
      ? summary.recentContracts
      : [],
    studentsCount: typeof summary.studentsCount === 'number' ? summary.studentsCount : 0,
    contractsCount: typeof summary.contractsCount === 'number' ? summary.contractsCount : 0,
    ...summary,
  };
};

