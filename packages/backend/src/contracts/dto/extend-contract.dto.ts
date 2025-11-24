import { IsInt, IsDateString, IsOptional, Min } from 'class-validator';

export class ExtendContractDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  added_sessions?: number;

  @IsDateString()
  @IsOptional()
  extended_end_date?: string;
}

