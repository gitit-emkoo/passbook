import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Performance');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, query } = request;
    const startTime = Date.now();

    // 요청 정보 로깅 (민감한 정보 제외)
    const logData: any = {
      method,
      url,
      query: Object.keys(query).length > 0 ? query : undefined,
    };

    // POST/PUT/PATCH 요청의 경우 body 일부만 로깅 (민감한 정보 제외)
    if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
      const sanitizedBody = { ...body };
      // 비밀번호, 토큰 등 민감한 정보 제외
      if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
      if (sanitizedBody.token) sanitizedBody.token = '[REDACTED]';
      if (sanitizedBody.accessToken) sanitizedBody.accessToken = '[REDACTED]';
      logData.body = sanitizedBody;
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const responseTime = Date.now() - startTime;
          const statusCode = context.switchToHttp().getResponse().statusCode;

          // 응답 시간에 따라 로그 레벨 결정
          if (responseTime > 2000) {
            // 2초 이상: 에러 레벨
            this.logger.error(
              `[SLOW] ${method} ${url} - ${responseTime}ms - ${statusCode}`,
              JSON.stringify(logData),
            );
          } else if (responseTime > 1000) {
            // 1초 이상: 경고 레벨
            this.logger.warn(
              `[SLOW] ${method} ${url} - ${responseTime}ms - ${statusCode}`,
            );
          } else {
            // 1초 미만: 로그 레벨
            this.logger.log(
              `${method} ${url} - ${responseTime}ms - ${statusCode}`,
            );
          }
        },
        error: (error) => {
          const responseTime = Date.now() - startTime;
          const statusCode = error?.status || error?.response?.status || 500;
          this.logger.error(
            `[ERROR] ${method} ${url} - ${responseTime}ms - ${statusCode} - ${error?.message || 'Unknown error'}`,
            JSON.stringify(logData),
          );
        },
      }),
    );
  }
}

