import { Controller, Get, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'System health check and database connectivity verification' })
  @ApiResponse({ status: 200, description: 'Application and PostgreSQL database are healthy' })
  @ApiResponse({ status: 503, description: 'Database connectivity failed' })
  async check() {
    try {
      const startTime = Date.now();
      await this.prisma.$queryRaw`SELECT 1;`;
      const dbLatencyMs = Date.now() - startTime;

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        services: {
          database: {
            status: 'up',
            type: 'PostgreSQL',
            latencyMs: dbLatencyMs,
          },
        },
      };
    } catch (error: any) {
      throw new ServiceUnavailableException({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: process.env.NODE_ENV === 'production' ? 'Database connection unavailable' : (error.message || 'Database connection error'),
      });
    }
  }
}
