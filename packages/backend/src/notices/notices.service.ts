import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
}


