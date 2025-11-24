import { Controller, Get, Patch, Param, Query, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { Request } from 'express';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * 알림 목록 조회
   */
  @Get()
  async findAll(@Req() req: Request, @Query('filter') filter?: string) {
    const user = req.user as any;
    return this.notificationsService.findAll(user.id ?? user.sub, filter);
  }

  /**
   * 알림 읽음 처리
   */
  @Patch(':id/read')
  async markAsRead(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req.user as any;
    return this.notificationsService.markAsRead(user.id ?? user.sub, id);
  }

  /**
   * 모든 알림 읽음 처리
   */
  @Patch('read-all')
  async markAllAsRead(@Req() req: Request) {
    const user = req.user as any;
    return this.notificationsService.markAllAsRead(user.id ?? user.sub);
  }
}
