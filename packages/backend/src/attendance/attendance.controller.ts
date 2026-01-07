import { Controller, Post, Patch, Get, Param, Body, Req, UseGuards, ParseIntPipe, Query } from '@nestjs/common';
import { Request } from 'express';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto, UpdateAttendanceDto } from './dto/create-attendance.dto';
import { VoidAttendanceDto } from './dto/void-attendance.dto';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';

@Controller('api/v1/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /**
   * 사용처리 완료 안내 페이지 HTML 조회 (공개 엔드포인트)
   * 라우트 순서상 다른 :id 라우트보다 먼저 정의해야 함
   */
  @Get(':id/view')
  async getAttendanceView(@Param('id', ParseIntPipe) id: number) {
    // 공개 엔드포인트: 인증 없이 사용처리 기록 조회 가능
    const html = await this.attendanceService.generateAttendanceViewHtml(id);
    return { html };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: Request, @Body() dto: CreateAttendanceDto) {
    const user = req.user as any;
    return this.attendanceService.create(user.id ?? user.sub, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceDto,
  ) {
    const user = req.user as any;
    return this.attendanceService.update(user.id ?? user.sub, id, dto);
  }

  @Patch(':id/void')
  @UseGuards(JwtAuthGuard)
  async void(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VoidAttendanceDto,
  ) {
    const user = req.user as any;
    return this.attendanceService.void(user.id ?? user.sub, id, dto.void_reason);
  }

  @Get('student/:studentId')
  @UseGuards(JwtAuthGuard)
  async findByStudent(
    @Req() req: Request,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    const user = req.user as any;
    return this.attendanceService.findByStudent(user.id ?? user.sub, studentId);
  }

  @Get('contract/:contractId')
  @UseGuards(JwtAuthGuard)
  async findByContract(
    @Req() req: Request,
    @Param('contractId', ParseIntPipe) contractId: number,
  ) {
    const user = req.user as any;
    return this.attendanceService.findByContract(user.id ?? user.sub, contractId);
  }

  @Get('unprocessed')
  @UseGuards(JwtAuthGuard)
  async findUnprocessed(@Req() req: Request) {
    const user = req.user as any;
    return this.attendanceService.findUnprocessed(user.id ?? user.sub);
  }

  @Get('unprocessed/count')
  @UseGuards(JwtAuthGuard)
  async countUnprocessed(@Req() req: Request) {
    const user = req.user as any;
    return { count: await this.attendanceService.countUnprocessed(user.id ?? user.sub) };
  }

  @Patch(':id/sms-sent')
  @UseGuards(JwtAuthGuard)
  async markSmsSent(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const user = req.user as any;
    return this.attendanceService.markSmsSent(user.id ?? user.sub, id);
  }
}
