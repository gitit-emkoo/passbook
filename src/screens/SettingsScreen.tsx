import React, { useState, useEffect } from 'react';
import { ScrollView, Alert, Switch } from 'react-native';
import styled from 'styled-components/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/useStore';

const Container = styled.View`
  flex: 1;
  background-color: #f5f5f5;
`;

const Header = styled.View`
  background-color: #fff;
  padding: 16px;
  padding-top: 50px;
  border-bottom-width: 1px;
  border-bottom-color: #e0e0e0;
`;

const Title = styled.Text`
  font-size: 24px;
  font-weight: bold;
  color: #000;
  margin-bottom: 8px;
`;

const Section = styled.View`
  background-color: #fff;
  padding: 16px;
  margin-top: 16px;
  margin-horizontal: 16px;
  border-radius: 8px;
`;

const SectionTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #000;
  margin-bottom: 12px;
`;

const SettingRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const SettingRowLast = styled(SettingRow)`
  border-bottom-width: 0;
`;

const SettingLabel = styled.View`
  flex: 1;
  margin-right: 16px;
`;

const SettingTitle = styled.Text`
  font-size: 16px;
  color: #000;
  margin-bottom: 4px;
`;

const SettingDescription = styled.Text`
  font-size: 12px;
  color: #666;
`;

const PickerContainer = styled.View`
  border-width: 1px;
  border-color: #ddd;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
`;

const PickerButton = styled.TouchableOpacity`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const PickerText = styled.Text`
  font-size: 16px;
  color: #000;
`;

const TextInput = styled.TextInput`
  border-width: 1px;
  border-color: #ddd;
  border-radius: 6px;
  padding: 12px;
  font-size: 16px;
  color: #000;
  background-color: #fff;
  margin-bottom: 12px;
`;

const LogoutButton = styled.TouchableOpacity`
  background-color: #FF3B30;
  padding: 16px;
  margin: 16px;
  border-radius: 8px;
  align-items: center;
`;

const LogoutButtonText = styled.Text`
  color: #fff;
  font-size: 18px;
  font-weight: bold;
`;

const InfoText = styled.Text`
  font-size: 12px;
  color: #666;
  margin-top: 4px;
`;

/**
 * 설정 화면
 */
export default function SettingsScreen() {
  const logout = useAuthStore((state) => state.logout);

  // 기본 설정값 (새 계약의 기본값)
  const [billingType, setBillingType] = useState<'prepaid' | 'postpaid'>('postpaid');
  const [absencePolicy, setAbsencePolicy] = useState<'carry_over' | 'deduct_next' | 'vanish'>('deduct_next');
  const [requireSignature, setRequireSignature] = useState(false);
  const [showInvoiceDetails, setShowInvoiceDetails] = useState(true);
  const [defaultAccount, setDefaultAccount] = useState('');
  const [orgCode, setOrgCode] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await AsyncStorage.getItem('settings');
      if (settings) {
        const parsed = JSON.parse(settings);
        setBillingType(parsed.billingType || 'postpaid');
        setAbsencePolicy(parsed.absencePolicy || 'deduct_next');
        setRequireSignature(parsed.requireSignature || false);
        setShowInvoiceDetails(parsed.showInvoiceDetails !== false);
        setDefaultAccount(parsed.defaultAccount || '');
        setOrgCode(parsed.orgCode || '');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = async () => {
    try {
      const settings = {
        billingType,
        absencePolicy,
        requireSignature,
        showInvoiceDetails,
        defaultAccount,
        orgCode,
      };
      await AsyncStorage.setItem('settings', JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  useEffect(() => {
    saveSettings();
  }, [billingType, absencePolicy, requireSignature, showInvoiceDetails, defaultAccount, orgCode]);

  const handleLogout = async () => {
    Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
      {
        text: '취소',
        style: 'cancel',
      },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  return (
    <Container>
      <ScrollView>
        <Header>
          <Title>설정</Title>
        </Header>

        <Section>
          <SectionTitle>기본 규칙 (새 계약서용)</SectionTitle>
          <InfoText>* 새로 만드는 계약서의 기본값입니다. 기존 계약에는 영향 없습니다.</InfoText>

          <SettingRow>
            <SettingLabel>
              <SettingTitle>결제 방식</SettingTitle>
            </SettingLabel>
            <PickerContainer style={{ flex: 1 }}>
              <PickerButton
                onPress={() => {
                  Alert.alert(
                    '결제 방식',
                    '선택하세요',
                    [
                      { text: '후불', onPress: () => setBillingType('postpaid') },
                      { text: '선불', onPress: () => setBillingType('prepaid') },
                    ],
                    { cancelable: true },
                  );
                }}
              >
                <PickerText>{billingType === 'prepaid' ? '선불' : '후불'}</PickerText>
                <PickerText>▾</PickerText>
              </PickerButton>
            </PickerContainer>
          </SettingRow>

          <SettingRow>
            <SettingLabel>
              <SettingTitle>결석 처리 방식</SettingTitle>
            </SettingLabel>
            <PickerContainer style={{ flex: 1 }}>
              <PickerButton
                onPress={() => {
                  Alert.alert(
                    '결석 처리 방식',
                    '선택하세요',
                    [
                      { text: '차월차감', onPress: () => setAbsencePolicy('deduct_next') },
                      { text: '이월', onPress: () => setAbsencePolicy('carry_over') },
                      { text: '소멸', onPress: () => setAbsencePolicy('vanish') },
                    ],
                    { cancelable: true },
                  );
                }}
              >
                <PickerText>
                  {absencePolicy === 'deduct_next'
                    ? '차월차감'
                    : absencePolicy === 'carry_over'
                    ? '이월'
                    : '소멸'}
                </PickerText>
                <PickerText>▾</PickerText>
              </PickerButton>
            </PickerContainer>
          </SettingRow>
        </Section>

        <Section>
          <SectionTitle>출결 설정</SectionTitle>
          <SettingRow>
            <SettingLabel>
              <SettingTitle>출석 후 서명 요구</SettingTitle>
              <SettingDescription>출석 시 서명을 받을지 여부</SettingDescription>
            </SettingLabel>
            <Switch value={requireSignature} onValueChange={setRequireSignature} />
          </SettingRow>
        </Section>

        <Section>
          <SectionTitle>청구서 설정</SectionTitle>
          <SettingRow>
            <SettingLabel>
              <SettingTitle>상세 내역 표시</SettingTitle>
              <SettingDescription>청구서에 출결 내역을 표시할지 여부</SettingDescription>
            </SettingLabel>
            <Switch value={showInvoiceDetails} onValueChange={setShowInvoiceDetails} />
          </SettingRow>
        </Section>

        <Section>
          <SectionTitle>계좌 정보</SectionTitle>
          <TextInput
            placeholder="기본 입금 계좌 (예: 국민은행 123-456-789012)"
            value={defaultAccount}
            onChangeText={setDefaultAccount}
          />
          <InfoText>청구서 전송 시 계좌 정보에 포함됩니다.</InfoText>
        </Section>

        <Section>
          <SectionTitle>기관 정보</SectionTitle>
          <TextInput
            placeholder="기관 코드 (선택사항)"
            value={orgCode}
            onChangeText={setOrgCode}
          />
          <InfoText>기관 코드를 입력하면 계약서에 표시됩니다.</InfoText>
        </Section>
      </ScrollView>

      <LogoutButton onPress={handleLogout}>
        <LogoutButtonText>로그아웃</LogoutButtonText>
      </LogoutButton>
    </Container>
  );
}
