import { IsInt, IsDateString, IsOptional, Min, IsNumber } from 'class-validator';

export class ExtendContractDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  added_sessions?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  extension_amount?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  added_amount?: number; // 금액권: 추가할 금액

  @IsDateString()
  @IsOptional()
  extended_end_date?: string; // 레거시: 뷰티앱에서는 사용하지 않음
}

