import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Ahmed Ali', description: 'User full name' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  name: string;

  @ApiProperty({ example: 'ahmed@example.com', description: 'User email address' })
  @IsEmail({}, { message: 'Invalid email address format' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'P@ssword123', description: 'User password (min 6 characters)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;
}
