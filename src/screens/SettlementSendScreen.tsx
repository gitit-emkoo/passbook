import React, { useEffect, useState } from 'react';
import { ScrollView, Alert } from 'react-native';
import styled from 'styled-components/native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { invoicesApi } from '../api/invoices';

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

const InvoiceItem = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const InvoiceItemLast = styled(InvoiceItem)`
  border-bottom-width: 0;
`;

const StudentInfo = styled.View`
  flex: 1;
`;

const StudentName = styled.Text`
  font-size: 16px;
  font-weight: bold;
  color: #000;
  margin-bottom: 4px;
`;

const StudentSubject = styled.Text`
  font-size: 14px;
  color: #666;
`;

const Amount = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #000;
`;

const Checkbox = styled.TouchableOpacity<{ selected?: boolean }>`
  width: 24px;
  height: 24px;
  border-width: 2px;
  border-color: ${(props) => (props.selected ? '#007AFF' : '#ccc')};
  background-color: ${(props) => (props.selected ? '#007AFF' : '#fff')};
  border-radius: 4px;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
`;

const Checkmark = styled.Text`
  color: #fff;
  font-size: 14px;
  font-weight: bold;
`;

const WarningText = styled.Text`
  font-size: 14px;
  color: #FF9800;
  margin-top: 8px;
`;

const SendButton = styled.TouchableOpacity`
  background-color: #4CAF50;
  padding: 16px;
  margin: 16px;
  border-radius: 8px;
  align-items: center;
`;

const SendButtonText = styled.Text`
  color: #fff;
  font-size: 18px;
  font-weight: bold;
`;

const EmptyText = styled.Text`
  text-align: center;
  color: #999;
  margin-top: 20px;
  font-size: 14px;
`;

interface Invoice {
  id: number;
  final_amount: number;
  student: {
    id: number;
    name: string;
    phone: string;
  };
  contract: {
    id: number;
    subject: string;
  };
}

/**
 * 전송 대상 확인 화면
 */
export default function SettlementSendScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const [sendableInvoices, setSendableInvoices] = useState<Invoice[]>([]);
  const [notSendableInvoices, setNotSendableInvoices] = useState<Invoice[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadSendableInvoices();
  }, []);

  const loadSendableInvoices = async () => {
    try {
      setLoading(true);
      const data = await invoicesApi.getSendable();
      setSendableInvoices(data.sendable || []);
      setNotSendableInvoices(data.not_sendable || []);
      // 기본적으로 모든 전송 가능한 항목 선택
      setSelectedIds(data.sendable?.map((inv: Invoice) => inv.id) || []);
    } catch (error) {
      console.error('Failed to load sendable invoices:', error);
      Alert.alert('오류', '전송 가능한 항목을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSend = async () => {
    if (selectedIds.length === 0) {
      Alert.alert('알림', '전송할 항목을 선택해주세요.');
      return;
    }

    try {
      setSending(true);
      const results = await invoicesApi.send(selectedIds, 'sms'); // TODO: 채널 선택 기능 추가
      Alert.alert('완료', `${results.length}개의 청구서가 전송되었습니다.`, [
        {
          text: '확인',
          onPress: () => {
            (navigation as any).goBack();
          },
        },
      ]);
    } catch (error) {
      console.error('Failed to send invoices:', error);
      Alert.alert('오류', '청구서 전송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Container>
      <ScrollView>
        <Header>
          <Title>청구서 전송</Title>
        </Header>

        <Section>
          <SectionTitle>전송 가능 ({selectedIds.length}개 선택)</SectionTitle>
          {loading ? (
            <EmptyText>로딩 중...</EmptyText>
          ) : sendableInvoices.length === 0 ? (
            <EmptyText>전송 가능한 항목이 없습니다.</EmptyText>
          ) : (
            sendableInvoices.map((invoice, index) => {
              const ItemComponent =
                index === sendableInvoices.length - 1 ? InvoiceItemLast : InvoiceItem;
              const isSelected = selectedIds.includes(invoice.id);

              return (
                <ItemComponent key={invoice.id}>
                  <Checkbox selected={isSelected} onPress={() => toggleSelection(invoice.id)}>
                    {isSelected && <Checkmark>✓</Checkmark>}
                  </Checkbox>
                  <StudentInfo>
                    <StudentName>{invoice.student.name}</StudentName>
                    <StudentSubject>{invoice.contract.subject}</StudentSubject>
                  </StudentInfo>
                  <Amount>{invoice.final_amount.toLocaleString()}원</Amount>
                </ItemComponent>
              );
            })
          )}
        </Section>

        {notSendableInvoices.length > 0 && (
          <Section>
            <SectionTitle>전송 불가 ({notSendableInvoices.length}개)</SectionTitle>
            <WarningText>
              수신자 정보가 없어 전송할 수 없습니다. 계약서에서 수신자를 설정해주세요.
            </WarningText>
            {notSendableInvoices.map((invoice, index) => {
              const ItemComponent =
                index === notSendableInvoices.length - 1 ? InvoiceItemLast : InvoiceItem;

              return (
                <ItemComponent key={invoice.id}>
                  <StudentInfo>
                    <StudentName>{invoice.student.name}</StudentName>
                    <StudentSubject>{invoice.contract.subject}</StudentSubject>
                  </StudentInfo>
                  <Amount>{invoice.final_amount.toLocaleString()}원</Amount>
                </ItemComponent>
              );
            })}
          </Section>
        )}
      </ScrollView>

      {selectedIds.length > 0 && (
        <SendButton onPress={handleSend} disabled={sending}>
          <SendButtonText>{sending ? '전송 중...' : `전송 (${selectedIds.length}개)`}</SendButtonText>
        </SendButton>
      )}
    </Container>
  );
}



