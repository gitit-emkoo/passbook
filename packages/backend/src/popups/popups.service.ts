import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePopupDto } from './dto/create-popup.dto';
import { UpdatePopupDto } from './dto/update-popup.dto';

@Injectable()
export class PopupsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 앱에서 사용할 활성 팝업 목록 조회
   * - is_active = true
   * - (starts_at가 없거나, 현재 시각 이후)
   * - (ends_at가 없거나, 현재 시각 이전)
   */
  async findActiveNow() {
    const now = new Date();

    return this.prisma.popup.findMany({
      where: {
        is_active: true,
        OR: [{ starts_at: null }, { starts_at: { lte: now } }],
        AND: [{ ends_at: null }, { ends_at: { gte: now } }],
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  /**
   * 관리자용 전체 팝업 목록 조회
   */
  async adminFindAll() {
    return this.prisma.popup.findMany({
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  /**
   * 관리자용 팝업 생성
   */
  async adminCreate(dto: CreatePopupDto) {
    const { title, content, is_active, starts_at, ends_at } = dto;

    return this.prisma.popup.create({
      data: {
        title,
        content,
        is_active: is_active ?? true,
        starts_at: starts_at ? new Date(starts_at) : null,
        ends_at: ends_at ? new Date(ends_at) : null,
      },
    });
  }

  /**
   * 관리자용 팝업 수정
   */
  async adminUpdate(id: number, dto: UpdatePopupDto) {
    const existing = await this.prisma.popup.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('팝업을 찾을 수 없습니다.');
    }

    return this.prisma.popup.update({
      where: { id },
      data: {
        title: dto.title ?? existing.title,
        content: dto.content ?? existing.content,
        is_active: dto.is_active ?? existing.is_active,
        starts_at:
          dto.starts_at !== undefined
            ? dto.starts_at
              ? new Date(dto.starts_at)
              : null
            : existing.starts_at,
        ends_at:
          dto.ends_at !== undefined
            ? dto.ends_at
              ? new Date(dto.ends_at)
              : null
            : existing.ends_at,
      },
    });
  }

  /**
   * 관리자용 팝업 삭제
   */
  async adminDelete(id: number) {
    const existing = await this.prisma.popup.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('팝업을 찾을 수 없습니다.');
    }

    await this.prisma.popup.delete({ where: { id } });
    return { success: true };
  }
}


