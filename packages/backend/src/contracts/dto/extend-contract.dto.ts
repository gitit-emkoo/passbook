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

  @IsDateString()
  @IsOptional()
  extended_end_date?: string;
}

