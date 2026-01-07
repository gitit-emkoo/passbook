import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  name: string;

  @IsString()
  @Matches(/^010-?\d{4}-?\d{4}$/)
  phone: string;

  @IsOptional()
  @IsString()
  guardian_name?: string;

  @IsOptional()
  @Matches(/^010-?\d{4}-?\d{4}$/)
  guardian_phone?: string;

  @IsOptional()
  @IsString()
  memo?: string;
}





