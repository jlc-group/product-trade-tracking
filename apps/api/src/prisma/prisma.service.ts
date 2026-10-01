import { Global, Injectable, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { config } from '../config.js'
import { PrismaClient, type Prisma } from '../generated/prisma/client.js'

/**
 * Prisma client bound to the FlowTrade schema only (DB_SCHEMA).
 *
 * The session timezone is pinned to UTC: the pg driver adapter sends timestamps without an offset,
 * so on a server whose TimeZone is e.g. Asia/Bangkok every stored timestamptz would be 7 h early
 * (and read back 7 h late). With `timezone=UTC` the values in the database are the real instants.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl, max: 10, options: '-c timezone=UTC' }, { schema: config.dbSchema }) })
  }

  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}

/** Either the root client or an interactive-transaction client. */
export type Db = PrismaService | Prisma.TransactionClient

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
