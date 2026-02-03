import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { InquiriesService } from './inquiries.service';
import { IsString, IsNotEmpty } from 'class-validator';

class AnswerDto {
  @IsString()
  @IsNotEmpty({ message: '답변 내용을 입력해주세요.' })
  answer: string;
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/inquiries')
export class InquiriesAdminController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  /**
   * 관리자용 전체 문의사항 목록 조회
   */
  @Get()
  async findAll() {
    return this.inquiriesService.adminFindAll();
  }

  /**
   * 관리자용 문의사항 답변 저장
   */
  @Patch(':id/answer')
  async updateAnswer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnswerDto,
  ) {
    return this.inquiriesService.adminUpdateAnswer(id, dto.answer);
  }
}




