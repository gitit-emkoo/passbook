import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { usersApi } from '../api/users';
import { Alert, ScrollView, ActivityIndicator, Modal, Platform } from 'react-native';
import styled from 'styled-components/native';
import { useNavigation } from '@react-navigation/native';
import { HomeStackNavigationProp } from '../navigation/AppNavigator';
import { contractsApi } from '../api/contracts';
import { studentsApi } from '../api/students';
import DateTimePicker from '@react-native-community/datetimepicker';

const DAYS_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const DAY_INDEX_MAP: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

const BILLING_TYPES = [
  { value: 'prepaid', label: '선불' },
  { value: 'postpaid', label: '후불' },
];

const ABSENCE_POLICIES = [
  { value: 'carry_over', label: '이월' },
  { value: 'deduct_next', label: '차감' },
  { value: 'vanish', label: '소멸' },
];

const RECIPIENT_POLICIES = [
  { value: 'student_only', label: '수강생만' },
  { value: 'guardian_only', label: '보호자만' },
  { value: 'both', label: '모두' },
];

export default function ContractNewScreen() {
  const navigation = useNavigation<HomeStackNavigationProp>();
  const [loading, setLoading] = useState(false);

  // 수강생 정보
  const [studentName, setStudentName] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');

  // 수업 정보
  const [subject, setSubject] = useState('');
  const [lessonNotes, setLessonNotes] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const [showHourPicker, setShowHourPicker] = useState(false);
  const [showMinutePicker, setShowMinutePicker] = useState(false);
  // 수업 시간(선택 입력: HH:MM)
  const [lessonTime, setLessonTime] = useState<string>('');

// 결제 및 정책
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [billingType, setBillingType] = useState<'prepaid' | 'postpaid'>('prepaid');
  const [absencePolicy, setAbsencePolicy] = useState<'carry_over' | 'deduct_next' | 'vanish'>('carry_over');
  const [attendanceRequiresSignature, setAttendanceRequiresSignature] = useState(false);

  // 수업 형태/단가 방식
  const [lessonType, setLessonType] = useState<'monthly' | 'sessions'>('monthly');
  const [pricingMode, setPricingMode] = useState<'monthly_flat' | 'per_session'>('per_session'); // 월단위: 월정액/회차×단가
  const [paymentSchedule, setPaymentSchedule] = useState<'monthly' | 'lump_sum'>('monthly'); // 납부 방식: 월납 / 일시납
  const [perSessionAmount, setPerSessionAmount] = useState<string>(''); // 숫자 문자열(자동 산출 기본값, 사용자가 수정 가능)
  const [totalSessions, setTotalSessions] = useState<string>(''); // 횟수제 총 회차
  const [sessionsTotalAmount, setSessionsTotalAmount] = useState<string>(''); // 횟수제 전체금액
  const [plannedCountOverride, setPlannedCountOverride] = useState<string>(''); // 예정 회차 수동 입력 (사용 안 함)
  const lastEditedField = useRef<'perSession' | 'totalAmount' | null>(null); // 양방향 계산을 위한 마지막 수정 필드 추적

  // 계약 기간
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1); // 기본값: 오늘부터 1개월 후
    date.setDate(date.getDate() - 1); // -1일 (실무 기준: 12.8~1.7 = 한달)
    return date;
  });
  const [endDateDay, setEndDateDay] = useState<number>(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    date.setDate(date.getDate() - 1);
    return date.getDate(); // 기본 일자 저장
  });
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  // 전송 옵션
  const [recipientPolicy, setRecipientPolicy] = useState('student_only');
  const [recipientTargets, setRecipientTargets] = useState<string[]>([]);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');

  // 날짜를 YYYY-MM-DD 문자열로 변환 (타임존 보정 없이 날짜만 전송)
  const formatDateOnly = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const plannedCount = useMemo(
    () => plannedCountUsed(selectedDays, plannedCountOverride, startDate, endDate),
    [selectedDays, plannedCountOverride, startDate, endDate],
  );

  // 첫 달의 수업일수 계산 (선불 여러달 계약의 경우 월단위 수업료 계산용)
  // 확정 개념: 첫 정산서의 period_end는 첫 달 마지막일(다음 달 billing_day)
  const firstMonthPlannedCount = useMemo(() => {
    if (!startDate || !selectedDays || selectedDays.length === 0) return 0;
    
    // 첫 달 마지막일 계산: 다음 달의 billing_day (startDate의 일자)
    // 예: 12.7일부터 계약이면 첫 달 마지막일은 1.7일
    const billingDay = startDate.getDate();
    const firstMonthEnd = new Date(startDate.getFullYear(), startDate.getMonth() + 1, billingDay);
    firstMonthEnd.setHours(23, 59, 59, 999);
    
    return plannedCountUsed(selectedDays, plannedCountOverride, startDate, firstMonthEnd);
  }, [selectedDays, plannedCountOverride, startDate]);

  // 계약 개월수 계산 (선불 여러달 계약의 단가 계산용)
  // 실제 일수 차이로 판단: 32일 이상이면 여러달 계약
  // 예: 12.9~1.8 = 약 30일 = 1개월
  // 예: 12.9~3.8 = 약 89일 = 3개월
  const contractMonths = useMemo(() => {
    if (!startDate || !endDate) return 1;
    
    // 날짜를 정규화 (시간 제거)
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    
    // 실제 일수 차이 계산
    const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    // 32일 이상이면 여러달 계약, 그렇지 않으면 한달 계약
    // 한달 계약의 경우 contractMonths = 1
    if (daysDiff >= 32) {
      // 여러달 계약: 일수 차이를 기준으로 개월수 계산
      // 한달은 대략 30일이므로, 일수 차이를 30으로 나눈 후 반올림
      // 예: 61일 = 2개월, 89일 = 3개월
      const result = Math.round(daysDiff / 30);
      
      console.log('[계약개월수계산] 여러달', {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
        daysDiff,
        result,
      });
      
      return result;
    } else {
      // 한달 계약
      console.log('[계약개월수계산] 한달', {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
        daysDiff,
      });
      
      return 1;
    }
  }, [startDate, endDate]);

  const effectivePerSessionAmount = useMemo(() => {
    const trimmed = perSessionAmount.trim();
    if (trimmed.length > 0) {
      const manual = Number(trimmed);
      if (!Number.isNaN(manual) && manual > 0) {
        return manual;
      }
    }
    if (lessonType === 'sessions') {
      return calculateAutoPerSessionFromSessions(totalSessions, sessionsTotalAmount);
    }
    // 일시납부의 경우: 총 금액 / 총 회차
    if (paymentSchedule === 'lump_sum') {
      const cleanedAmount = monthlyAmount.replace(/,/g, '');
      const totalAmount = Number(cleanedAmount) || 0;
      console.log('[effectivePerSessionAmount계산] 일시납부', { 
        monthlyAmount, 
        cleanedAmount, 
        totalAmount, 
        plannedCount, 
        paymentSchedule 
      });
      if (plannedCount > 0 && totalAmount > 0) {
        const result = roundToNearestHundred(totalAmount / plannedCount);
        console.log('[effectivePerSessionAmount계산] 일시납부 결과', { result });
        return result;
      }
      return 0;
    }
    // 확정 개념: 선불 여러달 계약의 경우 (월납부)
    // 단가 = (월금액 × 계약 개월수) ÷ 전체 계약기간 수업일수
    // 예: (10만원 × 3개월) ÷ 13회 = 단가
    console.log('[effectivePerSessionAmount계산] 월납부', { monthlyAmount, plannedCount, contractMonths, paymentSchedule });
    return calculateAutoPerSessionFromMonthly(monthlyAmount, plannedCount, contractMonths);
  }, [perSessionAmount, lessonType, totalSessions, sessionsTotalAmount, monthlyAmount, plannedCount, contractMonths, paymentSchedule]);

  // 전체금액/월 수업료 변경 시 단가 자동 계산 (양방향 계산)
  useEffect(() => {
    if (lessonType === 'sessions' && lastEditedField.current === 'totalAmount') {
      const totalAmount = Number(sessionsTotalAmount) || 0;
      const totalCount = Number(totalSessions) || 0;
      if (totalAmount > 0 && totalCount > 0) {
        const calculatedPerSession = roundToNearestHundred(totalAmount / totalCount);
        if (calculatedPerSession > 0) {
          setPerSessionAmount(String(calculatedPerSession));
        }
      }
      lastEditedField.current = null;
    } else if (lessonType === 'monthly' && lastEditedField.current === 'totalAmount') {
      const totalAmount = Number(monthlyAmount.replace(/,/g, '')) || 0;
      if (totalAmount > 0 && plannedCount > 0) {
        // 일시납부: 총금액 / 전체 회차
        if (paymentSchedule === 'lump_sum') {
          const calculatedPerSession = roundToNearestHundred(totalAmount / plannedCount);
          if (calculatedPerSession > 0) {
            setPerSessionAmount(String(calculatedPerSession));
          }
        } else {
          // 월납부: (월 수업료 × 계약 개월수) ÷ 전체 계약기간 수업일수
          const months = contractMonths || 1;
          const totalForPeriod = totalAmount * months;
          const calculatedPerSession = roundToNearestHundred(totalForPeriod / plannedCount);
          if (calculatedPerSession > 0) {
            setPerSessionAmount(String(calculatedPerSession));
          }
        }
      }
      lastEditedField.current = null;
    }
  }, [sessionsTotalAmount, totalSessions, monthlyAmount, plannedCount, lessonType, contractMonths, paymentSchedule]);

  const toggleDay = useCallback((day: string) => {
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        return prev.filter((d) => d !== day);
      } else {
        return [...prev, day];
      }
    });
  }, []);

  const handleRecipientPolicyChange = useCallback((policy: string) => {
    setRecipientPolicy(policy);
    // 정책에 따라 recipient_targets 자동 설정
    if (policy === 'student_only' && studentPhone) {
      setRecipientTargets([studentPhone]);
    } else if (policy === 'guardian_only' && guardianPhone) {
      setRecipientTargets([guardianPhone]);
    } else if (policy === 'both') {
      const targets: string[] = [];
      if (studentPhone) targets.push(studentPhone);
      if (guardianPhone) targets.push(guardianPhone);
      setRecipientTargets(targets);
    } else {
      setRecipientTargets([]);
    }
  }, [studentPhone, guardianPhone]);

  const validateForm = useCallback((): boolean => {
    if (!studentName.trim()) {
      Alert.alert('입력 오류', '수강생 이름을 입력해주세요.');
      return false;
    }
    if (!studentPhone.trim()) {
      Alert.alert('입력 오류', '수강생 연락처를 입력해주세요.');
      return false;
    }
    const phoneRegex = /^010-?\d{4}-?\d{4}$/;
    const trimmedStudentPhone = studentPhone.trim();
    if (!phoneRegex.test(trimmedStudentPhone.replace(/\s+/g, ''))) {
      Alert.alert('입력 오류', '수강생 연락처는 010-1234-5678 형식으로 입력해주세요.');
      return false;
    }
    if (guardianPhone.trim()) {
      const trimmedGuardianPhone = guardianPhone.trim();
      if (!phoneRegex.test(trimmedGuardianPhone.replace(/\s+/g, ''))) {
        Alert.alert('입력 오류', '보호자 연락처는 010-1234-5678 형식으로 입력해주세요.');
        return false;
      }
    }
    if (!subject.trim()) {
      Alert.alert('입력 오류', '과목명을 입력해주세요.');
      return false;
    }
    if (selectedDays.length === 0) {
      Alert.alert('입력 오류', '수업 요일을 선택해주세요.');
      return false;
    }
    if (lessonType === 'sessions') {
      if (!totalSessions.trim() || isNaN(Number(totalSessions)) || Number(totalSessions) <= 0) {
        Alert.alert('입력 오류', '총 회차를 올바르게 입력해주세요.');
        return false;
      }
      if (!sessionsTotalAmount.trim() || isNaN(Number(sessionsTotalAmount)) || Number(sessionsTotalAmount) <= 0) {
        Alert.alert('입력 오류', '전체 금액을 올바르게 입력해주세요.');
        return false;
      }
    } else {
      // monthly
      if (!monthlyAmount.trim() || isNaN(Number(monthlyAmount)) || Number(monthlyAmount) <= 0) {
        Alert.alert('입력 오류', '올바른 월 금액을 입력해주세요.');
        return false;
      }
    }
    const trimmedBank = bankName.trim();
    const trimmedAccountNumber = accountNumber.trim();
    const trimmedHolder = accountHolder.trim();
    if (!trimmedBank || !trimmedAccountNumber || !trimmedHolder) {
      Alert.alert('입력 오류', '은행명, 계좌번호, 예금주를 모두 입력해주세요.');
      return false;
    }
    return true;
  }, [
    studentName,
    studentPhone,
    subject,
    selectedDays,
    monthlyAmount,
    lessonType,
    pricingMode,
    perSessionAmount,
    totalSessions,
    sessionsTotalAmount,
    plannedCountOverride,
    bankName,
    accountNumber,
    accountHolder,
  ]);

  // 전화번호 정규화: 01012345678 -> 010-1234-5678
  // 설정값 불러오기
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const user = await usersApi.getMe();
        const settings = user.settings;
        
        if (settings) {
          // 계좌 정보
          if (settings.account_info) {
            if (settings.account_info.bank_name) {
              setBankName(settings.account_info.bank_name);
            }
            if (settings.account_info.account_number) {
              setAccountNumber(settings.account_info.account_number);
            }
            if (settings.account_info.account_holder) {
              setAccountHolder(settings.account_info.account_holder);
            }
          }
          
          // 기본값 설정
          if (settings.default_lesson_type) {
            // 'session' -> 'sessions' 변환
            const lessonTypeValue = settings.default_lesson_type === 'session' ? 'sessions' : settings.default_lesson_type;
            setLessonType(lessonTypeValue as 'monthly' | 'sessions');
          }
          if (settings.default_billing_type) {
            setBillingType(settings.default_billing_type);
          }
          if (settings.default_absence_policy) {
            setAbsencePolicy(settings.default_absence_policy);
          }
          if (settings.default_send_target) {
            setRecipientPolicy(settings.default_send_target);
          }
        }
      } catch (error) {
        console.error('[ContractNew] Failed to load settings', error);
        // 설정 로드 실패해도 계약서 생성은 가능하도록 계속 진행
      }
    };
    
    loadSettings();
  }, []);

  const normalizePhone = useCallback((phone: string): string => {
    const cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('010')) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    }
    return phone; // 이미 정규화된 형식이거나 다른 형식이면 그대로 반환
  }, []);

  const handleSave = useCallback(async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // 전화번호 정규화
      const normalizedStudentPhone = normalizePhone(studentPhone);
      const normalizedGuardianPhone = guardianPhone ? normalizePhone(guardianPhone) : undefined;

      // 1. 수강생 생성 또는 조회
      let studentId: number;
      const students = await studentsApi.getAll({ search: normalizedStudentPhone });
      const existingStudent = Array.isArray(students) 
        ? students.find((s: any) => s.phone === normalizedStudentPhone)
        : null;

      if (existingStudent) {
        studentId = existingStudent.id;
      } else {
        const newStudent = await studentsApi.create({
          name: studentName,
          phone: normalizedStudentPhone,
          guardian_name: guardianName || undefined,
          guardian_phone: normalizedGuardianPhone,
        });
        studentId = newStudent.id;
      }

      // 2. recipient_targets 최종 설정 (정규화된 전화번호 사용)
      const finalRecipientTargets: string[] = [];
      if (recipientPolicy === 'student_only' && normalizedStudentPhone) {
        finalRecipientTargets.push(normalizedStudentPhone);
      } else if (recipientPolicy === 'guardian_only' && normalizedGuardianPhone) {
        finalRecipientTargets.push(normalizedGuardianPhone);
      } else if (recipientPolicy === 'both') {
        if (normalizedStudentPhone) finalRecipientTargets.push(normalizedStudentPhone);
        if (normalizedGuardianPhone) finalRecipientTargets.push(normalizedGuardianPhone);
      }

      // 3. 계약서 생성 (초안 저장 - draft 상태)
      // 시간은 선택값: HH:MM 형식일 때만 전송
      const timeString = /^\d{2}:\d{2}$/.test(lessonTime.trim()) ? lessonTime.trim() : undefined;
      // 백엔드 400 방지: 현재 허용 필드만 전송
      // policy_snapshot에 회차제 정보/보조 정보를 담아 정산 계산 시 정확한 단가를 사용하게 함
      const policySnapshot: Record<string, any> = {
        billing_type: billingType,
        absence_policy: absencePolicy,
        monthly_amount: Number(lessonType === 'sessions' ? sessionsTotalAmount : monthlyAmount),
      };
      if (lessonType === 'sessions') {
        const total = Number(totalSessions) || 0;
        const totalAmt = Number(sessionsTotalAmount) || 0;
        const per = total > 0 ? roundToNearestHundred(totalAmt / total) : 0;
        policySnapshot.total_sessions = total;
        policySnapshot.per_session_amount = per;
      } else if (lessonType === 'monthly') {
        // 월단위: 예정 회차 계산 및 단가 계산
        policySnapshot.per_session_amount = effectivePerSessionAmount;
        policySnapshot.planned_count = plannedCount;
      }

      if (bankName || accountNumber || accountHolder) {
        policySnapshot.account_info = {
          bank_name: bankName.trim(),
          account_number: accountNumber.trim(),
          account_holder: accountHolder.trim(),
        };
      }

      if (lessonNotes.trim()) {
        policySnapshot.lesson_notes = lessonNotes.trim();
      }

      const contractData = {
        student_id: studentId,
        subject: subject.trim(),
        day_of_week: selectedDays,
        ...(timeString ? { time: timeString } : {}),
        billing_type: billingType,
        absence_policy: absencePolicy,
        monthly_amount: Number(lessonType === 'sessions' ? sessionsTotalAmount : monthlyAmount),
        policy_snapshot: policySnapshot,
        attendance_requires_signature: attendanceRequiresSignature,
        recipient_policy: recipientPolicy,
        recipient_targets: finalRecipientTargets,
        ...(lessonType === 'monthly'
          ? {
              started_at: formatDateOnly(startDate),
              ended_at: formatDateOnly(endDate),
              payment_schedule: paymentSchedule, // 월납 / 일시납
            }
          : {}),
        status: 'draft', // 초안 저장
      };

      const contract = await contractsApi.create(contractData);

      // 계약서 미리보기 화면으로 이동
      navigation.navigate('ContractPreview', {
        contractId: contract.id,
      });
    } catch (error: any) {
      console.error('[Contract] error', error);
      const message = error?.response?.data?.message || error?.message || '계약서 생성에 실패했습니다.';
      Alert.alert('오류', message);
    } finally {
      setLoading(false);
    }
  }, [
    validateForm,
    normalizePhone,
    studentName,
    studentPhone,
    guardianName,
    guardianPhone,
    subject,
    selectedDays,
    lessonTime,
    lessonType,
    monthlyAmount,
    billingType,
    absencePolicy,
    attendanceRequiresSignature,
    recipientPolicy,
    perSessionAmount,
    totalSessions,
    sessionsTotalAmount,
    plannedCount,
    effectivePerSessionAmount,
    startDate,
    endDate,
    paymentSchedule,
    bankName,
    accountNumber,
    accountHolder,
    lessonNotes,
    navigation,
  ]);

  return (
    <Container>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => {
          setShowHourPicker(false);
          setShowMinutePicker(false);
        }}
      >
        {/* 수강생 정보 */}
        <Section>
          <SectionTitle>수강생 정보</SectionTitle>
          <FormLabel label="이름" required />
          <TextInput
            value={studentName}
            onChangeText={setStudentName}
            placeholder="수강생 이름을 입력하세요"
            autoCapitalize="none"
          />
          <FormLabel label="연락처" required />
          <TextInput
            value={studentPhone}
            onChangeText={(text) => {
              setStudentPhone(text);
              // 연락처 변경 시 recipient_targets 업데이트
              if (recipientPolicy === 'student_only' || recipientPolicy === 'both') {
                handleRecipientPolicyChange(recipientPolicy);
              }
            }}
            placeholder="010-0000-0000"
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          <InputLabel>보호자 이름</InputLabel>
          <TextInput
            value={guardianName}
            onChangeText={setGuardianName}
            placeholder="보호자 이름을 입력하세요"
            autoCapitalize="none"
          />
          <InputLabel>보호자 연락처</InputLabel>
          <TextInput
            value={guardianPhone}
            onChangeText={(text) => {
              setGuardianPhone(text);
              // 보호자 연락처 변경 시 recipient_targets 업데이트
              if (recipientPolicy === 'guardian_only' || recipientPolicy === 'both') {
                handleRecipientPolicyChange(recipientPolicy);
              }
            }}
            placeholder="010-0000-0000"
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
        </Section>

        {/* 수업 정보 */}
        <Section>
          <SectionTitle>수업 정보</SectionTitle>
          <FormLabel label="과목명" required />
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="예: 수학, 영어, 피아노"
            autoCapitalize="none"
          />
          <FormLabel label="수업 내용 (선택)" />
          <TextArea
            value={lessonNotes}
            onChangeText={setLessonNotes}
            placeholder="수업 범위, 특약 사항 등을 입력하세요"
            multiline
            textAlignVertical="top"
          />
          <InputLabel>수업 시간 (선택)</InputLabel>
          <TimeSelectRow>
            <TimeSelectButton onPress={() => setShowHourPicker(true)}>
              <TimeSelectText>{selectedHour !== null ? String(selectedHour).padStart(2, '0') : '시'}</TimeSelectText>
              <TimeSelectCaret>▾</TimeSelectCaret>
            </TimeSelectButton>
            <TimeDivider>:</TimeDivider>
            <TimeSelectButton onPress={() => setShowMinutePicker(true)}>
              <TimeSelectText>{selectedMinute !== null ? String(selectedMinute).padStart(2, '0') : '분'}</TimeSelectText>
              <TimeSelectCaret>▾</TimeSelectCaret>
            </TimeSelectButton>
          </TimeSelectRow>
          {!!lessonTime && <SelectedTimeHint>선택됨: {lessonTime}</SelectedTimeHint>}
          <FormLabel label="수업 형태" required />
          <OptionsContainer>
            {[
              { value: 'monthly', label: '월단위' },
              { value: 'sessions', label: '횟수제' },
            ].map((opt) => (
              <OptionButton
                key={opt.value}
                selected={lessonType === (opt.value as any)}
                onPress={() => {
                  const newLessonType = opt.value as 'monthly' | 'sessions';
                  setLessonType(newLessonType);
                  // 확정 개념: 횟수제 계약은 차감 옵션 없음
                  // 횟수제로 변경 시 차감 옵션이 선택되어 있으면 자동으로 이월로 변경
                  if (newLessonType === 'sessions' && absencePolicy === 'deduct_next') {
                    setAbsencePolicy('carry_over');
                  }
                }}
              >
                <OptionButtonText selected={lessonType === (opt.value as any)}>
                  {opt.label}
                </OptionButtonText>
              </OptionButton>
            ))}
          </OptionsContainer>
          <FormLabel label="수업 요일" required />
          <DaysContainer>
            {DAYS_OF_WEEK.map((day, index) => (
              <DayButton
                key={day}
                selected={selectedDays.includes(day)}
                onPress={() => toggleDay(day)}
              >
                <DayButtonText selected={selectedDays.includes(day)}>
                  {DAY_LABELS[index]}
                </DayButtonText>
              </DayButton>
            ))}
          </DaysContainer>

          {/* 계약 기간 */}
          {lessonType === 'monthly' ? (
            <>
              <FormLabel label="계약 시작일" required />
              <DatePickerButton onPress={() => setShowStartDatePicker(true)}>
                <DatePickerText>
                  {startDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                </DatePickerText>
                <DatePickerCaret>▾</DatePickerCaret>
              </DatePickerButton>
              {showStartDatePicker && (
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    setShowStartDatePicker(Platform.OS === 'ios');
                    if (selectedDate) {
                      setStartDate(selectedDate);
                      if (selectedDate > endDate) {
                        const newEndDate = new Date(selectedDate);
                        newEndDate.setMonth(newEndDate.getMonth() + 1);
                        newEndDate.setDate(newEndDate.getDate() - 1); // -1일 (실무 기준)
                        setEndDate(newEndDate);
                      }
                    }
                  }}
                />
              )}

              <FormLabel label="계약 종료일" required />
              <DatePickerButton onPress={() => {
                // 캘린더를 열 때 현재 일자 저장
                setEndDateDay(endDate.getDate());
                setShowEndDatePicker(true);
              }}>
                <DatePickerText>
                  {endDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                </DatePickerText>
                <DatePickerCaret>▾</DatePickerCaret>
              </DatePickerButton>
              {showEndDatePicker && (
                <DateTimePicker
                  value={endDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={startDate}
                  onChange={(event, selectedDate) => {
                    setShowEndDatePicker(Platform.OS === 'ios');
                    if (selectedDate) {
                      // 선택된 날짜의 월이 변경되었는지 확인
                      const selectedMonth = selectedDate.getMonth();
                      const selectedYear = selectedDate.getFullYear();
                      const currentMonth = endDate.getMonth();
                      const currentYear = endDate.getFullYear();
                      
                      // 월이 변경되었으면 일자는 유지
                      if (selectedMonth !== currentMonth || selectedYear !== currentYear) {
                        // 해당 월의 마지막 날짜 확인
                        const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
                        const dayToUse = Math.min(endDateDay, daysInMonth);
                        
                        const newEndDate = new Date(selectedYear, selectedMonth, dayToUse);
                        // 최소 날짜 체크
                        if (newEndDate >= startDate) {
                          setEndDate(newEndDate);
                        } else {
                          // 최소 날짜보다 이전이면 선택된 날짜 사용
                          setEndDate(selectedDate);
                          setEndDateDay(selectedDate.getDate());
                        }
                      } else {
                        // 월이 변경되지 않았으면 선택된 날짜 사용 (일자 변경)
                        setEndDate(selectedDate);
                        setEndDateDay(selectedDate.getDate());
                      }
                    }
                  }}
                />
              )}

              {/* 납부 방식 선택 (한달 이상 계약만 표시) */}
              {contractMonths > 1 && (
                <>
                  <FormLabel label="납부 방식" required />
                  <OptionsContainer>
                    <OptionButton
                      selected={paymentSchedule === 'monthly'}
                      onPress={() => {
                        setPaymentSchedule('monthly');
                        // 월납부로 변경 시 단가 초기화하여 재계산
                        setPerSessionAmount('');
                      }}
                    >
                      <OptionButtonText selected={paymentSchedule === 'monthly'}>
                        월납
                      </OptionButtonText>
                    </OptionButton>
                    <OptionButton
                      selected={paymentSchedule === 'lump_sum'}
                      onPress={() => {
                        setPaymentSchedule('lump_sum');
                        // 일시납부로 변경 시 단가 초기화하여 재계산
                        setPerSessionAmount('');
                      }}
                    >
                      <OptionButtonText selected={paymentSchedule === 'lump_sum'}>
                        일시납
                      </OptionButtonText>
                    </OptionButton>
                  </OptionsContainer>
                </>
              )}
            </>
          ) : (
            <HelperText>횟수제 계약은 기간 입력 없이 회차만으로 관리됩니다.</HelperText>
          )}

          {lessonType === 'monthly' && (
            <>
              <FormLabel 
                label={paymentSchedule === 'lump_sum' ? '총 수업료 (원)' : '월 수업료 (원)'} 
                required 
              />
              <TextInput
                value={monthlyAmount}
                onChangeText={(text) => {
                  console.log('[월수업료입력]', { text, length: text.length });
                  lastEditedField.current = 'totalAmount';
                  setMonthlyAmount(text);
                  // 월 수업료 입력 시 단가 필드 초기화하여 자동 계산이 실행되도록 함
                  if (text.length > 0) {
                    setPerSessionAmount('');
                  }
                }}
                placeholder="예: 120000"
                keyboardType="number-pad"
                autoCapitalize="none"
              />
            </>
          )}
          {lessonType === 'sessions' && (
            <>
              <FormLabel label="총 회차" required />
              <TextInput
                value={totalSessions}
                onChangeText={setTotalSessions}
                placeholder="예: 10"
                keyboardType="number-pad"
              />
              <FormLabel label="전체 금액(원)" required />
              <TextInput
                value={sessionsTotalAmount}
                onChangeText={(text) => {
                  lastEditedField.current = 'totalAmount';
                  setSessionsTotalAmount(text);
                }}
                placeholder="예: 300000"
                keyboardType="number-pad"
              />
            </>
          )}

          {/* 자동 계산 미리보기 */}
          <PreviewCard>
            {lessonType === 'sessions' ? (
              <>
                <PreviewRow>
                  <PreviewLabel>회차</PreviewLabel>
                  <PreviewValue>{Number(totalSessions || '0')}회</PreviewValue>
                </PreviewRow>
                <PreviewRow>
                  <PreviewLabel>수업료</PreviewLabel>
                  <PreviewValue>{(Number(sessionsTotalAmount) || 0).toLocaleString()}원</PreviewValue>
                </PreviewRow>
              </>
            ) : (
              <>
                <PreviewRow>
                  <PreviewLabel>회차</PreviewLabel>
                  <PreviewValue>{plannedCount}회</PreviewValue>
                </PreviewRow>
                <PreviewRow>
                  <PreviewLabel>수업료</PreviewLabel>
                  <PreviewValue>
                    {autoBaseAmount(
                      lessonType,
                      pricingMode,
                      effectivePerSessionAmount,
                      monthlyAmount,
                      totalSessions,
                      sessionsTotalAmount,
                      plannedCount,
                      contractMonths,
                      paymentSchedule,
                    ).toLocaleString()}원
                  </PreviewValue>
                </PreviewRow>
              </>
            )}
          </PreviewCard>
        </Section>

        {/* 결제 및 정책 */}
        <Section>
          <SectionTitle>결제 및 정책</SectionTitle>
          {lessonType === 'sessions' && (
            <>
              <InputLabel>회차 단가(자동 계산) · 수정 가능</InputLabel>
              <TextInput
                value={autoPerSessionFromSessions(totalSessions, sessionsTotalAmount, perSessionAmount)}
                onChangeText={(text) => {
                  lastEditedField.current = 'perSession';
                  setPerSessionAmount(text);
                  // 단가 입력 시 전체금액 자동 계산
                  const perSession = Number(text) || 0;
                  const totalCount = Number(totalSessions) || 0;
                  if (perSession > 0 && totalCount > 0) {
                    const calculatedTotal = perSession * totalCount;
                    setSessionsTotalAmount(String(calculatedTotal));
                  }
                }}
                placeholder="예: 30000"
                keyboardType="number-pad"
                autoCapitalize="none"
              />
            </>
          )}
          {lessonType === 'monthly' && (
            <>
              <InputLabel>회차 단가(자동 계산) · 수정 가능</InputLabel>
              <TextInput
                value={
                  perSessionAmount.trim().length > 0
                    ? perSessionAmount
                    : String(effectivePerSessionAmount || '')
                }
                onChangeText={(text) => {
                  lastEditedField.current = 'perSession';
                  setPerSessionAmount(text);
                  // 단가 입력 시 수업료 자동 계산
                  const perSession = Number(text) || 0;
                  if (paymentSchedule === 'lump_sum') {
                    // 일시납부: 단가 × 총 회차 = 총 수업료
                    if (perSession > 0 && plannedCount > 0) {
                      const calculatedTotal = perSession * plannedCount;
                      setMonthlyAmount(String(calculatedTotal));
                    }
                  } else {
                    // 월납부: 단가 × 첫 달 회차 = 월 수업료
                    // 확정 개념: 선불 여러달 계약의 경우 월단위 수업료는 첫 달 기준으로 계산
                    const countForMonthly = firstMonthPlannedCount > 0 ? firstMonthPlannedCount : plannedCount;
                    if (perSession > 0 && countForMonthly > 0) {
                      const calculatedMonthly = perSession * countForMonthly;
                      setMonthlyAmount(String(calculatedMonthly));
                    }
                  }
                }}
                placeholder="예: 30000"
                keyboardType="number-pad"
                autoCapitalize="none"
              />
            </>
          )}
          <FormLabel label="결제 방식" required />
          <OptionsContainer>
            {BILLING_TYPES.map((type) => (
              <OptionButton
                key={type.value}
                selected={billingType === type.value}
                onPress={() => setBillingType(type.value as 'prepaid' | 'postpaid')}
              >
                <OptionButtonText selected={billingType === type.value}>
                  {type.label}
                </OptionButtonText>
              </OptionButton>
            ))}
          </OptionsContainer>
          <FormLabel label="결석시 수업료 처리조건" required />
          <OptionsContainer>
            {ABSENCE_POLICIES.filter((policy) => {
              // 확정 개념: 횟수제 계약은 차감 옵션 없음 (선불이든 후불이든 출결기록 반영 차감 없음)
              if (lessonType === 'sessions' && policy.value === 'deduct_next') {
                return false;
              }
              return true;
            }).map((policy) => (
              <OptionButton
                key={policy.value}
                selected={absencePolicy === policy.value}
                onPress={() => setAbsencePolicy(policy.value as 'carry_over' | 'deduct_next' | 'vanish')}
              >
                <OptionButtonText selected={absencePolicy === policy.value}>
                  {policy.label}
                </OptionButtonText>
              </OptionButton>
            ))}
          </OptionsContainer>
          <InputLabel>출석 시 서명 필수</InputLabel>
          <ToggleContainer>
            <ToggleButton
              onPress={() => setAttendanceRequiresSignature(!attendanceRequiresSignature)}
              active={attendanceRequiresSignature}
            >
              <ToggleText active={attendanceRequiresSignature}>
                {attendanceRequiresSignature ? '필수' : '선택'}
              </ToggleText>
            </ToggleButton>
          </ToggleContainer>
        </Section>

        {/* 전송 옵션 */}
        <Section>
          <SectionTitle>전송 옵션</SectionTitle>
          <FormLabel label="청구서 수신자" required />
          <OptionsContainer>
            {RECIPIENT_POLICIES.map((policy) => (
              <OptionButton
                key={policy.value}
                selected={recipientPolicy === policy.value}
                onPress={() => handleRecipientPolicyChange(policy.value)}
              >
                <OptionButtonText selected={recipientPolicy === policy.value}>
                  {policy.label}
                </OptionButtonText>
              </OptionButton>
            ))}
          </OptionsContainer>
          <FormLabel label="계좌 정보" required />
          <HelperText>설정에서 등록한 계좌가 없다면 여기에서 직접 입력해 주세요.</HelperText>
          <FormLabel label="은행명" required />
          <TextInput
            value={bankName}
            onChangeText={setBankName}
            placeholder="예: 국민은행"
            autoCapitalize="none"
          />
          <FormLabel label="계좌번호" required />
          <TextInput
            value={accountNumber}
            onChangeText={setAccountNumber}
            placeholder="예: 123456-01-123456"
            autoCapitalize="none"
          />
          <FormLabel label="예금주" required />
          <TextInput
            value={accountHolder}
            onChangeText={setAccountHolder}
            placeholder="예: 김선생"
            autoCapitalize="none"
          />
        </Section>

        {/* 초안 저장 버튼 */}
        <SaveButtonContainer>
          <SaveButton onPress={handleSave} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <SaveButtonText>작성 완료</SaveButtonText>
            )}
          </SaveButton>
        </SaveButtonContainer>
      </ScrollView>

      {/* 시간 선택 모달 */}
      <TimePickerModalComponent
        visible={showHourPicker}
        onClose={() => setShowHourPicker(false)}
        options={Array.from({ length: 24 }, (_, i) => i)}
        selected={selectedHour}
        onSelect={(hour) => {
          setSelectedHour(hour);
          setShowHourPicker(false);
          const mm = selectedMinute ?? 0;
          const t = `${String(hour).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
          setLessonTime(t);
        }}
        label="시"
      />
      <TimePickerModalComponent
        visible={showMinutePicker}
        onClose={() => setShowMinutePicker(false)}
        options={Array.from({ length: 12 }, (_, i) => i * 5)}
        selected={selectedMinute}
        onSelect={(minute) => {
          setSelectedMinute(minute);
          setShowMinutePicker(false);
          const hh = selectedHour ?? 0;
          const t = `${String(hh).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
          setLessonTime(t);
        }}
        label="분"
      />
    </Container>
  );
}

interface TimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  options: number[];
  selected: number | null;
  onSelect: (value: number) => void;
  label: string;
}

// 로컬 전용(충돌 방지를 위해 별도 네이밍) 스타일
const PickerOverlay = styled.TouchableOpacity`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.5);
  justify-content: center;
  align-items: center;
`;

const PickerContent = styled.View`
  background-color: #ffffff;
  border-radius: 12px;
  width: 80%;
  max-width: 300px;
  max-height: 400px;
  padding: 20px;
`;

const PickerTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 16px;
  text-align: center;
`;

const PickerList = styled.ScrollView`
  max-height: 300px;
`;

const PickerOption = styled.TouchableOpacity<{ selected?: boolean }>`
  padding: 16px;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
  background-color: ${(props) => (props.selected ? '#eef2ff' : '#ffffff')};
`;

const PickerOptionText = styled.Text<{ selected?: boolean }>`
  font-size: 16px;
  color: ${(props) => (props.selected ? '#1d42d8' : '#333333')};
  font-weight: ${(props) => (props.selected ? '600' : '400')};
  text-align: center;
`;

function TimePickerModalComponent({ visible, onClose, options, selected, onSelect, label }: TimePickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <PickerOverlay onPress={onClose}>
        <PickerContent onStartShouldSetResponder={() => true}>
          <PickerTitle>{label} 선택</PickerTitle>
          <PickerList>
            {options.map((option) => (
              <PickerOption
                key={option}
                selected={selected === option}
                onPress={() => onSelect(option)}
              >
                <PickerOptionText selected={selected === option}>
                  {String(option).padStart(2, '0')}
                </PickerOptionText>
              </PickerOption>
            ))}
          </PickerList>
        </PickerContent>
      </PickerOverlay>
    </Modal>
  );
}

const Container = styled.View`
  flex: 1;
  background-color: #f2f2f7;
`;

const Section = styled.View`
  background-color: #ffffff;
  margin: 16px;
  padding: 20px;
  border-radius: 16px;
  shadow-color: #000000;
  shadow-opacity: 0.05;
  shadow-offset: 0px 4px;
  shadow-radius: 10px;
  elevation: 2;
  overflow: visible;
`;

const SectionTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
  margin-bottom: 16px;
`;

const InputLabel = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #333333;
  margin-bottom: 8px;
  margin-top: 12px;
`;

const LabelWrapper = styled.View`
  flex-direction: row;
  align-items: center;
  margin-top: 12px;
  margin-bottom: 8px;
`;

const LabelText = styled(InputLabel)`
  margin-top: 0px;
  margin-bottom: 0px;
`;

const RequiredMark = styled.Text`
  font-size: 14px;
  font-weight: 700;
  color: #ff3b30;
  margin-left: 4px;
`;

function FormLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <LabelWrapper>
      <LabelText>{label}</LabelText>
      {required && <RequiredMark>*</RequiredMark>}
    </LabelWrapper>
  );
}

const HelperText = styled.Text`
  font-size: 12px;
  color: #8e8e93;
  margin-bottom: 4px;
`;

const TextInput = styled.TextInput`
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 16px;
  color: #111111;
  background-color: #ffffff;
`;

const TextArea = styled(TextInput)`
  height: 120px;
`;

const TimeSelectRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
`;

const TimeSelectButton = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 8px;
  padding: 10px 12px;
  background-color: #ffffff;
`;

const TimeSelectText = styled.Text`
  font-size: 14px;
  color: #333333;
  font-weight: 600;
`;

const TimeSelectCaret = styled.Text`
  font-size: 14px;
  color: #666666;
  margin-left: 6px;
`;

const TimeDivider = styled.Text`
  font-size: 16px;
  color: #666666;
  font-weight: 700;
`;

const DatePickerButton = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 8px;
  padding: 12px 16px;
  background-color: #ffffff;
  margin-top: 4px;
`;

const DatePickerText = styled.Text`
  font-size: 16px;
  color: #333333;
  font-weight: 500;
`;

const DatePickerCaret = styled.Text`
  font-size: 14px;
  color: #666666;
`;

const SelectedTimeHint = styled.Text`
  margin-top: 6px;
  font-size: 12px;
  color: #666666;
`;

const DaysContainer = styled.View`
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 6px;
  margin-top: 8px;
`;

const DayButton = styled.TouchableOpacity<{ selected: boolean }>`
  width: 32px;
  height: 32px;
  border-radius: 16px;
  border-width: 1px;
  border-color: ${(props) => (props.selected ? '#1d42d8' : '#e0e0e0')};
  background-color: ${(props) => (props.selected ? '#1d42d8' : '#ffffff')};
  align-items: center;
  justify-content: center;
`;

const DayButtonText = styled.Text<{ selected: boolean }>`
  font-size: 12px;
  font-weight: 600;
  color: ${(props) => (props.selected ? '#ffffff' : '#333333')};
`;

const OptionsContainer = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
`;

const OptionButton = styled.TouchableOpacity<{ selected: boolean }>`
  padding: 10px 20px;
  border-radius: 8px;
  border-width: 1px;
  border-color: ${(props) => (props.selected ? '#1d42d8' : '#e0e0e0')};
  background-color: ${(props) => (props.selected ? '#1d42d8' : '#ffffff')};
`;

const OptionButtonText = styled.Text<{ selected: boolean }>`
  font-size: 14px;
  font-weight: 600;
  color: ${(props) => (props.selected ? '#ffffff' : '#333333')};
`;

const ToggleContainer = styled.View`
  margin-top: 8px;
`;

const ToggleButton = styled.TouchableOpacity<{ active: boolean }>`
  padding: 10px 20px;
  border-radius: 8px;
  border-width: 1px;
  border-color: ${(props) => (props.active ? '#1d42d8' : '#e0e0e0')};
  background-color: ${(props) => (props.active ? '#1d42d8' : '#ffffff')};
  align-self: flex-start;
`;

const ToggleText = styled.Text<{ active: boolean }>`
  font-size: 14px;
  font-weight: 600;
  color: ${(props) => (props.active ? '#ffffff' : '#333333')};
`;

const SaveButtonContainer = styled.View`
  padding: 16px;
  padding-bottom: 32px;
`;

const SaveButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  background-color: ${(props) => (props.disabled ? '#cccccc' : '#1d42d8')};
  border-radius: 12px;
  padding: 16px;
  align-items: center;
  justify-content: center;
  min-height: 52px;
`;

const SaveButtonText = styled.Text`
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
`;

/* 시간 선택 관련 스타일 제거 */

const PreviewCard = styled.View`
  margin-top: 12px;
  border-width: 1px;
  border-color: #f1f1f1;
  border-radius: 12px;
  padding: 12px;
  background-color: #fafafa;
`;

const PreviewRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 6px;
`;

const PreviewLabel = styled.Text`
  font-size: 13px;
  color: #666666;
`;

const PreviewValue = styled.Text`
  font-size: 14px;
  color: #111111;
  font-weight: 700;
`;

// 유틸: 계약 기간 내 특정 요일 개수 계산
function computePlannedCount(days: string[], startDate?: Date, endDate?: Date): number {
  if (!Array.isArray(days) || days.length === 0 || !startDate || !endDate) return 0;
  const start = normalizeDateOnly(startDate);
  const end = normalizeDateOnly(endDate);
  if (start > end) return 0;

  const weekdaySet = new Set<number>();
  days.forEach((day) => {
    const index = DAY_INDEX_MAP[day as keyof typeof DAY_INDEX_MAP];
    if (typeof index === 'number') {
      weekdaySet.add(index);
    }
  });
  if (weekdaySet.size === 0) return 0;

  let count = 0;
  for (let cursor = new Date(start.getTime()); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (weekdaySet.has(cursor.getDay())) {
      count += 1;
    }
  }
  return count;
}

function plannedCountUsed(days: string[], override: string, startDate?: Date, endDate?: Date): number {
  if (!startDate || !endDate) return 0;
  return computePlannedCount(days, startDate, endDate);
}

function autoBaseAmount(
  lessonType: 'monthly' | 'sessions',
  pricingMode: 'monthly_flat' | 'per_session',
  perSessionAmountValue: number,
  monthlyAmount: string,
  totalSessions?: string,
  sessionsTotalAmount?: string,
  plannedCount?: number,
  contractMonths?: number,
  paymentSchedule?: 'monthly' | 'lump_sum',
): number {
  if (lessonType === 'sessions') {
    return Number(sessionsTotalAmount) || 0;
  }
  
  // 일시납의 경우: 이미 총 금액이므로 그대로 반환
  if (paymentSchedule === 'lump_sum') {
    const cleanedAmount = monthlyAmount.replace(/,/g, '');
    return Number(cleanedAmount) || 0;
  }
  
  if (pricingMode === 'monthly_flat') {
    return Number(monthlyAmount) || 0;
  }
  // 확정 개념: 선불 여러달 계약의 경우 (월납만)
  // 총금액 = 월 수업료 × 계약 개월수 (반올림된 단가 × 총수업일이 아님)
  // 예: 15만원 × 3개월 = 45만원
  if (lessonType === 'monthly' && contractMonths && contractMonths > 1) {
    const cleanedAmount = monthlyAmount.replace(/,/g, '');
    const monthlyAmt = Number(cleanedAmount) || 0;
    return monthlyAmt * contractMonths;
  }
  // 한달 계약이거나 contractMonths가 없는 경우: 반올림된 단가 × 총수업일
  const count = plannedCount ?? 0;
  return count * (perSessionAmountValue || 0);
}

function autoPerSessionFromSessions(total: string, totalAmount: string, current: string): string {
  if (current?.trim().length) {
    return current;
  }
  const autoValue = calculateAutoPerSessionFromSessions(total, totalAmount);
  return autoValue > 0 ? String(autoValue) : '';
}

function autoPerSessionFromMonthly(monthAmt: string, planned: number, current: string, contractMonths?: number, paymentSchedule?: 'monthly' | 'lump_sum'): string {
  console.log('[autoPerSessionFromMonthly]', { monthAmt, planned, current, contractMonths, paymentSchedule });
  if (current?.trim().length) {
    console.log('[autoPerSessionFromMonthly] 기존 값 사용:', current);
    return current;
  }
  // 일시납부의 경우: 총 금액 / 총 회차
  if (paymentSchedule === 'lump_sum') {
    const cleanedAmount = monthAmt.replace(/,/g, '');
    const totalAmount = Number(cleanedAmount) || 0;
    if (planned > 0 && totalAmount > 0) {
      const autoValue = roundToNearestHundred(totalAmount / planned);
      console.log('[autoPerSessionFromMonthly] 일시납부 계산:', { totalAmount, planned, autoValue });
      return autoValue > 0 ? String(autoValue) : '';
    }
    return '';
  }
  // 월납부의 경우: 기존 로직
  const autoValue = calculateAutoPerSessionFromMonthly(monthAmt, planned, contractMonths);
  console.log('[autoPerSessionFromMonthly] 월납부 계산:', { autoValue });
  return autoValue > 0 ? String(autoValue) : '';
}

function calculateAutoPerSessionFromSessions(total: string, totalAmount: string): number {
  const totalCount = Number(total) || 0;
  const amount = Number(totalAmount) || 0;
  if (totalCount > 0 && amount > 0) {
    return roundToNearestHundred(amount / totalCount);
  }
  return 0;
}

function calculateAutoPerSessionFromMonthly(monthAmt: string, planned: number, contractMonths?: number): number {
  const plannedCount = planned || 0;
  // 문자열에서 쉼표 제거 후 숫자 변환 (예: "100,000" → 100000)
  const cleanedAmount = monthAmt.replace(/,/g, '');
  const monthlyAmount = Number(cleanedAmount) || 0;
  // contractMonths가 undefined이거나 0 이하일 때만 1 사용
  const months = (contractMonths && contractMonths > 0) ? contractMonths : 1;
  
  if (plannedCount > 0 && monthlyAmount > 0) {
    // 확정 개념: 선불 여러달 계약의 경우
    // 단가 = (월금액 × 계약 개월수) ÷ 전체 계약기간 수업일수
    // 예: (10만원 × 3개월) ÷ 26회 = 단가
    const totalAmount = monthlyAmount * months;
    const result = roundToNearestHundred(totalAmount / plannedCount);
    
    // 디버깅: 계산 값 확인
    console.log('[단가계산]', {
      monthAmt,
      cleanedAmount,
      monthlyAmount,
      months,
      plannedCount,
      totalAmount,
      result,
      contractMonths,
    });
    
    return result;
  }
  return 0;
}

function roundToNearestHundred(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / 100) * 100;
}

function normalizeDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function countTotalDaysInclusive(startDate: Date, endDate: Date): number {
  const start = normalizeDateOnly(startDate);
  const end = normalizeDateOnly(endDate);
  if (start > end) return 0;
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}
