import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersController } from './users.controller';
import { UsersAdminController } from './users.admin.controller';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService, PrismaService],
  controllers: [UsersController, UsersAdminController],
  exports: [UsersService],
})
export class UsersModule {}

