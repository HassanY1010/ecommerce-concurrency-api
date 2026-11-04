import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { User } from '@prisma/client';

export type UserWithoutPassword = Omit<User, 'password_hash'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { name: string; email: string; password_hash: string }): Promise<UserWithoutPassword> {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException(`User with email "${data.email}" already exists`);
    }

    const user = await this.prisma.user.create({
      data: {
        name: data.name.trim(),
        email: data.email.toLowerCase().trim(),
        password_hash: data.password_hash,
      },
    });

    return this.sanitize(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findById(id: string): Promise<UserWithoutPassword> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" was not found`);
    }

    return this.sanitize(user);
  }

  sanitize(user: User): UserWithoutPassword {
    const { password_hash, ...sanitized } = user;
    return sanitized;
  }
}
