import { Module } from '@nestjs/common';
import { NoticesController } from './notices.controller';
import { NoticesAdminController } from './notices.admin.controller';
import { NoticesService } from './notices.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [NoticesController, NoticesAdminController],
  providers: [NoticesService, PrismaService],
  exports: [NoticesService],
})
export class NoticesModule {}

