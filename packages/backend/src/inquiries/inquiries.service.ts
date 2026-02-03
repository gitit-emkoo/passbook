import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 관리자용 전체 문의사항 목록 조회
   */
  async adminFindAll() {
    return this.prisma.inquiry.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            org_code: true,
            phone: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  /**
   * 관리자용 문의사항 답변 저장
   */
  async adminUpdateAnswer(id: number, answer: string) {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id },
    });

    if (!inquiry) {
      throw new NotFoundException('문의사항을 찾을 수 없습니다.');
    }

    return this.prisma.inquiry.update({
      where: { id },
      data: {
        answer,
        status: 'answered',
        answered_at: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            org_code: true,
            phone: true,
          },
        },
      },
    });
  }

  /**
   * 내 문의 내역 조회
   */
  async findMyInquiries(userId: number) {
    return this.prisma.inquiry.findMany({
      where: { user_id: userId },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  /**
   * 문의 생성 (앱 사용자)
   */
  async createInquiry(
    userId: number,
    dto: {
      title?: string;
      content: string;
    },
  ) {
    const title =
      typeof dto.title === 'string' && dto.title.trim().length > 0
        ? dto.title.trim()
        : null;

    return this.prisma.inquiry.create({
      data: {
        user_id: userId,
        title,
        content: dto.content.trim(),
      },
    });
  }
}




