import React, { useEffect, useState } from 'react';
import { ScrollView, TouchableOpacity, Alert } from 'react-native';
import styled from 'styled-components/native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { studentsApi } from '../api/students';
import { attendanceApi } from '../api/attendance';
import AttendanceEditModal from '../components/modals/AttendanceEditModal';

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

const InfoRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const InfoLabel = styled.Text`
  font-size: 14px;
  color: #666;
`;

const InfoValue = styled.Text`
  font-size: 14px;
  color: #000;
  font-weight: 500;
`;

const TimelineItem = styled.View`
  padding: 12px;
  border-left-width: 2px;
  border-left-color: #007AFF;
  margin-bottom: 12px;
  background-color: #f9f9f9;
  border-radius: 4px;
`;

const TimelineDate = styled.Text`
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
`;

const TimelineContent = styled.Text`
  font-size: 14px;
  color: #000;
`;

const EditButton = styled.TouchableOpacity`
  padding: 8px 16px;
  background-color: #007AFF;
  border-radius: 6px;
  align-self: flex-end;
  margin-top: 8px;
`;

const EditButtonText = styled.Text`
  color: #fff;
  font-size: 14px;
  font-weight: bold;
`;

const EmptyText = styled.Text`
  text-align: center;
  color: #999;
  margin-top: 20px;
  font-size: 14px;
`;

interface StudentDetail {
  id: number;
  name: string;
  phone: string;
  guardian_name?: string;
  guardian_phone?: string;
  contracts: Array<{
    id: number;
    subject: string;
    day_of_week: string[];
    time: string;
    policy_snapshot: any;
  }>;
  attendance_logs: Array<{
    id: number;
    occurred_at: string;
    status: string;
    memo_public?: string;
    memo_internal?: string;
    modified_at?: string;
    change_reason?: string;
    contract: {
      id: number;
      subject: string;
    };
  }>;
  invoices: Array<{
    id: number;
    year: number;
    month: number;
    final_amount: number;
    send_status: string;
  }>;
}

/**
 * 수강생 상세 화면
 */
export default function StudentDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedAttendanceId, setSelectedAttendanceId] = useState<number | null>(null);
  const [selectedAttendance, setSelectedAttendance] = useState<any>(null);
  const studentId = (route.params as any)?.id;

  useEffect(() => {
    if (studentId) {
      loadStudentDetail();
    }
  }, [studentId]);

  const loadStudentDetail = async () => {
    try {
      setLoading(true);
      const data = await studentsApi.getById(studentId);
      setStudent(data);
    } catch (error) {
      console.error('Failed to load student detail:', error);
      Alert.alert('오류', '수강생 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditAttendance = (attendanceId: number) => {
    const attendance = student?.attendance_logs.find((log) => log.id === attendanceId);
    if (attendance) {
      setSelectedAttendanceId(attendanceId);
      setSelectedAttendance(attendance);
      setEditModalVisible(true);
    }
  };

  const handleEditConfirm = () => {
    loadStudentDetail();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      present: '출석',
      absent: '결석',
      substitute: '대체',
      vanish: '소멸',
    };
    return map[status] || status;
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      present: '#4CAF50',
      absent: '#FF9800',
      substitute: '#2196F3',
      vanish: '#9E9E9E',
    };
    return map[status] || '#666';
  };

  if (loading || !student) {
    return (
      <Container>
        <Header>
          <Title>로딩 중...</Title>
        </Header>
      </Container>
    );
  }

  return (
    <Container>
      <ScrollView>
        <Header>
          <Title>{student.name}</Title>
        </Header>

        <Section>
          <SectionTitle>기본 정보</SectionTitle>
          <InfoRow>
            <InfoLabel>연락처</InfoLabel>
            <InfoValue>{student.phone}</InfoValue>
          </InfoRow>
          {student.guardian_name && (
            <>
              <InfoRow>
                <InfoLabel>보호자</InfoLabel>
                <InfoValue>{student.guardian_name}</InfoValue>
              </InfoRow>
              <InfoRow>
                <InfoLabel>보호자 연락처</InfoLabel>
                <InfoValue>{student.guardian_phone}</InfoValue>
              </InfoRow>
            </>
          )}
        </Section>

        {student.contracts && student.contracts.length > 0 && (
          <Section>
            <SectionTitle>계약 정보</SectionTitle>
            {student.contracts.map((contract) => (
              <Section key={contract.id} style={{ marginTop: 8, marginHorizontal: 0 }}>
                <InfoRow>
                  <InfoLabel>과목</InfoLabel>
                  <InfoValue>{contract.subject}</InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>요일/시간</InfoLabel>
                  <InfoValue>
                    {contract.day_of_week.join(', ')} {contract.time}
                  </InfoValue>
                </InfoRow>
                <InfoRow>
                  <InfoLabel>정책</InfoLabel>
                  <InfoValue>
                    {contract.policy_snapshot.billing_type === 'prepaid' ? '선불' : '후불'} /{' '}
                    {contract.policy_snapshot.absence_policy === 'carry_over'
                      ? '이월'
                      : contract.policy_snapshot.absence_policy === 'deduct_next'
                      ? '차월차감'
                      : '소멸'}
                  </InfoValue>
                </InfoRow>
                <InfoValue style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                  * 계약 시점의 정책이 적용됩니다 (policy_snapshot)
                </InfoValue>
              </Section>
            ))}
          </Section>
        )}

        <Section>
          <SectionTitle>이번 달 출결 로그</SectionTitle>
          {student.attendance_logs && student.attendance_logs.length > 0 ? (
            student.attendance_logs.map((log) => (
              <TimelineItem key={log.id}>
                <TimelineDate>{formatDate(log.occurred_at)}</TimelineDate>
                <TimelineContent>
                  {log.contract.subject} -{' '}
                  <TimelineContent style={{ color: getStatusColor(log.status) }}>
                    {getStatusText(log.status)}
                  </TimelineContent>
                </TimelineContent>
                {log.memo_public && (
                  <TimelineContent style={{ marginTop: 4, fontSize: 12, color: '#666' }}>
                    공개 메모: {log.memo_public}
                  </TimelineContent>
                )}
                {log.modified_at && (
                  <TimelineContent style={{ marginTop: 4, fontSize: 12, color: '#FF9800' }}>
                    수정됨 ({formatDate(log.modified_at)}) - {log.change_reason}
                  </TimelineContent>
                )}
                <EditButton onPress={() => handleEditAttendance(log.id)}>
                  <EditButtonText>수정</EditButtonText>
                </EditButton>
              </TimelineItem>
            ))
          ) : (
            <EmptyText>출결 기록이 없습니다</EmptyText>
          )}
        </Section>

        {student.invoices && student.invoices.length > 0 && (
          <Section>
            <SectionTitle>정산 히스토리</SectionTitle>
            {student.invoices.map((invoice) => (
              <InfoRow key={invoice.id} style={{ marginBottom: 12 }}>
                <InfoLabel>
                  {invoice.year}년 {invoice.month}월
                </InfoLabel>
                <InfoValue>
                  {invoice.final_amount.toLocaleString()}원 ({invoice.send_status === 'sent' ? '전송완료' : '미전송'})
                </InfoValue>
              </InfoRow>
            ))}
          </Section>
        )}
      </ScrollView>

      {selectedAttendanceId && selectedAttendance && (
        <AttendanceEditModal
          visible={editModalVisible}
          onClose={() => {
            setEditModalVisible(false);
            setSelectedAttendanceId(null);
            setSelectedAttendance(null);
          }}
          onConfirm={handleEditConfirm}
          attendanceId={selectedAttendanceId}
          initialStatus={selectedAttendance.status}
          initialMemoPublic={selectedAttendance.memo_public}
          initialMemoInternal={selectedAttendance.memo_internal}
        />
      )}
    </Container>
  );
}

