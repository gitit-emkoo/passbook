import React, { useEffect, useState } from 'react';
import { ScrollView, Alert, TouchableOpacity } from 'react-native';
import styled from 'styled-components/native';
import { useNavigation } from '@react-navigation/native';
import { invoicesApi } from '../api/invoices';
import InvoiceAmountModal from '../components/modals/InvoiceAmountModal';

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

const SectionHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
`;

const SectionTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #000;
`;

const ToggleIcon = styled.Text`
  font-size: 20px;
  color: #666;
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

const AmountInfo = styled.View`
  align-items: flex-end;
  margin-right: 12px;
`;

const Amount = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #000;
  margin-bottom: 4px;
`;

const AdjustmentText = styled.Text<{ negative?: boolean }>`
  font-size: 12px;
  color: ${(props) => (props.negative ? '#FF3B30' : '#007AFF')};
`;

const EditButton = styled.TouchableOpacity`
  padding: 8px 16px;
  background-color: #007AFF;
  border-radius: 6px;
`;

const EditButtonText = styled.Text`
  color: #fff;
  font-size: 14px;
  font-weight: bold;
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

const TotalAmount = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-top-width: 1px;
  border-top-color: #e0e0e0;
  margin-top: 8px;
`;

const TotalLabel = styled.Text`
  font-size: 16px;
  font-weight: bold;
  color: #000;
`;

const TotalValue = styled.Text`
  font-size: 20px;
  font-weight: bold;
  color: #007AFF;
`;

const EmptyText = styled.Text`
  text-align: center;
  color: #999;
  margin-top: 20px;
  font-size: 14px;
`;

interface Invoice {
  id: number;
  year: number;
  month: number;
  base_amount: number;
  auto_adjustment: number;
  manual_adjustment: number;
  final_amount: number;
  planned_count?: number;
  send_status: string;
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
 * 정산 메인 화면
 */
export default function SettlementScreen() {
  const navigation = useNavigation();
  const [currentInvoices, setCurrentInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    current: true,
  });

  useEffect(() => {
    loadCurrentInvoices();
  }, []);

  const loadCurrentInvoices = async () => {
    try {
      setLoading(true);
      const data = await invoicesApi.getCurrent();
      setCurrentInvoices(data);
    } catch (error) {
      console.error('Failed to load invoices:', error);
      Alert.alert('오류', '정산 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections({
      ...expandedSections,
      [section]: !expandedSections[section],
    });
  };

  const handleEdit = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setEditModalVisible(true);
  };

  const handleEditConfirm = () => {
    loadCurrentInvoices();
  };

  const handleSend = () => {
    (navigation as any).navigate('Settlement', {
      screen: 'SettlementSend',
      params: {
        invoices: currentInvoices,
      },
    });
  };

  const formatAmount = (amount: number) => {
    return `${amount >= 0 ? '+' : ''}${amount.toLocaleString()}원`;
  };

  const totalAmount = currentInvoices.reduce((sum, inv) => sum + inv.final_amount, 0);

  return (
    <Container>
      <ScrollView>
        <Header>
          <Title>정산</Title>
        </Header>

        <Section>
          <SectionHeader>
            <SectionTitle>
              {new Date().getMonth() + 1}월 정산 ({currentInvoices.length}명)
            </SectionTitle>
            <TouchableOpacity onPress={() => toggleSection('current')}>
              <ToggleIcon>{expandedSections.current ? '▾' : '▴'}</ToggleIcon>
            </TouchableOpacity>
          </SectionHeader>

          {expandedSections.current && (
            <>
              {loading ? (
                <EmptyText>로딩 중...</EmptyText>
              ) : currentInvoices.length === 0 ? (
                <EmptyText>이번 달 정산할 항목이 없습니다.</EmptyText>
              ) : (
                <>
                  {currentInvoices.map((invoice, index) => {
                    const ItemComponent =
                      index === currentInvoices.length - 1 ? InvoiceItemLast : InvoiceItem;
                    const hasAdjustment =
                      invoice.auto_adjustment !== 0 || invoice.manual_adjustment !== 0;

                    return (
                      <ItemComponent key={invoice.id}>
                        <StudentInfo>
                          <StudentName>{invoice.student.name}</StudentName>
                          <StudentSubject>{invoice.contract.subject}</StudentSubject>
                        </StudentInfo>
                        <AmountInfo>
                          <Amount>{invoice.final_amount.toLocaleString()}원</Amount>
                          {hasAdjustment && (
                            <>
                              {invoice.auto_adjustment !== 0 && (
                                <AdjustmentText negative={invoice.auto_adjustment < 0}>
                                  자동: {formatAmount(invoice.auto_adjustment)}
                                </AdjustmentText>
                              )}
                              {invoice.manual_adjustment !== 0 && (
                                <AdjustmentText negative={invoice.manual_adjustment < 0}>
                                  수동: {formatAmount(invoice.manual_adjustment)}
                                </AdjustmentText>
                              )}
                            </>
                          )}
                        </AmountInfo>
                        <EditButton onPress={() => handleEdit(invoice)}>
                          <EditButtonText>수정</EditButtonText>
                        </EditButton>
                      </ItemComponent>
                    );
                  })}

                  <TotalAmount>
                    <TotalLabel>총 금액</TotalLabel>
                    <TotalValue>{totalAmount.toLocaleString()}원</TotalValue>
                  </TotalAmount>
                </>
              )}
            </>
          )}
        </Section>

        {/* TODO: 지난 달 정산 카드들 (접힘 상태) */}
      </ScrollView>

      {currentInvoices.length > 0 && (
        <SendButton onPress={handleSend}>
          <SendButtonText>청구서 전송</SendButtonText>
        </SendButton>
      )}

      {selectedInvoice && (
        <InvoiceAmountModal
          visible={editModalVisible}
          onClose={() => {
            setEditModalVisible(false);
            setSelectedInvoice(null);
          }}
          onConfirm={handleEditConfirm}
          invoiceId={selectedInvoice.id}
          currentAmount={selectedInvoice.final_amount}
          baseAmount={selectedInvoice.base_amount}
          autoAdjustment={selectedInvoice.auto_adjustment}
          manualAdjustment={selectedInvoice.manual_adjustment}
        />
      )}
    </Container>
  );
}
