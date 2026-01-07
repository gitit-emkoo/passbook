import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateReservationDto {
  @IsDateString()
  reserved_date!: string; // YYYY-MM-DD 형식

  @IsOptional()
  @IsString()
  reserved_time?: string | null; // HH:MM 형식 (선택사항)
}

