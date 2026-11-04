import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ahmed@example.com', description: 'User email address' })
  @IsEmail({}, { message: 'Invalid email address format' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'P@ssword123', description: 'User password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
