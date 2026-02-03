import React, { useRef, useCallback, useState, useEffect } from 'react';
import { Modal, Alert, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import styled from 'styled-components/native';
import Signature from 'react-native-signature-canvas';

const LoadingOverlay = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const LoadingText = styled.Text`
  margin-top: 12px;
  font-size: 16px;
  font-weight: 600;
  color: #333;
`;

const ModalOverlay = styled.View`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.5);
  justify-content: center;
  align-items: center;
`;

const ModalContent = styled.View`
  background-color: #fff;
  border-radius: 12px;
  padding: 20px;
  width: 90%;
  max-height: 90%;
`;

const ModalTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #000;
  margin-bottom: 16px;
  text-align: center;
`;

const InputLabel = styled.Text`
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
`;

const AmountInput = styled.TextInput<{ disabled?: boolean }>`
  border-width: 1px;
  border-color: #ddd;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #000;
  background-color: ${(props: { disabled?: boolean }) => (props.disabled ? '#f5f5f5' : '#fff')};
`;

const SignatureContainer = styled.View`
  width: 100%;
  height: 200px;
  border-width: 1px;
  border-color: #ddd;
  border-radius: 8px;
  margin-bottom: 16px;
  background-color: #fff;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  gap: 12px;
`;

const Button = styled.TouchableOpacity<{ variant?: 'primary' | 'secondary'; disabled?: boolean }>`
  flex: 1;
  padding: 12px;
  border-radius: 6px;
  align-items: center;
  background-color: ${(props: { variant?: 'primary' | 'secondary'; disabled?: boolean }) => {
    if (props.disabled) return '#e0e0e0';
    return props.variant === 'primary' ? '#007AFF' : '#e0e0e0';
  }};
  opacity: ${(props: { disabled?: boolean }) => (props.disabled ? 0.5 : 1)};
`;

const ButtonText = styled.Text<{ variant?: 'primary' | 'secondary' }>`
  color: ${(props: { variant?: 'primary' | 'secondary' }) => (props.variant === 'primary' ? '#fff' : '#000')};
  font-size: 16px;
  font-weight: bold;
`;

interface AttendanceSignatureModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (signature: string, amount?: number, memo?: string) => Promise<void>;
  studentName: string;
  contractType: 'sessions' | 'amount'; // 횟수권 또는 금액권
  remainingAmount?: number; // 금액권: 잔여 금액 (잔액 체크용)
  requireSignature?: boolean; // 서명 필수 여부 (기본값: true, 미처리내역에서는 false)
}

/**
 * 사용 후 서명 모달
 */
export default function AttendanceSignatureModal({
  visible,
  onClose,
  onConfirm,
  studentName,
  contractType,
  remainingAmount,
  requireSignature = true, // 기본값: 서명 필수
}: AttendanceSignatureModalProps) {
  const signatureRef = useRef<any>(null);
  const [amount, setAmount] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSessions = contractType === 'sessions';

  // 모달이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!visible) {
      setAmount('');
      setMemo('');
      setIsSubmitting(false);
      signatureRef.current?.clearSignature();
    }
  }, [visible]);

  const handleClear = () => {
    signatureRef.current?.clearSignature();
  };

  const handleSignatureOk = useCallback(async (base64: string) => {
    // 서명 필수인 경우 서명 확인
    if (requireSignature && !base64) {
      Alert.alert('알림', '서명을 입력해주세요.');
      return;
    }

    // 금액권인 경우 금액 입력 확인
    if (!isSessions) {
      const amountNum = amount.trim() ? Number(amount.replace(/,/g, '')) : 0;
      if (!amount.trim() || amountNum <= 0) {
        Alert.alert('알림', '차감금액을 입력해주세요.');
        return;
      }
      // 잔액 체크: 잔액보다 많이 사용할 수 없음
      if (remainingAmount !== undefined && amountNum > remainingAmount) {
        Alert.alert('알림', `잔액(${remainingAmount.toLocaleString()}원)보다 많이 사용할 수 없습니다.`);
        return;
      }
    }

    // 로딩 시작
    setIsSubmitting(true);
    
    try {
      // onConfirm 호출 (부모에서 API 호출 수행)
      // 서명이 없으면 빈 문자열 전달
      const signatureData = base64 || '';
      if (!isSessions) {
        const amountNum = amount.trim() ? Number(amount.replace(/,/g, '')) : 0;
        await onConfirm(signatureData, amountNum, memo.trim() || undefined);
      } else {
        await onConfirm(signatureData, undefined, memo.trim() || undefined);
      }
      // 완료 후 모달 닫기 (부모에서 처리하지만 안전장치)
      setAmount('');
      setMemo('');
      setIsSubmitting(false);
      onClose();
    } catch (error) {
      setIsSubmitting(false);
      // 에러는 부모에서 처리하므로 여기서는 로딩만 해제
    }
  }, [onConfirm, onClose, amount, memo, isSessions, remainingAmount, requireSignature]);

  const handleConfirm = () => {
    // 서명이 필수가 아닌 경우 직접 처리
    if (!requireSignature) {
      handleSignatureOk('');
      return;
    }
    // Signature 컴포넌트의 내장 확인 버튼을 트리거하기 위해 readSignature 호출
    signatureRef.current?.readSignature();
  };

  const handleClose = () => {
    if (isSubmitting) return; // 제출 중에는 닫기 방지
    setAmount('');
    setMemo('');
    setIsSubmitting(false);
    signatureRef.current?.clearSignature();
    onClose();
  };

  // 금액 입력 포맷팅 (천단위 콤마)
  const handleAmountChange = (text: string) => {
    const numericValue = text.replace(/[^0-9]/g, '');
    if (numericValue) {
      const formatted = Number(numericValue).toLocaleString();
      setAmount(formatted);
    } else {
      setAmount('');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ModalOverlay>
          <ModalContent>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ flexGrow: 1 }}
            >
              <ModalTitle>{studentName} 사용 서명</ModalTitle>
              
              {/* 차감 금액/횟수 입력 */}
              <InputLabel>{isSessions ? '사용 횟수' : '차감 금액'}</InputLabel>
              <AmountInput
                value={isSessions ? '1회' : amount}
                onChangeText={isSessions ? undefined : handleAmountChange}
                placeholder={isSessions ? undefined : '차감금액 입력'}
                keyboardType="numeric"
                editable={!isSessions}
                disabled={isSessions}
              />
              {/* 잔액 표시 (금액권일 때만) */}
              {!isSessions && remainingAmount !== undefined && (
                <InputLabel style={{ fontSize: 12, color: '#999', marginTop: -12, marginBottom: 16 }}>
                  잔여 금액: {remainingAmount.toLocaleString()}원
                </InputLabel>
              )}

              {/* 서비스 내용 입력 */}
              <InputLabel>서비스 내용 (선택사항)</InputLabel>
              <TextInput
                value={memo}
                onChangeText={setMemo}
                placeholder="서비스 내용을 입력하세요"
                multiline
                numberOfLines={3}
                style={{
                  borderWidth: 1,
                  borderColor: '#ddd',
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 16,
                  fontSize: 14,
                  color: '#000',
                  backgroundColor: '#fff',
                  textAlignVertical: 'top',
                }}
              />

              {requireSignature && (
                <>
                  <InputLabel>서명</InputLabel>
                  <SignatureContainer>
                    <Signature
                      ref={signatureRef}
                      onOK={handleSignatureOk}
                      descriptionText="서명해주세요"
                      clearText="지우기"
                      confirmText="확인"
                      webStyle={`
                        .m-signature-pad {
                          box-shadow: none;
                          border: none;
                        }
                        .m-signature-pad--body {
                          border: none;
                        }
                        .m-signature-pad--body canvas {
                          border-radius: 8px;
                        }
                      `}
                    />
                  </SignatureContainer>
                </>
              )}
              <ButtonRow>
                {requireSignature && (
                  <Button variant="secondary" onPress={handleClear} disabled={isSubmitting}>
                    <ButtonText variant="secondary">지우기</ButtonText>
                  </Button>
                )}
                <Button variant="secondary" onPress={handleClose} disabled={isSubmitting}>
                  <ButtonText variant="secondary">취소</ButtonText>
                </Button>
                <Button variant="primary" onPress={handleConfirm} disabled={isSubmitting}>
                  <ButtonText variant="primary">확인</ButtonText>
                </Button>
              </ButtonRow>
            </ScrollView>
            {isSubmitting && (
              <LoadingOverlay>
                <ActivityIndicator size="large" color="#1d42d8" />
                <LoadingText>사용 처리 중입니다...</LoadingText>
              </LoadingOverlay>
            )}
          </ModalContent>
        </ModalOverlay>
      </KeyboardAvoidingView>
    </Modal>
  );
}



