# NestJS 백엔드용 Dockerfile
FROM node:20-alpine AS base

# 작업 디렉토리 설정
WORKDIR /app

# 의존성 설치를 위한 단계
FROM base AS deps
# package.json과 package-lock.json 복사
COPY package*.json ./
# Prisma 스키마 복사 (의존성 설치에 필요)
COPY prisma ./prisma/
# 의존성 설치 (Prisma Client를 위해 prisma도 설치)
RUN npm ci --only=production && \
    npm install prisma@^5.22.0 --save-dev && \
    npx prisma generate && \
    npm cache clean --force

# 빌드 단계
FROM base AS build
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY prisma ./prisma/
# 개발 의존성 포함하여 설치 (빌드에 필요, Prisma도 포함됨)
RUN npm ci
COPY src ./src
# Prisma Client 생성 (devDependencies의 prisma 5.22.0 사용)
RUN npx prisma generate
# 빌드
RUN npm run build

# 프로덕션 이미지
FROM base AS runner
ENV NODE_ENV=production

# 사용자 생성 (보안)
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# 필요한 파일만 복사
COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
# Prisma Client와 Query Engine은 build 단계에서 생성된 것을 복사
COPY --from=build --chown=nestjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=nestjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/package*.json ./
COPY --from=build --chown=nestjs:nodejs /app/prisma ./prisma

USER nestjs

EXPOSE 3000

# 헬스체크용 간단한 엔드포인트 (선택사항)
# 또는 main.ts에서 /health 엔드포인트 추가 필요

CMD ["node", "dist/main.js"]

