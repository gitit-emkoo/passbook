import { Module } from '@nestjs/common';
import { InquiriesService } from './inquiries.service';
import { InquiriesAdminController } from './inquiries.admin.controller';
import { InquiriesController } from './inquiries.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [InquiriesAdminController, InquiriesController],
  providers: [InquiriesService, PrismaService],
  exports: [InquiriesService],
})
export class InquiriesModule {}




