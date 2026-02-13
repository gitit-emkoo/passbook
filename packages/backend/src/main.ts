import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS 설정: 환경변수로 제어
  const corsOrigin = process.env.CORS_ORIGIN;
  const allowedOrigins = corsOrigin
    ? corsOrigin.split(',').map((origin) => origin.trim())
    : true; // 환경변수가 없으면 모든 origin 허용 (개발 환경)
  
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // 전역 에러 핸들링
  app.useGlobalFilters(new AllExceptionsFilter());

  // 전역 성능 로깅 인터셉터
  app.useGlobalInterceptors(new LoggingInterceptor());

  // 전역 유효성 검사 파이프
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API prefix 설정 (인증은 제외하고 /api/v1로 시작)
  // 인증은 /auth로 직접 접근 가능하도록 별도 처리

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Application is running on: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  }
}
bootstrap();
