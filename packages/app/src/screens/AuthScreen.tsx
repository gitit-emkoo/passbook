import React, { useState, useCallback, useMemo } from 'react';
import { Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import styled from 'styled-components/native';
import { authApi, CompleteSignupRequest } from '../api/auth';
import { useAuthStore } from '../store/useStore';

type Step = 1 | 2 | 3 | 4;

export default function AuthScreen() {
  const [step, setStep] = useState<Step>(1);
  const login = useAuthStore((state) => state.login);

  // Step 1: 전화번호 인증
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [temporaryToken, setTemporaryToken] = useState<string | null>(null);

  // Step 2: 프로필 정보
  const [name, setName] = useState('');
  const [orgCode, setOrgCode] = useState('');

  // Step 3: 기본 설정
  const [billingType, setBillingType] = useState<'prepaid' | 'postpaid' | null>(null);
  const [absencePolicy, setAbsencePolicy] = useState<'carry_over' | 'deduct_next' | 'vanish' | null>(null);
  const [sendTarget, setSendTarget] = useState<'student_only' | 'guardian_only' | 'both' | null>(null);
  const [skipSettings, setSkipSettings] = useState(false);

  // Step 4: 완료 처리
  const [completing, setCompleting] = useState(false);

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

  // Step 1: 인증번호 요청
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
      console.error('[AuthScreen] requestCode error', error);
      Alert.alert('오류', error?.response?.data?.message || '인증번호 전송에 실패했습니다.');
    } finally {
      setRequestingCode(false);
    }
  }, [phone]);

  // Step 1: 인증번호 검증
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
        });
        // 로그인 성공하면 자동으로 홈 화면으로 이동됨
      } else if (response.isNewUser && response.temporaryToken) {
        // 신규 사용자: 회원가입 플로우
        setTemporaryToken(response.temporaryToken);
        setStep(2);
      } else {
        console.error('[AuthScreen] unexpected response format', response);
        throw new Error('예상치 못한 응답 형식입니다.');
      }
    } catch (error: any) {
      console.error('[AuthScreen] verifyCode error', error);
      Alert.alert('오류', error?.response?.data?.message || error?.message || '인증번호가 일치하지 않습니다.');
    } finally {
      setVerifyingCode(false);
    }
  }, [phone, code, login]);

  // Step 2: 다음 단계로
  const handleStep2Next = useCallback(() => {
    if (!name.trim()) {
      Alert.alert('입력 오류', '이름을 입력해주세요.');
      return;
    }
    if (!orgCode.trim()) {
      Alert.alert('입력 오류', '상호명을 입력해주세요.');
      return;
    }
    setStep(3);
  }, [name, orgCode]);

  // Step 3: 건너뛰기 또는 완료
  const handleStep3Skip = useCallback(() => {
    setSkipSettings(true);
    setStep(4);
  }, []);

  const handleStep3Complete = useCallback(() => {
    if (!billingType || !absencePolicy || !sendTarget) {
      Alert.alert('입력 오류', '모든 설정을 선택해주세요.');
      return;
    }
    setSkipSettings(false);
    setStep(4);
  }, [billingType, absencePolicy, sendTarget]);

  // Step 4: 회원가입 완료
  const handleCompleteSignup = useCallback(async () => {
    if (!temporaryToken) {
      Alert.alert('오류', '인증 정보가 없습니다. 처음부터 다시 시작해주세요.');
      return;
    }

    try {
      setCompleting(true);

      const signupData: CompleteSignupRequest = {
        name: name.trim(),
        org_code: orgCode.trim(),
        settings: skipSettings
          ? undefined
          : {
              default_billing_type: billingType!,
              default_absence_policy: absencePolicy!,
              default_send_target: sendTarget!,
            },
      };

      const response = await authApi.completeSignup(temporaryToken, signupData);
      await login(response.accessToken, {
        id: response.user.id,
        phone: response.user.phone,
        name: response.user.name,
      });
    } catch (error: any) {
      console.error('[AuthScreen] completeSignup error', error);
      Alert.alert('오류', error?.response?.data?.message || '회원가입에 실패했습니다.');
    } finally {
      setCompleting(false);
    }
  }, [temporaryToken, name, orgCode, skipSettings, billingType, absencePolicy, sendTarget, login]);

  // Step 4는 자동으로 실행
  React.useEffect(() => {
    if (step === 4 && !completing) {
      handleCompleteSignup();
    }
  }, [step]);

  const stepLabel = useMemo(() => {
    if (step === 1) {
      return '로그인 · 회원가입';
    }
    if (step === 4) {
      return '완료 중...';
    }
    const signupStep = step - 1;
    return `${signupStep}/3`;
  }, [step]);

  const step1HelperText = useMemo(() => {
    if (!codeSent) {
      return '가입 기록이 있으면 인증만으로 바로 로그인되고, 없다면 이어서 가입 설정을 진행해요.';
    }
    return '문자로 받은 6자리 인증번호를 입력하면 자동으로 가입 여부를 확인해요.';
  }, [codeSent]);

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
          <Content>
            {/* Step 표시 */}
            <StepIndicator>
              <StepText>{stepLabel}</StepText>
            </StepIndicator>

            {/* Step 1: 전화번호 인증 */}
            {step === 1 && (
              <StepContainer>
                <Title>전화번호 인증</Title>
                <Subtitle>전화번호로 빠르게 로그인 또는 회원가입하세요.</Subtitle>
                <HelperBanner>
                  <HelperBannerText>{step1HelperText}</HelperBannerText>
                </HelperBanner>

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
                      <PrimaryButtonText>인증번호 받기</PrimaryButtonText>
                    )}
                  </PrimaryButton>
                ) : (
                  <PrimaryButton onPress={handleVerifyCode} disabled={verifyingCode || code.length !== 6}>
                    {verifyingCode ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <PrimaryButtonText>인증하기</PrimaryButtonText>
                    )}
                  </PrimaryButton>
                )}

                {codeSent && (
                  <SecondaryButton
                    onPress={() => {
                      setCodeSent(false);
                      setCode('');
                    }}
                  >
                    <SecondaryButtonText>번호 다시 입력</SecondaryButtonText>
                  </SecondaryButton>
                )}
              </StepContainer>
            )}

            {/* Step 2: 프로필 정보 */}
            {step === 2 && (
              <StepContainer>
                <Title>프로필 정보</Title>
                <Subtitle>기본 정보를 입력해주세요.</Subtitle>

                <InputLabel>이름 *</InputLabel>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="선생님 이름"
                  autoCapitalize="words"
                />

                <InputLabel style={{ marginTop: 16 }}>상호명 *</InputLabel>
                <TextInput
                  value={orgCode}
                  onChangeText={setOrgCode}
                  placeholder="상호명을 입력하세요"
                  autoCapitalize="words"
                />

                <PrimaryButton onPress={handleStep2Next} disabled={!name.trim() || !orgCode.trim()}>
                  <PrimaryButtonText>다음</PrimaryButtonText>
                </PrimaryButton>
              </StepContainer>
            )}

            {/* Step 3: 기본 설정 */}
            {step === 3 && (
              <StepContainer>
                <Title>기본 설정</Title>
                <Subtitle>계약서 기본 조건을 설정하거나 건너뛸 수 있습니다.</Subtitle>

                <InputLabel>결제 방식</InputLabel>
                <OptionRow>
                  <OptionButton
                    $selected={billingType === 'prepaid'}
                    onPress={() => setBillingType('prepaid')}
                  >
                    <OptionButtonText $selected={billingType === 'prepaid'}>선불</OptionButtonText>
                  </OptionButton>
                  <OptionButton
                    $selected={billingType === 'postpaid'}
                    onPress={() => setBillingType('postpaid')}
                  >
                    <OptionButtonText $selected={billingType === 'postpaid'}>후불</OptionButtonText>
                  </OptionButton>
                </OptionRow>

                <InputLabel style={{ marginTop: 20 }}>결석 처리</InputLabel>
                <OptionRow>
                  <OptionButton
                    $selected={absencePolicy === 'deduct_next'}
                    onPress={() => setAbsencePolicy('deduct_next')}
                  >
                    <OptionButtonText $selected={absencePolicy === 'deduct_next'}>차감</OptionButtonText>
                  </OptionButton>
                  <OptionButton
                    $selected={absencePolicy === 'carry_over'}
                    onPress={() => setAbsencePolicy('carry_over')}
                  >
                    <OptionButtonText $selected={absencePolicy === 'carry_over'}>회차이월</OptionButtonText>
                  </OptionButton>
                  <OptionButton
                    $selected={absencePolicy === 'vanish'}
                    onPress={() => setAbsencePolicy('vanish')}
                  >
                    <OptionButtonText $selected={absencePolicy === 'vanish'}>소멸</OptionButtonText>
                  </OptionButton>
                </OptionRow>

                <InputLabel style={{ marginTop: 20 }}>전송 대상</InputLabel>
                <OptionRow>
                  <OptionButton
                    $selected={sendTarget === 'student_only'}
                    onPress={() => setSendTarget('student_only')}
                  >
                    <OptionButtonText $selected={sendTarget === 'student_only'}>수강생만</OptionButtonText>
                  </OptionButton>
                  <OptionButton
                    $selected={sendTarget === 'guardian_only'}
                    onPress={() => setSendTarget('guardian_only')}
                  >
                    <OptionButtonText $selected={sendTarget === 'guardian_only'}>보호자만</OptionButtonText>
                  </OptionButton>
                  <OptionButton
                    $selected={sendTarget === 'both'}
                    onPress={() => setSendTarget('both')}
                  >
                    <OptionButtonText $selected={sendTarget === 'both'}>둘 다</OptionButtonText>
                  </OptionButton>
                </OptionRow>

                <ButtonRow>
                  <SkipButton onPress={handleStep3Skip}>
                    <SkipButtonText>건너뛰기</SkipButtonText>
                  </SkipButton>
                  <PrimaryButton onPress={handleStep3Complete} disabled={!billingType || !absencePolicy || !sendTarget}>
                    <PrimaryButtonText>완료</PrimaryButtonText>
                  </PrimaryButton>
                </ButtonRow>
              </StepContainer>
            )}

            {/* Step 4: 완료 처리 */}
            {step === 4 && (
              <StepContainer>
                <ActivityIndicator size="large" color="#ff6b00" />
                <Title style={{ marginTop: 20 }}>회원가입 처리 중...</Title>
              </StepContainer>
            )}
          </Content>
        </ScrollView>
      </KeyboardAvoidingView>
    </Container>
  );
}

const Container = styled.SafeAreaView`
  flex: 1;
  background-color: #f2f2f7;
`;

const Content = styled.View`
  flex: 1;
  padding: 20px;
  justify-content: center;
`;

const StepIndicator = styled.View`
  align-items: center;
  margin-bottom: 32px;
`;

const StepText = styled.Text`
  font-size: 14px;
  color: #8e8e93;
  font-weight: 600;
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

const HelperBanner = styled.View`
  background-color: #f5f5f7;
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 20px;
`;

const HelperBannerText = styled.Text`
  font-size: 13px;
  color: #555555;
  line-height: 18px;
  text-align: center;
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

const TextInput = styled.TextInput`
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 16px;
  color: #111111;
  background-color: #ffffff;
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

const OptionRow = styled.View`
  flex-direction: row;
  gap: 8px;
  flex-wrap: wrap;
`;

const OptionButton = styled.TouchableOpacity<{ $selected: boolean }>`
  flex: 1;
  min-width: 80px;
  padding: 12px 16px;
  border-width: 1px;
  border-color: ${(props) => (props.$selected ? '#ff6b00' : '#e0e0e0')};
  border-radius: 8px;
  background-color: ${(props) => (props.$selected ? '#fff2e5' : '#ffffff')};
  align-items: center;
`;

const OptionButtonText = styled.Text<{ $selected: boolean }>`
  font-size: 14px;
  font-weight: ${(props) => (props.$selected ? 600 : 500)};
  color: ${(props) => (props.$selected ? '#ff6b00' : '#333333')};
`;

const ButtonRow = styled.View`
  flex-direction: row;
  gap: 12px;
  margin-top: 24px;
`;

const SkipButton = styled.TouchableOpacity`
  flex: 1;
  padding: 16px;
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: #ffffff;
`;

const SkipButtonText = styled.Text`
  color: #8e8e93;
  font-size: 16px;
  font-weight: 600;
`;
