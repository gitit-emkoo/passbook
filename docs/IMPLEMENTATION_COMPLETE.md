# 김쌤 앱 구현 완료 문서

> 이 문서는 Phase 1~8까지 구현한 내용을 상세하게 기록한 문서입니다.  
> 이 문서만 보면 앱의 전체 구조와 구현 내용을 완전히 이해할 수 있습니다.

---

## 목차

1. [프로젝트 구조](#프로젝트-구조)
2. [Phase 1: 기본 인프라 및 인증 API](#phase-1-기본-인프라-및-인증-api)
3. [Phase 2: 데이터베이스 및 기본 API](#phase-2-데이터베이스-및-기본-api)
4. [Phase 3: 앱 기본 구조](#phase-3-앱-기본-구조)
5. [Phase 4: 홈 화면 및 출결](#phase-4-홈-화면-및-출결)
6. [Phase 5: 수강생 관리](#phase-5-수강생-관리)
7. [Phase 6: 계약서 생성](#phase-6-계약서-생성)
8. [Phase 7: 정산 기능](#phase-7-정산-기능)
9. [Phase 8: 인증, 설정, 알림](#phase-8-인증-설정-알림)
10. [핵심 로직 설명](#핵심-로직-설명)

---

## 프로젝트 구조

### 모노레포 구조
```
kimssam/
├── packages/
│   ├── app/              # React Native 앱 (프론트엔드)
│   │   ├── src/
│   │   │   ├── api/      # API 클라이언트
│   │   │   ├── components/ # 재사용 컴포넌트
│   │   │   ├── config/   # 설정 (env)
│   │   │   ├── navigation/ # 네비게이션 설정
│   │   │   ├── screens/  # 화면 컴포넌트
│   │   │   └── store/    # Zustand 상태 관리
│   │   ├── App.tsx
│   │   ├── app.config.js # Expo 설정
│   │   └── package.json
│   │
│   └── backend/          # NestJS 백엔드
│       ├── src/
│       │   ├── auth/     # 인증 모듈
│       │   ├── students/ # 수강생 모듈
│       │   ├── contracts/ # 계약서 모듈
│       │   ├── attendance/ # 출결 모듈
│       │   ├── invoices/  # 정산 모듈
│       │   ├── notifications/ # 알림 모듈
│       │   ├── prisma/   # Prisma 서비스
│       │   └── main.ts   # 진입점
│       ├── prisma/
│       │   └── schema.prisma # 데이터베이스 스키마
│       └── package.json
│
└── package.json          # 루트 워크스페이스 설정
```

### 기술 스택

**프론트엔드:**
- React Native + Expo
- TypeScript
- React Navigation (Stack + Bottom Tabs)
- Zustand (상태 관리)
- styled-components/native (스타일링)
- axios (HTTP 클라이언트)
- AsyncStorage (로컬 저장소)

**백엔드:**
- Node.js + NestJS
- TypeScript
- PostgreSQL
- Prisma ORM
- JWT (인증)
- Passport (인증 전략)

---

## Phase 1: 기본 인프라 및 인증 API

### 목표
- 모노레포 구조 설정
- NestJS 백엔드 기본 구조
- 전화번호 기반 인증 API 구현

### 구현 내용

#### 1. 모노레포 설정

**루트 `package.json`:**
```json
{
  "name": "kimssam",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "app:start": "cd packages/app && npm start",
    "app:android": "cd packages/app && npm run android",
    "app:ios": "cd packages/app && npm run ios",
    "backend:start": "cd packages/backend && npm run start:dev",
    "backend:build": "cd packages/backend && npm run build"
  }
}
```

#### 2. 백엔드 기본 구조

**`packages/backend/src/main.ts`:**
```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // CORS 설정
  app.enableCors();
  
  // 전역 예외 필터
  app.useGlobalFilters(new HttpExceptionFilter());
  
  // 전역 검증 파이프
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  
  await app.listen(3000);
}
bootstrap();
```

#### 3. 인증 API 구현

**`packages/backend/src/auth/auth.service.ts`:**
- `requestCode(phone)`: 전화번호로 6자리 인증 코드 생성 및 저장 (5분 유효)
- `verifyCode(phone, code)`: 인증 코드 검증 후 JWT 토큰 발급
- 개발 환경에서는 콘솔에 인증 코드 출력 (실제 SMS는 TODO)

**`packages/backend/src/auth/auth.controller.ts`:**
```typescript
@Controller('auth')
export class AuthController {
  @Post('request-code')
  async requestCode(@Body() dto: RequestCodeDto) {
    return this.authService.requestCode(dto.phone);
  }

  @Post('verify-code')
  async verifyCode(@Body() dto: VerifyCodeDto) {
    return this.authService.verifyCode(dto.phone, dto.code);
  }
}
```

**인증 코드 저장:**
- 메모리 Map 사용: `Map<string, VerificationCode>`
- VerificationCode: `{ phone, code, expiresAt }`

**JWT 전략:**
- `packages/backend/src/auth/jwt-strategy/jwt.strategy.ts`: Passport JWT 전략 구현
- `packages/backend/src/auth/jwt-auth/jwt-auth.guard.ts`: JWT 가드 구현

**환경 변수 (.env):**
```env
DATABASE_URL=postgresql://kimssam_user:cns8377933@localhost:5432/kimssam?schema=public
PORT=3000
NODE_ENV=development
JWT_SECRET=please-change-in-production-very-long-secret
JWT_EXPIRES_IN=30d
```

---

## Phase 2: 데이터베이스 및 기본 API

### 목표
- Prisma 스키마 정의
- 데이터베이스 모델 생성
- 기본 CRUD API 구현 (Students, Contracts, Attendance, Invoices)

### 구현 내용

#### 1. Prisma 스키마

**`packages/backend/prisma/schema.prisma`:**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ENUMs
enum AttendanceStatus {
  present
  absent
  substitute
  vanish
}

enum InvoiceSendStatus {
  not_sent
  sent
  partial
}

enum BillingType {
  prepaid
  postpaid
}

enum AbsencePolicy {
  carry_over
  deduct_next
  vanish
}

enum ContractStatus {
  draft
  confirmed
  sent
}

// Models
model User {
  id        Int      @id @default(autoincrement())
  phone     String   @unique
  name      String?
  org_code  String?
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  students       Student[]
  contracts      Contract[]
  attendance_logs AttendanceLog[]
  invoices       Invoice[]
  notifications  Notification[]

  @@map("users")
}

model Student {
  id            Int      @id @default(autoincrement())
  user_id       Int
  name          String
  phone         String
  guardian_name String?
  guardian_phone String?
  is_active     Boolean  @default(true)
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  user            User      @relation(fields: [user_id], references: [id], onDelete: Cascade)
  contracts       Contract[]
  attendance_logs AttendanceLog[]
  invoices        Invoice[]

  @@map("students")
}

model Contract {
  id                    Int      @id @default(autoincrement())
  user_id               Int
  student_id            Int
  subject               String
  day_of_week           Json     // ["TUE", "THU"] 형식
  time                  String   // "16:00" 형식 (HH:MM)
  billing_type          BillingType
  absence_policy        AbsencePolicy
  monthly_amount        Int
  recipient_policy      String   // student_only | guardian_only | both | custom
  recipient_targets     Json     // 실제 보낼 번호들
  policy_snapshot       Json     // 생성 시점 규정 고정 저장
  planned_count_override Int?    // 월별 횟수 강제 지정 (nullable)
  status                ContractStatus
  created_at            DateTime @default(now())
  updated_at            DateTime @updatedAt

  user            User            @relation(fields: [user_id], references: [id], onDelete: Cascade)
  student         Student         @relation(fields: [student_id], references: [id], onDelete: Cascade)
  attendance_logs AttendanceLog[]
  invoices        Invoice[]

  @@map("contracts")
}

model AttendanceLog {
  id             Int      @id @default(autoincrement())
  user_id        Int
  student_id     Int
  contract_id    Int
  occurred_at    DateTime
  status         AttendanceStatus
  substitute_at  DateTime?
  memo_public    String?
  memo_internal  String?
  recorded_at    DateTime @default(now())
  recorded_by    Int      // user_id
  modified_at    DateTime?
  modified_by    Int?
  change_reason  String?
  voided         Boolean  @default(false)
  void_reason    String?

  user       User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  student    Student  @relation(fields: [student_id], references: [id], onDelete: Cascade)
  contract   Contract @relation(fields: [contract_id], references: [id], onDelete: Cascade)

  @@index([student_id])
  @@index([contract_id])
  @@index([occurred_at])
  @@map("attendance_logs")
}

model Invoice {
  id                Int      @id @default(autoincrement())
  user_id           Int
  student_id        Int
  contract_id       Int
  year              Int
  month             Int
  base_amount       Int
  auto_adjustment   Int      @default(0)
  manual_adjustment Int      @default(0)
  manual_reason     String?
  final_amount      Int
  planned_count      Int?
  send_status       InvoiceSendStatus @default(not_sent)
  send_to           Json?
  send_history      Json?
  account_snapshot  Json?
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt

  user      User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  student  Student   @relation(fields: [student_id], references: [id], onDelete: Cascade)
  contract Contract  @relation(fields: [contract_id], references: [id], onDelete: Cascade)

  @@unique([student_id, contract_id, year, month])
  @@index([student_id])
  @@index([contract_id])
  @@index([year, month])
  @@map("invoices")
}

model Notification {
  id          Int      @id @default(autoincrement())
  user_id     Int
  type        String
  title       String
  body        String
  target_route String
  is_read     Boolean  @default(false)
  push_sent   Boolean  @default(false)
  push_sent_at DateTime?
  created_at  DateTime @default(now())

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id])
  @@index([is_read])
  @@map("notifications")
}
```

**주요 특징:**
- `policy_snapshot`: 계약 생성 시점의 규정을 JSON으로 고정 저장
- `AttendanceLog`: 출결 기록 수정 이력 추적 (`modified_at`, `modified_by`, `change_reason`)
- `Invoice`: 자동 조정(`auto_adjustment`)과 수동 조정(`manual_adjustment`) 분리

#### 2. Prisma 서비스

**`packages/backend/src/prisma/prisma.service.ts`:**
```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

#### 3. Students API

**엔드포인트:**
- `POST /api/v1/students` - 수강생 생성
- `GET /api/v1/students?search=...&filter=...` - 수강생 목록 조회
- `GET /api/v1/students/:id` - 수강생 상세 조회
- `PATCH /api/v1/students/:id` - 수강생 수정
- `PATCH /api/v1/students/:id/active` - 활성화 상태 변경

**`packages/backend/src/students/students.service.ts`:**
```typescript
@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: number, dto: CreateStudentDto) {
    return this.prisma.student.create({
      data: {
        user_id: userId,
        name: dto.name,
        phone: dto.phone,
        guardian_name: dto.guardian_name,
        guardian_phone: dto.guardian_phone,
      },
    });
  }

  async list(params: { search?: string; filter?: string; userId: number }) {
    const { search, userId } = params;
    return this.prisma.student.findMany({
      where: {
        user_id: userId,
        AND: search
          ? [{
              OR: [
                { name: { contains: search } },
                { guardian_name: { contains: search } },
              ],
            }]
          : undefined,
      },
      orderBy: { id: 'desc' },
    });
  }

  async detail(id: number, userId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id, user_id: userId },
      include: {
        contracts: true,
        attendance_logs: {
          orderBy: { occurred_at: 'desc' },
          where: { voided: false },
        },
        invoices: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
      },
    });
    return student;
  }
}
```

#### 4. Contracts API

**엔드포인트:**
- `POST /api/v1/contracts` - 계약서 생성
- `GET /api/v1/contracts` - 계약서 목록 조회
- `GET /api/v1/contracts/:id` - 계약서 상세 조회
- `GET /api/v1/contracts/today` - 오늘 수업 조회
- `PATCH /api/v1/contracts/:id/status` - 계약서 상태 업데이트

**`policy_snapshot` 생성 로직:**
```typescript
async create(userId: number, dto: CreateContractDto) {
  // policy_snapshot 생성 (생성 시점 규정 고정 저장)
  const policySnapshot = {
    billing_type: dto.billing_type,
    absence_policy: dto.absence_policy,
    monthly_amount: dto.monthly_amount,
    recipient_policy: dto.recipient_policy,
    recipient_targets: dto.recipient_targets,
    created_at: new Date().toISOString(),
  };

  const contract = await this.prisma.contract.create({
    data: {
      // ... 기타 필드
      policy_snapshot: policySnapshot,
    },
  });
}
```

**오늘 수업 조회 로직:**
```typescript
async findTodayClasses(userId: number) {
  const today = new Date();
  const todayDayOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][today.getDay()];

  const contracts = await this.prisma.contract.findMany({
    where: {
      user_id: userId,
      status: { in: ['confirmed', 'sent'] },
      student: { is_active: true },
    },
    include: { student: true },
  });

  // 오늘 요일이 포함된 계약서만 필터링
  const todayContracts = contracts.filter((contract) => {
    const dayOfWeekArray = contract.day_of_week as string[];
    return dayOfWeekArray.includes(todayDayOfWeek);
  });

  return todayContracts;
}
```

#### 5. Attendance API

**엔드포인트:**
- `POST /api/v1/attendance` - 출결 기록 생성
- `PATCH /api/v1/attendance/:id` - 출결 기록 수정
- `PATCH /api/v1/attendance/:id/void` - 출결 기록 취소
- `GET /api/v1/attendance/student/:studentId` - 수강생별 출결 조회
- `GET /api/v1/attendance/contract/:contractId` - 계약별 출결 조회

**출결 기록 수정 로직:**
```typescript
async update(userId: number, id: number, dto: UpdateAttendanceDto) {
  return this.prisma.attendanceLog.update({
    where: { id },
    data: {
      status: dto.status,
      substitute_at: dto.substitute_at ? new Date(dto.substitute_at) : undefined,
      memo_public: dto.memo_public,
      memo_internal: dto.memo_internal,
      modified_at: new Date(),
      modified_by: userId,
      change_reason: dto.change_reason, // 필수
    },
  });
}
```

#### 6. Invoice Calculation Service

**`packages/backend/src/invoices/invoice-calculation.service.ts`:**
- `calculatePlannedCount()`: 달력 기반 예정 수업 횟수 계산
- `calculateAutoAdjustment()`: 출결 기록 기반 자동 조정 금액 계산
- `calculatePreviousMonthAdjustment()`: 이전 달 결석 반영 금액 계산

**예정 수업 횟수 계산:**
```typescript
calculatePlannedCount(dayOfWeekArray: string[], year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  const dayOfWeekMap = {
    SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
  };

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    if (dayOfWeekArray.includes(Object.keys(dayOfWeekMap).find(key => dayOfWeekMap[key] === dayOfWeek))) {
      count++;
    }
  }
  return count;
}
```

**자동 조정 계산 로직:**
- 후불: 출석 횟수만큼 과금, 결석은 정책에 따라 처리
- 선불: 결석 정책에 따라 환불/이월 처리
- 소멸: 해당 금액 차감
- 차월차감/이월: 다음 달에 반영

---

## Phase 3: 앱 기본 구조

### 목표
- React Native 앱 기본 설정
- 네비게이션 구조 설정
- 상태 관리 (Zustand)
- API 클라이언트 설정

### 구현 내용

#### 1. Expo 설정

**`packages/app/app.config.js`:**
```javascript
require('dotenv/config');

module.exports = {
  expo: {
    name: '김쌤',
    slug: 'kimssam',
    version: '1.0.0',
    orientation: 'portrait',
    plugins: [
      'expo-dev-client',
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: process.env.ANDROID_ADMOB_APP_ID,
          iosAppId: process.env.IOS_ADMOB_APP_ID,
        },
      ],
    ],
    extra: {
      API_URL: process.env.API_URL,
      API_KEY: process.env.API_KEY,
      ANDROID_ADMOB_APP_ID: process.env.ANDROID_ADMOB_APP_ID,
      IOS_ADMOB_APP_ID: process.env.IOS_ADMOB_APP_ID,
    },
  },
};
```

**`packages/app/.env`:**
```env
API_URL=http://localhost:3000
API_KEY=
ANDROID_ADMOB_APP_ID=ca-app-pub-3940256099942544~3347511713
IOS_ADMOB_APP_ID=ca-app-pub-3940256099942544~1458002511
```

#### 2. 환경 변수 설정

**`packages/app/src/config/env.ts`:**
```typescript
import Constants from 'expo-constants';

function getEnvVar(key: string, defaultValue?: string): string {
  const value = Constants.expoConfig?.extra?.[key] || process.env[key];
  if (!value && !defaultValue) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value || defaultValue || '';
}

export const env = {
  API_URL: getEnvVar('API_URL', 'http://localhost:3000'),
  API_KEY: getEnvVar('API_KEY', ''),
  ANDROID_ADMOB_APP_ID: getEnvVar('ANDROID_ADMOB_APP_ID'),
  IOS_ADMOB_APP_ID: getEnvVar('IOS_ADMOB_APP_ID'),
};
```

#### 3. API 클라이언트

**`packages/app/src/api/client.ts`:**
```typescript
import axios from 'axios';
import { env } from '../config/env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/useStore';

const apiClient = axios.create({
  baseURL: env.API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 요청 인터셉터: JWT 토큰 자동 추가
apiClient.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
);

// 응답 인터셉터: 401 에러 시 로그아웃
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const logout = useAuthStore.getState().logout;
      await logout();
    }
    return Promise.reject(error);
  },
);

export default apiClient;
```

#### 4. 상태 관리 (Zustand)

**`packages/app/src/store/useStore.ts`:**
```typescript
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id: number;
  phone: string;
  name?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  loadAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,

  login: async (token, user) => {
    await AsyncStorage.setItem('accessToken', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    set({ user, accessToken: token, isAuthenticated: true });
  },

  logout: async () => {
    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('user');
    set({ user: null, accessToken: null, isAuthenticated: false });
  },

  loadAuth: async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const userStr = await AsyncStorage.getItem('user');
      if (token && userStr) {
        const user = JSON.parse(userStr);
        set({ user, accessToken: token, isAuthenticated: true });
      }
    } catch (error) {
      console.error('Failed to load auth:', error);
    }
  },
}));
```

#### 5. 네비게이션 구조

**`packages/app/src/navigation/AppNavigator.tsx`:**
- 인증 상태에 따라 분기:
  - 비인증: `AuthScreen`만 표시
  - 인증됨: `MainAppStack` 표시
- `MainAppStack`: 탭 네비게이터 + 알림 화면
- `MainTabs`: 홈/수강생/정산/설정 탭

**구조:**
```
NavigationContainer
├── (비인증) Stack Navigator
│   └── Auth Screen
│
└── (인증됨) MainAppStack
    ├── MainTabs (Bottom Tab Navigator)
    │   ├── Home Stack
    │   │   ├── Home Main
    │   │   └── Contract New
    │   ├── Students Stack
    │   │   ├── Students List
    │   │   └── Student Detail
    │   ├── Settlement Stack
    │   │   ├── Settlement Main
    │   │   └── Settlement Send
    │   └── Settings
    └── Notifications Screen
```

#### 6. App.tsx

**`packages/app/App.tsx`:**
```typescript
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store/useStore';

export default function App() {
  const loadAuth = useAuthStore((state) => state.loadAuth);

  useEffect(() => {
    loadAuth();
  }, [loadAuth]);

  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}
```

---

## Phase 4: 홈 화면 및 출결

### 목표
- 홈 화면 레이아웃 구현
- 오늘 수업 조회 및 표시
- 출석/결석/대체 기록 기능
- 출결 모달 구현

### 구현 내용

#### 1. 홈 화면

**`packages/app/src/screens/HomeScreen.tsx`:**
- 상단: 로고, 알림 아이콘, 안내 텍스트
- 오늘 수업 섹션: 계약서 리스트, 출석/결석/대체 버튼
- 플로팅 버튼: 계약서 생성 화면으로 이동

**주요 기능:**
```typescript
const loadTodayClasses = async () => {
  const data = await contractsApi.getTodayClasses();
  setTodayClasses(data);
};

const handleAttendanceClick = (classItem, action) => {
  if (action === 'present' && requireSignature) {
    setSignatureModalVisible(true);
  } else if (action === 'absent' || action === 'substitute') {
    setAbsenceModalVisible(true);
  } else {
    handleAttendanceDirect(classItem, 'present');
  }
};
```

#### 2. 출결 API

**`packages/app/src/api/attendance.ts`:**
```typescript
export const attendanceApi = {
  create: async (payload: CreateAttendancePayload) => {
    const response = await apiClient.post('/api/v1/attendance', payload);
    return response.data;
  },
  update: async (id: number, payload: UpdateAttendancePayload) => {
    const response = await apiClient.patch(`/api/v1/attendance/${id}`, payload);
    return response.data;
  },
};
```

#### 3. 출결 모달

**`AttendanceSignatureModal`:**
- 서명 캔버스 (`react-native-signature-canvas`)
- 서명 확인 후 출석 기록

**`AttendanceAbsenceModal`:**
- 결석/대체 선택
- 대체 수업 날짜 선택 (`@react-native-community/datetimepicker`)
- 공개 메모 / 내부 메모 입력

**`AttendanceEditModal`:**
- 기존 출결 기록 수정
- 변경 사유 필수 입력
- 상태 변경 (출석/결석/대체/소멸)

---

## Phase 5: 수강생 관리

### 목표
- 수강생 리스트 화면
- 수강생 상세 화면
- 출결 로그 타임라인
- 출결 기록 수정

### 구현 내용

#### 1. 수강생 리스트 화면

**`packages/app/src/screens/StudentsListScreen.tsx`:**
- 검색바: 이름/보호자 검색
- 필터: 전체 / 이번 달 청구 대상 / 추가 안내 필요
- 수강생 카드: 이름, 연락처, 상세보기 버튼
- 플로팅 버튼: 계약서 생성 화면으로 이동

**API 호출:**
```typescript
const loadStudents = async () => {
  const data = await studentsApi.getAll(searchQuery, filter);
  setStudents(data);
};
```

#### 2. 수강생 상세 화면

**`packages/app/src/screens/StudentDetailScreen.tsx`:**
- 기본 정보: 이름, 연락처, 보호자 정보
- 계약 정보: 과목, 요일/시간, 정책 (policy_snapshot 표시)
- 출결 로그 타임라인: 날짜, 상태, 메모, 수정 이력
- 정산 히스토리: 월별 청구 금액, 전송 상태

**출결 로그 표시:**
```typescript
{student.attendance_logs.map((log) => (
  <TimelineItem key={log.id}>
    <TimelineDate>{formatDate(log.occurred_at)}</TimelineDate>
    <TimelineContent>
      {log.contract.subject} - {getStatusText(log.status)}
    </TimelineContent>
    {log.modified_at && (
      <TimelineContent style={{ color: '#FF9800' }}>
        수정됨 ({formatDate(log.modified_at)}) - {log.change_reason}
      </TimelineContent>
    )}
    <EditButton onPress={() => handleEditAttendance(log.id)}>
      수정
    </EditButton>
  </TimelineItem>
))}
```

---

## Phase 6: 계약서 생성

### 목표
- 계약서 생성 폼 구현
- 자동 수강생 생성/조회
- policy_snapshot 자동 생성 (백엔드)

### 구현 내용

#### 1. 계약서 생성 화면

**`packages/app/src/screens/ContractNewScreen.tsx`:**
- 수강생 정보: 이름, 연락처, 보호자 정보
- 수업 정보: 과목명, 요일 선택 (버튼), 시간
- 결제 및 정책: 월 금액, 결제 방식, 결석 처리 방식
- 전송 옵션: 수신자 설정 (수강생만/보호자만/둘 다)

**요일 선택 UI:**
```typescript
const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

const toggleDay = (day: string) => {
  if (selectedDays.includes(day)) {
    setSelectedDays(selectedDays.filter((d) => d !== day));
  } else {
    setSelectedDays([...selectedDays, day]);
  }
};
```

**저장 로직:**
```typescript
const handleSave = async () => {
  // 1. 수강생 생성 또는 조회
  let studentId: number;
  const students = await studentsApi.getAll({ search: studentPhone });
  const existingStudent = students.find((s) => s.phone === studentPhone);
  if (existingStudent) {
    studentId = existingStudent.id;
  } else {
    const newStudent = await studentsApi.create({ ... });
    studentId = newStudent.id;
  }

  // 2. 계약서 생성
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
};
```

**`packages/app/src/api/contracts.ts`:**
```typescript
export const contractsApi = {
  getTodayClasses: async () => {
    const response = await apiClient.get('/api/v1/contracts/today');
    return response.data;
  },
  create: async (payload: CreateContractPayload) => {
    const response = await apiClient.post('/api/v1/contracts', payload);
    return response.data;
  },
};
```

---

## Phase 7: 정산 기능

### 목표
- 정산 메인 화면 (이번 달 정산 목록)
- Invoice on-demand 생성
- 금액 수정 기능
- 청구서 전송 화면

### 구현 내용

#### 1. Invoice API

**엔드포인트:**
- `GET /api/v1/invoices/current` - 이번 달 정산 목록 (없으면 생성)
- `PATCH /api/v1/invoices/:id` - 금액 수정
- `GET /api/v1/invoices/sendable` - 전송 가능한 Invoice 목록
- `POST /api/v1/invoices/send` - 청구서 전송

**`packages/backend/src/invoices/invoices.service.ts`:**
```typescript
async getCurrentMonthInvoices(userId: number) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 활성화된 계약서 조회
  const contracts = await this.prisma.contract.findMany({
    where: {
      user_id: userId,
      status: { in: ['confirmed', 'sent'] },
      student: { is_active: true },
    },
  });

  const invoices = [];
  for (const contract of contracts) {
    // 이미 invoice가 있는지 확인
    let invoice = await this.prisma.invoice.findUnique({
      where: {
        student_id_contract_id_year_month: {
          student_id: contract.student_id,
          contract_id: contract.id,
          year,
          month,
        },
      },
    });

    // 없으면 생성
    if (!invoice) {
      invoice = await this.createInvoiceForContract(userId, contract, year, month);
    }

    invoices.push(invoice);
  }

  return invoices;
}

private async createInvoiceForContract(userId, contract, year, month) {
  const policy = contract.policy_snapshot;
  const baseAmount = policy.monthly_amount;

  // 예정 수업 횟수 계산
  const plannedCount = contract.planned_count_override ??
    this.calculationService.calculatePlannedCount(contract.day_of_week, year, month);

  // 출결 기록 조회
  const attendanceLogs = await this.prisma.attendanceLog.findMany({
    where: { user_id: userId, contract_id: contract.id, voided: false },
  });

  // auto_adjustment 계산
  const autoAdjustment = this.calculationService.calculateAutoAdjustment(
    contract, attendanceLogs, year, month
  );

  // 이전 달 결석 반영
  const previousMonthAdjustment = this.calculationService.calculatePreviousMonthAdjustment(
    contract, attendanceLogs, year, month
  );

  const finalAutoAdjustment = autoAdjustment + previousMonthAdjustment;
  const finalAmount = baseAmount + finalAutoAdjustment;

  return this.prisma.invoice.create({
    data: {
      user_id: userId,
      student_id: contract.student_id,
      contract_id: contract.id,
      year,
      month,
      base_amount: baseAmount,
      auto_adjustment: finalAutoAdjustment,
      manual_adjustment: 0,
      final_amount: finalAmount,
      planned_count: plannedCount,
      send_status: 'not_sent',
    },
  });
}
```

#### 2. 정산 메인 화면

**`packages/app/src/screens/SettlementScreen.tsx`:**
- 이번 달 정산 카드 (펼침/접힘)
- 학생별 라인: 금액, 자동/수동 조정 표시, 수정 버튼
- 총 금액 표시
- 청구서 전송 버튼

**금액 표시:**
```typescript
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
```

#### 3. 금액 수정 모달

**`packages/app/src/components/modals/InvoiceAmountModal.tsx`:**
- 기본 금액, 자동 조정, 수동 조정 표시
- 최종 금액 실시간 계산
- 수동 조정 금액 입력
- 수정 사유 입력 (선택)

#### 4. 전송 대상 확인 화면

**`packages/app/src/screens/SettlementSendScreen.tsx`:**
- 전송 가능한 항목: 체크박스 선택
- 전송 불가 항목: 수신자 정보 없음 안내
- 전송 버튼: 선택한 항목 전송

**전송 로직:**
```typescript
const handleSend = async () => {
  const results = await invoicesApi.send(selectedIds, 'sms');
  Alert.alert('완료', `${results.length}개의 청구서가 전송되었습니다.`);
};
```

---

## Phase 8: 인증, 설정, 알림

### 목표
- 인증 화면 구현
- 설정 화면 구현
- 알림 기능 구현

### 구현 내용

#### 1. 인증 화면

**`packages/app/src/screens/AuthScreen.tsx`:**
- 전화번호 입력
- 인증 코드 요청 (3분 타이머)
- 인증 코드 입력 및 검증
- 인증 코드 재전송

**API:**
```typescript
export const authApi = {
  requestCode: async (phone: string) => {
    const response = await apiClient.post('/auth/request-code', { phone });
    return response.data;
  },
  verifyCode: async (phone: string, code: string) => {
    const response = await apiClient.post('/auth/verify-code', { phone, code });
    return response.data; // { accessToken, user }
  },
};
```

**타이머 구현:**
```typescript
React.useEffect(() => {
  if (codeSent && timer > 0) {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }
}, [codeSent, timer]);
```

#### 2. 설정 화면

**`packages/app/src/screens/SettingsScreen.tsx`:**
- 기본 규칙 (새 계약서용):
  - 결제 방식: 선불/후불 선택
  - 결석 처리 방식: 차월차감/이월/소멸 선택
- 출결 설정:
  - 출석 후 서명 요구 (토글)
- 청구서 설정:
  - 상세 내역 표시 (토글)
- 계좌 정보: 기본 입금 계좌
- 기관 정보: 기관 코드
- 로그아웃 버튼

**설정 저장:**
```typescript
const saveSettings = async () => {
  const settings = {
    billingType,
    absencePolicy,
    requireSignature,
    showInvoiceDetails,
    defaultAccount,
    orgCode,
  };
  await AsyncStorage.setItem('settings', JSON.stringify(settings));
};

useEffect(() => {
  saveSettings();
}, [billingType, absencePolicy, requireSignature, showInvoiceDetails, defaultAccount, orgCode]);
```

#### 3. 알림 API

**`packages/backend/src/notifications/notifications.service.ts`:**
```typescript
async findAll(userId: number, filter?: string) {
  const where: any = { user_id: userId };
  if (filter && filter !== 'all') {
    where.type = filter;
  }
  return this.prisma.notification.findMany({
    where,
    orderBy: { created_at: 'desc' },
  });
}

async markAsRead(userId: number, notificationId: number) {
  return this.prisma.notification.updateMany({
    where: { id: notificationId, user_id: userId },
    data: { is_read: true },
  });
}

async markAllAsRead(userId: number) {
  return this.prisma.notification.updateMany({
    where: { user_id: userId, is_read: false },
    data: { is_read: true },
  });
}
```

**엔드포인트:**
- `GET /api/v1/notifications?filter=all|settlement|student|attendance`
- `PATCH /api/v1/notifications/:id/read`
- `PATCH /api/v1/notifications/read-all`

#### 4. 알림 화면

**`packages/app/src/screens/NotificationsScreen.tsx`:**
- 알림 리스트 (읽음/안 읽음 구분)
- 필터: 전체/정산/수강생/출결
- 모두 읽음 버튼
- 시간 표시 (상대 시간)
- 읽지 않은 알림 개수 표시

**시간 포맷:**
```typescript
const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
};
```

---

## 핵심 로직 설명

### 1. policy_snapshot (계약 규정 고정)

**목적:** 계약 생성 시점의 규정을 JSON으로 고정 저장하여, 이후 계약서 규정이 변경되어도 기존 계약에는 영향 없음

**구현:**
- 계약 생성 시 `policy_snapshot` 필드에 규정 저장:
  ```typescript
  const policySnapshot = {
    billing_type: dto.billing_type,
    absence_policy: dto.absence_policy,
    monthly_amount: dto.monthly_amount,
    recipient_policy: dto.recipient_policy,
    recipient_targets: dto.recipient_targets,
    created_at: new Date().toISOString(),
  };
  ```
- 정산 계산 시 `policy_snapshot` 사용:
  ```typescript
  const policy = contract.policy_snapshot;
  const billingType = policy.billing_type;
  const absencePolicy = policy.absence_policy;
  const monthlyAmount = policy.monthly_amount;
  ```

### 2. Invoice on-demand 생성

**목적:** 정산 화면 진입 시 자동으로 Invoice 생성

**구현:**
- 활성화된 계약서 조회
- 각 계약서별로 해당 월 Invoice 존재 여부 확인
- 없으면 생성 (예정 횟수 계산, 출결 기록 기반 자동 조정 계산)

### 3. 자동 조정 계산 로직

**후불 (postpaid):**
- 출석 횟수만큼 과금
- 결석 정책:
  - `deduct_next`: 다음 달 차감 (이번 달 영향 없음)
  - `carry_over`: 다음 달로 이월 (이번 달 영향 없음)
  - `vanish`: 소멸 (이번 달에서 차감)

**선불 (prepaid):**
- 미리 받은 금액 기준
- 결석 정책:
  - `deduct_next`: 다음 달 차감 (이번 달 영향 없음)
  - `carry_over`: 다음 달로 이월 (이번 달 영향 없음)
  - `vanish`: 소멸 (이번 달에서 차감)

**이전 달 반영:**
- `deduct_next` 또는 `carry_over` 정책인 경우
- 이전 달 결석을 다음 달 `auto_adjustment`에 반영

### 4. 출결 기록 수정 이력

**필드:**
- `modified_at`: 수정 시간
- `modified_by`: 수정한 사용자 ID
- `change_reason`: 변경 사유 (필수)

**로직:**
- 출결 기록 수정 시 기존 기록은 유지하고 필드만 업데이트
- 취소 시 `voided = true`로 설정 (soft delete)

### 5. 인증 상태 관리

**흐름:**
1. 앱 시작 시 `loadAuth()` 호출 → AsyncStorage에서 토큰/사용자 정보 로드
2. 인증되지 않으면 `AuthScreen` 표시
3. 인증 코드 검증 후 JWT 토큰 받음
4. `login()` 호출하여 AsyncStorage에 저장 및 상태 업데이트
5. 401 에러 시 자동 로그아웃

---

## 주요 파일 목록

### 백엔드
- `packages/backend/src/main.ts` - 진입점
- `packages/backend/src/auth/` - 인증 모듈
- `packages/backend/src/students/` - 수강생 모듈
- `packages/backend/src/contracts/` - 계약서 모듈
- `packages/backend/src/attendance/` - 출결 모듈
- `packages/backend/src/invoices/` - 정산 모듈
  - `invoice-calculation.service.ts` - 정산 계산 로직
- `packages/backend/src/notifications/` - 알림 모듈
- `packages/backend/src/prisma/prisma.service.ts` - Prisma 서비스
- `packages/backend/prisma/schema.prisma` - 데이터베이스 스키마

### 프론트엔드
- `packages/app/App.tsx` - 앱 진입점
- `packages/app/src/navigation/AppNavigator.tsx` - 네비게이션 설정
- `packages/app/src/store/useStore.ts` - Zustand 상태 관리
- `packages/app/src/api/` - API 클라이언트
- `packages/app/src/screens/` - 화면 컴포넌트
  - `AuthScreen.tsx` - 인증 화면
  - `HomeScreen.tsx` - 홈 화면
  - `StudentsListScreen.tsx` - 수강생 리스트
  - `StudentDetailScreen.tsx` - 수강생 상세
  - `ContractNewScreen.tsx` - 계약서 생성
  - `SettlementScreen.tsx` - 정산 메인
  - `SettlementSendScreen.tsx` - 청구서 전송
  - `SettingsScreen.tsx` - 설정
  - `NotificationsScreen.tsx` - 알림
- `packages/app/src/components/modals/` - 모달 컴포넌트
  - `AttendanceSignatureModal.tsx` - 출석 서명 모달
  - `AttendanceAbsenceModal.tsx` - 결석/대체 모달
  - `AttendanceEditModal.tsx` - 출결 수정 모달
  - `InvoiceAmountModal.tsx` - 금액 수정 모달

---

## 환경 변수

### 백엔드 (.env)
```env
DATABASE_URL=postgresql://kimssam_user:cns8377933@localhost:5432/kimssam?schema=public
PORT=3000
NODE_ENV=development
JWT_SECRET=please-change-in-production-very-long-secret
JWT_EXPIRES_IN=30d
```

### 프론트엔드 (.env)
```env
API_URL=http://localhost:3000
API_KEY=
ANDROID_ADMOB_APP_ID=ca-app-pub-3940256099942544~3347511713
IOS_ADMOB_APP_ID=ca-app-pub-3940256099942544~1458002511
```

---

## 실행 방법

### 백엔드
```bash
cd packages/backend
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

### 프론트엔드
```bash
cd packages/app
npm install
npm start
# 또는
npm run android  # Android
npm run ios      # iOS
```

---

## 데이터베이스 마이그레이션

```bash
cd packages/backend
npx prisma migrate dev --name init
npx prisma generate
```

---

## 완료된 기능 체크리스트

- [x] Phase 1: 기본 인프라 및 인증 API
- [x] Phase 2: 데이터베이스 및 기본 API
- [x] Phase 3: 앱 기본 구조
- [x] Phase 4: 홈 화면 및 출결
- [x] Phase 5: 수강생 관리
- [x] Phase 6: 계약서 생성
- [x] Phase 7: 정산 기능
- [x] Phase 8: 인증, 설정, 알림

---

## 다음 단계 (추가 구현 가능)

- [ ] 실제 SMS 전송 연동
- [ ] 푸시 알림 구현
- [ ] 청구서 링크 생성 및 전송
- [ ] 계약서 서명 기능
- [ ] 지난 달 정산 히스토리 표시
- [ ] 통계 대시보드
- [ ] 데이터 내보내기/가져오기

---

이 문서는 김쌤 앱의 전체 구현 내용을 상세하게 기록한 문서입니다.  
이 문서만 보면 앱의 구조, 구현 방식, 핵심 로직을 완전히 이해할 수 있습니다.







