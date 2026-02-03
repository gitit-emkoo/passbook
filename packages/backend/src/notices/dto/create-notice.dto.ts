import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateNoticeDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsBoolean()
  is_important?: boolean;
}





