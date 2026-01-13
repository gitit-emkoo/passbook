import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, Alert, ScrollView, Image } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import styled from 'styled-components/native';
import { attendanceApi } from '../api/attendance';
import AttendanceAbsenceModal from '../components/modals/AttendanceAbsenceModal';
import AttendanceSignatureModal from '../components/modals/AttendanceSignatureModal';
import AttendanceConfirmModal from '../components/modals/AttendanceConfirmModal';
import { useStudentsStore } from '../store/useStudentsStore';

const emptyStateIcon = require('../../assets/p3.png');

interface UnprocessedItem {
  contract_id: number;
  student_id: number;
  student_name: string;
  subject: string;
  day_of_week: string[];
  time: string | null;
  missed_date: string; // YYYY-MM-DD
  reservation_id: number; // 예약 ID
  is_amount_based?: boolean; // 금액권 여부
  remaining_amount?: number; // 잔여 금액 (금액권일 때만)
}

function UnprocessedAttendanceContent() {
  const navigation = useNavigation();
  const fetchStudentDetail = useStudentsStore((state) => state.fetchStudentDetail);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<UnprocessedItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<UnprocessedItem | null>(null);
  const [showAttendanceSignatureModal, setShowAttendanceSignatureModal] = useState(false);
  const [showAttendanceAbsenceModal, setShowAttendanceAbsenceModal] = useState(false);
  const [showAttendanceConfirmModal, setShowAttendanceConfirmModal] = useState(false);

  const loadUnprocessed = useCallback(async () => {
    try {
      setLoading(true);
      const data = await attendanceApi.getUnprocessed();
      setItems(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('[UnprocessedAttendance] load error', error);
      Alert.alert('오류', '미처리 출결을 불러오지 못했습니다.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUnprocessed();
    }, [loadUnprocessed]),
  );

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    return `${month}/${day}(${dayOfWeek})`;
  };

  const formatDayOfWeek = (dayOfWeekArray: string[]): string => {
    const dayNames: Record<string, string> = {
      MON: '월',
      TUE: '화',
      WED: '수',
      THU: '목',
      FRI: '금',
      SAT: '토',
      SUN: '일',
    };
    return dayOfWeekArray.map((d) => dayNames[d] || d).join('/');
  };

  const handlePresent = useCallback((item: UnprocessedItem) => {
    setSelectedItem(item);
    // 금액권인 경우 AttendanceSignatureModal을 열어서 금액 입력 받기
    if (item.is_amount_based) {
      setShowAttendanceSignatureModal(true);
    } else {
      // 횟수권인 경우 AttendanceConfirmModal 사용
      setShowAttendanceConfirmModal(true);
    }
  }, []);

  const handleAbsence = useCallback((item: UnprocessedItem) => {
    setSelectedItem(item);
    setShowAttendanceAbsenceModal(true);
  }, []);

  const handleAttendancePresentSubmit = useCallback(
    async (signatureData?: string, amount?: number, memo?: string) => {
      if (!selectedItem) return;

      try {
        const occurredAt = new Date(selectedItem.missed_date);
        occurredAt.setHours(12, 0, 0, 0); // 정오로 설정

        await attendanceApi.create({
          student_id: selectedItem.student_id,
          contract_id: selectedItem.contract_id,
          occurred_at: occurredAt.toISOString(),
          status: 'present',
          signature_data: signatureData,
          amount: amount, // 금액권인 경우 차감 금액
          memo_public: memo, // 서비스 내용
        });

        Alert.alert('완료', '이용권 사용처리가 완료되었습니다.');
        await loadUnprocessed();
        // 해당 수강생의 상세 정보도 새로고침 (출결 기록 반영)
        if (selectedItem?.student_id) {
          await fetchStudentDetail(selectedItem.student_id, { force: true }).catch(() => {
            // 에러는 무시 (수강생 상세 화면이 열려있지 않을 수 있음)
          });
        }
        setSelectedItem(null);
      } catch (error: any) {
        console.error('[UnprocessedAttendance] create attendance error', error);
        Alert.alert('오류', error?.message || '출석 기록에 실패했습니다.');
      }
    },
    [selectedItem, loadUnprocessed, fetchStudentDetail],
  );

  const handleAttendanceAbsenceSubmit = useCallback(
    async (data: {
      status: 'vanish' | 'substitute'; // 소멸 = vanish, 대체 = substitute
      substitute_at?: string;
      reason: string;
      amount?: number | null; // 차감 금액 (금액권 소멸 시)
    }) => {
      if (!selectedItem) return;

      try {
        const occurredAt = new Date(selectedItem.missed_date);
        occurredAt.setHours(12, 0, 0, 0);

        await attendanceApi.create({
          student_id: selectedItem.student_id,
          contract_id: selectedItem.contract_id,
          occurred_at: occurredAt.toISOString(),
          status: data.status,
          substitute_at: data.substitute_at,
          memo_public: data.reason,
          reservation_id: selectedItem.reservation_id, // 예약 ID 전달
          // 금액권 소멸 시 차감 금액 (입력하지 않으면 undefined)
          amount: data.amount ?? undefined,
        });

        Alert.alert('완료', `${data.status === 'vanish' ? '소멸' : '대체'}이 기록되었습니다.`);
        await loadUnprocessed();
        // 해당 수강생의 상세 정보도 새로고침 (출결 기록 반영)
        if (selectedItem?.student_id) {
          await fetchStudentDetail(selectedItem.student_id, { force: true }).catch(() => {
            // 에러는 무시 (수강생 상세 화면이 열려있지 않을 수 있음)
          });
        }
        setSelectedItem(null);
      } catch (error: any) {
        console.error('[UnprocessedAttendance] create absence error', error);
        
        // 에러 메시지 추출 및 사용자 친화적 메시지로 변환
        let errorMessage = '기록에 실패했습니다.';
        
        // 백엔드에서 직접 오는 메시지 우선 확인
        const backendMessage = error?.response?.data?.message;
        if (typeof backendMessage === 'string') {
          errorMessage = backendMessage;
        } else if (typeof error?.message === 'string') {
          errorMessage = error.message;
        }
        
        // "잘못된 요청입니다:" 접두사 제거 및 메시지 정리
        if (errorMessage.includes('잘못된 요청입니다:')) {
          errorMessage = errorMessage.replace('잘못된 요청입니다:', '').trim();
        }
        
        // 중복 예약 관련 메시지인 경우 더 명확하게 표시
        if (errorMessage.includes('이미 예약된 날짜') || errorMessage.includes('중복')) {
          errorMessage = '이미 예약이 등록된 날짜입니다. 다른 날짜를 선택해주세요.';
        }
        
        Alert.alert('알림', errorMessage);
      }
    },
    [selectedItem, loadUnprocessed, fetchStudentDetail],
  );

  const groupedItems = useMemo(() => {
    const groups: Record<string, UnprocessedItem[]> = {};
    items.forEach((item) => {
      if (!groups[item.missed_date]) {
        groups[item.missed_date] = [];
      }
      groups[item.missed_date].push(item);
    });
    return groups;
  }, [items]);

  if (loading && items.length === 0) {
    return (
      <Container>
        <CenteredContainer>
          <ActivityIndicator size="large" color="#ff6b00" />
          <CenteredText>미처리 출결을 불러오는 중...</CenteredText>
        </CenteredContainer>
      </Container>
    );
  }

  if (items.length === 0) {
    return (
      <Container>
        <CenteredContainer>
          <EmptyStateImage source={emptyStateIcon} resizeMode="contain" />
          <CenteredText>미처리 내역이 없습니다.</CenteredText>
          <CenteredSubText>
            관리 일정(오늘 방문 고객)에 등록되었으나 처리되지 않은 내역을 여기에서 처리할 수 있어요.
          </CenteredSubText>
        </CenteredContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Subtitle>총 {items.length}건</Subtitle>
      </Header>
      <ScrollView showsVerticalScrollIndicator={false}>
        {Object.keys(groupedItems)
          .sort()
          .map((date) => (
            <DateGroup key={date}>
              <DateHeader>{formatDate(date)}</DateHeader>
              {groupedItems[date].map((item, index) => (
                <ItemCard key={`${item.contract_id}-${item.missed_date}-${index}`}>
                  <ItemHeader>
                    <StudentName>{item.student_name}</StudentName>
                    <Subject>{item.subject}</Subject>
                  </ItemHeader>
                  <ItemInfo>
                    <ItemInfoText>{formatDayOfWeek(item.day_of_week)}</ItemInfoText>
                    {item.time && <ItemInfoText> • {item.time}</ItemInfoText>}
                  </ItemInfo>
                  <ButtonRow>
                    <ActionButton onPress={() => handlePresent(item)} variant="primary">
                      <ActionButtonText variant="primary">출석</ActionButtonText>
                    </ActionButton>
                    <ActionButton onPress={() => handleAbsence(item)} variant="secondary">
                      <ActionButtonText variant="secondary">결석/대체</ActionButtonText>
                    </ActionButton>
                  </ButtonRow>
                </ItemCard>
              ))}
            </DateGroup>
          ))}
      </ScrollView>

      {/* 출석 서명 모달 (금액권용) */}
      {selectedItem && selectedItem.is_amount_based && (
        <AttendanceSignatureModal
          visible={showAttendanceSignatureModal}
          onClose={() => {
            setShowAttendanceSignatureModal(false);
            setSelectedItem(null);
          }}
          onConfirm={(signature: string, amount?: number, memo?: string) => {
            handleAttendancePresentSubmit(signature, amount, memo);
            setShowAttendanceSignatureModal(false);
            setSelectedItem(null);
          }}
          studentName={selectedItem.student_name}
          contractType="amount"
          remainingAmount={selectedItem.remaining_amount}
        />
      )}

      {/* 출석 확인 모달 */}
      {selectedItem && (
        <AttendanceConfirmModal
          visible={showAttendanceConfirmModal}
          onClose={() => {
            setShowAttendanceConfirmModal(false);
            setSelectedItem(null);
          }}
          onConfirm={() => {
            handleAttendancePresentSubmit();
            setShowAttendanceConfirmModal(false);
            setSelectedItem(null);
          }}
          studentName={selectedItem.student_name}
        />
      )}

      {/* 결석/대체 모달 */}
      {selectedItem && (
        <AttendanceAbsenceModal
          visible={showAttendanceAbsenceModal}
          onClose={() => {
            setShowAttendanceAbsenceModal(false);
            setSelectedItem(null);
          }}
          onConfirm={(data) => {
            handleAttendanceAbsenceSubmit(data);
            setShowAttendanceAbsenceModal(false);
            setSelectedItem(null);
          }}
          studentName={selectedItem.student_name}
        />
      )}
    </Container>
  );
}

const Container = styled.View`
  flex: 1;
  background-color: #ffffff;
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

const Subtitle = styled.Text`
  margin-top: 4px;
  font-size: 14px;
  color: #666666;
`;

const CenteredContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  padding: 40px;
`;

const CenteredText = styled.Text`
  font-size: 16px;
  color: #8e8e93;
  margin-top: 12px;
`;

const CenteredSubText = styled.Text`
  margin-top: 8px;
  font-size: 13px;
  color: #9ca3af;
  text-align: center;
  line-height: 20px;
`;

const EmptyStateImage = styled.Image`
  width: 120px;
  height: 120px;
  margin-bottom: 16px;
`;

const DateGroup = styled.View`
  margin-bottom: 24px;
`;

const DateHeader = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111111;
  padding: 12px 16px;
  background-color: #f8f9fa;
`;

const ItemCard = styled.View`
  background-color: #ffffff;
  padding: 16px;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const ItemHeader = styled.View`
  margin-bottom: 8px;
`;

const StudentName = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #111111;
`;

const Subject = styled.Text`
  font-size: 14px;
  color: #666666;
  margin-top: 4px;
`;

const ItemInfo = styled.View`
  flex-direction: row;
  margin-bottom: 12px;
`;

const ItemInfoText = styled.Text`
  font-size: 13px;
  color: #8e8e93;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  gap: 8px;
`;

const ActionButton = styled.TouchableOpacity<{ variant: 'primary' | 'secondary' }>`
  flex: 1;
  padding: 12px;
  border-radius: 8px;
  align-items: center;
  background-color: ${(props) => (props.variant === 'primary' ? '#1d42d8' : '#c7d2fe')};
`;

const ActionButtonText = styled.Text<{ variant: 'primary' | 'secondary' }>`
  font-size: 14px;
  font-weight: 600;
  color: ${(props) => (props.variant === 'primary' ? '#ffffff' : '#1d42d8')};
`;

export default function UnprocessedAttendanceScreen() {
  return <UnprocessedAttendanceContent />;
}

