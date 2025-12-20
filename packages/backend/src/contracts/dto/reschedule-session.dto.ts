import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class RescheduleSessionDto {
  @IsDateString()
  @IsNotEmpty()
  original_date!: string; // YYYY-MM-DD 또는 ISO 날짜 문자열

  @IsDateString()
  @IsNotEmpty()
  new_date!: string; // YYYY-MM-DD 또는 ISO 날짜 문자열

  @IsOptional()
  @IsInt()
  @Min(1)
  student_id?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}





