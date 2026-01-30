import AsyncStorage from '@react-native-async-storage/async-storage';

export type SubscriptionStatus = 'trial' | 'free' | 'paid' | 'none';

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  startDate: string | null;
  remainingDays: number | null;
  contractCount: number;
  isFirstTimeBonus?: boolean; // 최초 접속 팝업 경로로 활성화된 경우 true
}

const SUBSCRIPTION_START_DATE_KEY = 'subscription_start_date';
const SUBSCRIPTION_STATUS_KEY = 'subscription_status';
const FIRST_TIME_POPUP_SHOWN_KEY = 'first_time_contract_bonus_popup_shown';
const FIRST_TIME_BONUS_ACTIVATED_KEY = 'first_time_bonus_activated';

/**
 * 구독 시작일 저장
 */
export async function saveSubscriptionStartDate(date: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SUBSCRIPTION_START_DATE_KEY, date);
  } catch (error) {
    console.error('[Subscription] Failed to save start date', error);
  }
}

/**
 * 구독 시작일 조회
 */
export async function getSubscriptionStartDate(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SUBSCRIPTION_START_DATE_KEY);
  } catch (error) {
    console.error('[Subscription] Failed to get start date', error);
    return null;
  }
}

/**
 * 구독 상태 저장
 */
export async function saveSubscriptionStatus(status: SubscriptionStatus): Promise<void> {
  try {
    await AsyncStorage.setItem(SUBSCRIPTION_STATUS_KEY, status);
  } catch (error) {
    console.error('[Subscription] Failed to save status', error);
  }
}

/**
 * 구독 상태 조회
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  try {
    const status = await AsyncStorage.getItem(SUBSCRIPTION_STATUS_KEY);
    return (status as SubscriptionStatus) || 'none';
  } catch (error) {
    console.error('[Subscription] Failed to get status', error);
    return 'none';
  }
}

/**
 * 최초 접속 팝업 경로로 활성화되었는지 확인
 */
export async function isFirstTimeBonusActivated(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(FIRST_TIME_BONUS_ACTIVATED_KEY);
    return value === 'true';
  } catch (error) {
    console.error('[Subscription] Failed to check first time bonus', error);
    return false;
  }
}

/**
 * 최초 접속 팝업 경로로 활성화 플래그 설정
 */
export async function setFirstTimeBonusActivated(): Promise<void> {
  try {
    await AsyncStorage.setItem(FIRST_TIME_BONUS_ACTIVATED_KEY, 'true');
  } catch (error) {
    console.error('[Subscription] Failed to set first time bonus', error);
  }
}

/**
 * 구독 정보 계산
 * @param contractCount 현재 이용권 개수
 */
export async function getSubscriptionInfo(contractCount: number): Promise<SubscriptionInfo> {
  const startDate = await getSubscriptionStartDate();
  const savedStatus = await getSubscriptionStatus();
  const isFirstTimeBonus = await isFirstTimeBonusActivated();

  // 구독 시작일이 없으면 none
  if (!startDate) {
    return {
      status: 'none',
      startDate: null,
      remainingDays: null,
      contractCount,
      isFirstTimeBonus: false,
    };
  }

  const start = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);

  // 무료 체험 종료일 계산
  // 최초 접속 팝업 경로로 활성화된 경우: 90일 (3개월)
  // 일반 경로: 60일 (2개월)
  const trialEndDate = new Date(start);
  if (isFirstTimeBonus) {
    trialEndDate.setMonth(trialEndDate.getMonth() + 3); // 90일
  } else {
    trialEndDate.setMonth(trialEndDate.getMonth() + 2); // 60일
  }

  // 남은 일자 계산
  const remainingDays = Math.max(0, Math.ceil((trialEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  // 상태 판단
  let status: SubscriptionStatus;
  if (today < trialEndDate) {
    // 무료 체험 중
    status = 'trial';
  } else if (contractCount <= 5) {
    // 무료 버전 (5개 이하)
    status = 'free';
  } else {
    // 유료 필요 (6개 이상)
    status = 'paid';
  }

  return {
    status,
    startDate,
    remainingDays: status === 'trial' ? remainingDays : null,
    contractCount,
    isFirstTimeBonus,
  };
}

/**
 * 구독 활성화 여부 확인
 */
export async function isSubscriptionActive(contractCount: number): Promise<boolean> {
  const info = await getSubscriptionInfo(contractCount);
  return info.status === 'trial' || info.status === 'free' || info.status === 'paid';
}

/**
 * 이용권 추가 가능 여부 확인
 */
export async function canAddContract(contractCount: number): Promise<boolean> {
  const info = await getSubscriptionInfo(contractCount);
  
  // 무료 체험 중이면 항상 가능
  if (info.status === 'trial') {
    return true;
  }
  
  // 무료 버전이면 5개 이하만 가능
  if (info.status === 'free') {
    return contractCount < 5;
  }
  
  // 유료 구독이면 가능
  if (info.status === 'paid') {
    return true;
  }
  
  // 구독 없으면 불가능
  return false;
}

/**
 * 구독 시작 (무료 구독 활성화)
 * @param isFirstTimeBonus 최초 접속 팝업 경로로 활성화하는 경우 true (90일 적용)
 */
export async function activateFreeSubscription(isFirstTimeBonus: boolean = false): Promise<void> {
  const today = new Date().toISOString();
  await saveSubscriptionStartDate(today);
  await saveSubscriptionStatus('trial');
  if (isFirstTimeBonus) {
    await setFirstTimeBonusActivated();
  }
}

/**
 * 최초 접속 팝업 표시 여부 확인
 */
export async function hasSeenFirstTimePopup(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(FIRST_TIME_POPUP_SHOWN_KEY);
    return value === 'true';
  } catch (error) {
    console.error('[Subscription] Failed to check first time popup', error);
    return false;
  }
}

/**
 * 최초 접속 팝업 표시 완료로 표시
 */
export async function markFirstTimePopupAsShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(FIRST_TIME_POPUP_SHOWN_KEY, 'true');
  } catch (error) {
    console.error('[Subscription] Failed to mark first time popup as shown', error);
  }
}

