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

  /**
   * 관리자용: 전체 유저 목록 조회
   */
  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        phone: true,
        name: true,
        org_code: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  /**
   * 회원 탈퇴 (사용자 삭제)
   * Cascade 설정으로 인해 관련된 모든 데이터가 자동으로 삭제됨:
   * - students (수강생)
   * - contracts (계약서)
   * - attendance_logs (출결 기록)
   * - invoices (정산서)
   * - notifications (알림)
   * - notices (공지사항)
   * - inquiries (문의)
   * - scheduleExceptions (일정 예외)
   */
  async deleteMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    // User 삭제 (Cascade로 관련 데이터 자동 삭제)
    await this.prisma.user.delete({
      where: { id: userId },
    });

    return { message: '회원 탈퇴가 완료되었습니다.' };
  }
}

