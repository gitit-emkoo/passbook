import React, { useState, useCallback, useEffect } from 'react';
import { Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { useNavigation, NativeStackNavigationProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import styled from 'styled-components/native';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/useStore';
import { AuthStackParamList } from '../navigation/AppNavigator';

const logoImage = require('../../assets/logo1.jpg');

type PhoneAuthNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'PhoneAuth'>;

export default function PhoneAuthScreen() {
  const navigation = useNavigation<PhoneAuthNavigationProp>();
  const login = useAuthStore((state) => state.login);
  
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [hasPreviousLogin, setHasPreviousLogin] = useState(false);

  // 디바이스에 이전 로그인 기록이 있는지 확인
  useEffect(() => {
    const checkPreviousLogin = async () => {
      try {
        // 먼저 현재 auth-storage 확인 (로그인 중인 경우)
        const stored = await AsyncStorage.getItem('auth-storage');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.state?.user) {
            setHasPreviousLogin(true);
            if (parsed.state.user.phone) {
              setPhone(parsed.state.user.phone);
            }
            return;
          }
        }
        // 로그아웃 후에도 이전 기록 확인
        const lastUser = await AsyncStorage.getItem('last-logged-in-user');
        if (lastUser) {
          const parsedUser = JSON.parse(lastUser);
          setHasPreviousLogin(true);
          if (parsedUser?.phone) {
            setPhone(parsedUser.phone);
          }
        }
      } catch (error) {
        console.error('[PhoneAuthScreen] Failed to check previous login', error);
      }
    };
    checkPreviousLogin();
  }, []);

  // 전화번호 형식 검증
  const isValidPhone = (phoneNumber: string): boolean => {
    const phoneRegex = /^010-?\d{4}-?\d{4}$/;
    return phoneRegex.test(phoneNumber);
  };

  // 전화번호 포맷팅 (010-1234-5678)
  const formatPhone = (text: string): string => {
    const numbers = text.replace(/[^0-9]/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  };

  // 인증번호 요청
  const handleRequestCode = useCallback(async () => {
    if (!isValidPhone(phone)) {
      Alert.alert('입력 오류', '올바른 전화번호 형식이 아닙니다.\n(010-1234-5678)');
      return;
    }

    try {
      setRequestingCode(true);
      await authApi.requestCode(phone);
      setCodeSent(true);
      Alert.alert('인증번호 전송', '인증번호가 전송되었습니다.');
    } catch (error: any) {
      // 개발용 로그는 __DEV__ 모드에서만 console.log로 출력 (에러 오버레이 방지)
      if (__DEV__) {
        console.log('[PhoneAuthScreen] requestCode error (handled)', {
          status: error?.response?.status,
          message: error?.response?.data?.message || error?.message,
        });
      }
      Alert.alert('오류', error?.response?.data?.message || '인증번호 전송에 실패했습니다.');
    } finally {
      setRequestingCode(false);
    }
  }, [phone]);

  // 인증번호 검증
  const handleVerifyCode = useCallback(async () => {
    if (code.length !== 6) {
      Alert.alert('입력 오류', '인증번호는 6자리입니다.');
      return;
    }

    try {
      setVerifyingCode(true);
      const response = await authApi.verifyCode(phone, code);
      
      if (!response.isNewUser && response.accessToken && response.user) {
        // 이미 가입한 사용자: 바로 로그인
        await login(response.accessToken, {
          id: response.user.id,
          phone: response.user.phone,
          name: response.user.name,
          org_code: response.user.org_code,
        });
        // 로그인 성공하면 자동으로 홈 화면으로 이동됨
      } else if (response.isNewUser && response.temporaryToken) {
        // 신규 사용자: 회원가입 화면으로 이동
        navigation.navigate('Signup', {
          phone,
          temporaryToken: response.temporaryToken,
        });
      } else {
        console.error('[PhoneAuthScreen] unexpected response format', response);
        throw new Error('예상치 못한 응답 형식입니다.');
      }
    } catch (error: any) {
      // 개발용 로그는 __DEV__ 모드에서만 console.log로 출력 (에러 오버레이 방지)
      if (__DEV__) {
        console.log('[PhoneAuthScreen] verifyCode error (handled)', {
          status: error?.response?.status,
          message: error?.response?.data?.message || error?.message,
        });
      }
      
      // 사용자에게는 항상 간단하고 명확한 메시지만 표시
      Alert.alert(
        '인증 실패',
        '인증번호가 일치하지 않습니다.',
        [
          {
            text: '확인',
            onPress: () => {
              // 인증번호 입력 필드 초기화하여 다시 입력할 수 있도록
              setCode('');
            },
          },
        ],
        { cancelable: true }
      );
    } finally {
      setVerifyingCode(false);
    }
  }, [phone, code, login, navigation]);

  return (
    <Container>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <HeaderArea>
            <LogoImage source={logoImage} resizeMode="contain" />
            <AppSlogan>계약부터 정산까지 간편한 레슨관리 김쌤</AppSlogan>
          </HeaderArea>
          <Content>
            <StepContainer>
              {hasPreviousLogin ? (
                <>
                  <Title>전화번호 간편 로그인</Title>
                  <Subtitle>가입된 전화번호로 인증을 진행해주세요</Subtitle>
                </>
              ) : (
                <>
                  <Title>전화번호로 시작하기</Title>
                  <Subtitle>간편하게 전화번호로 김쌤을 이용하실 수 있어요</Subtitle>
                </>
              )}

              <InputLabel>전화번호</InputLabel>
              <PhoneInput
                value={phone}
                onChangeText={(text) => setPhone(formatPhone(text))}
                placeholder="010-1234-5678"
                keyboardType="phone-pad"
                maxLength={13}
                editable={!codeSent}
              />

              {codeSent && (
                <>
                  <InputLabel style={{ marginTop: 20 }}>인증번호</InputLabel>
                  <CodeInput
                    value={code}
                    onChangeText={setCode}
                    placeholder="6자리 인증번호"
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </>
              )}

              {!codeSent ? (
                <PrimaryButton onPress={handleRequestCode} disabled={requestingCode || !isValidPhone(phone)}>
                  {requestingCode ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <PrimaryButtonText>
                      {hasPreviousLogin ? '인증요청 로그인' : '인증번호 요청'}
                    </PrimaryButtonText>
                  )}
                </PrimaryButton>
              ) : (
                <PrimaryButton onPress={handleVerifyCode} disabled={verifyingCode || code.length !== 6}>
                  {verifyingCode ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <PrimaryButtonText>
                      {hasPreviousLogin ? '로그인하기' : '시작하기'}
                    </PrimaryButtonText>
                  )}
                </PrimaryButton>
              )}

              {codeSent && (
                <SecondaryButton onPress={() => {
                  setCodeSent(false);
                  setCode('');
                }}>
                  <SecondaryButtonText>번호 다시 입력</SecondaryButtonText>
                </SecondaryButton>
              )}
            </StepContainer>
          </Content>
        </ScrollView>
      </KeyboardAvoidingView>
    </Container>
  );
}

const Container = styled.SafeAreaView`
  flex: 1;
  background-color: #ffffff;
`;

const HeaderArea = styled.View`
  padding: 60px 20px 40px;
  align-items: center;
  gap: 16px;
`;

const LogoImage = styled.Image`
  width: 80px;
  height: 80px;
  margin-bottom: 8px;
`;

const AppSlogan = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #ff6b00;
  text-align: center;
`;

const Content = styled.View`
  flex: 1;
  padding: 20px;
  justify-content: flex-start;
  padding-top: 20px;
`;

const StepContainer = styled.View`
  background-color: #ffffff;
  border-radius: 16px;
  padding: 24px;
  shadow-color: #000000;
  shadow-opacity: 0.05;
  shadow-offset: 0px 4px;
  shadow-radius: 10px;
  elevation: 2;
`;

const Title = styled.Text`
  font-size: 24px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 8px;
  text-align: center;
`;

const Subtitle = styled.Text`
  font-size: 14px;
  color: #8e8e93;
  margin-bottom: 24px;
  text-align: center;
  line-height: 20px;
`;

const InputLabel = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #333333;
  margin-bottom: 8px;
  margin-top: 12px;
`;

const PhoneInput = styled.TextInput`
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 16px;
  color: #111111;
  background-color: #ffffff;
`;

const CodeInput = styled.TextInput`
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 16px;
  color: #111111;
  background-color: #ffffff;
  text-align: center;
  letter-spacing: 8px;
`;

const PrimaryButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  background-color: #ff6b00;
  padding: 16px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  margin-top: 24px;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;

const PrimaryButtonText = styled.Text`
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
`;

const SecondaryButton = styled.TouchableOpacity`
  padding: 12px;
  align-items: center;
  margin-top: 12px;
`;

const SecondaryButtonText = styled.Text`
  color: #8e8e93;
  font-size: 14px;
`;

