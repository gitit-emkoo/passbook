import React, { useState } from 'react';
import { Alert } from 'react-native';
import styled from 'styled-components/native';
import { useNavigation } from '@react-navigation/native';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/useStore';

const Container = styled.View`
  flex: 1;
  background-color: #f5f5f5;
  justify-content: center;
  padding: 20px;
`;

const Logo = styled.Text`
  font-size: 32px;
  font-weight: bold;
  color: #000;
  text-align: center;
  margin-bottom: 40px;
`;

const FormContainer = styled.View`
  background-color: #fff;
  padding: 24px;
  border-radius: 12px;
`;

const InputLabel = styled.Text`
  font-size: 16px;
  color: #333;
  margin-bottom: 8px;
`;

const TextInput = styled.TextInput`
  border-width: 1px;
  border-color: #ddd;
  border-radius: 8px;
  padding: 12px;
  font-size: 16px;
  color: #000;
  background-color: #fff;
  margin-bottom: 16px;
`;

const Button = styled.TouchableOpacity<{ primary?: boolean }>`
  background-color: ${(props) => (props.primary ? '#007AFF' : '#f0f0f0')};
  padding: 16px;
  border-radius: 8px;
  align-items: center;
  margin-bottom: 12px;
`;

const ButtonText = styled.Text<{ primary?: boolean }>`
  color: ${(props) => (props.primary ? '#fff' : '#333')};
  font-size: 18px;
  font-weight: bold;
`;

const InfoText = styled.Text`
  font-size: 12px;
  color: #666;
  text-align: center;
  margin-top: 16px;
`;

const CodeInput = styled.TextInput`
  border-width: 1px;
  border-color: #ddd;
  border-radius: 8px;
  padding: 12px;
  font-size: 16px;
  color: #000;
  background-color: #fff;
  margin-bottom: 16px;
  text-align: center;
  letter-spacing: 8px;
`;

const TimerText = styled.Text`
  font-size: 14px;
  color: #007AFF;
  text-align: center;
  margin-bottom: 16px;
`;

/**
 * 인증 화면 (로그인)
 */
export default function AuthScreen() {
  const navigation = useNavigation();
  const login = useAuthStore((state) => state.login);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [timer, setTimer] = useState(0);

  // 타이머 시작
  React.useEffect(() => {
    if (codeSent && timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [codeSent, timer]);

  const handleRequestCode = async () => {
    if (!phone || phone.length < 10) {
      Alert.alert('알림', '올바른 전화번호를 입력해주세요.');
      return;
    }

    try {
      setLoading(true);
      await authApi.requestCode(phone);
      setCodeSent(true);
      setStep('code');
      setTimer(180); // 3분
      Alert.alert('완료', '인증 코드가 전송되었습니다.');
    } catch (error) {
      console.error('Failed to request code:', error);
      Alert.alert('오류', '인증 코드 전송에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code || code.length !== 6) {
      Alert.alert('알림', '6자리 인증 코드를 입력해주세요.');
      return;
    }

    try {
      setLoading(true);
      const response = await authApi.verifyCode(phone, code);
      await login(response.access_token, {
        id: response.user.id,
        phone: response.user.phone,
        name: response.user.name,
      });
      // 로그인 성공 시 자동으로 홈으로 이동 (AppNavigator에서 처리)
    } catch (error: any) {
      console.error('Failed to verify code:', error);
      const message = error.response?.data?.message || '인증에 실패했습니다.';
      Alert.alert('오류', message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (timer > 0) {
      Alert.alert('알림', `${timer}초 후 다시 시도해주세요.`);
      return;
    }
    await handleRequestCode();
  };

  return (
    <Container>
      <Logo>김쌤</Logo>
      <FormContainer>
        {step === 'phone' ? (
          <>
            <InputLabel>전화번호</InputLabel>
            <TextInput
              placeholder="010-1234-5678"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoFocus
            />
            <Button primary onPress={handleRequestCode} disabled={loading}>
              <ButtonText primary>인증 코드 받기</ButtonText>
            </Button>
            <InfoText>
              전화번호로 인증 코드를 발송합니다.{'\n'}
              SMS 요금이 발생할 수 있습니다.
            </InfoText>
          </>
        ) : (
          <>
            <InputLabel>인증 코드</InputLabel>
            <CodeInput
              placeholder="000000"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            {timer > 0 && (
              <TimerText>
                {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
              </TimerText>
            )}
            <Button primary onPress={handleVerifyCode} disabled={loading}>
              <ButtonText primary>확인</ButtonText>
            </Button>
            <Button onPress={handleResendCode} disabled={timer > 0}>
              <ButtonText>인증 코드 다시 받기</ButtonText>
            </Button>
            <Button onPress={() => setStep('phone')}>
              <ButtonText>전화번호 변경</ButtonText>
            </Button>
          </>
        )}
      </FormContainer>
    </Container>
  );
}



