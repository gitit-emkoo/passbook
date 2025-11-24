# 김쌤 앱 구현 계획서 v1

> 이 문서는 기획서, 화면 이미지, 추가 확인 사항을 종합한 구현 계획서입니다.  
> 모든 구현은 이 문서를 기준으로 진행됩니다.

---

## 목차

1. [프로젝트 개요](#프로젝트-개요)
2. [기술 스택](#기술-스택)
3. [데이터베이스 스키마](#데이터베이스-스키마)
4. [API 엔드포인트](#api-엔드포인트)
5. [화면 구조 및 컴포넌트](#화면-구조-및-컴포넌트)
6. [핵심 로직](#핵심-로직)
7. [모달 컴포넌트](#모달-컴포넌트)
8. [구현 순서](#구현-순서)
9. [주의사항](#주의사항)

---

## 프로젝트 개요

### 목적
개인사업자/소규모 레슨(공부방, 과외, 골프, 보컬, 필라, PT, 공방 등)에서
1. 수업 출결 기록
2. 약식 계약서 규정 적용
3. 청구 안내 및 결제코드/입금계좌 전송

까지를 앱 하나에서 처리하여, **강사와 수강생(및 보호자) 모두에게 합리적인 거래 증명**을 남기는 것

### 핵심 고객
**개인사업자/소규모 레슨을 운영하는 강사**

- 주요 사용자: 강사 (앱을 직접 사용)
- 관리 대상: 수강생 (앱을 직접 사용하지 않음, 강사가 관리)

---

## 기술 스택

### 프론트엔드 (앱)
- **React Native** 0.81.5
- **Expo SDK** 54
- **TypeScript** 5.9.2
- **styled-components** (React Native용)
- **Zustand** (상태 관리)
- **react-native-google-mobile-ads** (Google Ads)
- **expo-dev-client** (개발 클라이언트)
- **expo-constants** (환경변수)

### 백엔드
- **Node.js** 20.x LTS
- **NestJS** 11
- **Prisma** 5
- **PostgreSQL** 15.x / 16.x
- **TypeScript** 5.7.3
- **@nestjs/config** (환경변수)

### 기타
- **FCM** (+APNs) - 푸시 알림
- **AdMob** - 광고 (테스트 ID 사용 중)

---

## 데이터베이스 스키마

### 1. users (또는 teachers)
인증용 강사 계정

```prisma
model User {
  id        Int      @id @default(autoincrement())
  phone     String   @unique
  name      String?
  org_code  String?
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  students       Student[]
  contracts     Contract[]
  attendance_logs AttendanceLog[]
  invoices       Invoice[]
  notifications  Notification[]
}
```

**특징:**
- 휴대폰번호 + 인증번호(6자리) 방식 인증
- 최초 로그인 시 자동 생성 (회원가입 없음)
- 모든 데이터는 이 user가 만든/조회하는 데이터

---

### 2. students
수강생 기본 정보

```prisma
model Student {
  id            Int      @id @default(autoincrement())
  name          String   // 수강생 이름
  phone         String   // 수신번호 (필수)
  guardian_name String?  // 보호자 이름 (선택)
  guardian_phone String? // 보호자 연락처 (선택)
  is_active     Boolean  @default(true)
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  contracts       Contract[]
  attendance_logs AttendanceLog[]
  invoices        Invoice[]
}
```

**특징:**
- 수강생은 앱을 직접 사용하지 않음
- 최소한 수신번호만 있으면 됨

---

### 3. contracts
계약서/레슨 정보

```prisma
model Contract {
  id                    Int      @id @default(autoincrement())
  student_id            Int
  subject               String   // 레슨명/과목명
  day_of_week           Json     // ["TUE", "THU"] 형식
  time                  String   // "16:00" 형식 (HH:MM)
  billing_type          BillingType // prepaid | postpaid
  absence_policy        AbsencePolicy // carry_over | deduct_next | vanish
  monthly_amount        Int     // 정가 (예: 100000)
  recipient_policy      String  // student_only | guardian_only | both | custom
  recipient_targets     Json    // 실제 보낼 번호들
  policy_snapshot       Json    // 생성 시점 규정 고정 저장
  planned_count_override Int?   // 월별 횟수 강제 지정 (nullable)
  status                ContractStatus // draft | confirmed | sent
  created_at            DateTime @default(now())
  updated_at            DateTime @updatedAt

  student         Student         @relation(fields: [student_id], references: [id])
  attendance_logs AttendanceLog[]
  invoices        Invoice[]
}
```

**특징:**
- `policy_snapshot`: 계약 생성 시점의 규정(결제방식, 결석처리, 월금액)을 JSON으로 고정 저장
- 설정에서 바꾼 값은 새 계약 만들 때만 들어가고, 이미 만들어진 계약은 `policy_snapshot`만 계속 사용
- `day_of_week`: JSON 배열 형식 `["TUE", "THU"]`
- `time`: 24시간제 문자열 `"HH:MM"` (예: `"16:00"`, `"09:30"`)

---

### 4. attendance_logs
출결 기록

```prisma
model AttendanceLog {
  id             Int      @id @default(autoincrement())
  student_id     Int
  contract_id    Int
  occurred_at    DateTime // 그 수업이 실제로 있었던 날짜/시간
  status         AttendanceStatus // present | absent | substitute | vanish
  substitute_at  DateTime? // 대체수업일 있으면
  memo_public    String?  // 수신자에게 보여줄 짧은 안내
  memo_internal  String?  // 강사 전용 메모
  recorded_at    DateTime @default(now())
  recorded_by    Int      // user_id
  modified_at    DateTime?
  modified_by    Int?
  change_reason  String?
  voided         Boolean  @default(false)
  void_reason    String?

  student    Student  @relation(fields: [student_id], references: [id])
  contract   Contract @relation(fields: [contract_id], references: [id])
}
```

**특징:**
- 출결은 삭제하지 않고 수정/취소로만 처리
- 수정 시 `modified_at`, `modified_by`, `change_reason` 저장
- 취소 시 `voided = true`, `void_reason` 저장
- 정산은 이 테이블을 기준으로 계산

**대체 수업 처리:**
- 같은 달 안에서 대체: 그 달은 "정상 출석 1회"로 처리
- 다음 달로 대체: 원래 달은 결석 규칙 적용, 대체 달은 출석으로 처리

---

### 5. invoices
정산 정보

```prisma
model Invoice {
  id                Int      @id @default(autoincrement())
  student_id        Int
  contract_id       Int
  year              Int      // 예: 2025
  month             Int      // 예: 11
  base_amount       Int      // 계약의 월 기준금액
  auto_adjustment   Int      @default(0) // 출결로 자동 계산된 증감
  manual_adjustment Int      @default(0) // 강사가 수정한 금액
  manual_reason     String?
  final_amount      Int      // base_amount + auto_adjustment + manual_adjustment
  planned_count      Int?     // 그 달 예정 수업 횟수
  send_status        InvoiceSendStatus // not_sent | sent | partial
  send_to            Json?    // 실제 전송 대상
  send_history       Json?    // 채널/시각/성공여부
  account_snapshot   Json?    // 청구서 하단에 보여줄 계좌
  created_at         DateTime @default(now())
  updated_at         DateTime @updatedAt

  student  Student   @relation(fields: [student_id], references: [id])
  contract Contract  @relation(fields: [contract_id], references: [id])
}
```

**특징:**
- `final_amount = base_amount + auto_adjustment + manual_adjustment`
- 출결 수정/취소 시 `auto_adjustment` 재계산
- 정산 화면에 보이는 한 줄이 이 테이블의 한 row

**생성 시점:**
- 정산 화면 진입 시 on-demand 생성
- 해당 월의 invoice가 없으면 그때 생성

---

### 6. notifications
알림

```prisma
model Notification {
  id          Int      @id @default(autoincrement())
  user_id     Int      // 강사
  type        String   // settlement_pending, contract_expiring 등
  title       String
  body        String
  target_route String  // 예: /settlement, /students/3
  is_read     Boolean  @default(false)
  push_sent   Boolean  @default(false)
  push_sent_at DateTime?
  created_at  DateTime @default(now())

  user User @relation(fields: [user_id], references: [id])
}
```

**특징:**
- 푸시가 실패해도 이 테이블에는 무조건 INSERT
- 알림 탭 시 `target_route`로 딥링크 이동

---

## ENUM 타입 정의

```typescript
// 출석 상태
type AttendanceStatus = 'present' | 'absent' | 'substitute' | 'vanish';

// 청구 전송 상태
type InvoiceSendStatus = 'not_sent' | 'sent' | 'partial';

// 결제 방식
type BillingType = 'prepaid' | 'postpaid';

// 결석 처리 방식
type AbsencePolicy = 'carry_over' | 'deduct_next' | 'vanish';

// 계약서 상태
type ContractStatus = 'draft' | 'confirmed' | 'sent';
```

---

## API 엔드포인트

### 인증 (2개)
```
POST /auth/request-code
  body: { phone: "010..." }
  -> SMS로 6자리 전송

POST /auth/verify-code
  body: { phone: "010...", code: "123456" }
  -> 성공 시 JWT 토큰 반환
```

### 수강생 (2개)
```
GET /api/v1/students
  query: ?filter=all|current_month|needs_attention&search=...
  -> 수강생 리스트 (필터, 검색 파라미터 포함)

GET /api/v1/students/{id}
  -> 기본정보, 계약정보(policy_snapshot), 이번 달 출결로그, 정산 히스토리 포함
```

### 출결 (2개)
```
POST /api/v1/attendance
  body: {
    student_id: number,
    contract_id: number,
    occurred_at: string, // ISO datetime
    status: AttendanceStatus,
    substitute_at?: string,
    memo_public?: string,
    memo_internal?: string
  }
  -> 홈에서 출석/결석/대체 버튼 눌렀을 때 새 로그 INSERT

PATCH /api/v1/attendance/{id}
  body: {
    status?: AttendanceStatus,
    substitute_at?: string,
    memo_public?: string,
    memo_internal?: string,
    change_reason: string
  }
  -> 출결 로그 수정/취소
```

### 계약서 (1개)
```
POST /api/v1/contracts
  body: {
    student_id: number,
    subject: string,
    day_of_week: string[], // ["TUE", "THU"]
    time: string, // "16:00"
    billing_type: BillingType,
    absence_policy: AbsencePolicy,
    monthly_amount: number,
    recipient_policy: string,
    recipient_targets: string[],
    planned_count_override?: number,
    ...
  }
  -> 플로팅 버튼 → 약식 계약서 저장할 때 사용
```

### 정산 (3개)
```
GET /api/v1/invoices/current
  -> 이번 달 정산 목록 (정산 메인에서 사용하는 리스트)

PATCH /api/v1/invoices/{id}
  body: {
    manual_adjustment: number,
    manual_reason?: string
  }
  -> 금액 수정, 수동 조정, 사유

POST /api/v1/invoices/send
  body: {
    invoice_ids: number[],
    channel: 'sms' | 'kakao' | 'link'
  }
  -> 이번 달 전송 가능한 수강생들에게 청구서 전송
```

### 알림 (1개)
```
GET /api/v1/notifications
  query: ?filter=all|settlement|student|attendance
  -> 알림 리스트 (푸시를 꺼도 알림함에 쌓이도록)
```

**총 11개 API 엔드포인트**

---

## 화면 구조 및 컴포넌트

### 하단 네비게이션 바
- 홈 (`/home`)
- 수강생 (`/students`)
- 플로팅 버튼 (홈에서만 보임) → `/contracts/new`
- 정산 (`/settlement`)
- 설정 (`/settings`)

### 주요 화면 (6개)

#### 1. 홈 화면 (`/home`)
**파일:** `packages/app/src/screens/HomeScreen.tsx`

**구성:**
- 상단: 로고, 알림 아이콘, 안내 텍스트
- 오늘 수업 섹션: 계약 중인 레슨 리스트, 출석/결석/대체 버튼
- 정산 알림 섹션: "11월 정산할 학생 3명" 카드
- 추가 안내가 필요한 수강생 섹션
- 플로팅 버튼: 레슨/계약서 추가

**핵심 동작:**
- 출석/결석/대체 버튼 클릭 → `POST /api/v1/attendance`
- 설정에서 출석 후 서명 ON이면 서명 모달 표시

---

#### 2. 수강생 리스트 (`/students`)
**파일:** `packages/app/src/screens/StudentsListScreen.tsx`

**구성:**
- 상단: 제목, 서브텍스트, 수강생 추가 버튼
- 검색바: 이름/보호자/과목 검색
- 필터: 전체 / 이번 달 청구 대상 / 추가 안내 필요
- 수강생 카드 리스트:
  - 결제방식/결석정책 뱃지
  - 수업 정보
  - 이번 달 상태 요약
  - 금액 영역
  - 상세보기 버튼

**핵심 동작:**
- 검색/필터 → `GET /api/v1/students?filter=...&search=...`
- 수강생 추가 버튼 → `/contracts/new`

---

#### 3. 수강생 상세 (`/students/:id`)
**파일:** `packages/app/src/screens/StudentDetailScreen.tsx`

**구성:**
- 기본 정보 섹션
- 계약 정보 섹션: policy_snapshot 안내문
- 이번 달 출석/결석 로그 (타임라인)
- 정산 히스토리
- 수정 버튼: 출결 로그 수정 모달

**핵심 동작:**
- 출결 로그 수정 → `PATCH /api/v1/attendance/{id}`
- 수정 내역은 타임라인에 표시

---

#### 4. 계약서 생성 (`/contracts/new`)
**파일:** `packages/app/src/screens/ContractNewScreen.tsx`

**구성:**
- 수강생 정보 입력
- 수업/금액 입력
- 결제/결석 규정 선택
- 서명란 (강사/수강생)
- 전송 옵션 & 계좌
- 저장 버튼

**핵심 동작:**
- 저장 시 `policy_snapshot` 생성
- `POST /api/v1/contracts`
- 전송 모달 표시

---

#### 5. 정산 메인 (`/settlement`)
**파일:** `packages/app/src/screens/SettlementScreen.tsx`

**구성:**
- 이번 달 정산 카드 (기본 펼침)
- 학생별 라인: 금액, 수정 버튼
- 청구서 전송 버튼
- 지난 달 정산 카드들 (기본 접힘)

**핵심 동작:**
- 화면 진입 시 invoice on-demand 생성
- 금액 수정 → `PATCH /api/v1/invoices/{id}`
- 청구서 전송 버튼 → `/settlement/send`

---

#### 6. 전송 대상 확인 (`/settlement/send`)
**파일:** `packages/app/src/screens/SettlementSendScreen.tsx`

**구성:**
- 전송 가능한 수강생 섹션
- 전송 불가/선택 전송 섹션
- 전송 버튼

**핵심 동작:**
- `POST /api/v1/invoices/send`
- 전송 결과 모달 표시

---

#### 7. 설정 (`/settings`)
**파일:** `packages/app/src/screens/SettingsScreen.tsx`

**구성:**
- 결제·결석 규칙: 드롭다운
- 출석·서명: 토글 스위치
- 청구서 표시: 토글 스위치
- 기본 입금 계좌
- 기관 코드 입력

**핵심 동작:**
- 설정 변경은 새 계약의 기본값만 변경
- 기존 계약에는 영향 없음

---

#### 8. 알림 (`/notifications`)
**파일:** `packages/app/src/screens/NotificationsScreen.tsx`

**구성:**
- 알림 리스트
- 필터: 전체 / 정산 / 수강생 / 출결
- 모두 읽음 버튼

**핵심 동작:**
- `GET /api/v1/notifications`
- 알림 탭 시 `target_route`로 딥링크 이동

---

## 핵심 로직

### 1. 정산 자동 계산 로직

#### 기본 전제
- 계약에 `monthly_amount`가 있음
- 한 달에 예정된 수업 횟수 (`planned_count`) 계산:
  - 기본: 달력 기반 자동 계산 (요일별 해당 월 개수)
  - 옵션: `contracts.planned_count_override` 우선 사용
- 1회 금액: `per_session = monthly_amount / planned_count`

#### 후불(postpaid)일 때
1. 이번 달에 출석으로 기록된 횟수만큼 과금
2. 결석이 `absence_policy = deduct_next`인 경우:
   - 이번 달 금액에서는 빼지 않음
   - 다음 달 `auto_adjustment`에 반영
3. **공식:**
   ```
   이번 달 출석 n회 → final_amount = per_session * n회
   ```

#### 선불(prepaid)일 때
1. 선불은 돈은 미리 받았다고 가정
2. 이번 달에 결석이 생겼고 그 정책이 차월차감이면:
   - 이번 달 청구는 0원일 수 있음
   - 다음 달 `auto_adjustment = - (per_session * 결석횟수)` 로 붙음
3. 선불인데 소멸이면 그냥 0원 처리만 해두고 다음 달로 안 넘김

#### 최종 금액 계산
```
final_amount = base_amount + auto_adjustment + manual_adjustment
```

**핵심 포인트:**
- 출결을 바꾸면 → 그 달 invoice의 `auto_adjustment`만 다시 계산
- 계약의 정책이 바뀌어도 → `policy_snapshot`으로 계산했기 때문에 과거 달은 안 깨짐

---

### 2. 대체 수업 정산 반영

**같은 달 안에서 대체:**
- 그 달은 "정상 출석 1회"로 처리
- 그 달 invoice에서는 감액이 일어나지 않음

**다음 달로 대체:**
- 원래 달에는 감액(또는 다음 달 차감)이 남음
- 대체가 일어난 달에는 출석 1회로 잡힘

**구현:**
- `attendance_logs.status = 'substitute'`이고 `substitute_at`이 해당 월 안이면 → 그 월 자동계산에서 "출석 1회"로 처리
- `substitute_at`이 다음 달이면 → 원래 달은 결석 규칙대로 `auto_adjustment` 생성, 대체가 일어난 달에는 출석으로 1회 추가

---

### 3. Invoice 생성 시점

**v1 방식:**
- 정산 화면 진입 시 on-demand 생성
- 해당 월의 invoice가 없으면 그때 생성

**나중에 추가 가능:**
- 매월 1일 00:10에 "이번 달 invoice 미리 생성" 크론

---

### 4. 예정 수업 횟수 계산

**기본 원칙:**
- 계약서에서는 "요일 + 시간"만 입력받음
- 월별 예정 횟수는 서버에서 그 달의 실제 달력으로 계산

**예시:**
- `day_of_week = ["TUE", "THU"]`인 계약이 2025년 11월에 있으면
- 그 달의 화/목 개수를 세서 8회 또는 9회를 얻음
- 이 값을 그 달 invoice 만들 때 `planned_count`로 사용

**옵션 필드:**
- `contracts.planned_count_override` (nullable)
- 있으면 override를 쓰고, 없으면 달력으로 계산

---

### 5. 선불권 잔여 횟수 관리

**v1 방식:**
- DB에 잔여 횟수를 따로 들고 있지 않음
- `attendance_logs`를 역산해서 판단

**이유:**
- 선불/후불/대체/소멸 정책이 섞여 있어서, 고정 숫자로 들고 있으면 나중에 정책 바뀔 때 틀어질 수 있음

**확장용 필드 (선택):**
- `contracts.prepaid_total_sessions` (처음 선불로 받은 총 회차)
- `contracts.prepaid_consumed_sessions` (전송 시점에 계산해서 보여주기 용)

---

### 6. 설정값과 계약서 스냅샷 분리

**핵심 원칙:**
- 설정 화면에서 결제방식이나 결석 처리 기본값을 바꿔도
- 이미 작성·서명된 계약서에는 적용되지 않음
- 계약 생성 시점에 저장된 `policy_snapshot`만으로 정산

**즉:**
- 설정은 "새 계약의 초기값"일 뿐
- 기존 계약을 일괄 변경하지 않음

---

### 7. 출결 → 정산 연결

**핵심 동작:**
- 홈에서 강사가 오늘 수업을 결석(차월차감)으로 기록했을 때
- 이 기록은 바로 이번 달 청구 금액을 줄이는 게 아님
- "다음 달 invoice의 `auto_adjustment`로 마이너스가 들어가야 함"

**수정/취소 시:**
- 기록을 나중에 수정해도 다시 반영되도록 설계
- 출결 수정 시 해당 달 invoice의 `auto_adjustment` 재계산

---

### 8. 알림/푸시 우선순위

**핵심 원칙:**
- 사용자가 푸시를 꺼놔도 정산 못 보낸 내역, 전송 실패 같은 중요한 알림은 반드시 앱 내부 알림함에 남아야 함
- 알림을 탭하면 관련 화면(`/settlement`, `/students/:id`)으로 바로 이동

**구현:**
1. 알림 테이블에 레코드 생성
2. 푸시 전송 시도
3. 성공/실패 여부를 notification에 저장
4. 실패여도 `/notifications`에는 항상 노출

---

## 모달 컴포넌트

### 1. AttendanceSignatureModal
**위치:** 홈 화면에서 출석 버튼 클릭 시 (설정에서 출석 후 서명 ON일 때)

**기능:**
- 출석 후 서명 요청
- 서명 완료 후 출결 기록 저장

---

### 2. AttendanceAbsenceModal
**위치:** 홈 화면에서 결석/대체 버튼 클릭 시

**기능:**
- 결석/대체 처리 선택
- 대체 수업 날짜 선택 (대체인 경우)
- 메모 입력
- 출결 기록 저장

---

### 3. AttendanceEditModal
**위치:** 수강생 상세에서 출결 로그 수정 버튼 클릭 시

**기능:**
- 출결 상태 수정 (출석 ↔ 결석 ↔ 대체 ↔ 소멸)
- 메모 수정
- 공개 여부 설정
- 변경 사유 입력
- 수정 저장

---

### 4. AttendanceVoidModal
**위치:** 수강생 상세에서 출결 로그 취소 시

**기능:**
- 출결 취소 확인
- 취소 사유 입력
- 취소 처리 (voided = true)

---

### 5. ContractPreviewModal
**위치:** 계약서 저장 후 전송 모달

**기능:**
- 계약서 미리보기
- 전송 방식 선택 (SMS 링크 / 링크만 복사 / 카카오톡 비활성)
- 전송 실행

---

### 6. InvoiceAmountModal
**위치:** 정산 화면에서 금액 수정 버튼 클릭 시

**기능:**
- 금액 수정
- 수동 조정 사유 입력
- 수정 저장

---

### 7. InvoiceSendModal
**위치:** 정산 전송 대상 확인 화면에서 전송 버튼 클릭 시

**기능:**
- 전송 방식 선택 (SMS / 카카오 / 링크)
- 전송 대상 확인
- 전송 실행

---

### 8. InvoiceSendResultModal
**위치:** 청구서 전송 후 결과 표시

**기능:**
- 전송 성공/실패 결과 표시
- 전송된 수강생 목록
- 실패한 수강생 및 사유

---

## 구현 순서

### Phase 1: 기본 인프라 및 인증
1. Prisma 스키마 작성 및 마이그레이션
2. NestJS 기본 구조 설정
3. 인증 API 구현 (`POST /auth/request-code`, `POST /auth/verify-code`)
4. JWT 미들웨어 설정
5. 기본 에러 핸들링

### Phase 2: 데이터베이스 및 기본 API
1. 모든 테이블 Prisma 모델 작성
2. 기본 CRUD 서비스 구현
3. 정산 계산 로직 구현 (핵심)
4. 예정 수업 횟수 계산 로직 구현

### Phase 3: 앱 기본 구조
1. React Navigation 설정
2. 하단 탭 네비게이션 설정
3. 기본 화면 컴포넌트 생성
4. Zustand 스토어 설정
5. API 클라이언트 설정 (axios/fetch)

### Phase 4: 홈 화면 및 출결
1. 홈 화면 레이아웃 구현
2. 오늘 수업 섹션 구현
3. 출석/결석/대체 버튼 동작
4. 출결 API 연동 (`POST /api/v1/attendance`)
5. 출석 후 서명 모달 구현
6. 결석/대체 모달 구현

### Phase 5: 수강생 관리
1. 수강생 리스트 화면 구현
2. 검색/필터 기능
3. 수강생 상세 화면 구현
4. 출결 로그 타임라인 구현
5. 출결 수정 모달 구현 (`PATCH /api/v1/attendance/{id}`)

### Phase 6: 계약서
1. 계약서 생성 화면 구현
2. 폼 입력 처리
3. `policy_snapshot` 생성 로직
4. 계약서 저장 API 연동 (`POST /api/v1/contracts`)
5. 계약서 미리보기/전송 모달 구현

### Phase 7: 정산
1. 정산 메인 화면 구현
2. Invoice on-demand 생성 로직
3. 정산 카드 UI 구현
4. 금액 수정 모달 구현 (`PATCH /api/v1/invoices/{id}`)
5. 전송 대상 확인 화면 구현
6. 청구서 전송 API 연동 (`POST /api/v1/invoices/send`)
7. 전송 결과 모달 구현

### Phase 8: 설정 및 알림
1. 설정 화면 구현
2. 설정 값 저장/로드
3. 알림 화면 구현
4. 알림 API 연동 (`GET /api/v1/notifications`)
5. 알림 딥링크 처리

### Phase 9: 테스트 및 최적화
1. 전체 플로우 테스트
2. 정산 계산 로직 검증
3. 성능 최적화
4. 에러 처리 개선
5. UI/UX 개선

---

## 주의사항

### 1. 코드 작성 규칙
- **절대 추측하지 않음**: 코드와 데이터 등 활용 가능한 정보를 최대한 활용
- **임의 변경 금지**: 기획서에 명시된 것만 처리, 변경 필요 시 상의 필수
- **코드 최적화**: 불필요하거나 방해되는 코드 제거, 스파게티 코드 금지
- **모든 선택은 합의 후 진행**: 임의 선택 금지

### 2. 데이터 일관성
- `policy_snapshot`은 절대 변경하지 않음
- 출결 기록은 삭제하지 않고 수정/취소로만 처리
- Invoice의 `auto_adjustment`는 출결 변경 시 재계산

### 3. 타임존 처리
- 서버 저장: UTC
- 클라이언트 표시: KST (Asia/Seoul)
- "오늘 수업" 조회는 KST 기준으로 필터링

### 4. 환경변수 관리
- 모든 하드코딩 금지
- `.env` 파일로 관리
- 앱: `packages/app/.env`
- 백엔드: `packages/backend/.env`

### 5. 이미지 및 기획서 대조
- 항상 이미지와 기획서를 대조해서 작업
- 화면 구조는 이미지 기준으로 구현
- 기능은 기획서 기준으로 구현

### 6. 개발 클라이언트 사용
- 웹이나 Expo Go로 테스트하지 않음
- 개발 클라이언트로만 테스트
- `expo-dev-client` 설정 완료됨

### 7. Google AdMob
- 현재 테스트 ID 사용 중
- 나중에 실제 앱 ID로 교체 예정
- 환경변수로 관리 (`ANDROID_ADMOB_APP_ID`, `IOS_ADMOB_APP_ID`)

---

## 파일 구조 예시

```
packages/
├── app/
│   ├── src/
│   │   ├── screens/
│   │   │   ├── HomeScreen.tsx
│   │   │   ├── StudentsListScreen.tsx
│   │   │   ├── StudentDetailScreen.tsx
│   │   │   ├── ContractNewScreen.tsx
│   │   │   ├── SettlementScreen.tsx
│   │   │   ├── SettlementSendScreen.tsx
│   │   │   ├── SettingsScreen.tsx
│   │   │   └── NotificationsScreen.tsx
│   │   ├── components/
│   │   │   ├── modals/
│   │   │   │   ├── AttendanceSignatureModal.tsx
│   │   │   │   ├── AttendanceAbsenceModal.tsx
│   │   │   │   ├── AttendanceEditModal.tsx
│   │   │   │   ├── AttendanceVoidModal.tsx
│   │   │   │   ├── ContractPreviewModal.tsx
│   │   │   │   ├── InvoiceAmountModal.tsx
│   │   │   │   ├── InvoiceSendModal.tsx
│   │   │   │   └── InvoiceSendResultModal.tsx
│   │   │   └── ...
│   │   ├── store/
│   │   │   └── useStore.ts (Zustand)
│   │   ├── api/
│   │   │   └── client.ts
│   │   ├── config/
│   │   │   └── env.ts
│   │   └── navigation/
│   │       └── AppNavigator.tsx
│   └── ...
└── backend/
    ├── src/
    │   ├── auth/
    │   ├── students/
    │   ├── contracts/
    │   ├── attendance/
    │   ├── invoices/
    │   ├── notifications/
    │   └── common/
    └── prisma/
        └── schema.prisma
```

---

## 체크리스트

### 데이터베이스
- [ ] Prisma 스키마 작성 (6개 테이블)
- [ ] ENUM 타입 정의
- [ ] 관계 설정
- [ ] 마이그레이션 실행

### 백엔드 API
- [ ] 인증 API (2개)
- [ ] 수강생 API (2개)
- [ ] 출결 API (2개)
- [ ] 계약서 API (1개)
- [ ] 정산 API (3개)
- [ ] 알림 API (1개)

### 핵심 로직
- [ ] 정산 자동 계산 로직
- [ ] 예정 수업 횟수 계산
- [ ] 대체 수업 처리 로직
- [ ] Invoice on-demand 생성
- [ ] policy_snapshot 생성

### 앱 화면
- [ ] 홈 화면
- [ ] 수강생 리스트
- [ ] 수강생 상세
- [ ] 계약서 생성
- [ ] 정산 메인
- [ ] 전송 대상 확인
- [ ] 설정
- [ ] 알림

### 모달
- [ ] AttendanceSignatureModal
- [ ] AttendanceAbsenceModal
- [ ] AttendanceEditModal
- [ ] AttendanceVoidModal
- [ ] ContractPreviewModal
- [ ] InvoiceAmountModal
- [ ] InvoiceSendModal
- [ ] InvoiceSendResultModal

---

**이 문서는 구현의 기준이 됩니다. 모든 구현은 이 문서를 따릅니다.**

