import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { Request } from 'express';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';

@Controller('api/v1/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  /**
   * 이번 달 정산 목록 조회 (on-demand 생성)
   */
  @Get('current')
  @UseGuards(JwtAuthGuard)
  async getCurrentMonth(@Req() req: Request) {
    const user = req.user as any;
    return this.invoicesService.getCurrentMonthInvoices(user.id ?? user.sub);
  }

  /**
   * 지난 정산 목록 조회
   */
  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getHistory(@Req() req: Request, @Query('months') months?: string) {
    const user = req.user as any;
    const monthsNumber = Number.parseInt(months ?? '', 10);
    return this.invoicesService.getInvoiceHistory(
      user.id ?? user.sub,
      Number.isFinite(monthsNumber) && monthsNumber > 0 ? monthsNumber : undefined,
    );
  }

  /**
   * Invoice 수정 (manual_adjustment)
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body('manual_adjustment') manualAdjustment: number,
    @Body('manual_reason') manualReason?: string,
  ) {
    const user = req.user as any;
    return this.invoicesService.updateInvoice(
      user.id ?? user.sub,
      id,
      manualAdjustment,
      manualReason,
    );
  }

  /**
   * 전송 가능한 Invoice 목록 조회
   */
  @Get('sendable')
  @UseGuards(JwtAuthGuard)
  async getSendable(@Req() req: Request) {
    const user = req.user as any;
    return this.invoicesService.getSendableInvoices(user.id ?? user.sub);
  }

  /**
   * 청구서 전송
   */
  @Post('send')
  @UseGuards(JwtAuthGuard)
  async send(
    @Req() req: Request,
    @Body('invoice_ids') invoiceIds: number[],
    @Body('channel') channel: 'sms' | 'kakao' | 'link',
  ) {
    const user = req.user as any;
    return this.invoicesService.sendInvoices(user.id ?? user.sub, invoiceIds, channel);
  }

  /**
   * 청구서 HTML 조회 (공개 엔드포인트)
   */
  @Get(':id/view')
  async getInvoiceView(@Param('id', ParseIntPipe) id: number) {
    // 공개 엔드포인트: 인증 없이 청구서 조회 가능
    const html = await this.invoicesService.generateInvoiceHtml(id);
    return { html };
  }
}
