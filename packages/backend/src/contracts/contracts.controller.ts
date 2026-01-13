import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards, Header, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { UpdateContractStatusDto } from './dto/update-contract-status.dto';
import { ExtendContractDto } from './dto/extend-contract.dto';
import { RescheduleSessionDto } from './dto/reschedule-session.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';

@Controller('api/v1/contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: Request, @Body() dto: CreateContractDto) {
    const user = req.user as any;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Contracts] POST /api/v1/contracts body=${JSON.stringify(dto)}`);
    }
    return this.contractsService.create(user.id ?? user.sub, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Req() req: Request) {
    const user = req.user as any;
    const userId = user.id ?? user.sub;
    const query = req.query;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Contracts] GET /api/v1/contracts userId=${userId} q=${JSON.stringify(query)}`);
    }
    return this.contractsService.findAll(userId);
  }

  @Get('today')
  @UseGuards(JwtAuthGuard)
  async findTodayClasses(@Req() req: Request) {
    const user = req.user as any;
    return this.contractsService.findTodayClasses(user.id ?? user.sub);
  }

  @Post(':id/reschedule')
  @UseGuards(JwtAuthGuard)
  async rescheduleSession(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RescheduleSessionDto,
  ) {
    const user = req.user as any;
    const userId = user.id ?? user.sub;
    return this.contractsService.rescheduleSession(userId, id, dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req.user as any;
    return this.contractsService.findOne(user.id ?? user.sub, id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateContractStatusDto,
  ) {
    const user = req.user as any;
    const userId = user.id ?? user.sub;
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[Contracts] PATCH /api/v1/contracts/${id}/status userId=${userId} body=${JSON.stringify(body)}`,
      );
    }
    return this.contractsService.updateStatus(userId, id, body);
  }

  @Patch(':id/extend')
  @UseGuards(JwtAuthGuard)
  async extend(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtendContractDto,
  ) {
    const user = req.user as any;
    const userId = user.id ?? user.sub;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Contracts] PATCH /api/v1/contracts/${id}/extend userId=${userId} body=${JSON.stringify(dto)}`);
    }
    return this.contractsService.extend(userId, id, dto);
  }

  @Get(':id/view')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getContractView(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    // 공개 엔드포인트: 인증 없이 계약서 조회 가능
    const html = await this.contractsService.generateContractHtml(id);
    return res.send(html);
  }

  // 예약 관련 API
  @Post(':id/reservations')
  @UseGuards(JwtAuthGuard)
  async createReservation(
    @Req() req: Request,
    @Param('id', ParseIntPipe) contractId: number,
    @Body() dto: CreateReservationDto,
  ) {
    const user = req.user as any;
    return this.contractsService.createReservation(user.id ?? user.sub, contractId, dto);
  }

  @Get(':id/reservations')
  @UseGuards(JwtAuthGuard)
  async getReservations(
    @Req() req: Request,
    @Param('id', ParseIntPipe) contractId: number,
  ) {
    const user = req.user as any;
    return this.contractsService.getReservations(user.id ?? user.sub, contractId);
  }

  @Get('reservations/all')
  @UseGuards(JwtAuthGuard)
  async getAllReservations(@Req() req: Request) {
    const user = req.user as any;
    return this.contractsService.getAllReservations(user.id ?? user.sub);
  }

  @Patch(':id/reservations/:reservationId')
  @UseGuards(JwtAuthGuard)
  async updateReservation(
    @Req() req: Request,
    @Param('id', ParseIntPipe) contractId: number,
    @Param('reservationId', ParseIntPipe) reservationId: number,
    @Body() dto: UpdateReservationDto,
  ) {
    const user = req.user as any;
    return this.contractsService.updateReservation(user.id ?? user.sub, contractId, reservationId, dto);
  }

  @Delete(':id/reservations/:reservationId')
  @UseGuards(JwtAuthGuard)
  async deleteReservation(
    @Req() req: Request,
    @Param('id', ParseIntPipe) contractId: number,
    @Param('reservationId', ParseIntPipe) reservationId: number,
  ) {
    const user = req.user as any;
    return this.contractsService.deleteReservation(user.id ?? user.sub, contractId, reservationId);
  }
}
