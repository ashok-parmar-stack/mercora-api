import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateCountryStatusDto {
  @ApiProperty({
    description: 'Status code (e.g. ACTIVE, INACTIVE) or status UUID',
    example: 'ACTIVE',
  })
  @IsNotEmpty()
  @IsString()
  status: string;
}
