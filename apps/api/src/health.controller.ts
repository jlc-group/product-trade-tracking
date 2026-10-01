import { Controller, Get } from '@nestjs/common'
import { config } from './config.js'
import { Public } from './auth/decorators.js'
import { PrismaService } from './prisma/prisma.service.js'

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    const [{ now }] = await this.prisma.$queryRaw<{ now: Date }[]>`select now()`
    return { ok: true, schema: config.dbSchema, dbTime: now }
  }
}
