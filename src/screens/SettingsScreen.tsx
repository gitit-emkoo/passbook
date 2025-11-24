import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, TextInput } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import styled from 'styled-components/native';
import { usersApi } from '../api/users';
import { featureFlags } from '../config/features';
import { useAuthStore } from '../store/useStore';
import { env } from '../config/env';
import axios from 'axios';
import ContractSettingsModal from '../components/modals/ContractSettingsModal';
import AccountInfoModal from '../components/modals/AccountInfoModal';
import ProfileEditModal from '../components/modals/ProfileEditModal';
import LogoutModal from '../components/modals/LogoutModal';
import WithdrawModal from '../components/modals/WithdrawModal';
import BusinessIconModal from '../components/modals/BusinessIconModal';

// 업종 아이콘 이모지 매핑 (나중에 실제 이미지로 교체 가능)
const getBusinessIconEmoji = (iconId: string): string => {
  const iconMap: Record<string, string> = {
    health: '💪',
    tutoring: '📚',
    yoga: '🧘',
    dance: '💃',
    music: '🎵',
    art: '🎨',
    sports: '⚽',
    language: '🌐',
  };
  return iconMap[iconId] || '?';
};

const SettingsStub = () => (
  <StubContainer>
    <StubTitle>마이</StubTitle>
    <StubDescription>STEP 1: 네비게이션 테스트</StubDescription>
  </StubContainer>
);

function SettingsContent() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);

  // 기본 정보
  const [userName, setUserName] = useState('');
  const [orgCode, setOrgCode] = useState('');

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
  const [businessIconModalVisible, setBusinessIconModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  
  // 업종 아이콘
  const [businessIcon, setBusinessIcon] = useState<string | null>(null);

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

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const user = await usersApi.getMe();
      
      // 기본 정보
      setUserName(user.name || '');
      setOrgCode(user.org_code || '');

      // 계약서 기본값 요약 생성
      const settings = user.settings || {};
      const summaryParts: string[] = [];
      
      if (settings.default_billing_type) {
        const billingLabel = settings.default_billing_type === 'prepaid' ? '선불' : '후불';
        summaryParts.push(billingLabel);
      }
      if (settings.default_absence_policy) {
        const absenceLabels: Record<string, string> = {
          carry_over: '이월',
          deduct_next: '차감',
          vanish: '소멸',
        };
        summaryParts.push(absenceLabels[settings.default_absence_policy] || settings.default_absence_policy);
      }
      if (settings.default_send_target) {
        const recipientLabels: Record<string, string> = {
          student_only: '수강생만',
          guardian_only: '보호자만',
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
      
      // 업종 아이콘
      setBusinessIcon(settings.business_icon || null);
    } catch (error: any) {
      console.error('[Settings] load error', error);
      Alert.alert('오류', '설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings]),
  );

  const handleProfileEditSave = useCallback(() => {
    loadSettings();
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
    }, 2000);
  }, [loadSettings]);

  const handleContractSettingsSave = useCallback(() => {
    loadSettings();
  }, [loadSettings]);

  const handleAccountInfoSave = useCallback(() => {
    loadSettings();
  }, [loadSettings]);

  const handleBusinessIconSave = useCallback(() => {
    loadSettings();
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
    }, 2000);
  }, [loadSettings]);

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
          <ActivityIndicator size="large" color="#ff6b00" />
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
          <ProfileAvatarTouchable onPress={() => setBusinessIconModalVisible(true)}>
            <ProfileAvatar>
              {businessIcon ? (
                <AvatarIcon>{getBusinessIconEmoji(businessIcon)}</AvatarIcon>
              ) : (
                <AvatarText>{userName ? userName.charAt(0) : '?'}</AvatarText>
              )}
            </ProfileAvatar>
          </ProfileAvatarTouchable>
          <ProfileName>{orgCode || '상호명 없음'}</ProfileName>
          <ProfileEmail>{userName || '이름 없음'}</ProfileEmail>
          <EditButtonWrapper onPress={() => setProfileEditModalVisible(true)}>
            <EditButtonText>
              프로필 수정 <EditIcon>✏</EditIcon>
            </EditButtonText>
          </EditButtonWrapper>
        </ProfileSection>

        {/* 계약서 기본조건 설정 */}
        <Section>
          <SectionTitle>계약서 기본조건 설정</SectionTitle>
          <SettingsItem onPress={() => setContractSettingsModalVisible(true)}>
            <SettingsItemLeft>
              <SettingsItemTitle>등록 된 기본조건</SettingsItemTitle>
              {contractSettingsSummary !== '설정 안 됨' && (
                <SettingsItemValue>{contractSettingsSummary}</SettingsItemValue>
              )}
              <SettingsButtonText>
                {contractSettingsSummary === '설정 안 됨' ? '설정하기' : '조건 변경하기'}
              </SettingsButtonText>
            </SettingsItemLeft>
            <ChevronIcon>›</ChevronIcon>
          </SettingsItem>
        </Section>

        {/* 계좌 정보 */}
        <Section>
          <SectionTitle>계좌 정보</SectionTitle>
          <HelperText>청구서에 포함될 계좌정보를 등록 해 주세요</HelperText>
          <SettingsItem onPress={() => setAccountInfoModalVisible(true)}>
            <SettingsItemLeft>
              <SettingsItemTitle $isOrange={bankName && accountNumber && accountHolder ? true : false}>
                {bankName && accountNumber && accountHolder ? '계좌 수정하기' : '계좌 등록하기'}
              </SettingsItemTitle>
              {bankName && accountNumber && accountHolder && (
                <SettingsItemValue>{bankName} {accountNumber}</SettingsItemValue>
              )}
            </SettingsItemLeft>
            <ChevronIcon>›</ChevronIcon>
          </SettingsItem>
        </Section>

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
              trackColor={{ false: '#e0e0e0', true: '#ff6b00' }}
              thumbColor="#ffffff"
            />
          </SettingsItem>

          <SettingsItem onPress={handleNoticePress}>
            <SettingsItemLeft>
              <SettingsItemTitle>공지사항</SettingsItemTitle>
            </SettingsItemLeft>
            <ChevronIcon>›</ChevronIcon>
          </SettingsItem>

          <SettingsItem onPress={() => navigation.navigate('UnprocessedAttendance' as never)}>
            <SettingsItemLeft>
              <SettingsItemTitle>출결 미처리 관리</SettingsItemTitle>
            </SettingsItemLeft>
            <ChevronIcon>›</ChevronIcon>
          </SettingsItem>

          <SettingsItem onPress={() => navigation.navigate('Terms' as never, { type: 'terms' } as never)}>
            <SettingsItemLeft>
              <SettingsItemTitle>서비스 이용약관</SettingsItemTitle>
            </SettingsItemLeft>
            <ChevronIcon>›</ChevronIcon>
          </SettingsItem>

          <SettingsItem onPress={() => navigation.navigate('Terms' as never, { type: 'privacy' } as never)}>
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

          <SettingsItem onPress={() => setWithdrawModalVisible(true)}>
            <SettingsItemLeft>
              <SettingsItemTitle style={{ color: '#ff3b30' }}>회원탈퇴</SettingsItemTitle>
            </SettingsItemLeft>
            <ChevronIcon>›</ChevronIcon>
          </SettingsItem>
        </Section>

        {/* 개발자 옵션 (백엔드 정식 배포 전까지) */}
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
      <BusinessIconModal
        visible={businessIconModalVisible}
        onClose={() => setBusinessIconModalVisible(false)}
        onSave={handleBusinessIconSave}
        initialIcon={businessIcon}
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
          <ToastText>수정되었습니다</ToastText>
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
  background-color: #ff6b00;
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

const ProfileName = styled.Text`
  font-size: 20px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 4px;
`;

const ProfileEmail = styled.Text`
  font-size: 14px;
  color: #8e8e93;
`;

const EditButtonWrapper = styled.TouchableOpacity`
  margin-top: 16px;
`;

const EditButtonText = styled.Text`
  font-size: 18px;
  color: #ff6b00;
  font-weight: 700;
  text-decoration-line: underline;
`;

const EditIcon = styled.Text`
  font-size: 18px;
  color: #ff6b00;
  margin-left: 4px;
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

const SettingsItemTitle = styled.Text<{ $isOrange?: boolean }>`
  font-size: 16px;
  color: ${(props) => (props.$isOrange ? '#ff6b00' : '#111111')};
  margin-bottom: 4px;
  font-weight: ${(props) => (props.$isOrange ? '700' : 'normal')};
`;

const SettingsItemValue = styled.Text`
  font-size: 14px;
  color: #8e8e93;
`;

const SettingsButtonText = styled.Text`
  font-size: 16px;
  color: #ff6b00;
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

const StubContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  background-color: #f5f5f5;
`;

const StubTitle = styled.Text`
  font-size: 24px;
  font-weight: bold;
  color: #000;
  margin-bottom: 10px;
`;

const StubDescription = styled.Text`
  font-size: 16;
  color: #666;
`;

const ToastContainer = styled.View`
  position: absolute;
  bottom: 100px;
  align-self: center;
  background-color: rgba(0, 0, 0, 0.8);
  padding: 12px 24px;
  border-radius: 8px;
  z-index: 1000;
`;

const ToastText = styled.Text`
  font-size: 14px;
  color: #ffffff;
  font-weight: 500;
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
