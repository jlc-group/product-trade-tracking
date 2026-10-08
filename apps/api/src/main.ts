import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Request, Response } from 'express'
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
  if (config.isProd) {
    const webDist = resolve(process.env.WEB_DIST ?? '../web/dist')
    if (!existsSync(resolve(webDist, 'index.html'))) throw new Error('Production web build is missing')
    app.useStaticAssets(webDist, { index: false, dotfiles: 'deny' })
    // Only browser navigation gets the SPA; API and missing assets keep their 404.
    app.use((req: Request, res: Response, next: () => void) => {
      if (!['GET', 'HEAD'].includes(req.method) || /^\/(api|assets)(\/|$)/.test(req.path) ||
          !req.accepts('html') || /\.[^/]+$/.test(req.path)) return next()
      res.set('Cache-Control', 'no-store').sendFile('index.html', { root: webDist })
    })
  }
  await app.listen(config.port, config.host)
  Logger.log(`FlowTrade API on http://localhost:${config.port}/api/v1 (schema "${config.dbSchema}")`, 'Bootstrap')
}

void bootstrap()
