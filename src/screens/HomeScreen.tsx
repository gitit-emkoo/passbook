import React, { useEffect, useState } from 'react';
import { ScrollView, TouchableOpacity, Alert } from 'react-native';
import styled from 'styled-components/native';
import { useNavigation } from '@react-navigation/native';
import { contractsApi } from '../api/contracts';
import { attendanceApi } from '../api/attendance';
import AttendanceSignatureModal from '../components/modals/AttendanceSignatureModal';
import AttendanceAbsenceModal from '../components/modals/AttendanceAbsenceModal';

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

const HeaderRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const Logo = styled.Text`
  font-size: 24px;
  font-weight: bold;
  color: #000;
`;

const NotificationIcon = styled.TouchableOpacity`
  padding: 8px;
`;

const NotificationText = styled.Text`
  font-size: 18px;
`;

const GuideText = styled.Text`
  font-size: 14px;
  color: #666;
  margin-top: 8px;
`;

const Section = styled.View`
  margin-top: 16px;
  padding: 16px;
  background-color: #fff;
`;

const SectionTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #000;
  margin-bottom: 12px;
`;

const ClassCard = styled.View`
  background-color: #f9f9f9;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 12px;
`;

const ClassTitle = styled.Text`
  font-size: 16px;
  font-weight: bold;
  color: #000;
  margin-bottom: 4px;
`;

const ClassInfo = styled.Text`
  font-size: 14px;
  color: #666;
  margin-bottom: 12px;
`;

const ButtonRow = styled.View`
  flex-direction: row;
`;

const ActionButton = styled.TouchableOpacity<{ variant?: 'present' | 'absent' | 'substitute' }>`
  flex: 1;
  padding: 12px;
  border-radius: 6px;
  align-items: center;
  margin-right: 8px;
  background-color: ${(props) =>
    props.variant === 'present'
      ? '#4CAF50'
      : props.variant === 'absent'
      ? '#FF9800'
      : '#2196F3'};
`;

const ActionButtonLast = styled(ActionButton)`
  margin-right: 0;
`;

const ButtonText = styled.Text`
  color: #fff;
  font-size: 14px;
  font-weight: bold;
`;

const FloatingButton = styled.TouchableOpacity`
  position: absolute;
  bottom: 80px;
  right: 20px;
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background-color: #007AFF;
  align-items: center;
  justify-content: center;
  elevation: 4;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.25;
  shadow-radius: 3.84px;
`;

const FloatingButtonText = styled.Text`
  color: #fff;
  font-size: 24px;
  font-weight: bold;
`;

interface TodayClass {
  id: number;
  subject: string;
  time: string;
  day_of_week: string[];
  student: {
    id: number;
    name: string;
    phone: string;
  };
  policy_snapshot: {
    billing_type: string;
    absence_policy: string;
    monthly_amount: number;
  };
}

/**
 * 홈 화면
 */
export default function HomeScreen() {
  const navigation = useNavigation();
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [absenceModalVisible, setAbsenceModalVisible] = useState(false);
  const [selectedClass, setSelectedClass] = useState<TodayClass | null>(null);
  const [attendanceAction, setAttendanceAction] = useState<'present' | 'absent' | 'substitute' | null>(null);
  // TODO: 설정에서 출석 후 서명 여부 가져오기
  const requireSignature = false;

  useEffect(() => {
    loadTodayClasses();
  }, []);

  const loadTodayClasses = async () => {
    try {
      setLoading(true);
      const data = await contractsApi.getTodayClasses();
      setTodayClasses(data);
    } catch (error) {
      console.error('Failed to load today classes:', error);
      Alert.alert('오류', '오늘 수업을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAttendanceClick = (
    classItem: TodayClass,
    action: 'present' | 'absent' | 'substitute',
  ) => {
    setSelectedClass(classItem);
    setAttendanceAction(action);

    if (action === 'present' && requireSignature) {
      setSignatureModalVisible(true);
    } else if (action === 'absent' || action === 'substitute') {
      setAbsenceModalVisible(true);
    } else {
      // 출석 처리 (서명 불필요)
      handleAttendanceDirect(classItem, 'present');
    }
  };

  const handleAttendanceDirect = async (
    classItem: TodayClass,
    status: 'present' | 'absent' | 'substitute',
    data?: {
      substitute_at?: string;
      memo_public?: string;
      memo_internal?: string;
    },
  ) => {
    try {
      const now = new Date().toISOString();
      await attendanceApi.create({
        student_id: classItem.student.id,
        contract_id: classItem.id,
        occurred_at: now,
        status,
        substitute_at: data?.substitute_at,
        memo_public: data?.memo_public,
        memo_internal: data?.memo_internal,
      });
      Alert.alert('완료', '출결이 기록되었습니다.');
      loadTodayClasses();
    } catch (error) {
      console.error('Failed to record attendance:', error);
      Alert.alert('오류', '출결 기록에 실패했습니다.');
    }
  };

  const handleSignatureConfirm = (signature: string) => {
    if (selectedClass && attendanceAction === 'present') {
      handleAttendanceDirect(selectedClass, 'present');
    }
  };

  const handleAbsenceConfirm = (data: {
    status: 'absent' | 'substitute';
    substitute_at?: string;
    memo_public?: string;
    memo_internal?: string;
  }) => {
    if (selectedClass) {
      handleAttendanceDirect(selectedClass, data.status, data);
    }
  };

  const getBillingTypeText = (billingType: string) => {
    return billingType === 'prepaid' ? '선불' : '후불';
  };

  const getAbsencePolicyText = (absencePolicy: string) => {
    const map: Record<string, string> = {
      carry_over: '이월',
      deduct_next: '차월차감',
      vanish: '소멸',
    };
    return map[absencePolicy] || absencePolicy;
  };

  return (
    <Container>
      <ScrollView>
        <Header>
          <HeaderRow>
            <Logo>김쌤</Logo>
              <NotificationIcon onPress={() => {
                (navigation as any).navigate('Notifications');
              }}>
                <NotificationText>🔔</NotificationText>
              </NotificationIcon>
          </HeaderRow>
          <GuideText>오늘 수업을 기록만 하면 자동 반영됩니다</GuideText>
        </Header>

        <Section>
          <SectionTitle>오늘 수업</SectionTitle>
          {loading ? (
            <ClassInfo>로딩 중...</ClassInfo>
          ) : todayClasses.length === 0 ? (
            <ClassInfo>오늘 수업이 없습니다</ClassInfo>
          ) : (
            todayClasses.map((classItem) => (
              <ClassCard key={classItem.id}>
                <ClassTitle>
                  {classItem.time} {classItem.subject} – {classItem.student.name}
                </ClassTitle>
                <ClassInfo>
                  {classItem.policy_snapshot.monthly_amount.toLocaleString()}원 •{' '}
                  {getBillingTypeText(classItem.policy_snapshot.billing_type)}(
                  {getAbsencePolicyText(classItem.policy_snapshot.absence_policy)})
                </ClassInfo>
                <ButtonRow>
                  <ActionButton
                    variant="present"
                    onPress={() => handleAttendanceClick(classItem, 'present')}
                  >
                    <ButtonText>출석</ButtonText>
                  </ActionButton>
                  <ActionButton
                    variant="absent"
                    onPress={() => handleAttendanceClick(classItem, 'absent')}
                  >
                    <ButtonText>결석</ButtonText>
                  </ActionButton>
                  <ActionButtonLast
                    variant="substitute"
                    onPress={() => handleAttendanceClick(classItem, 'substitute')}
                  >
                    <ButtonText>대체</ButtonText>
                  </ActionButtonLast>
                </ButtonRow>
              </ClassCard>
            ))
          )}
        </Section>
      </ScrollView>

      <FloatingButton onPress={() => {
        (navigation as any).navigate('Home', {
          screen: 'ContractNew',
        });
      }}>
        <FloatingButtonText>+</FloatingButtonText>
      </FloatingButton>

      {selectedClass && (
        <>
          <AttendanceSignatureModal
            visible={signatureModalVisible}
            onClose={() => setSignatureModalVisible(false)}
            onConfirm={handleSignatureConfirm}
            studentName={selectedClass.student.name}
          />
          <AttendanceAbsenceModal
            visible={absenceModalVisible}
            onClose={() => setAbsenceModalVisible(false)}
            onConfirm={handleAbsenceConfirm}
            studentName={selectedClass.student.name}
          />
        </>
      )}
    </Container>
  );
}
