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

    set((state) => ({
      list: {
        ...state.list,
        status: isRefresh ? 'loading' : state.list.status,
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
          },
        };
      });
    } catch (error: any) {
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
      },
      details: {},
    });
  },
}));

