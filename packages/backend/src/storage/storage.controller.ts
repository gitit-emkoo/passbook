import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { StorageService } from './storage.service';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload/notice')
  @UseInterceptors(FileInterceptor('image'))
  async uploadNoticeImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('이미지 파일이 필요합니다.');
    }

    // 이미지 파일만 허용
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('이미지 파일만 업로드 가능합니다.');
    }

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('파일 크기는 10MB를 초과할 수 없습니다.');
    }

    const imageUrl = await this.storageService.uploadImage(file, 'notices');
    return { imageUrl };
  }

  @Post('upload/popup')
  @UseInterceptors(FileInterceptor('image'))
  async uploadPopupImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('이미지 파일이 필요합니다.');
    }

    // 이미지 파일만 허용
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('이미지 파일만 업로드 가능합니다.');
    }

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('파일 크기는 10MB를 초과할 수 없습니다.');
    }

    const imageUrl = await this.storageService.uploadImage(file, 'popups');
    return { imageUrl };
  }
}





