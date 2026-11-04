import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService, UserWithoutPassword } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface AuthResult {
  accessToken: string;
  user: UserWithoutPassword;
}

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 12;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResult> {
    const existing = await this.usersService.findByEmail(registerDto.email);
    if (existing) {
      throw new ConflictException(`User with email "${registerDto.email}" already exists`);
    }

    const password_hash = await bcrypt.hash(registerDto.password, this.SALT_ROUNDS);

    const user = await this.usersService.create({
      name: registerDto.name,
      email: registerDto.email,
      password_hash,
    });

    const accessToken = this.generateToken(user);

    return {
      accessToken,
      user,
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      // Use generic error to prevent email enumeration
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(loginDto.password, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const sanitizedUser = this.usersService.sanitize(user);
    const accessToken = this.generateToken(sanitizedUser);

    return {
      accessToken,
      user: sanitizedUser,
    };
  }

  private generateToken(user: UserWithoutPassword): string {
    const payload = {
      sub: user.id,
      email: user.email,
    };
    return this.jwtService.sign(payload);
  }
}
