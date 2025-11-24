import { create } from 'zustand';
import { contractsApi } from '../api/contracts';

interface ContractsState {
  sendContract: (contractId: number, channel: 'sms' | 'kakao' | 'link') => Promise<void>;
}

export const useContractsStore = create<ContractsState>(() => ({
  sendContract: async (contractId: number, channel: 'sms' | 'kakao' | 'link') => {
    // 계약서 전송은 contractsApi.updateStatus를 사용하여 'sent' 상태로 변경
    await contractsApi.updateStatus(contractId, 'sent');
  },
}));

