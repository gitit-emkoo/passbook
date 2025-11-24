import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ContractStatus } from './create-contract.dto';

export class UpdateContractStatusDto {
  @IsEnum(ContractStatus)
  status: ContractStatus;

  @IsString()
  @IsOptional()
  teacher_signature?: string;

  @IsString()
  @IsOptional()
  student_signature?: string;
}

