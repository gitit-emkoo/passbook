import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AdminAuthController } from './admin-auth.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './jwt-strategy/jwt.strategy';
import { JwtAuthGuard } from './jwt-auth/jwt-auth.guard';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    PassportModule,
    SmsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const jwtSecret = configService.get<string>('JWT_SECRET');
        if (!jwtSecret) {
          throw new Error('JWT_SECRET environment variable is required');
        }
        const jwtExpiresIn = configService.get<string>('JWT_EXPIRES_IN') || '30d';
        
        return {
          secret: jwtSecret,
        signOptions: {
            // JWT 만료 시간 (예: "30d", "7d", "1h" 등 문자열 형식 지원)
            expiresIn: jwtExpiresIn,
        },
        } as any; // NestJS JWT는 문자열을 지원하지만 타입 정의가 엄격함
      },
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, PrismaService, JwtStrategy, JwtAuthGuard],
  controllers: [AuthController, AdminAuthController],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
