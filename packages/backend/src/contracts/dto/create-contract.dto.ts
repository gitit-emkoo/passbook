import { IsArray, IsString, IsEnum, IsNumber, IsOptional, IsNotEmpty, ArrayMinSize, IsBoolean, IsObject, IsDateString } from 'class-validator';

export enum BillingType {
  prepaid = 'prepaid',
  postpaid = 'postpaid',
}

export enum AbsencePolicy {
  carry_over = 'carry_over',
  deduct_next = 'deduct_next',
  vanish = 'vanish',
}

export enum ContractStatus {
  draft = 'draft',
  confirmed = 'confirmed',
  sent = 'sent',
}

export class CreateContractDto {
  @IsNumber()
  @IsNotEmpty()
  student_id!: number;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  day_of_week!: string[];

  @IsOptional()
  @IsString()
  time?: string | null;

  @IsEnum(BillingType)
  billing_type!: BillingType;

  @IsEnum(AbsencePolicy)
  absence_policy!: AbsencePolicy;

  @IsNumber()
  @IsNotEmpty()
  monthly_amount!: number;

  @IsString()
  @IsNotEmpty()
  recipient_policy!: string;

  @IsArray()
  @IsString({ each: true })
  recipient_targets!: string[];

  @IsOptional()
  @IsNumber()
  planned_count_override?: number | null;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus | null;

  @IsOptional()
  @IsBoolean()
  attendance_requires_signature?: boolean;

  @IsOptional()
  @IsString()
  teacher_signature?: string | null;

  @IsOptional()
  @IsString()
  student_signature?: string | null;

  @IsOptional()
  @IsDateString()
  started_at?: string | null;

  @IsOptional()
  @IsDateString()
  ended_at?: string | null;

  @IsOptional()
  policy_snapshot?: Record<string, any>;
}




