import { Controller, Post, Body, Headers, UnauthorizedException, Logger } from '@nestjs/common';
import { IsString, Matches, Length, IsOptional, IsObject } from 'class-validator';
import { AuthService } from './auth.service';

class RequestCodeDto {
  @IsString()
  @Matches(/^010-?\d{4}-?\d{4}$/, {
    message: '올바른 전화번호 형식이 아닙니다. (010-1234-5678)',
  })
  phone: string;
}

class VerifyCodeDto {
  @IsString()
  @Matches(/^010-?\d{4}-?\d{4}$/, {
    message: '올바른 전화번호 형식이 아닙니다. (010-1234-5678)',
  })
  phone: string;

  @IsString()
  @Length(6, 6, {
    message: '인증번호는 6자리입니다.',
  })
  code: string;
}

class CompleteSignupDto {
  @IsString()
  name: string;

  @IsString()
  org_code: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('request-code')
  async requestCode(@Body() dto: RequestCodeDto) {
    return this.authService.requestCode(dto.phone);
  }

  @Post('verify-code')
  async verifyCode(@Body() dto: VerifyCodeDto) {
    return this.authService.verifyCode(dto.phone, dto.code);
  }

  @Post('complete-signup')
  async completeSignup(
    @Headers('authorization') authorization: string,
    @Body() dto: CompleteSignupDto,
  ) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[AuthController] complete-signup called', {
        hasAuthorization: !!authorization,
        authorizationPrefix: authorization?.substring(0, 20),
        name: dto.name,
        org_code: dto.org_code,
      });
    }

    if (!authorization) {
      throw new UnauthorizedException('인증 토큰이 필요합니다.');
    }

    // Bearer 토큰 추출
    const tokenMatch = authorization.match(/^Bearer (.+)$/);
    if (!tokenMatch) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[AuthController] Invalid authorization format', { authorization });
      }
      throw new UnauthorizedException('올바른 인증 토큰 형식이 아닙니다.');
    }

    const temporaryToken = tokenMatch[1];
    if (process.env.NODE_ENV !== 'production') {
      console.log('[AuthController] temporaryToken extracted', { tokenLength: temporaryToken?.length });
    }

    return this.authService.completeSignup(
      temporaryToken,
      dto.name,
      dto.org_code,
      dto.settings,
    );
  }
}
