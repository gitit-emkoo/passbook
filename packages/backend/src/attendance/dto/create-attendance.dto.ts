import { IsNumber, IsString, IsEnum, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export enum AttendanceStatus {
  present = 'present',
  absent = 'absent',
  substitute = 'substitute',
  vanish = 'vanish',
}

export class CreateAttendanceDto {
  @IsNumber()
  @IsNotEmpty()
  student_id!: number;

  @IsNumber()
  @IsNotEmpty()
  contract_id!: number;

  @IsString()
  @IsNotEmpty()
  @IsDateString()
  occurred_at!: string; // ISO string

  @IsEnum(AttendanceStatus)
  @IsNotEmpty()
  status!: AttendanceStatus;

  @IsOptional()
  @IsString()
  substitute_at?: string | null;

  @IsOptional()
  @IsString()
  memo_public?: string | null;

  @IsOptional()
  @IsString()
  memo_internal?: string | null;

  @IsOptional()
  @IsString()
  signature_data?: string | null; // 출석 서명 데이터 (base64)
}

export class UpdateAttendanceDto {
  status?: AttendanceStatus;
  substitute_at?: string | null;
  memo_public?: string | null;
  memo_internal?: string | null;
  change_reason?: string;
}




