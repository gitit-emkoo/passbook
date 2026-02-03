import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

class AdminLoginDto {
  @IsString()
  @IsNotEmpty({ message: '아이디를 입력해주세요.' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '비밀번호를 입력해주세요.' })
  password: string;
}

@Controller('api/v1/admin/auth')
export class AdminAuthController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  async login(@Body() dto: AdminLoginDto) {
    // 관리자 아이디/비밀번호 확인 (환경변수에서 가져오기)
    const adminId = this.configService.get<string>('ADMIN_ID', '');
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD', '');

    // 아이디 확인
    if (dto.username !== adminId) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 일치하지 않습니다.');
    }

    // 비밀번호 확인
    if (dto.password !== adminPassword) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 일치하지 않습니다.');
    }

    // 관리자용 JWT 토큰 발급
    const payload = { sub: 'admin', username: dto.username, isAdmin: true };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: 'admin',
        username: dto.username,
        isAdmin: true,
      },
    };
  }
}

