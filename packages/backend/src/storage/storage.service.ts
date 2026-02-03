import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private supabase: SupabaseClient;
  private bucketName: string;

  constructor(private readonly configService: ConfigService) {
    // Supabase 클라이언트 초기화
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const storageBucket = this.configService.get<string>('SUPABASE_STORAGE_BUCKET') || 'images';

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      this.logger.warn('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
    } else {
      this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      this.bucketName = storageBucket;
      this.logger.log(`Supabase Storage initialized with bucket: ${storageBucket}`);
    }
  }

  /**
   * 이미지 파일을 Supabase Storage에 업로드
   * @param file 업로드할 파일 (Express.Multer.File)
   * @param folder 저장할 폴더 경로 (예: 'notices', 'popups')
   * @returns 업로드된 파일의 공개 URL
   */
  async uploadImage(
    file: Express.Multer.File,
    folder: 'notices' | 'popups' = 'notices',
  ): Promise<string> {
    try {
      if (!this.supabase) {
        throw new Error('Supabase 클라이언트가 초기화되지 않았습니다. SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 확인해주세요.');
      }

      const fileExtension = file.originalname.split('.').pop() || 'jpg';
      const fileName = `${folder}/${uuidv4()}.${fileExtension}`;

      // 파일 업로드
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: false, // 기존 파일 덮어쓰기 방지
        });

      if (error) {
        this.logger.error('Supabase Storage upload error', error);
        throw new Error(`이미지 업로드에 실패했습니다: ${error.message}`);
      }

      // 공개 URL 가져오기
      const { data: urlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(fileName);

      if (!urlData?.publicUrl) {
        throw new Error('공개 URL을 가져올 수 없습니다.');
      }

      this.logger.log(`Image uploaded: ${urlData.publicUrl}`);
      return urlData.publicUrl;
    } catch (error: any) {
      this.logger.error('Failed to upload image', error);
      const errorMessage = error?.message || '이미지 업로드에 실패했습니다.';
      throw new Error(errorMessage);
    }
  }

  /**
   * Supabase Storage에서 이미지 삭제
   * @param imageUrl 삭제할 이미지의 URL
   */
  async deleteImage(imageUrl: string): Promise<void> {
    try {
      if (!this.supabase) {
        this.logger.warn('Supabase 클라이언트가 초기화되지 않아 이미지 삭제를 건너뜁니다.');
        return;
      }

      // URL에서 파일 경로 추출
      // Supabase Storage URL 형식: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
      const urlParts = imageUrl.split('/');
      const publicIndex = urlParts.indexOf('public');
      if (publicIndex === -1 || publicIndex >= urlParts.length - 1) {
        this.logger.warn(`Invalid Supabase Storage URL format: ${imageUrl}`);
        return;
      }

      // 'public' 다음부터 끝까지가 파일 경로
      const filePath = urlParts.slice(publicIndex + 1).join('/');

      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .remove([filePath]);

      if (error) {
        this.logger.error('Failed to delete image', error);
        // 삭제 실패해도 에러를 던지지 않음 (이미 삭제된 경우 등)
      } else {
        this.logger.log(`Image deleted: ${filePath}`);
      }
    } catch (error) {
      this.logger.error('Failed to delete image', error);
      // 삭제 실패해도 에러를 던지지 않음
    }
  }
}
