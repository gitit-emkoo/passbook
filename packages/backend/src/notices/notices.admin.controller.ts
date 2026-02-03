import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { NoticesService } from './notices.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/admin/notices')
export class NoticesAdminController {
  constructor(private readonly noticesService: NoticesService) {}

  @Get()
  async findAll() {
    return this.noticesService.adminFindAll();
  }

  @Post()
  async create(@Body() dto: CreateNoticeDto) {
    return this.noticesService.adminCreate(dto);
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateNoticeDto) {
    return this.noticesService.adminUpdate(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.noticesService.adminDelete(id);
  }
}





