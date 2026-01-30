import { Controller, Get, Req, UseGuards, Logger } from '@nestjs/common';
import { Request } from 'express';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/dashboard')
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async getSummary(@Req() req: Request) {
    const user = req.user as any;
    try {
      return await this.dashboardService.getSummary(user.id ?? user.sub);
    } catch (error: any) {
      this.logger.error(`[getSummary] Error: ${error?.message || error}`, error?.stack);
      throw error;
    }
  }

  @Get('statistics')
  async getStatistics(@Req() req: Request) {
    const user = req.user as any;
    return this.dashboardService.getStatistics(user.id ?? user.sub);
  }

  @Get('statistics/revenue/monthly')
  async getMonthlyRevenue(@Req() req: Request) {
    const user = req.user as any;
    return this.dashboardService.getMonthlyRevenue(user.id ?? user.sub);
  }

  @Get('statistics/contracts/monthly')
  async getMonthlyContracts(@Req() req: Request) {
    const user = req.user as any;
    return this.dashboardService.getMonthlyContracts(user.id ?? user.sub);
  }

  @Get('statistics/usage-amount/monthly')
  async getMonthlyUsageAmount(@Req() req: Request) {
    const user = req.user as any;
    return this.dashboardService.getMonthlyUsageAmount(user.id ?? user.sub);
  }

  @Get('statistics/usage-count/monthly')
  async getMonthlyUsageCount(@Req() req: Request) {
    const user = req.user as any;
    return this.dashboardService.getMonthlyUsageCount(user.id ?? user.sub);
  }
}

