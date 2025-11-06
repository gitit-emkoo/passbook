import React, { useState } from 'react';
import { ScrollView, Alert } from 'react-native';
import styled from 'styled-components/native';
import { useNavigation } from '@react-navigation/native';
import { contractsApi } from '../api/contracts';
import { studentsApi } from '../api/students';

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

const InputLabel = styled.Text`
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
  margin-top: 8px;
`;

const TextInput = styled.TextInput`
  border-width: 1px;
  border-color: #ddd;
  border-radius: 6px;
  padding: 12px;
  font-size: 14px;
  color: #000;
  background-color: #fff;
`;

const PickerContainer = styled.View`
  border-width: 1px;
  border-color: #ddd;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
`;

const PickerButton = styled.TouchableOpacity`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const PickerText = styled.Text`
  font-size: 14px;
  color: #000;
`;

const DayButton = styled.TouchableOpacity<{ selected?: boolean }>`
  padding: 8px 16px;
  border-radius: 16px;
  margin-right: 8px;
  margin-bottom: 8px;
  background-color: ${(props) => (props.selected ? '#007AFF' : '#e0e0e0')};
`;

const DayButtonText = styled.Text<{ selected?: boolean }>`
  color: ${(props) => (props.selected ? '#fff' : '#666')};
  font-size: 14px;
  font-weight: ${(props) => (props.selected ? 'bold' : 'normal')};
`;

const DayButtonRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
`;

const SaveButton = styled.TouchableOpacity`
  background-color: #007AFF;
  padding: 16px;
  margin: 16px;
  border-radius: 8px;
  align-items: center;
`;

const SaveButtonText = styled.Text`
  color: #fff;
  font-size: 18px;
  font-weight: bold;
`;

const InfoText = styled.Text`
  font-size: 12px;
  color: #666;
  margin-top: 4px;
`;

/**
 * 계약서 생성 화면
 */
export default function ContractNewScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);

  // 수강생 정보
  const [studentName, setStudentName] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');

  // 수업 정보
  const [subject, setSubject] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [time, setTime] = useState('');

  // 정책
  const [billingType, setBillingType] = useState<'prepaid' | 'postpaid'>('postpaid');
  const [absencePolicy, setAbsencePolicy] = useState<'carry_over' | 'deduct_next' | 'vanish'>('deduct_next');
  const [monthlyAmount, setMonthlyAmount] = useState('');

  // 전송 옵션
  const [recipientPolicy, setRecipientPolicy] = useState<string>('both');
  const [recipientTargets, setRecipientTargets] = useState<string[]>([]);

  const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

  const toggleDay = (day: string) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const updateRecipientTargets = () => {
    const targets: string[] = [];
    if (recipientPolicy === 'student_only' || recipientPolicy === 'both') {
      if (studentPhone) targets.push(studentPhone);
    }
    if (recipientPolicy === 'guardian_only' || recipientPolicy === 'both') {
      if (guardianPhone) targets.push(guardianPhone);
    }
    setRecipientTargets(targets);
  };

  const handleSave = async () => {
    // 유효성 검사
    if (!studentName || !studentPhone) {
      Alert.alert('알림', '수강생 이름과 연락처를 입력해주세요.');
      return;
    }
    if (!subject || selectedDays.length === 0 || !time) {
      Alert.alert('알림', '수업 정보를 모두 입력해주세요.');
      return;
    }
    if (!monthlyAmount || isNaN(Number(monthlyAmount))) {
      Alert.alert('알림', '올바른 월 금액을 입력해주세요.');
      return;
    }

    try {
      setLoading(true);

      // 수강생 생성 또는 조회
      let studentId: number;
      try {
        const students = await studentsApi.getAll({ search: studentPhone });
        const existingStudent = students.find((s: any) => s.phone === studentPhone);
        if (existingStudent) {
          studentId = existingStudent.id;
        } else {
          const newStudent = await studentsApi.create({
            name: studentName,
            phone: studentPhone,
            guardian_name: guardianName || undefined,
            guardian_phone: guardianPhone || undefined,
          });
          studentId = newStudent.id;
        }
      } catch (error) {
        console.error('Failed to create/find student:', error);
        Alert.alert('오류', '수강생 생성에 실패했습니다.');
        return;
      }

      // 계약서 생성
      updateRecipientTargets();
      const contract = await contractsApi.create({
        student_id: studentId,
        subject,
        day_of_week: selectedDays,
        time,
        billing_type: billingType,
        absence_policy: absencePolicy,
        monthly_amount: Number(monthlyAmount),
        recipient_policy: recipientPolicy,
        recipient_targets: recipientTargets,
        status: 'confirmed',
      });

      Alert.alert('완료', '계약서가 생성되었습니다.', [
        {
          text: '확인',
          onPress: () => {
            // TODO: 계약서 미리보기 모달 또는 홈으로 이동
            (navigation as any).goBack();
          },
        },
      ]);
    } catch (error) {
      console.error('Failed to create contract:', error);
      Alert.alert('오류', '계약서 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <ScrollView>
        <Header>
          <Title>계약서 생성</Title>
        </Header>

        <Section>
          <SectionTitle>수강생 정보</SectionTitle>
          <InputLabel>수강생 이름 *</InputLabel>
          <TextInput
            placeholder="수강생 이름을 입력하세요"
            value={studentName}
            onChangeText={setStudentName}
          />
          <InputLabel>수강생 연락처 *</InputLabel>
          <TextInput
            placeholder="010-1234-5678"
            value={studentPhone}
            onChangeText={setStudentPhone}
            keyboardType="phone-pad"
          />
          <InputLabel>보호자 이름 (선택)</InputLabel>
          <TextInput
            placeholder="보호자 이름을 입력하세요"
            value={guardianName}
            onChangeText={setGuardianName}
          />
          <InputLabel>보호자 연락처 (선택)</InputLabel>
          <TextInput
            placeholder="010-1234-5678"
            value={guardianPhone}
            onChangeText={setGuardianPhone}
            keyboardType="phone-pad"
          />
        </Section>

        <Section>
          <SectionTitle>수업 정보</SectionTitle>
          <InputLabel>과목명 *</InputLabel>
          <TextInput
            placeholder="예: 피아노, 수학"
            value={subject}
            onChangeText={setSubject}
          />
          <InputLabel>수업 요일 *</InputLabel>
          <DayButtonRow>
            {daysOfWeek.map((day, index) => (
              <DayButton
                key={day}
                selected={selectedDays.includes(day)}
                onPress={() => toggleDay(day)}
              >
                <DayButtonText selected={selectedDays.includes(day)}>
                  {dayLabels[index]}
                </DayButtonText>
              </DayButton>
            ))}
          </DayButtonRow>
          <InputLabel>수업 시간 *</InputLabel>
          <TextInput
            placeholder="예: 16:00"
            value={time}
            onChangeText={setTime}
          />
          <InfoText>24시간 형식으로 입력하세요 (HH:MM)</InfoText>
        </Section>

        <Section>
          <SectionTitle>결제 및 정책</SectionTitle>
          <InputLabel>월 금액 *</InputLabel>
          <TextInput
            placeholder="예: 100000"
            value={monthlyAmount}
            onChangeText={setMonthlyAmount}
            keyboardType="numeric"
          />
          <InfoText>숫자만 입력하세요 (예: 100000)</InfoText>

          <InputLabel>결제 방식</InputLabel>
          <DayButtonRow>
            <DayButton
              selected={billingType === 'postpaid'}
              onPress={() => setBillingType('postpaid')}
            >
              <DayButtonText selected={billingType === 'postpaid'}>후불</DayButtonText>
            </DayButton>
            <DayButton
              selected={billingType === 'prepaid'}
              onPress={() => setBillingType('prepaid')}
            >
              <DayButtonText selected={billingType === 'prepaid'}>선불</DayButtonText>
            </DayButton>
          </DayButtonRow>

          <InputLabel>결석 처리 방식</InputLabel>
          <DayButtonRow>
            <DayButton
              selected={absencePolicy === 'deduct_next'}
              onPress={() => setAbsencePolicy('deduct_next')}
            >
              <DayButtonText selected={absencePolicy === 'deduct_next'}>차월차감</DayButtonText>
            </DayButton>
            <DayButton
              selected={absencePolicy === 'carry_over'}
              onPress={() => setAbsencePolicy('carry_over')}
            >
              <DayButtonText selected={absencePolicy === 'carry_over'}>이월</DayButtonText>
            </DayButton>
            <DayButton
              selected={absencePolicy === 'vanish'}
              onPress={() => setAbsencePolicy('vanish')}
            >
              <DayButtonText selected={absencePolicy === 'vanish'}>소멸</DayButtonText>
            </DayButton>
          </DayButtonRow>
          <InfoText>* 계약 시점의 정책이 저장됩니다 (policy_snapshot)</InfoText>
        </Section>

        <Section>
          <SectionTitle>전송 옵션</SectionTitle>
          <InputLabel>수신자 설정</InputLabel>
          <DayButtonRow>
            <DayButton
              selected={recipientPolicy === 'student_only'}
              onPress={() => setRecipientPolicy('student_only')}
            >
              <DayButtonText selected={recipientPolicy === 'student_only'}>수강생만</DayButtonText>
            </DayButton>
            <DayButton
              selected={recipientPolicy === 'guardian_only'}
              onPress={() => setRecipientPolicy('guardian_only')}
            >
              <DayButtonText selected={recipientPolicy === 'guardian_only'}>보호자만</DayButtonText>
            </DayButton>
            <DayButton
              selected={recipientPolicy === 'both'}
              onPress={() => setRecipientPolicy('both')}
            >
              <DayButtonText selected={recipientPolicy === 'both'}>둘 다</DayButtonText>
            </DayButton>
          </DayButtonRow>
        </Section>
      </ScrollView>

      <SaveButton onPress={handleSave} disabled={loading}>
        <SaveButtonText>{loading ? '저장 중...' : '저장'}</SaveButtonText>
      </SaveButton>
    </Container>
  );
}



