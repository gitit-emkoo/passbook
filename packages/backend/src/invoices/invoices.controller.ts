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
  Header,
  Res,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';

@Controller('api/v1/invoices')
export class InvoicesController {
  private readonly logger = new Logger(InvoicesController.name);

  constructor(private readonly invoicesService: InvoicesService) {}

  /**
   * 이번 달 정산 목록 조회 (on-demand 생성)
   */
  @Get('current')
  @UseGuards(JwtAuthGuard)
  async getCurrentMonth(@Req() req: Request) {
    const user = req.user as any;
    try {
      return await this.invoicesService.getCurrentMonthInvoices(user.id ?? user.sub);
    } catch (error: any) {
      this.logger.error(`[getCurrentMonth] Error: ${error?.message || error}`, error?.stack);
      throw error;
    }
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
   * 정산 섹션별 조회 (정산중/오늘청구/전송한청구서)
   */
  @Get('sections')
  @UseGuards(JwtAuthGuard)
  async getBySections(@Req() req: Request) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[InvoicesController] getBySections called');
    }
    const user = req.user as any;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[InvoicesController] User ID:', user.id ?? user.sub);
    }
    return this.invoicesService.getInvoicesBySections(user.id ?? user.sub);
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
   * 청구서를 오늘청구로 이동 (조기 청구)
   */
  @Patch(':id/move-to-today-billing')
  @UseGuards(JwtAuthGuard)
  async moveToTodayBilling(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[InvoicesController] moveToTodayBilling called - invoiceId:', id);
    }
    const user = req.user as any;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[InvoicesController] User ID:', user.id ?? user.sub);
    }
    const result = await this.invoicesService.moveToTodayBilling(user.id ?? user.sub, id);
    if (process.env.NODE_ENV !== 'production') {
      console.log('[InvoicesController] moveToTodayBilling result:', result);
    }
    return result;
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
   * 입금 확인 처리
   */
  @Patch(':id/payment-status')
  @UseGuards(JwtAuthGuard)
  async markAsPaid(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req.user as any;
    return this.invoicesService.markInvoiceAsPaid(user.id ?? user.sub, id);
  }

  /**
   * 청구서 HTML 조회 (공개 엔드포인트)
   */
  @Get(':id/view')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getInvoiceView(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    // 공개 엔드포인트: 인증 없이 청구서 조회 가능
    const html = await this.invoicesService.generateInvoiceHtml(id);
    return res.send(html);
  }
}
