import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module.js'
import { config } from './config.js'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  app.setGlobalPrefix('api/v1')
  app.use(cookieParser())
  app.useBodyParser('json', { limit: '1mb' })
  app.enableCors({ origin: config.webOrigin, credentials: true })
  app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.enableShutdownHooks()
  await app.listen(config.port)
  Logger.log(`FlowTrade API on http://localhost:${config.port}/api/v1 (schema "${config.dbSchema}")`, 'Bootstrap')
}

void bootstrap()
