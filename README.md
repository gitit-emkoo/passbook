## Passbook V1 (김쌤 이용권 관리 서비스)

모노레포 구조로 구성된 **이용권·출결·청구 관리 올인원 서비스**입니다.  
원장님이 모바일 앱으로 이용권 고객을 관리하고, 웹 관리자(Admin)와 NestJS 백엔드를 통해 청구/공지/문의 등을 운영합니다.

---

## 모노레포 구조

```bash
passbook/
├── packages/
│   ├── app/        # React Native + Expo 모바일 앱 (원장님용)
│   ├── admin/      # Next.js Admin 웹 (공지/팝업/문의 관리)
│   └── backend/    # NestJS + Prisma API 서버
├── docs/           # 구현 계획, 시나리오, 스크린샷 등 문서
├── package.json    # 워크스페이스 / 공용 스크립트
└── README.md
```

각 패키지의 자세한 사용법은 해당 디렉터리의 `package.json`과 코드 주석을 참고합니다.

---

## 주요 기능 (V1 기준)

- **이용권/고객 관리**
  - 이용권(횟수제/금액제) 생성 및 연장
  - 고객 상세 정보, 메모, 계약 내역 조회
- **출결·일정 관리**
  - 오늘 방문 예정 고객 / 신규 계약 / 미처리 내역 대시보드
  - 출석·결석(소멸/차감/대체) 처리, 서명 및 차감 금액 기록
  - 예약 일정 전체 보기(일정 노트) 및 오늘 기준 자동 스크롤
- **청구/정산**
  - 월별 청구서 생성, 금액 조정, SMS 전송
  - 전송 완료 청구서 이력 및 입금 확인 처리
- **구독/무료 체험**
  - 최초 가입 무료 구독(보너스 기간) 로직
  - 앱 내 Settings 에서 현재 구독 상태 확인
- **관리자(Admin) 웹**
  - 공지사항/팝업/문의 관리 전용 Next.js 대시보드
  - 관리자 ID/비밀번호 기반 로그인

---

## 기술 스택

### 모바일 앱 (`packages/app`)
- **React Native** 0.76.5, **Expo** 52 (Dev Client 기반)
- **React** 18.3
- **Navigation**: `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`
- **상태 관리**: `zustand`
- **스타일**: `styled-components/native`
- **기타**: `react-native-remix-icon`, `react-native-modal`, `react-native-webview`, `react-native-signature-canvas`

### Admin 웹 (`packages/admin`)
- **Next.js 15 (App Router)** + React
- styled-components 기반 레이아웃
- 백엔드 REST API 연동을 위한 `fetch` / 커스텀 API 클라이언트

### 백엔드 (`packages/backend`)
- **NestJS 11**
- **Prisma 6** + **PostgreSQL**
- 인증/인가 (원장님 로그인, 관리자 로그인)
- Fly.io 기반 배포 (`fly.toml` + Dockerfile)

---

## 개발 환경 설정

### 1) 공통 의존성 설치

```bash
# 모노레포 루트에서
npm install
```

### 2) 백엔드 (.env 예시)

`packages/backend/.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/passbook?schema=public"
PORT=8080
NODE_ENV=development
JWT_SECRET=change_me
```

PostgreSQL을 준비한 뒤, 마이그레이션을 실행합니다.

```bash
cd packages/backend
npx prisma migrate dev
```

### 3) 앱 (.env 예시)

`packages/app/.env`:

```env
API_URL=https://kimssam-backend.fly.dev
```

Dev Client / APK 모두 같은 API URL을 사용합니다.

---

## 로컬 개발 실행

### 백엔드 서버

```bash
# 루트에서
npm run backend:start   # = cd packages/backend && npm run start:dev
```

### 모바일 앱 (Expo Dev Client)

```bash
# 루트에서
npm run app:start       # Expo Dev Client용 Metro 번들러
# 또는
npm run app:android     # Android Dev Client
npm run app:ios         # iOS Dev Client
```

백엔드가 로컬이 아닌 Fly.io 등에 배포되어 있다면, `API_URL`을 배포 URL로 맞춰주면 됩니다.

---

## 빌드 & 배포 (요약)

- **앱(EAS 빌드)**  
  - `packages/app/eas.json` 프로파일을 사용해 Dev Client / Preview / Release 빌드
  - 예: `cd packages/app && npx eas build --platform android --profile preview`

- **백엔드(Fly.io)**  
  - `packages/backend/fly.toml` + Dockerfile 기반 배포
  - `cd packages/backend && fly deploy`

실제 운영 플로우는 `docs/IMPLEMENTATION_COMPLETE.md`와 Fly.io 대시보드를 함께 참고합니다.

