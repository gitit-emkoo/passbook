import AsyncStorage from '@react-native-async-storage/async-storage';

export type SubscriptionStatus = 'trial' | 'free' | 'paid' | 'none';

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  startDate: string | null;
  remainingDays: number | null;
  contractCount: number;
}

const SUBSCRIPTION_START_DATE_KEY = 'subscription_start_date';
const SUBSCRIPTION_STATUS_KEY = 'subscription_status';

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
 * 구독 정보 계산
 * @param contractCount 현재 이용권 개수
 */
export async function getSubscriptionInfo(contractCount: number): Promise<SubscriptionInfo> {
  const startDate = await getSubscriptionStartDate();
  const savedStatus = await getSubscriptionStatus();

  // 구독 시작일이 없으면 none
  if (!startDate) {
    return {
      status: 'none',
      startDate: null,
      remainingDays: null,
      contractCount,
    };
  }

  const start = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);

  // 무료 체험 종료일 (2개월 후)
  const trialEndDate = new Date(start);
  trialEndDate.setMonth(trialEndDate.getMonth() + 2);

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
 */
export async function activateFreeSubscription(): Promise<void> {
  const today = new Date().toISOString();
  await saveSubscriptionStartDate(today);
  await saveSubscriptionStatus('trial');
}

