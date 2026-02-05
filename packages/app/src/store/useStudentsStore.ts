import { create } from 'zustand';
import { studentsApi } from '../api/students';
import { StudentSummary, StudentDetail } from '../types/students';

interface StudentsListState {
  items: StudentSummary[];
  status: 'idle' | 'loading' | 'success' | 'error';
  errorMessage: string | null;
  isRefreshing: boolean;
  hasMore: boolean;
  total: number;
  lastUpdatedAt: number | null;
  _loadedOnce: boolean;
  _inFlight: boolean;
  _currentPage: number;
  _currentSearch?: string;
  _currentFilter?: string;
  _lastFetchedAt: number | null; // 타임스탬프 기반 캐싱
}

interface StudentDetailState {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: StudentDetail | null;
  errorMessage: string | null;
}

interface StudentsState {
  list: StudentsListState;
  details: Record<number, StudentDetailState>;
  fetchStudents: (options?: {
    refresh?: boolean;
    search?: string;
    filter?: string;
    page?: number;
  }) => Promise<void>;
  fetchNextPage: () => Promise<void>;
  fetchStudentDetail: (id: number, options?: { force?: boolean }) => Promise<void>;
  reset: () => void;
}

const DEFAULT_PAGE_SIZE = 20;
// 캐시 유효 시간: 30초 (Fly.io 환경 대응)
const CACHE_TTL_MS = 30 * 1000;

export const useStudentsStore = create<StudentsState>((set, get) => ({
  list: {
    items: [],
    status: 'idle',
    errorMessage: null,
    isRefreshing: false,
    hasMore: false,
    total: 0,
    lastUpdatedAt: null,
    _loadedOnce: false,
    _inFlight: false,
    _currentPage: 1,
    _lastFetchedAt: null,
  },
  details: {},

  fetchStudents: async (options = {}) => {
    const { refresh = false, search, filter, page = 1 } = options;
    const state = get();

    if (state.list._inFlight) {
      return;
    }

    const isRefresh = refresh || page === 1;
    const targetPage = isRefresh ? 1 : page;

    // 타임스탬프 기반 캐싱: 30초 내 재호출 방지 (검색/필터 변경 시에는 무시)
    const now = Date.now();
    const searchChanged = search !== state.list._currentSearch;
    const filterChanged = filter !== state.list._currentFilter;
    if (!isRefresh && !searchChanged && !filterChanged && state.list._lastFetchedAt) {
      const cacheAge = now - state.list._lastFetchedAt;
      if (cacheAge < CACHE_TTL_MS) {
        return; // 캐시된 데이터 사용
      }
    }

    // Stale-while-revalidate: 캐시된 데이터가 있으면 로딩 상태 유지하지 않음
    const hasStaleData = state.list.items.length > 0 && !isRefresh;
    set((state) => ({
      list: {
        ...state.list,
        status: isRefresh && !hasStaleData ? 'loading' : state.list.status,
        isRefreshing: isRefresh,
        errorMessage: null,
        _inFlight: true,
        _currentPage: targetPage,
        _currentSearch: search,
        _currentFilter: filter,
      },
    }));

    try {
      const params: Record<string, unknown> = {};
      if (search) params.search = search;
      if (filter) params.filter = filter;

      const data = await studentsApi.getAll(params);

      set((state) => {
        const newItems = isRefresh ? data : [...state.list.items, ...data];
        return {
          list: {
            ...state.list,
            items: newItems,
            status: 'success',
            errorMessage: null,
            isRefreshing: false,
            hasMore: data.length === DEFAULT_PAGE_SIZE,
            total: newItems.length,
            lastUpdatedAt: Date.now(),
            _loadedOnce: true,
            _inFlight: false,
            _lastFetchedAt: now,
          },
        };
      });
    } catch (error: any) {
      // 401/403 에러는 로그아웃 과정에서 발생할 수 있으므로 조용히 처리
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        set((state) => ({
          list: {
            ...state.list,
            status: 'idle',
            errorMessage: null,
            isRefreshing: false,
            _inFlight: false,
            _loadedOnce: false,
          },
        }));
        return;
      }
      
      console.error('[Students] fetchStudents error', error);
      set((state) => ({
        list: {
          ...state.list,
          status: 'error',
          errorMessage: error?.message || '수강생 목록을 불러오지 못했습니다.',
          isRefreshing: false,
          _inFlight: false,
        },
      }));
      throw error;
    }
  },

  fetchNextPage: async () => {
    const state = get();
    if (!state.list.hasMore || state.list._inFlight || state.list.status !== 'success') {
      return;
    }

    const nextPage = state.list._currentPage + 1;
    await get().fetchStudents({
      page: nextPage,
      search: state.list._currentSearch,
      filter: state.list._currentFilter,
    });
  },

  fetchStudentDetail: async (id: number, options = {}) => {
    const { force = false } = options;
    const state = get();
    const existing = state.details[id];

    if (!force && existing?.status === 'success' && existing.data) {
      return;
    }

    if (existing?.status === 'loading') {
      return;
    }

    set((state) => ({
      details: {
        ...state.details,
        [id]: {
          status: 'loading',
          data: force ? null : state.details[id]?.data || null,
          errorMessage: null,
        },
      },
    }));

    try {
      const data = await studentsApi.getById(id);
      set((state) => ({
        details: {
          ...state.details,
          [id]: {
            status: 'success',
            data: data as StudentDetail,
            errorMessage: null,
          },
        },
      }));
    } catch (error: any) {
      console.error('[Students] fetchStudentDetail error', error);
      set((state) => ({
        details: {
          ...state.details,
          [id]: {
            status: 'error',
            data: null,
            errorMessage: error?.message || '수강생 상세 정보를 불러오지 못했습니다.',
          },
        },
      }));
      throw error;
    }
  },

  reset: () => {
    set({
      list: {
        items: [],
        status: 'idle',
        errorMessage: null,
        isRefreshing: false,
        hasMore: false,
        total: 0,
        lastUpdatedAt: null,
        _loadedOnce: false,
        _inFlight: false,
        _currentPage: 1,
        _lastFetchedAt: null,
      },
      details: {},
    });
  },
}));

