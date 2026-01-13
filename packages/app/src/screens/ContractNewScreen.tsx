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
];

const ABSENCE_POLICIES = [
  { value: 'carry_over', label: '대체' },
  { value: 'vanish', label: '소멸' },
];

// 뷰티 앱에서는 고객 전화번호만 사용

export default function ContractNewScreen() {
  const navigation = useNavigation<HomeStackNavigationProp>();
  const [loading, setLoading] = useState(false);

  // 수강생 정보 (뷰티앱: 고객 정보)
  const [studentName, setStudentName] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');

  // 수업 정보
  const [subject, setSubject] = useState('');
  const [lessonNotes, setLessonNotes] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

// 결제 및 정책
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [billingType, setBillingType] = useState<'prepaid' | 'postpaid'>('prepaid');
  const [absencePolicy, setAbsencePolicy] = useState<'carry_over' | 'vanish'>('vanish');
  const [attendanceRequiresSignature, setAttendanceRequiresSignature] = useState(true); // 뷰티 앱에서는 필수

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
    date.setFullYear(date.getFullYear() + 1); // 기본값: 오늘부터 1년 후
    date.setDate(date.getDate() - 1); // 하루전 (예: 12.24 ~ 다음년 12.23)
    return date;
  });
  const [endDateDay, setEndDateDay] = useState<number>(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    date.setDate(date.getDate() - 1); // 하루전
    return date.getDate(); // 기본 일자 저장 (유효기간 종료일)
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
      
      // 디버그 로그 제거
      
      return result;
    } else {
      // 한달 계약
      // 디버그 로그 제거
      
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
      // 디버그 로그 제거
      if (plannedCount > 0 && totalAmount > 0) {
        const result = roundToNearestHundred(totalAmount / plannedCount);
        // 디버그 로그 제거
        return result;
      }
      return 0;
    }
    // 확정 개념: 선불 여러달 계약의 경우 (월납부)
    // 단가 = (월금액 × 계약 개월수) ÷ 전체 계약기간 수업일수
    // 예: (10만원 × 3개월) ÷ 13회 = 단가
    // 디버그 로그 제거
    return calculateAutoPerSessionFromMonthly(monthlyAmount, plannedCount, contractMonths);
  }, [perSessionAmount, lessonType, totalSessions, sessionsTotalAmount, monthlyAmount, plannedCount, contractMonths, paymentSchedule]);

  // 전체금액/금액 변경 시 단가 자동 계산 (양방향 계산)
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

  const handleUseCustomerPhone = useCallback(() => {
    if (studentPhone.trim()) {
      setRecipientTargets([studentPhone.trim()]);
    }
  }, [studentPhone]);

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
    // 횟수권일 때 총 회차 및 총 금액 검증
    if (lessonType === 'sessions') {
      const total = Number(totalSessions) || 0;
      const totalAmt = Number(sessionsTotalAmount) || 0;
      if (total <= 0) {
        Alert.alert('입력 오류', '횟수권의 총 회차를 입력해주세요.');
        return false;
      }
      if (totalAmt <= 0) {
        Alert.alert('입력 오류', '횟수권의 총 금액을 입력해주세요.');
        return false;
      }
    }
    // 청구서 수신 전화번호 검증
    // recipientTargets가 입력되어 있으면 형식 검증, 없으면 studentPhone 사용 (이미 검증됨)
    if (recipientTargets.length > 0 && recipientTargets[0].trim()) {
      const trimmedRecipientPhone = recipientTargets[0].trim();
      if (!phoneRegex.test(trimmedRecipientPhone.replace(/\s+/g, ''))) {
        Alert.alert('입력 오류', '청구서 수신 전화번호는 010-1234-5678 형식으로 입력해주세요.');
        return false;
      }
    }
    // recipientTargets가 비어있으면 studentPhone을 사용하므로 이미 검증됨
    if (!subject.trim()) {
      Alert.alert('입력 오류', '과목명을 입력해주세요.');
      return false;
    }
    // 뷰티 앱에서는 요일 선택 불필요 (예약 방식으로 변경)
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
          // 뷰티앱: 결제 방식은 항상 선불로 고정하므로
          // settings.default_billing_type이 있어도 무시하고 'prepaid'를 사용
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

  // 전화번호 포맷팅 (입력 중 자동 하이픈 추가): 01012345678 -> 010-1234-5678
  const formatPhone = useCallback((text: string): string => {
    const numbers = text.replace(/[^0-9]/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
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
        });
        studentId = newStudent.id;
      }

      // 2. recipient_targets 최종 설정 (정규화된 전화번호 사용)
      const finalRecipientTargets: string[] = [];
      // recipientTargets가 비어있으면 고객 전화번호 사용
      if (recipientTargets.length > 0 && recipientTargets[0].trim()) {
        recipientTargets.forEach((target) => {
          const normalized = normalizePhone(target);
          if (normalized) finalRecipientTargets.push(normalized);
        });
      } else if (normalizedStudentPhone) {
        finalRecipientTargets.push(normalizedStudentPhone);
      }
      
      // 안전장치: finalRecipientTargets가 비어있으면 에러 (validateForm에서 이미 검증했지만 이중 체크)
      if (finalRecipientTargets.length === 0) {
        Alert.alert('입력 오류', '청구서를 받으실 전화번호를 입력하거나 고객정보의 연락처를 사용해주세요.');
        setLoading(false);
        return;
      }

      // 3. 계약서 생성 (초안 저장 - draft 상태)
      // 시간은 선택값: 뷰티 앱에서는 예약 시점에 시간을 설정하므로 계약 생성 시에는 시간 없음
      const timeString = undefined;
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
        // 횟수권일 때만 total_sessions를 명시적으로 설정 (0이면 전송하지 않음)
        if (total > 0) {
          policySnapshot.total_sessions = total;
          policySnapshot.per_session_amount = per;
        }
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
        day_of_week: [], // 뷰티 앱에서는 요일 미설정 (예약 방식 사용)
        ...(timeString ? { time: timeString } : {}),
        billing_type: billingType,
        absence_policy: absencePolicy,
        monthly_amount: Number(lessonType === 'sessions' ? sessionsTotalAmount : monthlyAmount),
        policy_snapshot: policySnapshot,
        attendance_requires_signature: attendanceRequiresSignature,
        recipient_policy: 'student_only', // 뷰티 앱에서는 고객만
        recipient_targets: finalRecipientTargets,
        started_at: formatDateOnly(startDate),
        ended_at: formatDateOnly(endDate),
        ...(lessonType === 'monthly'
          ? {
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
    subject,
    selectedDays,
    lessonType,
    monthlyAmount,
    billingType,
    absencePolicy,
    attendanceRequiresSignature,
    recipientTargets,
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
      >
        {/* 고객 정보 */}
        <Section>
          <SectionTitle>고객 정보</SectionTitle>
          <FormLabel label="이름" required />
          <TextInput
            value={studentName}
            onChangeText={setStudentName}
            placeholder="고객 이름을 입력하세요"
            autoCapitalize="none"
          />
          <FormLabel label="연락처" required />
          <TextInput
            value={studentPhone}
            onChangeText={(text) => setStudentPhone(formatPhone(text))}
            placeholder="010-0000-0000"
            keyboardType="phone-pad"
            autoCapitalize="none"
            maxLength={13}
          />
        </Section>

        {/* 이용권 정보 */}
        <Section>
          <SectionTitle>이용권 정보</SectionTitle>
          <FormLabel label="이용권 명" required />
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="예: 네일, 피부관리, PT, 미용 등"
            autoCapitalize="none"
          />
          <FormLabel label="이용권 정보 (선택)" />
          <TextArea
            value={lessonNotes}
            onChangeText={setLessonNotes}
            placeholder="제공 서비스 내용, 특약 사항 등을 입력하세요"
            multiline
            textAlignVertical="top"
          />
          <FormLabel label="이용권 선택" required />
          <OptionsContainer>
            {[
              { value: 'monthly', label: '선불권' },
              { value: 'sessions', label: '횟수권' },
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

          {/* 유효기간 */}
          <FormLabel label="이용권 발행일" required />
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
                    newEndDate.setFullYear(newEndDate.getFullYear() + 1);
                    newEndDate.setDate(newEndDate.getDate() - 1); // 하루전 (예: 12.24 ~ 다음년 12.23)
                    setEndDate(newEndDate);
                  }
                }
              }}
            />
          )}

          <FormLabel label="이용권 종료일" required />
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

          {lessonType === 'monthly' && (
            <>
              <FormLabel 
                label="금액 (원)" 
                required 
              />
              <TextInput
                value={monthlyAmount}
                onChangeText={(text) => {
                  // 디버그 로그 제거
                  lastEditedField.current = 'totalAmount';
                  setMonthlyAmount(text);
                  // 금액 입력 시 단가 필드 초기화하여 자동 계산이 실행되도록 함
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
              <FormLabel label="금액 (원)" required />
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
                  <PreviewLabel>금액</PreviewLabel>
                  <PreviewValue>{(Number(sessionsTotalAmount) || 0).toLocaleString()}원</PreviewValue>
                </PreviewRow>
              </>
            ) : (
              <>
                <PreviewRow>
                  <PreviewLabel>유효기간</PreviewLabel>
                  <PreviewValue>
                    {startDate && endDate
                      ? `${startDate.getFullYear()}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${String(
                          startDate.getDate(),
                        ).padStart(2, '0')} ~ ${endDate.getFullYear()}.${String(endDate.getMonth() + 1).padStart(
                          2,
                          '0',
                        )}.${String(endDate.getDate()).padStart(2, '0')}`
                      : '-'}
                  </PreviewValue>
                </PreviewRow>
                <PreviewRow>
                  <PreviewLabel>금액</PreviewLabel>
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
                editable={false}
                placeholder="선불권에서는 사용하지 않음"
                keyboardType="number-pad"
                autoCapitalize="none"
                style={{ backgroundColor: '#f5f5f5', color: '#999999' }}
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
          <FormLabel label="노쇼 정책" required />
          <OptionsContainer>
            {ABSENCE_POLICIES.map((policy) => (
              <OptionButton
                key={policy.value}
                selected={absencePolicy === policy.value}
                onPress={() => setAbsencePolicy(policy.value as 'carry_over' | 'vanish')}
              >
                <OptionButtonText selected={absencePolicy === policy.value}>
                  {policy.label}
                </OptionButtonText>
              </OptionButton>
            ))}
          </OptionsContainer>
          <InputLabel>관리 시 서명 필수</InputLabel>
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
          <FormLabel label="청구서를 받으실 전화번호" required />
          <CustomerPhoneButton onPress={handleUseCustomerPhone}>
            <CustomerPhoneButtonText>고객정보의 연락처 사용</CustomerPhoneButtonText>
          </CustomerPhoneButton>
          <TextInput
            value={recipientTargets.length > 0 ? recipientTargets[0] : ''}
            onChangeText={(text) => {
              const formatted = formatPhone(text);
              setRecipientTargets(formatted.trim() ? [formatted.trim()] : []);
            }}
            placeholder="청구서가 발송될 전화번호를 입력하세요."
            keyboardType="phone-pad"
            autoCapitalize="none"
            maxLength={13}
          />
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

const CustomerPhoneButton = styled.TouchableOpacity`
  margin-top: 8px;
  margin-bottom: 8px;
`;

const CustomerPhoneButtonText = styled.Text`
  font-size: 14px;
  color: #1d42d8;
  text-decoration-line: underline;
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
  // 뷰티앱: 금액권은 입력한 금액 그대로 사용 (기간과 연동된 계산식 없음)
  if (lessonType === 'monthly') {
    const cleanedAmount = monthlyAmount.replace(/,/g, '');
    return Number(cleanedAmount) || 0;
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
  if (__DEV__) {
    console.log('[autoPerSessionFromMonthly]', { monthAmt, planned, current, contractMonths, paymentSchedule });
  }
  if (current?.trim().length) {
    if (__DEV__) {
      console.log('[autoPerSessionFromMonthly] 기존 값 사용:', current);
    }
    return current;
  }
  // 일시납부의 경우: 총 금액 / 총 회차
  if (paymentSchedule === 'lump_sum') {
    const cleanedAmount = monthAmt.replace(/,/g, '');
    const totalAmount = Number(cleanedAmount) || 0;
    if (planned > 0 && totalAmount > 0) {
      const autoValue = roundToNearestHundred(totalAmount / planned);
      if (__DEV__) {
        console.log('[autoPerSessionFromMonthly] 일시납부 계산:', { totalAmount, planned, autoValue });
      }
      return autoValue > 0 ? String(autoValue) : '';
    }
    return '';
  }
  // 월납부의 경우: 기존 로직
  const autoValue = calculateAutoPerSessionFromMonthly(monthAmt, planned, contractMonths);
  if (__DEV__) {
    console.log('[autoPerSessionFromMonthly] 월납부 계산:', { autoValue });
  }
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
    if (__DEV__) {
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
    }
    
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
