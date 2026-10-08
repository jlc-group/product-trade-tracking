// First-time setup of a fresh FlowTrade schema (idempotent — safe to run on every deploy):
//   • ensures the two built-in shelf types exist: "Exclusive Shelf" and "Normal Shelf" (OFFLINE)
//   • creates the first ADMIN when there is none, from ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD.
//     Without ADMIN_PASSWORD a temporary password is generated and written to the git-ignored file
//     apps/api/.admin-initial-password (never printed); either way the admin must choose a new
//     password at first sign-in.
// No sample data is created. Run: npm run db:bootstrap -w @flowtrade/api
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generateTempPassword, hashPassword } from '../auth/password.js'
import { config } from '../config.js'
import { PrismaService } from '../prisma/prisma.service.js'

export const BUILT_IN_SHELF_TYPES = [
  { name: 'Exclusive Shelf', color: '#7c3aed', sortOrder: 1, description: 'ชั้นวางเฉพาะแบรนด์ / Brand bay — ต้องออกแบบ ติดตั้ง และมักมีค่าเช่าพื้นที่' },
  { name: 'Normal Shelf', color: '#2563eb', sortOrder: 2, description: 'วางบนชั้นปกติตาม Planogram ของห้าง' },
] as const

export async function bootstrap(prisma: PrismaService, env: NodeJS.ProcessEnv = process.env, options: { shelvesOnly?: boolean } = {}) {
  const createdShelfTypes: string[] = []
  for (const s of BUILT_IN_SHELF_TYPES) {
    const exists = await prisma.shelfType.findFirst({ where: { channel: 'OFFLINE', name: { equals: s.name, mode: 'insensitive' } } })
    if (!exists) {
      await prisma.shelfType.create({ data: { ...s, channel: 'OFFLINE' } })
      createdShelfTypes.push(s.name)
    }
  }

  let admin: { email: string; tempPassword: string | null } | null = null
  const hasAdmin = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } })
  // Infrastructure can go online before the owner selects the first Admin email.
  // This explicit mode only installs shelf types; it never invents an account.
  if (!hasAdmin && options.shelvesOnly) return { createdShelfTypes, admin, adminPending: true }
  if (!hasAdmin) {
    const email = (env.ADMIN_EMAIL ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('No active ADMIN exists — set ADMIN_EMAIL (and optionally ADMIN_NAME, ADMIN_PASSWORD) and run again.')
    const password = env.ADMIN_PASSWORD || generateTempPassword()
    await prisma.user.create({
      data: { email, name: env.ADMIN_NAME?.trim() || 'ผู้ดูแลระบบ', nickname: 'Admin', position: 'System Administrator', role: 'ADMIN', mustChangePassword: true, passwordHash: await hashPassword(password), avatarColor: '#475569' },
    })
    admin = { email, tempPassword: env.ADMIN_PASSWORD ? null : password }
  }
  return { createdShelfTypes, admin, adminPending: false }
}

// CLI entry point
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const prisma = new PrismaService()
  try {
    const result = await bootstrap(prisma, process.env, { shelvesOnly: process.argv.includes('--shelves-only') })
    console.log(`Schema "${config.dbSchema}" bootstrap:`)
    console.log(`  shelf types created: ${result.createdShelfTypes.join(', ') || 'none (already present)'}`)
    if (result.admin) {
      console.log(`  admin created: ${result.admin.email}`)
      if (result.admin.tempPassword) {
        const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.admin-initial-password')
        writeFileSync(file, `# Trade Listing first sign-in — delete this file after changing the password.\nemail: ${result.admin.email}\ntemporary password: ${result.admin.tempPassword}\n`, { mode: 0o600 })
        console.log(`  temporary password written to ${file} (must be changed at first sign-in)`)
      }
    } else if (result.adminPending) {
      console.log('  admin: pending owner email (no account created)')
    } else {
      console.log('  admin: already present')
    }
  } finally {
    await prisma.$disconnect()
  }
}
