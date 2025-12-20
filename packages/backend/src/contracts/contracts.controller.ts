import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { UpdateContractStatusDto } from './dto/update-contract-status.dto';
import { ExtendContractDto } from './dto/extend-contract.dto';
import { RescheduleSessionDto } from './dto/reschedule-session.dto';

@Controller('api/v1/contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: Request, @Body() dto: CreateContractDto) {
    const user = req.user as any;
    console.log(`[Contracts] POST /api/v1/contracts body=${JSON.stringify(dto)}`);
    return this.contractsService.create(user.id ?? user.sub, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Req() req: Request) {
    const user = req.user as any;
    const userId = user.id ?? user.sub;
    const query = req.query;
    console.log(`[Contracts] GET /api/v1/contracts userId=${userId} q=${JSON.stringify(query)}`);
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
    console.log(
      `[Contracts] PATCH /api/v1/contracts/${id}/status userId=${userId} body=${JSON.stringify(body)}`,
    );
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
    console.log(`[Contracts] PATCH /api/v1/contracts/${id}/extend userId=${userId} body=${JSON.stringify(dto)}`);
    return this.contractsService.extend(userId, id, dto);
  }

  @Get(':id/view')
  async getContractView(@Param('id', ParseIntPipe) id: number) {
    // 공개 엔드포인트: 인증 없이 계약서 조회 가능
    const html = await this.contractsService.generateContractHtml(id);
    return { html };
  }
}
