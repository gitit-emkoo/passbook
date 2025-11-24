import { create } from 'zustand';
import { dashboardApi, normalizeDashboardSummary, EMPTY_DASHBOARD_SUMMARY } from '../api/dashboard';
import { DashboardSummary } from '../types/dashboard';

interface DashboardState {
  summary: DashboardSummary | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  errorMessage: string | null;
  _loadedOnce: boolean;
  fetchDashboard: (options?: { force?: boolean }) => Promise<void>;
  reset: () => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  summary: null,
  status: 'idle',
  errorMessage: null,
  _loadedOnce: false,

  fetchDashboard: async (options = {}) => {
    const { force = false } = options;
    const state = get();

    if (!force && state._loadedOnce && state.summary) {
      return;
    }

    set({ status: 'loading', errorMessage: null });

    try {
      const data = await dashboardApi.getSummary();
      const normalized = normalizeDashboardSummary(data);
      
      set({
        summary: normalized,
        status: 'success',
        errorMessage: null,
        _loadedOnce: true,
      });
    } catch (error: any) {
      console.error('[Dashboard] fetchDashboard error', error);
      set({
        summary: EMPTY_DASHBOARD_SUMMARY,
        status: 'error',
        errorMessage: error?.message || '대시보드를 불러오지 못했습니다.',
        _loadedOnce: true,
      });
      throw error;
    }
  },

  reset: () => {
    set({
      summary: null,
      status: 'idle',
      errorMessage: null,
      _loadedOnce: false,
    });
  },
}));

