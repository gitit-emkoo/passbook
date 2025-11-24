import React, { useState, useCallback } from 'react';
import { Alert, Linking, Platform, Clipboard } from 'react-native';
import Modal from 'react-native-modal';
import styled from 'styled-components/native';

interface ContractSendModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (channel: 'sms' | 'link') => void;
  contractLink: string;
  recipientPhone?: string;
  billingType?: 'prepaid' | 'postpaid';
}

type Channel = 'sms' | 'link' | 'kakao';

const CHANNEL_OPTIONS: Array<{ value: Channel; label: string; enabled: boolean }> = [
  { value: 'sms', label: 'SMS', enabled: true },
  { value: 'kakao', label: '카카오 (준비 중)', enabled: false },
  { value: 'link', label: '링크 복사', enabled: true },
];

export default function ContractSendModal({
  visible,
  onClose,
  onSend,
  contractLink,
  recipientPhone,
  billingType,
}: ContractSendModalProps) {
  const [sending, setSending] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  const handleConfirm = useCallback(async () => {
    if (!selectedChannel) {
      Alert.alert('계약', '전송 방식을 선택해주세요.');
      return;
    }

    if (selectedChannel === 'kakao') {
      Alert.alert('준비 중', '카카오 전송은 준비 중입니다.');
      return;
    }

    try {
      setSending(true);

      if (selectedChannel === 'sms') {
        if (!recipientPhone) {
          Alert.alert('오류', '수신자 번호가 없습니다.');
          return;
        }
        const message = `계약서 확인 링크: ${contractLink}`;
        const smsUrl = Platform.select({
          ios: `sms:${recipientPhone}&body=${encodeURIComponent(message)}`,
          android: `sms:${recipientPhone}?body=${encodeURIComponent(message)}`,
        });

        if (smsUrl && (await Linking.canOpenURL(smsUrl))) {
          await Linking.openURL(smsUrl);
        } else {
          await Clipboard.setString(contractLink);
          Alert.alert('완료', '계약서 링크가 클립보드에 복사되었습니다.');
        }
        await onSend('sms');
      } else if (selectedChannel === 'link') {
        await Clipboard.setString(contractLink);
        Alert.alert('완료', '계약서 링크가 클립보드에 복사되었습니다.');
        await onSend('link');
      }

      onClose();
    } catch (error: any) {
      console.error('[ContractSendModal] send error', error);
      Alert.alert('오류', error?.message || '계약서 전송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  }, [selectedChannel, contractLink, recipientPhone, onSend, onClose]);

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      style={{ margin: 0, justifyContent: 'flex-end' }}
    >
      <ModalContainer>
        <ModalHeader>
          <ModalTitle>계약서 전송</ModalTitle>
          <CloseButton onPress={onClose}>
            <CloseButtonText>닫기</CloseButtonText>
          </CloseButton>
        </ModalHeader>

        <ModalContent>
          <MainInfoText>계약서를 전송할 방법을 선택하세요.</MainInfoText>
          {billingType === 'prepaid' && (
            <PrepaidInfoText>
              선불 조건의 계약은 계약서와 이번 달 분의 청구서가 동시에 전송됩니다.
            </PrepaidInfoText>
          )}

          <ChannelList>
            {CHANNEL_OPTIONS.map((option) => {
              const disabled = option.value === 'sms' && !recipientPhone;
              const isSelected = selectedChannel === option.value;
              return (
                <ChannelButton
                  key={option.value}
                  disabled={!option.enabled || disabled || sending}
                  $selected={isSelected}
                  onPress={() => setSelectedChannel(option.value)}
                >
                  <ChannelLabel>{option.label}</ChannelLabel>
                  {!option.enabled && <ChannelBadge>준비 중</ChannelBadge>}
                </ChannelButton>
              );
            })}
          </ChannelList>

          <SendButton onPress={handleConfirm} disabled={!selectedChannel || sending}>
            <SendButtonText>전송하기</SendButtonText>
          </SendButton>
        </ModalContent>
      </ModalContainer>
    </Modal>
  );
}

const ModalContainer = styled.View`
  background-color: #ffffff;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  max-height: 90%;
  padding-bottom: 40px;
`;

const ModalHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom-width: 1px;
  border-bottom-color: #e0e0e0;
`;

const ModalTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
`;

const CloseButton = styled.TouchableOpacity`
  padding: 8px;
`;

const CloseButtonText = styled.Text`
  font-size: 16px;
  color: #ff6b00;
  font-weight: 600;
`;

const ModalContent = styled.View`
  padding: 20px;
  gap: 16px;
`;

const MainInfoText = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 8px;
  line-height: 22px;
`;

const PrepaidInfoText = styled.Text`
  font-size: 14px;
  color: #ff3b30;
  margin-bottom: 4px;
  line-height: 20px;
`;

const ChannelList = styled.View`
  gap: 10px;
`;

const ChannelButton = styled.TouchableOpacity<{ $selected?: boolean }>`
  border-width: 1px;
  border-color: ${(p) => (p.$selected ? '#ff6b00' : '#e0e0e0')};
  border-radius: 12px;
  padding: 14px 16px;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  opacity: ${(p) => (p.disabled ? 0.5 : 1)};
  background-color: ${(p) => (p.$selected ? '#fff2e5' : '#ffffff')};
`;

const ChannelLabel = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #111111;
`;

const ChannelBadge = styled.Text`
  font-size: 12px;
  color: #ff6b00;
`;

const SendButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  background-color: #ff6b00;
  padding: 16px;
  border-radius: 12px;
  align-items: center;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;

const SendButtonText = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
`;

