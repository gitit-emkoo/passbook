import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  RefreshControl,
} from 'react-native';
import styled from 'styled-components/native';
import { inquiriesApi, InquiryItem } from '../api/inquiries';

const formatDateTime = (dateString: string | null): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hours}:${minutes}`;
  } catch {
    return dateString;
  }
};

type InquiryTab = 'form' | 'list';

function InquiryScreen() {
  const [activeTab, setActiveTab] = useState<InquiryTab>('form');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [inquiries, setInquiries] = useState<InquiryItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadMyInquiries = async () => {
    try {
      setLoadingList(true);
      const data = await inquiriesApi.getMyInquiries();
      setInquiries(data);
    } catch (error) {
      console.error('[InquiryScreen] Failed to load inquiries', error);
      Alert.alert('오류', '문의 내역을 불러오지 못했습니다.');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'list' && inquiries.length === 0 && !loadingList) {
      loadMyInquiries();
    }
  }, [activeTab]);

  const handleSubmit = async () => {
    if (!content.trim()) {
      Alert.alert('입력 필요', '문의 내용을 입력해주세요.');
      return;
    }

    if (submitting) {
      return;
    }

    try {
      setSubmitting(true);
      await inquiriesApi.create({
        title: subject.trim() || undefined,
        content: content.trim(),
      });

      Alert.alert(
        '접수 완료',
        '문의가 정상적으로 접수되었습니다.\n담당자가 확인 후 연락드리겠습니다.',
      );

      setSubject('');
      setContent('');

      // 방금 문의한 내역이 리스트에 보이도록 탭 전환 및 재로딩
      setActiveTab('list');
      await loadMyInquiries();
    } catch (error) {
      console.error('[InquiryScreen] Failed to submit inquiry', error);
      Alert.alert('오류', '문의 접수에 실패했습니다. 네트워크 상태를 확인 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Container>
        <TabRow>
          <TabButton active={activeTab === 'form'} onPress={() => setActiveTab('form')}>
            <TabButtonText active={activeTab === 'form'}>문의하기</TabButtonText>
          </TabButton>
          <TabButton active={activeTab === 'list'} onPress={() => setActiveTab('list')}>
            <TabButtonText active={activeTab === 'list'}>내 문의 내역</TabButtonText>
          </TabButton>
        </TabRow>

        {activeTab === 'form' ? (
          <>
            <HelperText>
              앱 사용 중 궁금한 점이나 불편한 점이 있다면 자유롭게 남겨주세요.
            </HelperText>

            <Label>제목</Label>
            <Input
              placeholder="예) 결제 관련 문의"
              value={subject}
              onChangeText={setSubject}
              returnKeyType="next"
            />

            <Label>문의 내용</Label>
            <MultilineInput
              placeholder="문의 내용을 자세히 작성해 주세요."
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
            />

            <SubmitButton onPress={handleSubmit} disabled={submitting}>
              <SubmitButtonText>{submitting ? '전송 중...' : '문의 보내기'}</SubmitButtonText>
            </SubmitButton>

            <FooterInfo>
              <FooterText>문의는 영업일 3일내로 답변해드립니다. </FooterText>
            </FooterInfo>
          </>
        ) : (
          <>
            {loadingList && inquiries.length === 0 ? (
              <ListLoadingContainer>
                <ActivityIndicator size="small" color="#1d42d8" />
              </ListLoadingContainer>
            ) : (
              <FlatList
                data={inquiries}
                keyExtractor={(item) => String(item.id)}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={async () => {
                      try {
                        setRefreshing(true);
                        await loadMyInquiries();
                      } finally {
                        setRefreshing(false);
                      }
                    }}
                    tintColor="#1d42d8"
                  />
                }
                ListEmptyComponent={
                  <EmptyContainer>
                    <EmptyText>아직 남긴 문의가 없습니다.</EmptyText>
                  </EmptyContainer>
                }
                renderItem={({ item }) => (
                  <InquiryItemContainer>
                    <InquiryHeaderRow>
                      <StatusBadge status={item.status}>
                        <StatusBadgeText status={item.status}>
                          {item.status === 'answered' ? '답변 완료' : '접수'}
                        </StatusBadgeText>
                      </StatusBadge>
                      <InquiryDateText>{formatDateTime(item.created_at)}</InquiryDateText>
                    </InquiryHeaderRow>
                    <InquiryTitle numberOfLines={1}>
                      {item.title || '제목 없음'}
                    </InquiryTitle>
                    <InquiryContentPreview numberOfLines={2}>
                      {item.content}
                    </InquiryContentPreview>
                    {item.answer && (
                      <InquiryAnswerBox>
                        <InquiryAnswerHeader>
                          <InquiryAnswerLabel>관리자 답변</InquiryAnswerLabel>
                          {item.answered_at && (
                            <InquiryAnswerDateText>
                              {formatDateTime(item.answered_at)}
                            </InquiryAnswerDateText>
                          )}
                        </InquiryAnswerHeader>
                        <InquiryAnswerText>{item.answer}</InquiryAnswerText>
                      </InquiryAnswerBox>
                    )}
                  </InquiryItemContainer>
                )}
                contentContainerStyle={{ paddingVertical: 8 }}
              />
            )}
          </>
        )}
      </Container>
    </KeyboardAvoidingView>
  );
}

export default InquiryScreen;

const Container = styled.View`
  flex: 1;
  padding: 20px 16px 32px;
  background-color: #ffffff;
`;

const HelperText = styled.Text`
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 16px;
  line-height: 20px;
`;

const Label = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 8px;
`;

const Input = styled.TextInput`
  border-width: 1px;
  border-color: #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  margin-bottom: 16px;
`;

const MultilineInput = styled.TextInput`
  border-width: 1px;
  border-color: #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  font-size: 14px;
  min-height: 160px;
  margin-bottom: 20px;
`;

const SubmitButton = styled.TouchableOpacity`
  background-color: #1d42d8;
  padding: 14px;
  border-radius: 8px;
  align-items: center;
`;

const SubmitButtonText = styled.Text`
  color: #ffffff;
  font-size: 15px;
  font-weight: 600;
`;

const FooterInfo = styled.View`
  margin-top: 16px;
  align-items: center;
`;

const FooterText = styled.Text`
  font-size: 12px;
  color: #9ca3af;
`;

const TabRow = styled.View`
  flex-direction: row;
  background-color: #f3f4f6;
  border-radius: 999px;
  padding: 4px;
  margin-bottom: 16px;
`;

interface TabButtonProps {
  active: boolean;
}

const TabButton = styled.TouchableOpacity<TabButtonProps>`
  flex: 1;
  padding-vertical: 8px;
  border-radius: 999px;
  align-items: center;
  background-color: ${(props: TabButtonProps) => (props.active ? '#ffffff' : 'transparent')};
`;

interface TabButtonTextProps {
  active: boolean;
}

const TabButtonText = styled.Text<TabButtonTextProps>`
  font-size: 14px;
  font-weight: 600;
  color: ${(props: TabButtonTextProps) => (props.active ? '#1d42d8' : '#6b7280')};
`;

const ListLoadingContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  padding-top: 40px;
`;

const EmptyContainer = styled.View`
  padding: 40px 16px;
  align-items: center;
`;

const EmptyText = styled.Text`
  font-size: 13px;
  color: #9ca3af;
`;

const InquiryItemContainer = styled.View`
  padding: 14px 12px;
  margin-horizontal: 4px;
  margin-vertical: 4px;
  border-radius: 12px;
  background-color: #f9fafb;
`;

const InquiryHeaderRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  flex-wrap: wrap;
  gap: 4px;
`;

const InquiryDateText = styled.Text`
  font-size: 11px;
  color: #9ca3af;
`;

interface StatusBadgeProps {
  status: 'pending' | 'answered';
}

const StatusBadge = styled.View<StatusBadgeProps>`
  padding: 3px 8px;
  border-radius: 999px;
  background-color: ${(props: StatusBadgeProps) =>
    props.status === 'answered' ? 'rgba(29,66,216,0.12)' : '#ffe5e5'};
`;

interface StatusBadgeTextProps {
  status: 'pending' | 'answered';
}

const StatusBadgeText = styled.Text<StatusBadgeTextProps>`
  font-size: 11px;
  font-weight: 600;
  color: ${(props: StatusBadgeTextProps) =>
    (props.status === 'answered' ? '#1d42d8' : '#ff6b00')};
`;

const InquiryTitle = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 2px;
`;

const InquiryContentPreview = styled.Text`
  font-size: 13px;
  color: #4b5563;
  margin-top: 2px;
`;

const InquiryAnswerBox = styled.View`
  margin-top: 8px;
  padding: 10px;
  border-radius: 8px;
  background-color: #eef2ff;
`;

const InquiryAnswerHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  flex-wrap: wrap;
  gap: 4px;
`;

const InquiryAnswerLabel = styled.Text`
  font-size: 12px;
  font-weight: 600;
  color: #3730a3;
`;

const InquiryAnswerDateText = styled.Text`
  font-size: 11px;
  color: #6b7280;
`;

const InquiryAnswerText = styled.Text`
  font-size: 13px;
  color: #111827;
  line-height: 18px;
`;


