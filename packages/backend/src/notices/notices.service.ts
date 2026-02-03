import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';

@Injectable()
export class NoticesService {
  constructor(private prisma: PrismaService) {}

  /**
   * 공지사항 목록 조회
   * 전체 공지(user_id가 null)와 사용자별 공지를 모두 반환
   */
  async findAll(userId: number) {
    const notices = await this.prisma.notice.findMany({
      where: {
        OR: [
          { user_id: null }, // 전체 공지
          { user_id: userId }, // 사용자별 공지
        ],
      },
      orderBy: {
        created_at: 'desc',
      },
      select: {
        id: true,
        title: true,
        content: true,
        image_url: true,
        is_important: true,
        created_at: true,
        updated_at: true,
      },
    });

    return notices;
  }

  /**
   * 공지사항 상세 조회
   */
  async findOne(userId: number, id: number) {
    const notice = await this.prisma.notice.findFirst({
      where: {
        id,
        OR: [
          { user_id: null }, // 전체 공지
          { user_id: userId }, // 사용자별 공지
        ],
      },
    });

    if (!notice) {
      throw new NotFoundException('공지사항을 찾을 수 없습니다.');
    }

    return notice;
  }

  /**
   * 관리자용 전체 공지사항 목록 조회
   */
  async adminFindAll() {
    return this.prisma.notice.findMany({
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  /**
   * 관리자용 공지사항 생성
   */
  async adminCreate(dto: CreateNoticeDto) {
    const { title, content, image_url, is_important } = dto;

    return this.prisma.notice.create({
      data: {
        title,
        content,
        image_url: image_url || null,
        is_important: is_important ?? false,
      },
    });
  }

  /**
   * 관리자용 공지사항 수정
   */
  async adminUpdate(id: number, dto: UpdateNoticeDto) {
    const existing = await this.prisma.notice.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('공지사항을 찾을 수 없습니다.');
    }

    return this.prisma.notice.update({
      where: { id },
      data: {
        title: dto.title ?? existing.title,
        content: dto.content ?? existing.content,
        image_url: dto.image_url !== undefined ? dto.image_url : existing.image_url,
        is_important: dto.is_important ?? existing.is_important,
      },
    });
  }

  /**
   * 관리자용 공지사항 삭제
   */
  async adminDelete(id: number) {
    const existing = await this.prisma.notice.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('공지사항을 찾을 수 없습니다.');
    }

    await this.prisma.notice.delete({ where: { id } });
    return { success: true };
  }
}


