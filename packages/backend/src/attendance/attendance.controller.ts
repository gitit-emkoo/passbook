import { Controller, Post, Patch, Get, Param, Body, Req, UseGuards, ParseIntPipe, Query } from '@nestjs/common';
import { Request } from 'express';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto, UpdateAttendanceDto } from './dto/create-attendance.dto';
import { VoidAttendanceDto } from './dto/void-attendance.dto';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateAttendanceDto) {
    const user = req.user as any;
    return this.attendanceService.create(user.id ?? user.sub, dto);
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceDto,
  ) {
    const user = req.user as any;
    return this.attendanceService.update(user.id ?? user.sub, id, dto);
  }

  @Patch(':id/void')
  async void(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VoidAttendanceDto,
  ) {
    const user = req.user as any;
    return this.attendanceService.void(user.id ?? user.sub, id, dto.void_reason);
  }

  @Get('student/:studentId')
  async findByStudent(
    @Req() req: Request,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    const user = req.user as any;
    return this.attendanceService.findByStudent(user.id ?? user.sub, studentId);
  }

  @Get('contract/:contractId')
  async findByContract(
    @Req() req: Request,
    @Param('contractId', ParseIntPipe) contractId: number,
  ) {
    const user = req.user as any;
    return this.attendanceService.findByContract(user.id ?? user.sub, contractId);
  }

  @Get('unprocessed')
  async findUnprocessed(@Req() req: Request) {
    const user = req.user as any;
    return this.attendanceService.findUnprocessed(user.id ?? user.sub);
  }

  @Get('unprocessed/count')
  async countUnprocessed(@Req() req: Request) {
    const user = req.user as any;
    return { count: await this.attendanceService.countUnprocessed(user.id ?? user.sub) };
  }
}
