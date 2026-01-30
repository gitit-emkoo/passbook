import { Module } from '@nestjs/common';
import { PopupsService } from './popups.service';
import { PopupsController } from './popups.controller';
import { PopupsAdminController } from './popups.admin.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [PopupsController, PopupsAdminController],
  providers: [PopupsService, PrismaService],
  exports: [PopupsService],
})
export class PopupsModule {}


