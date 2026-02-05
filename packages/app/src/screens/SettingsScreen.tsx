import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, TextInput } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import styled from 'styled-components/native';
import { usersApi } from '../api/users';
import { useAuthStore } from '../store/useStore';
import { env } from '../config/env';
import axios from 'axios';
import ContractSettingsModal from '../components/modals/ContractSettingsModal';
import AccountInfoModal from '../components/modals/AccountInfoModal';
import ProfileEditModal from '../components/modals/ProfileEditModal';
import LogoutModal from '../components/modals/LogoutModal';
import WithdrawModal from '../components/modals/WithdrawModal';
import SubscriptionIntroModal from '../components/modals/SubscriptionIntroModal';
import { getSubscriptionInfo, activateFreeSubscription, SubscriptionStatus } from '../utils/subscription';
import { useStudentsStore } from '../store/useStudentsStore';

function SettingsContent() {
  const navigation = useNavigation();
  const route = useRoute();
  const [loading, setLoading] = useState(false);
  const settingsLastFetchedRef = useRef<number | null>(null); // 타임스탬프 기반 캐싱
  const subscriptionLastFetchedRef = useRef<number | null>(null); // 타임스탬프 기반 캐싱
  const paramsProcessedRef = useRef<string | null>(null); // 파라미터 처리 추적 (무한 루프 방지)

  // 기본 정보
  const [userName, setUserName] = useState('');
  const [orgCode, setOrgCode] = useState('');
  const [userPhone, setUserPhone] = useState('');

  // 계약서 기본값 설정 모달
  const [contractSettingsModalVisible, setContractSettingsModalVisible] = useState(false);
  const [contractSettingsSummary, setContractSettingsSummary] = useState('');
  
  // 계좌 정보 모달
  const [accountInfoModalVisible, setAccountInfoModalVisible] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');

  // 부가기능
  const [notificationEnabled, setNotificationEnabled] = useState(true);

  // 모달
  const [profileEditModalVisible, setProfileEditModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('수정되었습니다');
  const [subscriptionIntroModalVisible, setSubscriptionIntroModalVisible] = useState(false);
  const [isFirstTimeBonusPath, setIsFirstTimeBonusPath] = useState(false);
  
  // 구독 상태
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    status: SubscriptionStatus;
    remainingDays: number | null;
    contractCount: number;
    isFirstTimeBonus?: boolean;
  } | null>(null);

  // 개발자 옵션
  const apiBaseUrl = useAuthStore((state) => state.apiBaseUrl);
  const setApiBaseUrl = useAuthStore((state) => state.setApiBaseUrl);
  const accessToken = useAuthStore((state) => state.accessToken);
  const saveAccessToken = useAuthStore((state) => state.setAccessToken);
  const [apiUrlInput, setApiUrlInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const normalizedCurrentBase = useMemo(() => {
    const base = apiBaseUrl?.trim() || env.API_URL;
    return base.replace(/\/+$/, '');
  }, [apiBaseUrl]);

  useEffect(() => {
    setApiUrlInput(apiBaseUrl || '');
    setTokenInput(accessToken || '');
  }, [apiBaseUrl, accessToken]);

  const loadSettings = useCallback(async (force = false) => {
    // 타임스탬프 기반 캐싱: 30초 내 재호출 방지 (강제 새로고침이 아닐 때만)
    if (!force) {
      const now = Date.now();
      const CACHE_TTL_MS = 30 * 1000;
      if (settingsLastFetchedRef.current && (now - settingsLastFetchedRef.current) < CACHE_TTL_MS) {
        // 캐시된 데이터 사용 (서버 호출 없이)
        return;
      }
    }

    try {
      setLoading(true);
      const user = await usersApi.getMe();
      
      // 기본 정보
      setUserName(user.name || '');
      setOrgCode(user.org_code || '');

      // 계약서 기본값 요약 생성
      const settings = user.settings || {};
      const summaryParts: string[] = [];
      
      if (settings.default_lesson_type) {
        const lessonLabel = settings.default_lesson_type === 'monthly' ? '선불권' : '횟수권';
        summaryParts.push(lessonLabel);
      }
      if (settings.default_billing_type) {
        const billingLabel = settings.default_billing_type === 'prepaid' ? '선불' : '후불';
        summaryParts.push(billingLabel);
      }
      if (settings.default_absence_policy) {
        const absenceLabels: Record<string, string> = {
          carry_over: '대체',
          deduct_next: '차감',
          vanish: '소멸',
        };
        summaryParts.push(absenceLabels[settings.default_absence_policy] || settings.default_absence_policy);
      }
      if (settings.default_send_target) {
        const recipientLabels: Record<string, string> = {
          student_only: '고객',
          guardian_only: '보호자',
          both: '둘 다',
        };
        summaryParts.push(recipientLabels[settings.default_send_target] || settings.default_send_target);
      }

      if (summaryParts.length > 0) {
        setContractSettingsSummary(summaryParts.join(' / '));
      } else {
        setContractSettingsSummary('설정 안 됨');
      }
      
      // 계좌 정보
      if (settings.account_info) {
        setBankName(settings.account_info.bank_name || '');
        setAccountNumber(settings.account_info.account_number || '');
        setAccountHolder(settings.account_info.account_holder || '');
      } else {
        setBankName('');
        setAccountNumber('');
        setAccountHolder('');
      }
      
      settingsLastFetchedRef.current = Date.now();
      // 구독 상태는 별도로 로드
    } catch (error: any) {
      console.error('[Settings] load error', error);
      Alert.alert('오류', '설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 구독 상태 로드
  const loadSubscriptionInfo = useCallback(async (force = false) => {
    // 타임스탬프 기반 캐싱: 30초 내 재호출 방지 (강제 새로고침이 아닐 때만)
    if (!force) {
      const now = Date.now();
      const CACHE_TTL_MS = 30 * 1000;
      if (subscriptionLastFetchedRef.current && (now - subscriptionLastFetchedRef.current) < CACHE_TTL_MS) {
        // 캐시된 데이터 사용 (서버 호출 없이)
        return;
      }
    }

    try {
      const students = useStudentsStore.getState().list.items;
      const contractCount = students.filter((s) => s.latest_contract && s.latest_contract.status !== 'draft').length;
      const info = await getSubscriptionInfo(contractCount);
      setSubscriptionInfo({
        status: info.status,
        remainingDays: info.remainingDays,
        contractCount: info.contractCount,
        isFirstTimeBonus: info.isFirstTimeBonus,
      });
      subscriptionLastFetchedRef.current = Date.now();
    } catch (error) {
      console.error('[Settings] Failed to load subscription info', error);
    }
  }, []);

  // 네비게이션 파라미터 처리
  // 일반 경로의 경우: 무료구독 버튼을 클릭할 때까지 계속 모달을 표시해야 함
  useEffect(() => {
    const params = route.params as
      | {
          showSubscriptionIntro?: boolean;
          isFirstTimeBonus?: boolean;
        }
      | undefined;
    
    // 파라미터가 있고 아직 처리하지 않은 경우만 실행 (무한 루프 방지)
    if (params?.showSubscriptionIntro) {
      // 파라미터를 문자열로 변환하여 중복 처리 방지
      const paramsKey = `${params.showSubscriptionIntro}-${params.isFirstTimeBonus}`;
      
      // 이미 처리한 파라미터가 아니면 처리
      if (paramsProcessedRef.current !== paramsKey) {
        paramsProcessedRef.current = paramsKey;
        setSubscriptionIntroModalVisible(true);
        // isFirstTimeBonus 파라미터로 최초 접속 팝업 경로인지 구분
        setIsFirstTimeBonusPath(params.isFirstTimeBonus === true);
      }
    } else {
      // 파라미터가 없으면 ref 초기화 (다음 진입을 위해)
      paramsProcessedRef.current = null;
    }
  }, [route.params]);

  // 화면 포커스 시 데이터 로드 (파라미터와 분리)
  useFocusEffect(
    useCallback(() => {
      // accessToken이 있을 때만 설정 로드
      const { accessToken, isAuthenticated } = useAuthStore.getState();
      if (!isAuthenticated || !accessToken) {
        return;
      }
      loadSettings();
      loadSubscriptionInfo();
      
      // 화면 포커스를 잃을 때 paramsProcessedRef 초기화 (다음 진입 시 모달이 다시 표시되도록)
      return () => {
        paramsProcessedRef.current = null;
      };
    }, [loadSettings, loadSubscriptionInfo]),
  );

  const handleProfileEditSave = useCallback(() => {
    loadSettings(true); // 강제 새로고침
    setToastMessage('수정되었습니다');
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
    }, 2000);
  }, [loadSettings]);

  const handleContractSettingsSave = useCallback(() => {
    loadSettings(true); // 강제 새로고침
  }, [loadSettings]);

  const handleAccountInfoSave = useCallback(() => {
    loadSettings(true); // 강제 새로고침
  }, [loadSettings]);

  // 구독 활성화
  const handleActivateSubscription = useCallback(async () => {
    try {
      // 최초 접속 팝업 경로인지 확인 (상태로 저장된 값 사용)
      await activateFreeSubscription(isFirstTimeBonusPath);
      await loadSubscriptionInfo(true); // 강제 새로고침
      setToastMessage(isFirstTimeBonusPath ? '3개월 무료구독이 시작되었습니다' : '2개월 무료구독이 시작되었습니다');
      setToastVisible(true);
      setTimeout(() => {
        setToastVisible(false);
      }, 2000);
      // 활성화 후 모달 닫기 및 플래그 초기화
      setSubscriptionIntroModalVisible(false);
      setIsFirstTimeBonusPath(false);
      // 파라미터 처리 ref 초기화 (다음 진입을 위해)
      paramsProcessedRef.current = null;
    } catch (error) {
      Alert.alert('오류', '구독 활성화에 실패했습니다.');
    }
  }, [loadSubscriptionInfo, isFirstTimeBonusPath]);


  const handleNoticePress = () => {
    navigation.navigate('NoticesList' as never);
  };

  const handleSaveApiUrl = useCallback(async () => {
    if (!apiUrlInput.trim()) {
      Alert.alert('입력 필요', 'API 주소를 입력해주세요.');
      return;
    }
    let normalized = apiUrlInput.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `http://${normalized}`;
    }
    await setApiBaseUrl(normalized);
    Alert.alert('저장 완료', `API URL이 저장되었습니다.\n${normalized}`);
  }, [apiUrlInput, setApiBaseUrl]);

  const handleSaveAccessToken = useCallback(async () => {
    await saveAccessToken(tokenInput);
    Alert.alert('저장 완료', 'Access Token이 저장되었습니다.');
  }, [tokenInput, saveAccessToken]);

  const handleHealthCheck = useCallback(async () => {
    setHealthLoading(true);
    setHealthStatus(null);
    setHealthError(null);
    try {
      const targetUrl = `${normalizedCurrentBase}/health`;
      const response = await axios.get(targetUrl, { timeout: 10000 });
      setHealthStatus(`${response.status} ${response.statusText}`);
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.message || 'Unknown error';
      setHealthError(status ? `${status} ${message}` : message);
    } finally {
      setHealthLoading(false);
    }
  }, [normalizedCurrentBase]);

  if (loading) {
    return (
      <Container>
        <CenteredContainer>
          <ActivityIndicator size="large" color="#1d42d8" />
          <CenteredText>설정을 불러오는 중...</CenteredText>
        </CenteredContainer>
      </Container>
    );
  }

  return (
    <Container>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* 프로필 섹션 */}
        <ProfileSection>
          {/* 구독 상태 섹션 1: 이미지 + 남은 기간 */}
          <SubscriptionImageSection>
            <SubscriptionImageContainer>
              <SubscriptionImage
                source={
                  subscriptionInfo?.status === 'none'
                    ? require('../../assets/lock.png')
                    : require('../../assets/goodok.png')
                }
                resizeMode="contain"
              />
            </SubscriptionImageContainer>
            {subscriptionInfo?.status === 'none' ? (
              <SubscriptionDaysText>지금 바로 무료 이용을 시작해 보세요</SubscriptionDaysText>
            ) : subscriptionInfo?.status === 'trial' && subscriptionInfo.remainingDays !== null ? (
              <>
                <SubscriptionDaysText>무료 사용까지 {subscriptionInfo.remainingDays}일 남았습니다.</SubscriptionDaysText>
                {subscriptionInfo?.isFirstTimeBonus && (
                  <SubscriptionBonusText>(2개월 + 30일 연장 무료 사용 90일 적용)</SubscriptionBonusText>
                )}
              </>
            ) : subscriptionInfo?.status === 'free' ? (
              <SubscriptionDaysText>이용권 {subscriptionInfo.contractCount}/5개</SubscriptionDaysText>
            ) : subscriptionInfo?.status === 'paid' ? (
              <SubscriptionDaysText>월 3,900원</SubscriptionDaysText>
            ) : null}
          </SubscriptionImageSection>

          {/* 구독 상태 섹션 2: 버튼 */}
          <SubscriptionButtonSection>
            {subscriptionInfo?.status === 'none' ? (
              <SubscriptionActivateButton onPress={handleActivateSubscription}>
                <SubscriptionActivateButtonText>2개월 무료 사용 시작</SubscriptionActivateButtonText>
              </SubscriptionActivateButton>
            ) : (
              <SubscriptionActiveButton disabled>
                <SubscriptionActiveButtonText>무료 사용 중</SubscriptionActiveButtonText>
              </SubscriptionActiveButton>
            )}
          </SubscriptionButtonSection>

          <ProfileNameRow onPress={() => setProfileEditModalVisible(true)}>
          <ProfileName>{orgCode || '상호명 없음'}</ProfileName>
            <ChevronIcon>›</ChevronIcon>
          </ProfileNameRow>
          <ProfileEmail>{userName || '이름 없음'}</ProfileEmail>
        </ProfileSection>

        {/* 빠른 접근 카드 */}
        <QuickAccessSection>
          <QuickAccessCard onPress={() => setContractSettingsModalVisible(true)}>
            <QuickAccessIconWrapper>
              <QuickAccessIconImage source={require('../../assets/bbb2.png')} resizeMode="contain" />
            </QuickAccessIconWrapper>
            <QuickAccessLabel>기본 조건 설정</QuickAccessLabel>
          </QuickAccessCard>
          <QuickAccessCard onPress={() => setAccountInfoModalVisible(true)}>
            <QuickAccessIconWrapper>
              <QuickAccessIconImage source={require('../../assets/b1.png')} resizeMode="contain" />
            </QuickAccessIconWrapper>
            <QuickAccessLabel>계좌 정보</QuickAccessLabel>
          </QuickAccessCard>
          <QuickAccessCard onPress={() => navigation.navigate('Statistics' as never)}>
            <QuickAccessIconWrapper>
              <QuickAccessIconImage source={require('../../assets/Statistics.png')} resizeMode="contain" />
            </QuickAccessIconWrapper>
            <QuickAccessLabel>통계</QuickAccessLabel>
          </QuickAccessCard>
        </QuickAccessSection>

        {/* 부가기능 섹션 */}
        <Section>
          <SectionTitle>부가기능</SectionTitle>
          
          <SettingsItem>
            <SettingsItemLeft>
              <SettingsItemTitle>알림 설정</SettingsItemTitle>
            </SettingsItemLeft>
            <Switch
              value={notificationEnabled}
              onValueChange={setNotificationEnabled}
              trackColor={{ false: '#e0e0e0', true: '#c7d2fe' }}
              thumbColor="#ffffff"
            />
          </SettingsItem>

          <SettingsItem onPress={handleNoticePress}>
            <SettingsItemLeft>
              <SettingsItemTitle>공지사항</SettingsItemTitle>
            </SettingsItemLeft>
            <ChevronIcon>›</ChevronIcon>
          </SettingsItem>

          <SettingsItem onPress={() => (navigation as any).navigate('Inquiry')}>
            <SettingsItemLeft>
              <SettingsItemTitle>문의하기</SettingsItemTitle>
            </SettingsItemLeft>
            <ChevronIcon>›</ChevronIcon>
          </SettingsItem>

          <SettingsItem onPress={() => (navigation as any).navigate('Terms', { type: 'terms' })}>
            <SettingsItemLeft>
              <SettingsItemTitle>서비스 이용약관</SettingsItemTitle>
            </SettingsItemLeft>
            <ChevronIcon>›</ChevronIcon>
          </SettingsItem>

          <SettingsItem
            onPress={() => (navigation as any).navigate('Terms', { type: 'privacy' })}
            style={{ borderBottomWidth: 0 }}
          >
            <SettingsItemLeft>
              <SettingsItemTitle>개인정보처리방침</SettingsItemTitle>
            </SettingsItemLeft>
            <ChevronIcon>›</ChevronIcon>
          </SettingsItem>

          <Divider />

          <SettingsItem onPress={() => setLogoutModalVisible(true)}>
            <SettingsItemLeft>
              <SettingsItemTitle>로그아웃</SettingsItemTitle>
            </SettingsItemLeft>
            <ChevronIcon>›</ChevronIcon>
          </SettingsItem>
        </Section>

        {/* 개발자 옵션 (개발 모드에서만 표시) */}
        {__DEV__ && (
          <Section>
            <SectionTitle>개발자 옵션</SectionTitle>
            <HelperText>백엔드 정식 배포 전까지 테스트용 기능입니다.</HelperText>
            
            <InputLabel>API URL</InputLabel>
            <HelperText>현재 적용 중: {normalizedCurrentBase}</HelperText>
            <DevTextInput
              value={apiUrlInput}
              onChangeText={setApiUrlInput}
              placeholder="예: http://192.168.0.82:3000"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <DevButton onPress={handleSaveApiUrl}>
              <DevButtonText>API URL 저장</DevButtonText>
            </DevButton>

            <InputLabel style={{ marginTop: 20 }}>Access Token</InputLabel>
            <DevTextInput
              value={tokenInput}
              onChangeText={setTokenInput}
              placeholder="Bearer 토큰 문자열을 입력하세요"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <DevButton onPress={handleSaveAccessToken}>
              <DevButtonText>토큰 저장</DevButtonText>
            </DevButton>

            <InputLabel style={{ marginTop: 20 }}>헬스체크</InputLabel>
            <DevButton onPress={handleHealthCheck} disabled={healthLoading}>
              <DevButtonText>{healthLoading ? '요청 중...' : 'Health Check 호출'}</DevButtonText>
            </DevButton>
            {healthStatus && (
              <HealthResult>
                <HealthResultText>Status: {healthStatus}</HealthResultText>
              </HealthResult>
            )}
            {healthError && (
              <HealthResult>
                <HealthResultError>오류: {healthError}</HealthResultError>
              </HealthResult>
            )}
          </Section>
        )}
        {/* 하단 푸터: 사업자 정보 및 회원탈퇴 링크 (스크롤 맨 아래에 표시) */}
        <FooterContainer>
          <FooterText>KWCC(주)</FooterText>
          <FooterText>사업자등록번호 : 849-81-02606</FooterText>
          <FooterText>통신판매업신고 : 2023-화성동탄-1793호</FooterText>
          <FooterText>cokwcc@gmail.com</FooterText>
          <FooterText>V1.0.0</FooterText>
          <FooterWithdrawText onPress={() => setWithdrawModalVisible(true)}>
            회원탈퇴
          </FooterWithdrawText>
        </FooterContainer>
      </ScrollView>

      {/* 모달 */}
      <ProfileEditModal
        visible={profileEditModalVisible}
        onClose={() => setProfileEditModalVisible(false)}
        onSave={handleProfileEditSave}
        initialName={userName}
        initialOrgCode={orgCode}
      />
      <ContractSettingsModal
        visible={contractSettingsModalVisible}
        onClose={() => setContractSettingsModalVisible(false)}
        onSave={handleContractSettingsSave}
      />
      <AccountInfoModal
        visible={accountInfoModalVisible}
        onClose={() => setAccountInfoModalVisible(false)}
        onSave={handleAccountInfoSave}
        initialBankName={bankName}
        initialAccountNumber={accountNumber}
        initialAccountHolder={accountHolder}
      />
      <SubscriptionIntroModal
        visible={subscriptionIntroModalVisible}
        onClose={() => setSubscriptionIntroModalVisible(false)}
      />
      <LogoutModal
        visible={logoutModalVisible}
        onClose={() => setLogoutModalVisible(false)}
      />
      <WithdrawModal
        visible={withdrawModalVisible}
        onClose={() => setWithdrawModalVisible(false)}
      />

      {/* 토스트 메시지 */}
      {toastVisible && (
        <ToastContainer>
          <ToastText>{toastMessage}</ToastText>
        </ToastContainer>
      )}
    </Container>
  );
}

export default function SettingsScreen() {
  return <SettingsContent />;
}

// Styled Components
const Container = styled.SafeAreaView`
  flex: 1;
  background-color: #ffffff;
`;

const CenteredContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  gap: 12px;
`;

const CenteredText = styled.Text`
  font-size: 15px;
  color: #555;
`;

const ProfileSection = styled.View`
  background-color: #ffffff;
  padding: 32px 20px;
  align-items: center;
  margin-bottom: 16px;
`;

const ProfileAvatarTouchable = styled.TouchableOpacity`
  margin-bottom: 12px;
`;

const ProfileAvatar = styled.View`
  width: 80px;
  height: 80px;
  border-radius: 40px;
  background-color: transparent;
  justify-content: center;
  align-items: center;
`;

const AvatarText = styled.Text`
  font-size: 32px;
  font-weight: 700;
  color: #ffffff;
`;

const AvatarIcon = styled.Text`
  font-size: 40px;
`;

const ProfileNameRow = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
`;

const ProfileName = styled.Text`
  font-size: 20px;
  font-weight: 700;
  color: #111111;
`;

const ProfileEmail = styled.Text`
  font-size: 14px;
  color: #8e8e93;
`;

const ProfilePhone = styled.Text`
  font-size: 14px;
  color: #8e8e93;
  margin-top: 4px;
`;

const Section = styled.View`
  background-color: #ffffff;
  margin: 0 16px 16px;
  padding: 20px;
  border-radius: 16px;
`;

const SectionTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 16px;
`;

const SettingsItem = styled.TouchableOpacity`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const SettingsItemLeft = styled.View`
  flex: 1;
`;

interface SettingsItemTitleProps {
  $isOrange?: boolean;
}

const SettingsItemTitle = styled.Text<SettingsItemTitleProps>`
  font-size: 16px;
  color: ${(props: SettingsItemTitleProps) => (props.$isOrange ? '#1d42d8' : '#111111')};
  margin-bottom: 4px;
  font-weight: ${(props: SettingsItemTitleProps) => (props.$isOrange ? '700' : 'normal')};
`;

const SettingsItemValue = styled.Text`
  font-size: 14px;
  color: #8e8e93;
`;

const SettingsButtonText = styled.Text`
  font-size: 16px;
  color: #1d42d8;
  font-weight: 700;
  margin-top: 4px;
`;

const ChevronIcon = styled.Text`
  font-size: 24px;
  color: #c7c7cc;
  margin-left: 12px;
`;

const Divider = styled.View`
  height: 1px;
  background-color: #e0e0e0;
  margin: 8px 0;
`;

const ToastContainer = styled.View`
  position: absolute;
  bottom: 100px;
  align-self: center;
  background-color: #1d42d8;
  padding: 14px 24px;
  border-radius: 12px;
  z-index: 1000;
  shadow-color: rgba(29, 66, 216, 0.3);
  shadow-opacity: 0.3;
  shadow-radius: 8px;
  shadow-offset: 0px 4px;
  elevation: 4;
`;

const ToastText = styled.Text`
  font-size: 15px;
  color: #ffffff;
  font-weight: 600;
  text-align: center;
`;

const HelperText = styled.Text`
  font-size: 13px;
  color: #8e8e93;
  margin-bottom: 12px;
`;

const InputLabel = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #111111;
  margin-top: 12px;
  margin-bottom: 8px;
`;

const DevTextInput = styled.TextInput`
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  font-size: 14px;
  background-color: #ffffff;
  margin-bottom: 8px;
`;

const DevButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  background-color: ${(props: { disabled?: boolean }) => (props.disabled ? '#cccccc' : '#f0f0f0')};
  padding: 12px;
  border-radius: 8px;
  align-items: center;
  margin-bottom: 8px;
`;

const DevButtonText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #333333;
`;

const HealthResult = styled.View`
  margin-top: 8px;
  padding: 8px;
  background-color: #f5f5f5;
  border-radius: 6px;
`;

const HealthResultText = styled.Text`
  font-size: 13px;
  color: #333333;
`;

const HealthResultError = styled.Text`
  font-size: 13px;
  color: #ff3b30;
`;

const QuickAccessSection = styled.View`
  flex-direction: row;
  justify-content: space-between;
  padding: 0 16px;
  margin-bottom: 16px;
  gap: 12px;
`;

const QuickAccessCard = styled.TouchableOpacity`
  flex: 1;
  background-color: #ffffff;
  border-radius: 16px;
  padding: 20px 12px;
  align-items: center;
  shadow-color: rgba(29, 66, 216, 0.15);
  shadow-opacity: 0.15;
  shadow-radius: 8px;
  shadow-offset: 0px 4px;
  elevation: 2;
`;

const QuickAccessIconWrapper = styled.View`
  width: 50px;
  height: 50px;
  border-radius: 25px;
  background-color: transparent;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
`;

const QuickAccessIcon = styled.Text`
  font-size: 28px;
`;

const QuickAccessIconImage = styled.Image`
  width: 45px;
  height: 45px;
`;

const QuickAccessLabel = styled.Text`
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
  text-align: center;
`;

// 구독 상태 섹션 1: 이미지 + 남은 기간
const SubscriptionImageSection = styled.View`
  align-items: center;
  margin-bottom: 16px;
  padding: 20px;
  width: 100%;
`;

const SubscriptionImageContainer = styled.View`
  width: 80px;
  height: 80px;
  justify-content: center;
  align-items: center;
  margin-bottom: 12px;
`;

const SubscriptionImage = styled.Image`
  width: 80px;
  height: 80px;
`;

const SubscriptionDaysText = styled.Text`
  font-size: 15px;
  color: #1d42d8;
  font-weight: 500;
  text-align: center;
`;

const SubscriptionBonusText = styled.Text`
  font-size: 13px;
  color: #ff3b30;
  font-weight: 500;
  text-align: center;
  margin-top: 4px;
`;

// 구독 상태 섹션 2: 버튼
const SubscriptionButtonSection = styled.View`
  width: 100%;
  margin-bottom: 16px;
`;

const SubscriptionActivateButton = styled.TouchableOpacity`
  background-color: #1d42d8;
  padding: 14px;
  border-radius: 8px;
  align-items: center;
  width: 100%;
`;

const SubscriptionActivateButtonText = styled.Text`
  color: #fff;
  font-size: 16px;
  font-weight: bold;
`;

const SubscriptionActiveButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  background-color: #e0e0e0;
  padding: 14px;
  border-radius: 8px;
  align-items: center;
  width: 100%;
`;

const SubscriptionActiveButtonText = styled.Text`
  color: #666;
  font-size: 16px;
  font-weight: bold;
`;

const FooterContainer = styled.View`
  padding: 24px 16px 32px;
  background-color: #ffffff;
  align-items: center;
`;

const FooterText = styled.Text`
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
  margin-bottom: 2px;
`;

const FooterWithdrawText = styled.Text`
  font-size: 12px;
  color: #6b7280;
  text-decoration: underline;
  text-align: center;
  margin-top: 6px;
`;
