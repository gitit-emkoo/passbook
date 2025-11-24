import { IsString, IsNotEmpty } from 'class-validator';

export class VoidAttendanceDto {
  @IsString()
  @IsNotEmpty()
  void_reason: string;
}

