import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'Email verification token sent to user' })
  @IsString()
  @IsNotEmpty({ message: 'Verification token is required' })
  token: string;
}
