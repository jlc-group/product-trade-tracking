import 'dotenv/config'
import { defineConfig } from 'prisma/config'

const schema = process.env.DB_SCHEMA ?? 'flowtrade'
// `prisma generate` (npm install) doesn't need a database; migrate/status do and will fail clearly.
const base = process.env.DATABASE_URL ?? 'postgresql://set-DATABASE_URL-in-apps-api-.env@localhost:5432/unset'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --enable-source-maps dist/seed/bootstrap.js',
  },
  datasource: {
    // `schema` scopes every migration to the FlowTrade schema only.
    url: `${base}${base.includes('?') ? '&' : '?'}schema=${schema}`,
  },
})
