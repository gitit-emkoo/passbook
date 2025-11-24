# 김쌤 앱 작업 컨텍스트 문서

> 이 문서는 프로젝트 작업을 이어받는 AI가 완벽하게 이해할 수 있도록 작성된 종합 가이드입니다.  
> 코드 구조, 비즈니스 로직, 사용자 경험, 의사결정 이유 등을 상세히 기록했습니다.

---

## 📋 목차

1. [프로젝트 개요](#프로젝트-개요)
2. [핵심 비즈니스 로직](#핵심-비즈니스-로직)
3. [사용자 경험 플로우](#사용자-경험-플로우)
4. [코드 구조 및 아키텍처](#코드-구조-및-아키텍처)
5. [주요 의사결정 및 이유](#주요-의사결정-및-이유)
6. [에지 케이스 처리](#에지-케이스-처리)
7. [최근 작업 내용](#최근-작업-내용)
8. [주의사항 및 규칙](#주의사항-및-규칙)

---

## 프로젝트 개요

### 앱의 목적
레슨 관리 앱으로, 강사가 수강생 관리, 계약서 작성, 출결 처리, 월별 정산을 한 곳에서 처리할 수 있도록 합니다.

### 주요 기능
1. **수강생 관리**: 수강생 등록, 계약서 작성, 계약 상태 관리
2. **출결 관리**: 일일 출결 처리, 대체 수업, 미처리 출결 관리
3. **정산 관리**: 월별 자동 정산 계산, 청구서 생성 및 전송
4. **인증**: 전화번호 기반 OTP 인증, 자동 로그인
5. **푸시 알림**: Firebase Cloud Messaging 기반 알림

---

## 핵심 비즈니스 로직

### 1. 정산 계산 로직 (가장 복잡한 부분)

#### A. policy_snapshot (계약 규정 고정)
**왜 필요한가?**
- 계약서 규정이 나중에 변경되어도, 기존 계약의 정산은 계약 시점의 규정을 따라야 함
- 예: 11월 계약 시 월 20만원이었는데, 12월에 계약서 템플릿을 25만원으로 변경해도, 11월 계약은 계속 20만원 기준으로 정산

**구현 위치:**
- `packages/backend/src/contracts/contracts.service.ts` - 계약 생성 시 저장
- `packages/backend/src/invoices/invoice-calculation.service.ts` - 정산 계산 시 사용

**저장되는 데이터:**
```typescript
{
  billing_type: 'prepaid' | 'postpaid',
  absence_policy: 'carry_over' | 'deduct_next' | 'vanish',
  monthly_amount: number,
  recipient_policy: string,
  recipient_targets: string[],
  account_info?: { bank_name, account_number, account_holder },
  per_session_amount?: number,  // 명시적 단가 (선택)
  total_sessions?: number,       // 횟수제 총 회차 (선택)
  created_at: string
}
```

#### B. 정산 자동 계산 (auto_adjustment)

**계산 우선순위:**
1. **단가 계산 우선순위:**
   - `policy.per_session_amount` (명시적 단가) → 가장 우선
   - `policy.total_sessions` 기반 (횟수제: `monthly_amount / total_sessions`)
   - 예정 회차 기반 (월단위: `monthly_amount / plannedCount`)

2. **결석 정책별 처리:**

   **후불 (postpaid):**
   - 출석 횟수만큼 과금
   - `deduct_next`: 결석 시 다음 달에서 차감 (이번 달 영향 없음, 음수로 다음 달 반영)
   - `carry_over`: 결석 시 다음 달로 이월 (이번 달 영향 없음, 음수로 다음 달 반영)
   - `vanish`: 결석 시 소멸 (이번 달에서 차감)

   **선불 (prepaid):**
   - 미리 받은 금액 기준
   - 결석 정책은 후불과 동일하지만, 계산 방식이 다름
   - 선불은 이미 받은 금액이므로, 결석 시 차감만 하면 됨

3. **대체 수업 처리:**
   - `substitute_at`이 같은 달이면: 출석으로 처리 (원래 날짜는 결석)
   - `substitute_at`이 다른 달이면: 원래 달은 결석, 대체 날짜 달은 출석

4. **이전 달 결석 반영:**
   - `deduct_next` 또는 `carry_over` 정책인 경우
   - 이전 달의 결석을 다음 달 `auto_adjustment`에 음수로 반영
   - `calculatePreviousMonthAdjustment()` 함수로 계산

**최종 금액 계산:**
```typescript
final_amount = base_amount + auto_adjustment + previous_month_adjustment + manual_adjustment
```

#### C. Invoice on-demand 생성
- 정산 화면 진입 시 자동으로 Invoice 생성
- 각 계약서별로 해당 월 Invoice 존재 여부 확인
- 없으면 생성 (예정 횟수 계산, 출결 기록 기반 자동 조정 계산)
- 출결 기록 변경 시 자동 재계산 (`recalculateForContractMonth`)

### 2. 출결 처리 로직

#### A. 오늘 수업 표시
**조건:**
1. 계약서의 `day_of_week`에 오늘 요일이 포함됨
2. 또는 `substitute_at`이 오늘인 대체 수업이 있음
3. 계약서 상태가 `confirmed` 또는 `sent`
4. 수강생이 활성화 상태 (`is_active = true`)
5. 계약 기간 내 (`started_at` ~ `ended_at`)

**이미 처리됨 판단:**
- `occurred_at`이 오늘인 출결 기록이 있으면 "이미 처리됨"
- 단, 대체 수업의 경우 `substitute_at`이 오늘이어도 `occurred_at`이 오늘이 아니면 새로운 출결 처리 가능

#### B. 대체 수업 처리
- 원래 수업 날짜에 `status = 'substitute'`, `substitute_at`에 대체 날짜 저장
- 대체 날짜에 새로운 출결 기록 생성 가능
- 정산 계산 시:
  - 같은 달 대체: 원래 날짜는 결석, 대체 날짜는 출석
  - 다른 달 대체: 원래 달은 결석, 대체 날짜 달은 출석

#### C. 미처리 출결
- 오늘 날짜가 지난 수업 중 출결 기록이 없는 것들
- 계약 기간(`started_at` ~ `ended_at`) 내의 날짜만 포함
- 마이페이지 > 출결 미처리 관리에서 일괄 처리 가능

#### D. 출결 기록 수정/취소
- 수정: `modified_at`, `modified_by`, `change_reason` 필드 업데이트
- 취소: `voided = true`, `void_reason` 저장
- 취소된 기록은 정산 계산에서 제외 (`voided = false`만 조회)
- 출결 수정/취소 시 자동으로 정산 재계산

### 3. 계약서 관리

#### A. 계약서 상태
- `draft`: 작성 중 (확정 전)
- `confirmed`: 확정됨 (서명 완료)
- `sent`: 전송 완료 (서명 후 전송)

#### B. 계약서 전송
- 전송 완료 후 서명 버튼 비활성화
- 선불 계약의 경우 전송 시 해당 월 Invoice 자동 생성

#### C. 계약서 연장
- `extend` API로 `ended_at` 날짜 연장
- 연장 기록은 HTML에 "Contract Changes" 섹션으로 표시

### 4. 인증 및 사용자 관리

#### A. 로그인/회원가입 플로우
1. **전화번호 인증 화면** (`PhoneAuthScreen`)
   - 공통 진입점 (로그인 + 회원가입)
   - 이전 로그인 기록이 있으면 자동으로 전화번호 채움
   - `verifyCode` 결과의 `isNewUser`로 분기:
     - `false`: 즉시 `accessToken` 발급 → 홈 화면
     - `true`: `temporaryToken` 발급 → 회원가입 화면

2. **회원가입 화면** (`SignupScreen`)
   - Step 1: 이름/상호명 입력
   - Step 2: 기본 설정 (선택, 건너뛰기 가능)
   - Step 3: `complete-signup` 호출 → `accessToken` 발급

3. **자동 로그인**
   - 앱 시작 시 `loadAuth()` 호출
   - AsyncStorage에 `accessToken`과 `user`가 있으면 자동 로그인

#### B. 사용자 설정
- `user.settings` (JSON 필드)에 저장:
  - `default_billing_type`: 계약서 기본 결제 방식
  - `default_absence_policy`: 계약서 기본 결석 정책
  - `default_send_target`: 계약서 기본 전송 대상
  - `bank_name`, `bank_account`, `bank_holder`: 계좌 정보
  - `business_icon`: 업종 아이콘 (선택)
  - `fcm_token`: 푸시 알림 토큰

### 5. 데이터 격리

#### A. 사용자별 데이터 분리
- 모든 테이블에 `user_id` 필드로 사용자별 데이터 분리
- API는 JWT 토큰에서 `user_id` 추출하여 필터링
- 프론트엔드 Zustand 스토어는 로그인/로그아웃 시 `reset()` 호출하여 이전 사용자 데이터 제거

#### B. 스토어 초기화
- `useAuthStore.login()`: 모든 스토어 `reset()` 호출
- `useAuthStore.logout()`: 모든 스토어 `reset()` 호출
- 순환 참조 방지를 위해 동적 import 사용

---

## 사용자 경험 플로우

### 1. 로그인/회원가입 플로우

```
[앱 시작]
  ↓
[자동 로그인 확인]
  ├─ accessToken 있음 → [홈 화면]
  └─ accessToken 없음 → [전화번호 인증 화면]
       ↓
    [전화번호 입력]
       ↓
    [인증번호 요청]
       ↓
    [인증번호 입력]
       ↓
    [verifyCode 호출]
       ├─ isNewUser = false → [accessToken 발급] → [홈 화면]
       └─ isNewUser = true → [temporaryToken 발급] → [회원가입 화면]
            ↓
         [이름/상호명 입력]
            ↓
         [기본 설정 (선택)]
            ├─ 건너뛰기 → [complete-signup] → [홈 화면]
            └─ 설정 입력 → [complete-signup] → [홈 화면]
```

### 2. 출결 처리 플로우

```
[홈 화면 - 오늘 수업]
  ↓
[출결 처리 버튼 클릭]
  ├─ 출석 → [서명 모달] → [저장] → [정산 자동 재계산]
  ├─ 결석/대체 → [결석/대체 모달]
  │    ├─ 결석 선택 → [사유 입력] → [저장] → [정산 자동 재계산]
  │    └─ 대체 선택 → [대체 날짜 선택] → [저장] → [정산 자동 재계산]
  └─ 이미 처리됨 → [수정 버튼] → [수정 모달] → [저장] → [정산 자동 재계산]
```

### 3. 정산 플로우

```
[정산 화면 진입]
  ↓
[getCurrentMonthInvoices 호출]
  ↓
[각 계약서별 Invoice 존재 확인]
  ├─ 없음 → [자동 생성] (예정 횟수 계산, 출결 기반 자동 조정)
  └─ 있음 → [기존 Invoice 사용]
       ↓
    [정산 화면 표시]
       ↓
    [전송 대상 선택]
       ↓
    [청구서 전송]
       ├─ 선불: 계약서와 청구서 동시 전송
       └─ 후불: 청구서만 전송
       ↓
    [전송 완료] → [Invoice 상태 'sent'로 변경]
```

### 4. 계약서 생성 플로우

```
[홈 화면 - 플로팅 버튼]
  ↓
[계약서 생성 화면]
  ├─ 수강생 선택 (기존 또는 신규)
  ├─ 기본값 자동 채움 (user.settings에서)
  ├─ 조건 입력 (과목, 요일, 시간, 금액, 정책 등)
  └─ [작성 완료]
       ↓
    [계약서 확인 화면]
       ├─ 서명 (선생님, 수강생)
       └─ [확정]
            ↓
         [전송 모달]
            ├─ 전송 방법 선택
            └─ [전송]
                 ↓
              [전송 완료] → [서명 버튼 비활성화]
```

---

## 코드 구조 및 아키텍처

### 1. 모노레포 구조

```
kimssam/
├── packages/
│   ├── app/              # React Native + Expo
│   │   ├── src/
│   │   │   ├── api/      # API 클라이언트 (axios)
│   │   │   ├── components/ # 재사용 컴포넌트
│   │   │   ├── navigation/ # React Navigation 설정
│   │   │   ├── screens/  # 화면 컴포넌트
│   │   │   ├── store/    # Zustand 상태 관리
│   │   │   ├── services/ # 서비스 (푸시 알림 등)
│   │   │   └── types/    # TypeScript 타입 정의
│   │   └── android/      # Android 네이티브 설정
│   │
│   └── backend/          # NestJS
│       ├── src/
│       │   ├── auth/     # 인증 모듈
│       │   ├── students/ # 수강생 모듈
│       │   ├── contracts/ # 계약서 모듈
│       │   ├── attendance/ # 출결 모듈
│       │   ├── invoices/ # 정산 모듈
│       │   │   └── invoice-calculation.service.ts # 정산 계산 로직
│       │   ├── notifications/ # 알림 모듈
│       │   │   ├── push-notification.service.ts # FCM 전송
│       │   │   └── notifications.service.ts # 알림 생성 및 전송
│       │   └── prisma/   # Prisma 서비스
│       └── prisma/
│           └── schema.prisma # 데이터베이스 스키마
```

### 2. 상태 관리 (프론트엔드)

**Zustand 스토어:**
- `useAuthStore`: 인증 상태, 자동 로그인, 로그인/로그아웃
- `useStudentsStore`: 수강생 목록, 검색
- `useContractsStore`: 계약서 목록
- `useDashboardStore`: 홈 화면 요약 데이터
- `useInvoicesStore`: 정산 데이터 (이번 달, 지난 달)

**데이터 격리:**
- 로그인/로그아웃 시 모든 스토어 `reset()` 호출
- 순환 참조 방지를 위해 동적 import 사용

### 3. API 통신

**인증:**
- `apiClient`의 request interceptor에서 `accessToken` 자동 추가
- 단, `temporaryToken` 사용 시 (회원가입) 기존 Authorization 헤더 유지
- 401 에러 시 자동 로그아웃 (단, 이미 로그아웃 상태면 무시)

**에러 처리:**
- 개발 모드에서 401 에러는 `console.log`로만 출력 (에러 오버레이 방지)
- 사용자에게는 간단한 메시지만 표시

### 4. 데이터베이스 스키마

**주요 모델:**
- `User`: 사용자 정보, 설정 (JSON)
- `Student`: 수강생 정보
- `Contract`: 계약서 (policy_snapshot 포함)
- `AttendanceLog`: 출결 기록 (voided, substitute_at 포함)
- `Invoice`: 정산서 (auto_adjustment, manual_adjustment 포함)
- `Notification`: 알림
- `Notice`: 공지사항

**중요한 필드:**
- `Contract.policy_snapshot`: 계약 시점 규정 고정
- `AttendanceLog.voided`: 취소된 기록 (soft delete)
- `AttendanceLog.substitute_at`: 대체 수업 날짜
- `Invoice.auto_adjustment`: 자동 계산된 조정 금액
- `Invoice.account_snapshot`: 청구서 생성 시점 계좌 정보

---

## 주요 의사결정 및 이유

### 1. policy_snapshot 사용 이유
- 계약서 규정 변경 시 기존 계약에 영향 없도록
- 과거 정산 재계산 시에도 원래 규정 사용 가능
- 데이터 무결성 보장

### 2. Invoice on-demand 생성 이유
- 정산 화면 진입 시점에만 필요하므로 미리 생성할 필요 없음
- 출결 기록 변경 시 자동 재계산으로 항상 최신 상태 유지
- 저장 공간 절약

### 3. 출결 기록 soft delete (voided)
- 삭제 이력 보존 (감사 추적)
- 취소 사유 저장 가능 (`void_reason`)
- 정산 재계산 시 취소된 기록 제외 가능

### 4. 대체 수업 처리 방식
- 원래 날짜에 `substitute` 상태로 저장
- 대체 날짜는 `substitute_at`에 저장
- 정산 계산 시 같은 달/다른 달 구분하여 처리

### 5. 데이터 격리 방식
- 백엔드: JWT에서 `user_id` 추출하여 필터링
- 프론트엔드: 로그인/로그아웃 시 스토어 초기화
- 순환 참조 방지: 동적 import 사용

### 6. 인증 플로우 분리
- `PhoneAuthScreen`: 공통 진입점 (로그인 + 회원가입)
- `SignupScreen`: 회원가입 전용 (이름, 설정 입력)
- `isNewUser` 플래그로 분기하여 UX 최적화

---

## 에지 케이스 처리

### 1. 정산 계산

**경계 케이스:**
- 예정 횟수가 0인 경우: 단가 계산 시 0으로 나누기 방지
- 출결 기록이 없는 경우: `auto_adjustment = 0`
- 이전 달 결석이 없는 경우: `previous_month_adjustment = 0`
- `planned_count_override`가 있는 경우: 예정 횟수 계산 스킵

**대체 수업:**
- 같은 달 대체: 원래 날짜는 결석, 대체 날짜는 출석
- 다른 달 대체: 원래 달은 결석, 대체 날짜 달은 출석
- `substitute_at`이 없는 경우: 결석으로 처리

### 2. 출결 처리

**오늘 수업 판단:**
- 대체 수업의 경우 `substitute_at`이 오늘이어도 `occurred_at`이 오늘이 아니면 새로운 출결 처리 가능
- 계약 기간(`started_at` ~ `ended_at`) 내의 날짜만 표시

**미처리 출결:**
- 계약 시작일(`started_at`) 이전 날짜는 제외
- 계약 종료일(`ended_at`) 이후 날짜는 제외
- 오늘 날짜는 제외 (오늘 수업 섹션에서 처리)

### 3. 인증

**전화번호 정규화:**
- 백엔드에서 전화번호 정규화 (`010-xxxx-xxxx` 형식)
- 기존 사용자 조회 시 정규화된 형식으로 검색

**토큰 관리:**
- `temporaryToken`: 회원가입 전용 (1회성, 5분 만료)
- `accessToken`: 정식 인증 토큰 (30일 만료)
- `temporaryToken` 사용 시 `accessToken`으로 덮어쓰지 않도록 주의

### 4. 데이터 일관성

**정산 재계산:**
- 출결 기록 생성/수정/취소 시 자동 재계산
- `recalculateForContractMonth()` 호출
- 실패해도 출결 기록은 저장됨 (로그만 남김)

**계약서 상태:**
- `sent` 상태인 계약서는 서명 버튼 비활성화
- 계약서 규정 변경 시 기존 계약의 `policy_snapshot`은 변경되지 않음

---

## 최근 작업 내용

### 1. 푸시 알림 구현 (2024-11-23)

**구현 내용:**
- Firebase Admin SDK 백엔드 설정 완료
- 프론트엔드 푸시 알림 서비스 구현 (`pushNotificationService.ts`)
- FCM 토큰 자동 등록 및 백엔드 저장
- 알림 수신 및 탭 이벤트 리스너 설정
- 알림 탭 시 화면 이동 처리

**파일:**
- `packages/app/src/services/pushNotificationService.ts` (신규)
- `packages/app/src/navigation/AppNavigator.tsx` (수정)
- `packages/backend/src/notifications/push-notification.service.ts`
- `packages/backend/src/notifications/notifications.service.ts`

**주의사항:**
- Dev Client 재빌드 필요 (`expo-notifications` 네이티브 모듈)
- Firebase 설정 완료 (`.env`에 `FIREBASE_SERVICE_ACCOUNT_KEY` 설정)

### 2. 미처리 출결 관리 (2024-11-23)

**구현 내용:**
- 미처리 출결 조회 API (`findUnprocessed`)
- 미처리 출결 처리 API (`processUnprocessed`)
- 미처리 출결 관리 화면 (`UnprocessedAttendanceScreen`)
- 홈 화면 안내 카드 추가

**중요:**
- 계약 기간(`started_at` ~ `ended_at`) 내의 날짜만 포함
- 미처리 출결 처리 시 자동으로 정산 재계산

### 3. 로그인/회원가입 UX 개선 (2024-11-23)

**변경 사항:**
- `PhoneAuthScreen`: 공통 진입점 (로그인 + 회원가입)
- 이전 로그인 기록이 있으면 자동으로 전화번호 채움
- `isNewUser` 플래그로 분기하여 UX 최적화
- 앱 로고 및 슬로건 추가

### 4. UI/UX 개선 (2024-11-23)

**변경 사항:**
- 전체 배경색 흰색으로 변경
- 섹션 그림자 제거
- 마이페이지 프로필 섹션 개선 (업종 아이콘 선택)
- 서비스 이용약관/개인정보처리방침 페이지 추가

---

## 주의사항 및 규칙

### 1. 코드 작성 규칙

**절대 금지:**
- `any` 타입 사용 금지 (TypeScript 타입 정의 필수)
- 임의로 코드 수정 금지 (사용자 요청 시에만)
- 우회 방법 사용 금지 (근본적인 해결 필요)
- 스파게티 코드 금지 (깔끔한 구조 유지)

**필수:**
- 기존 기능에 영향 없도록 구현
- 코드 최적화 유지
- 타입 에러 없이 구현

### 2. 데이터 무결성

**절대 변경하지 말 것:**
- `policy_snapshot`: 계약서 생성 시점 규정 고정
- `account_snapshot`: 청구서 생성 시점 계좌 정보 고정

**주의사항:**
- 출결 기록은 삭제하지 않고 `voided = true`로 처리
- Invoice의 `auto_adjustment`는 출결 변경 시 재계산
- `policy_snapshot`은 계약서 생성 시점에만 저장

### 3. 인증 및 보안

**토큰 관리:**
- `temporaryToken` 사용 시 `accessToken`으로 덮어쓰지 않도록 주의
- `apiClient` interceptor에서 기존 Authorization 헤더 확인
- 401 에러는 개발 모드에서만 로그 출력 (에러 오버레이 방지)

**에러 처리:**
- 사용자에게는 간단하고 명확한 메시지만 표시
- 개발용 상세 로그는 `__DEV__` 모드에서만 출력

### 4. 정산 계산

**중요 규칙:**
- `policy_snapshot`에서 정책 정보 가져오기 (계약서 필드 아님)
- 출결 기록은 `voided = false`만 조회
- 대체 수업은 같은 달/다른 달 구분하여 처리
- 이전 달 결석은 `carry_over` 정책일 때만 반영

**재계산 트리거:**
- 출결 기록 생성/수정/취소 시
- `recalculateForContractMonth()` 호출
- 실패해도 출결 기록은 저장됨

### 5. 프론트엔드 상태 관리

**스토어 초기화:**
- 로그인/로그아웃 시 모든 스토어 `reset()` 호출
- 순환 참조 방지를 위해 동적 import 사용
- `_loadedOnce` 플래그로 중복 로딩 방지

**데이터 격리:**
- 로그인 시 이전 사용자 데이터 제거
- 로그아웃 시 모든 데이터 초기화
- `isAuthenticated` 체크 후 API 호출

### 6. UI/UX 규칙

**스타일링:**
- `styled-components/native` 사용 (인라인 스타일 금지)
- 전체 배경색: 흰색
- 섹션 그림자: 없음
- 섹션 구분: 회색 실선

**텍스트:**
- 사용자에게 친화적인 메시지
- 에러 메시지는 간단하고 명확하게
- 개발용 로그는 사용자에게 보이지 않도록

### 7. 파일 구조

**중요 파일 위치:**
- Firebase 설정: `packages/backend/firebase-service-account.json`
- Android Firebase: `packages/app/android/app/google-services.json`
- iOS Firebase: `packages/app/GoogleService-Info.plist`
- 환경변수: `packages/backend/.env`, `packages/app/.env`

**Git 관리:**
- `.gradle/` 폴더는 `.gitignore`에 포함
- `node_modules/` 제외
- `.env` 파일 제외 (보안)

---

## 알려진 이슈 및 해결 방법

### 1. Prisma 생성 파일 절대 경로
**문제:** `packages/backend/src/generated/prisma/internal/class.ts`에 절대 경로 하드코딩
**해결:** 프로젝트 이동 후 `npx prisma generate` 재실행

### 2. 한글 경로 문제
**문제:** PowerShell에서 한글 경로 인식 실패
**해결:** 프로젝트를 영문 경로로 이동 (`C:\Projects\kimssam`)

### 3. 데이터 격리
**문제:** 로그인 후 이전 사용자 데이터 표시
**해결:** 로그인/로그아웃 시 모든 스토어 `reset()` 호출

### 4. 401 에러 오버레이
**문제:** 로그아웃 후 401 에러가 화면에 표시됨
**해결:** 개발 모드에서 `console.log`로만 출력, `isAuthenticated` 체크

---

## 다음 작업 예정

### 1. EAS Build
- Dev Client 재빌드 (푸시 알림 네이티브 모듈 포함)
- 프로젝트 경로 변경 후 Git 저장소 설정
- 빌드 실행 및 테스트

### 2. 푸시 알림 테스트
- FCM 토큰 등록 확인
- 백엔드에서 테스트 알림 전송
- 알림 수신 및 탭 이벤트 테스트

---

## 참고 문서

- `docs/IMPLEMENTATION_COMPLETE.md`: 전체 구현 내용
- `docs/IMPLEMENTATION_PLAN.md`: 구현 계획
- `docs/RELEASE_ROADMAP.md`: 릴리스 로드맵
- `README.md`: 프로젝트 개요

---

**이 문서를 읽으면 프로젝트의 모든 컨텍스트를 이해할 수 있습니다. 새로운 AI가 이 문서를 먼저 읽고 작업을 시작하세요.**

