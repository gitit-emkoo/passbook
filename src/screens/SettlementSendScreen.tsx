import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ActivityIndicator } from 'react-native';
import styled from 'styled-components/native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { SettlementStackParamList, SettlementStackNavigationProp } from '../navigation/AppNavigator';
import { useInvoicesStore } from '../store/useInvoicesStore';
import { InvoiceSummary } from '../types/invoices';
import { invoicesApi } from '../api/invoices';

type RouteProps = RouteProp<SettlementStackParamList, 'SettlementSend'>;

export default function SettlementSendScreen() {
  const navigation = useNavigation<SettlementStackNavigationProp>();
  const route = useRoute<RouteProps>();
  const { invoiceIds, year, month } = route.params;

  const currentMonthInvoices = useInvoicesStore((s) => s.currentMonthInvoices);
  const fetchCurrentMonth = useInvoicesStore((s) => s.fetchCurrentMonth);

  const [channel, setChannel] = useState<'kakao' | 'sms' | 'link'>('kakao');
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const selectedInvoices = useMemo<InvoiceSummary[]>(() => {
    const map = new Map<number, InvoiceSummary>();
    currentMonthInvoices.forEach((inv) => map.set(inv.id, inv));
    return invoiceIds
      .map((id) => map.get(id))
      .filter((v): v is InvoiceSummary => Boolean(v));
  }, [currentMonthInvoices, invoiceIds]);

  const canSend = (inv: InvoiceSummary) => {
    const hasPhone = Boolean(inv.student?.phone);
    const statusOk = inv.send_status === 'not_sent' || inv.send_status === 'partial';
    return hasPhone && statusOk;
  };

  const sendableInvoices = selectedInvoices.filter((inv) => canSend(inv) && !excluded.has(inv.id));
  const blockedInvoices = selectedInvoices.filter((inv) => !canSend(inv));

  const selectedCount = sendableInvoices.length;
  const selectedSum = sendableInvoices.reduce((sum, inv) => sum + (inv.final_amount ?? 0), 0);

  const toggleExclude = useCallback((id: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (selectedCount === 0) {
      Alert.alert('전송', '전송 가능한 대상이 없습니다.');
      return;
    }
    try {
      setSubmitting(true);
      await invoicesApi.send(sendableInvoices.map((i) => i.id), channel);
      Alert.alert('전송 완료', `${selectedCount}명에게 전송을 시작했습니다.`, [
        {
          text: '확인',
          onPress: async () => {
            try {
              await fetchCurrentMonth({ historyMonths: 3, force: true });
            } finally {
              navigation.goBack();
            }
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert('전송 실패', e?.message ?? '전송 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }, [channel, fetchCurrentMonth, navigation, selectedCount, sendableInvoices]);

  return (
    <Container>
      <Header>
        <Title>{`${year}년 ${month}월 전송 대상`}</Title>
        <Summary>{`선택 ${selectedCount}명 · 합계 ${selectedSum.toLocaleString()}원`}</Summary>
      </Header>

      <ChannelRow>
        <ChannelChip $active={channel === 'kakao'} onPress={() => setChannel('kakao')}>
          <ChannelChipText $active={channel === 'kakao'}>카카오</ChannelChipText>
        </ChannelChip>
        <ChannelChip $active={channel === 'sms'} onPress={() => setChannel('sms')}>
          <ChannelChipText $active={channel === 'sms'}>문자</ChannelChipText>
        </ChannelChip>
        <ChannelChip $active={channel === 'link'} onPress={() => setChannel('link')}>
          <ChannelChipText $active={channel === 'link'}>링크</ChannelChipText>
        </ChannelChip>
      </ChannelRow>

      <List>
        {blockedInvoices.length > 0 && (
          <BlockedBanner>
            <BlockedText>
              연락처 없음 등으로 전송 불가 {blockedInvoices.length}명은 아래 목록에서 비활성으로 표시됩니다.
            </BlockedText>
          </BlockedBanner>
        )}

        {selectedInvoices.map((inv) => {
          const disabled = !canSend(inv);
          const excludedThis = excluded.has(inv.id);
          return (
            <Row key={inv.id} $disabled={disabled}>
              <RowLeftTouchable
                onPress={() => {
                  if (!disabled) {
                    navigation.navigate('InvoicePreview', { invoiceId: inv.id });
                  }
                }}
                disabled={disabled}
              >
                <RowTitle>{inv.student?.name ?? '이름 없음'}</RowTitle>
                <RowSub>
                  {inv.student?.phone ? inv.student.phone : '연락처 없음'} · {inv.final_amount.toLocaleString()}원
                </RowSub>
              </RowLeftTouchable>
              <RowRight>
                {disabled ? (
                  <Badge $type="blocked">전송 불가</Badge>
                ) : (
                  <ExcludeBtn onPress={() => toggleExclude(inv.id)}>
                    <ExcludeText>{excludedThis ? '포함' : '제외'}</ExcludeText>
                  </ExcludeBtn>
                )}
              </RowRight>
            </Row>
          );
        })}
      </List>

      <Footer>
        <PrimaryButton disabled={selectedCount === 0 || submitting} onPress={handleSubmit}>
          {submitting ? <ActivityIndicator color="#ff6b00" /> : <PrimaryButtonText>전송하기</PrimaryButtonText>}
        </PrimaryButton>
      </Footer>
    </Container>
  );
}

const Container = styled.View`
  flex: 1;
  background-color: #f2f2f7;
`;

const Header = styled.View`
  padding: 16px;
  background-color: #ffffff;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const Title = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
`;

const Summary = styled.Text`
  margin-top: 4px;
  font-size: 14px;
  color: #666666;
`;

const ChannelRow = styled.View`
  flex-direction: row;
  gap: 8px;
  padding: 12px 16px;
  background-color: #ffffff;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const ChannelChip = styled.TouchableOpacity<{ $active?: boolean }>`
  padding: 8px 12px;
  border-radius: 999px;
  background-color: ${(p) => (p.$active ? '#ff6b00' : '#f3f4f6')};
`;

const ChannelChipText = styled.Text<{ $active?: boolean }>`
  color: ${(p) => (p.$active ? '#ffffff' : '#111111')};
  font-size: 14px;
  font-weight: 700;
`;

const List = styled.ScrollView`
  flex: 1;
  padding: 8px 16px 0;
`;

const BlockedBanner = styled.View`
  background-color: #fff7ed;
  border-radius: 10px;
  padding: 10px 12px;
  margin: 8px 0 4px;
`;

const BlockedText = styled.Text`
  color: #9a3412;
  font-size: 12px;
`;

const Row = styled.View<{ $disabled?: boolean }>`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  background-color: #ffffff;
  padding: 14px 12px;
  border-radius: 12px;
  margin-bottom: 8px;
  opacity: ${(p) => (p.$disabled ? 0.6 : 1)};
`;

const RowLeft = styled.View`
  flex: 1;
  margin-right: 8px;
`;

const RowLeftTouchable = styled.TouchableOpacity<{ disabled?: boolean }>`
  flex: 1;
  margin-right: 8px;
`;

const RowTitle = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111111;
`;

const RowSub = styled.Text`
  font-size: 13px;
  color: #666666;
  margin-top: 4px;
`;

const RowRight = styled.View``;

const Badge = styled.Text<{ $type: 'blocked' | 'ok' }>`
  padding: 6px 10px;
  border-radius: 8px;
  background-color: ${(p) => (p.$type === 'blocked' ? '#fee2e2' : '#ecfeff')};
  color: ${(p) => (p.$type === 'blocked' ? '#991b1b' : '#0369a1')};
  font-size: 12px;
  font-weight: 700;
`;

const ExcludeBtn = styled.TouchableOpacity`
  padding: 6px 10px;
  border-radius: 8px;
  background-color: #fff2e5;
`;

const ExcludeText = styled.Text`
  color: #ff6b00;
  font-size: 12px;
  font-weight: 700;
`;

const Footer = styled.View`
  padding: 12px 16px 20px;
  background-color: #ffffff;
  border-top-width: 1px;
  border-top-color: #f0f0f0;
`;

const PrimaryButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  padding: 14px;
  border-radius: 10px;
  background-color: ${(props) => (props.disabled ? '#ffd2ad' : '#ff6b00')};
  align-items: center;
`;

const PrimaryButtonText = styled.Text`
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
`;
