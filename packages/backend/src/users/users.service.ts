import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        name: true,
        org_code: true,
        settings: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    return user;
  }

  async updateMe(userId: number, data: { name?: string; org_code?: string }) {
    const updateData: { name?: string; org_code?: string } = {};
    
    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    
    if (data.org_code !== undefined) {
      updateData.org_code = data.org_code;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        phone: true,
        name: true,
        org_code: true,
        settings: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async updateSettings(userId: number, settings: Record<string, unknown>) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });

    const currentSettings =
      existing?.settings && typeof existing.settings === 'object' && !Array.isArray(existing.settings)
        ? (existing.settings as Record<string, unknown>)
        : {};

    const mergedSettings = {
      ...currentSettings,
      ...settings,
    };

    return this.prisma.user.update({
      where: { id: userId },
      data: { settings: mergedSettings as any },
      select: {
        id: true,
        phone: true,
        name: true,
        org_code: true,
        settings: true,
        created_at: true,
        updated_at: true,
      },
    });
  }
}

