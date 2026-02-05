import { create } from 'zustand';
import { dashboardApi, normalizeDashboardSummary, EMPTY_DASHBOARD_SUMMARY } from '../api/dashboard';
import { DashboardSummary } from '../types/dashboard';

interface DashboardState {
  summary: DashboardSummary | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  errorMessage: string | null;
  _loadedOnce: boolean;
  _lastFetchedAt: number | null; // 타임스탬프 기반 캐싱
  fetchDashboard: (options?: { force?: boolean }) => Promise<void>;
  reset: () => void;
}

// 캐시 유효 시간: 30초 (Fly.io 환경 대응)
const CACHE_TTL_MS = 30 * 1000;

export const useDashboardStore = create<DashboardState>((set, get) => ({
  summary: null,
  status: 'idle',
  errorMessage: null,
  _loadedOnce: false,
  _lastFetchedAt: null,

  fetchDashboard: async (options = {}) => {
    const { force = false } = options;
    const state = get();

    // 타임스탬프 기반 캐싱: 30초 내 재호출 방지
    const now = Date.now();
    if (!force && state._loadedOnce && state.summary && state._lastFetchedAt) {
      const cacheAge = now - state._lastFetchedAt;
      if (cacheAge < CACHE_TTL_MS) {
        return; // 캐시된 데이터 사용
      }
    }

    // Stale-while-revalidate: 캐시된 데이터가 있으면 로딩 상태 유지하지 않음
    const hasStaleData = state.summary !== null;
    if (!hasStaleData) {
      set({ status: 'loading', errorMessage: null });
    }

    try {
      const data = await dashboardApi.getSummary();
      const normalized = normalizeDashboardSummary(data);
      
      set({
        summary: normalized,
        status: 'success',
        errorMessage: null,
        _loadedOnce: true,
        _lastFetchedAt: now,
      });
    } catch (error: any) {
      const statusCode = error?.response?.status;
      if (statusCode === 401 || statusCode === 403) {
        console.warn('[Dashboard] unauthorized, skipping error banner');
        set({
          summary: null,
          status: 'idle',
          errorMessage: null,
          _loadedOnce: false,
        });
        return;
      }

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
      _lastFetchedAt: null,
    });
  },
}));

