import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { PopupsService } from './popups.service';
import { CreatePopupDto } from './dto/create-popup.dto';
import { UpdatePopupDto } from './dto/update-popup.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/admin/popups')
export class PopupsAdminController {
  constructor(private readonly popupsService: PopupsService) {}

  @Get()
  async findAll() {
    return this.popupsService.adminFindAll();
  }

  @Post()
  async create(@Body() dto: CreatePopupDto) {
    return this.popupsService.adminCreate(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePopupDto,
  ) {
    return this.popupsService.adminUpdate(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.popupsService.adminDelete(id);
  }
}


