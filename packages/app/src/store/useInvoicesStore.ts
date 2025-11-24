import { create } from 'zustand';
import { invoicesApi } from '../api/invoices';
import { InvoiceSummary, InvoiceHistoryGroup } from '../types/invoices';

interface InvoicesState {
  currentMonthInvoices: InvoiceSummary[];
  historyMonths: InvoiceHistoryGroup[];
  status: 'idle' | 'loading' | 'success' | 'error';
  errorMessage: string | null;
  _loadedOnce: boolean;
  _inFlight: boolean;
  fetchCurrentMonth: (options?: { historyMonths?: number; force?: boolean }) => Promise<void>;
  updateInvoice: (id: number, manualAdjustment: number, manualReason?: string) => Promise<void>;
  reset: () => void;
}

export const useInvoicesStore = create<InvoicesState>((set, get) => ({
  currentMonthInvoices: [],
  historyMonths: [],
  status: 'idle',
  errorMessage: null,
  _loadedOnce: false,
  _inFlight: false,

  fetchCurrentMonth: async (options = {}) => {
    const { historyMonths = 3, force = false } = options;
    const state = get();

    if (!force && state._loadedOnce && !state._inFlight) {
      return;
    }

    if (state._inFlight) {
      return;
    }

    set({ status: 'loading', errorMessage: null, _inFlight: true });

    try {
      const [currentData, historyData] = await Promise.all([
        invoicesApi.getCurrent(),
        invoicesApi.getHistory(historyMonths),
      ]);

      set({
        currentMonthInvoices: Array.isArray(currentData) ? currentData : [],
        historyMonths: Array.isArray(historyData) ? historyData : [],
        status: 'success',
        errorMessage: null,
        _loadedOnce: true,
        _inFlight: false,
      });
    } catch (error: any) {
      console.error('[Invoices] fetchCurrentMonth error', error);
      set({
        status: 'error',
        errorMessage: error?.message || '정산 정보를 불러오지 못했습니다.',
        _inFlight: false,
      });
      throw error;
    }
  },

  updateInvoice: async (id: number, manualAdjustment: number, manualReason?: string) => {
    try {
      await invoicesApi.update(id, manualAdjustment, manualReason);
      
      // 로컬 상태 업데이트
      set((state) => {
        const updatedCurrent = state.currentMonthInvoices.map((inv) =>
          inv.id === id
            ? {
                ...inv,
                manual_adjustment: manualAdjustment,
                manual_reason: manualReason || null,
                final_amount: inv.base_amount + inv.auto_adjustment + manualAdjustment,
              }
            : inv,
        );

        const updatedHistory = state.historyMonths.map((group) => ({
          ...group,
          invoices: group.invoices.map((inv) =>
            inv.id === id
              ? {
                  ...inv,
                  manual_adjustment: manualAdjustment,
                  manual_reason: manualReason || null,
                  final_amount: inv.base_amount + inv.auto_adjustment + manualAdjustment,
                }
              : inv,
          ),
        }));

        return {
          currentMonthInvoices: updatedCurrent,
          historyMonths: updatedHistory,
        };
      });
    } catch (error: any) {
      console.error('[Invoices] updateInvoice error', error);
      throw error;
    }
  },

  reset: () => {
    set({
      currentMonthInvoices: [],
      historyMonths: [],
      status: 'idle',
      errorMessage: null,
      _loadedOnce: false,
      _inFlight: false,
    });
  },
}));

