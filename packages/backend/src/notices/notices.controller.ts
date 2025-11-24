import { Controller, Get, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { NoticesService } from './notices.service';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/notices')
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  @Get()
  async findAll(@Req() req: Request) {
    const user = req.user as any;
    const userId = user.id ?? user.sub;
    return this.noticesService.findAll(userId);
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req.user as any;
    const userId = user.id ?? user.sub;
    return this.noticesService.findOne(userId, id);
  }
}


