import { Controller, Get, UseGuards } from '@nestjs/common';
import { PopupsService } from './popups.service';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/popups')
export class PopupsController {
  constructor(private readonly popupsService: PopupsService) {}

  /**
   * 앱에서 사용할 활성 팝업 목록 조회
   */
  @Get()
  async findActive() {
    return this.popupsService.findActiveNow();
  }
}


