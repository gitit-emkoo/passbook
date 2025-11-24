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

