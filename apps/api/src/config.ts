import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name} (see apps/api/.env.example)`)
  return value
}

const isProd = process.env.NODE_ENV === 'production'

export const config = {
  isProd,
  host: process.env.HOST ?? (isProd ? '127.0.0.1' : '0.0.0.0'),
  revision: process.env.RELEASE_SHA ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  /** Every FlowTrade table lives in this schema; nothing else in the database is touched. */
  dbSchema: process.env.DB_SCHEMA ?? 'flowtrade',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  sessionCookie: process.env.SESSION_COOKIE ?? (isProd ? '__Host-ft_sid' : 'ft_sid'),
  sessionIdleHours: Number(process.env.SESSION_IDLE_HOURS ?? 12),
  sessionAbsoluteDays: Number(process.env.SESSION_ABSOLUTE_DAYS ?? 7),
}
