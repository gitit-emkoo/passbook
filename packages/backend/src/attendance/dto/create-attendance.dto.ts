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

  @IsOptional()
  @IsNumber()
  amount?: number | null; // 차감 금액 (금액권) 또는 사용 횟수 (횟수권, 기본값 1)

  @IsOptional()
  @IsNumber()
  reservation_id?: number; // 예약 ID (대체일 지정 시 예약 날짜 업데이트용)
}

export class UpdateAttendanceDto {
  status?: AttendanceStatus;
  substitute_at?: string | null;
  memo_public?: string | null;
  memo_internal?: string | null;
  change_reason?: string;
}




