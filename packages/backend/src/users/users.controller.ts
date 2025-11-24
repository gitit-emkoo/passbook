import { Controller, Get, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Req() req: Request) {
    const user = req.user as any;
    return this.usersService.getMe(user.id ?? user.sub);
  }

  @Patch('me')
  async updateMe(@Req() req: Request, @Body() body: { name?: string; org_code?: string }) {
    const user = req.user as any;
    return this.usersService.updateMe(user.id ?? user.sub, body);
  }

  @Patch('me/settings')
  async updateSettings(@Req() req: Request, @Body() body: { settings: Record<string, unknown> }) {
    const user = req.user as any;
    return this.usersService.updateSettings(user.id ?? user.sub, body.settings);
  }
}

