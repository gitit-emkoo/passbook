import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { InquiriesService } from './inquiries.service';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

class CreateInquiryDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @IsNotEmpty({ message: '문의 내용을 입력해주세요.' })
  content!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1')
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  /**
   * 내 문의 내역 조회
   */
  @Get('me/inquiries')
  async getMyInquiries(@Req() req: Request) {
    const user = req.user as any;
    const userId = user.id ?? user.sub;
    return this.inquiriesService.findMyInquiries(userId);
  }

  /**
   * 문의 생성 (앱 사용자)
   */
  @Post('inquiries')
  async createInquiry(@Req() req: Request, @Body() dto: CreateInquiryDto) {
    const user = req.user as any;
    const userId = user.id ?? user.sub;
    return this.inquiriesService.createInquiry(userId, dto);
  }
}


