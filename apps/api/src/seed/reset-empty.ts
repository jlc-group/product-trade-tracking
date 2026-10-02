// Turns the FlowTrade schema into a clean, ready-to-use install:
//   keeps  — the ADMIN account: signed out, given a new random temporary password (written to the
//            git-ignored file apps/api/.admin-initial-password, never printed) that must be changed
//            at first sign-in
//          — the two built-in shelf types "Exclusive Shelf" and "Normal Shelf" (OFFLINE)
//   deletes — everything else: proposals, tasks, comments, activity, notifications, products,
//             stores/platforms, task templates, other shelf types, other users, sessions, counters.
// Only tables in DB_SCHEMA are touched (ORM queries are scoped by the adapter); no other schema.
//
// Run: npm run db:reset-empty -w @flowtrade/api -- --yes
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generateTempPassword, hashPassword } from '../auth/password.js'
import { config } from '../config.js'
import { PrismaService } from '../prisma/prisma.service.js'

export const KEEP_SHELF_TYPES = ['Exclusive Shelf', 'Normal Shelf'] as const

export interface ResetSummary {
  keptAdmin: string
  /** The admin's new temporary password (callers decide where it goes — never log it). */
  tempPassword: string
  keptShelfTypes: string[]
  deleted: Record<string, number>
}

/** `adminSignIn` picks the admin to keep by email or username (same rule as login: "@" → email). */
export async function resetToEmpty(prisma: PrismaService, adminSignIn?: string): Promise<ResetSummary> {
  const tempPassword = generateTempPassword()
  const passwordHash = await hashPassword(tempPassword)
  const ident = adminSignIn?.trim().toLowerCase()
  return prisma.$transaction(
    async (tx) => {
      const admins = await tx.user.findMany({ where: { role: 'ADMIN', ...(ident ? (ident.includes('@') ? { email: ident } : { username: ident }) : {}) }, orderBy: { createdAt: 'asc' } })
      const admin = admins.find((a) => a.isActive) ?? admins[0]
      if (!admin) throw new Error(ident ? `No ADMIN user with email or username ${ident}` : 'No ADMIN user found — refusing to leave the system without an administrator')

      const keepShelves = await tx.shelfType.findMany({ where: { channel: 'OFFLINE', name: { in: [...KEEP_SHELF_TYPES], mode: 'insensitive' } } })
      const keepShelfIds = keepShelves.map((s) => s.id)

      const deleted: Record<string, number> = {}
      const count = async (name: string, op: Promise<{ count: number }>) => {
        deleted[name] = (await op).count
      }
      // Children before parents (FKs use Restrict on several relations).
      await count('notifications', tx.notification.deleteMany())
      await count('activity_logs', tx.activityLog.deleteMany())
      await count('comments', tx.comment.deleteMany())
      await count('task_assignees', tx.taskAssignee.deleteMany())
      await count('tasks', tx.task.deleteMany())
      await count('proposal_members', tx.proposalMember.deleteMany())
      await count('proposal_products', tx.proposalProduct.deleteMany())
      await count('proposals', tx.proposal.deleteMany())
      await count('proposal_counters', tx.proposalCounter.deleteMany())
      await count('task_template_items', tx.taskTemplateItem.deleteMany())
      await count('task_templates', tx.taskTemplate.deleteMany())
      await count('products', tx.product.deleteMany())
      await count('stores', tx.store.deleteMany())
      await count('shelf_types', tx.shelfType.deleteMany({ where: { id: { notIn: keepShelfIds } } }))
      await count('sessions', tx.session.deleteMany())
      await count('users', tx.user.deleteMany({ where: { id: { not: admin.id } } }))

      // Built-in shelf types back to a tidy, active state in a fixed order.
      for (const s of keepShelves) {
        await tx.shelfType.update({ where: { id: s.id }, data: { isActive: true, sortOrder: s.name.toLowerCase().startsWith('exclusive') ? 1 : 2 } })
      }
      // The admin keeps the account but gets a neutral profile and must set their own password.
      await tx.user.update({
        where: { id: admin.id },
        data: { name: 'ผู้ดูแลระบบ', nickname: 'Admin', department: null, position: 'System Administrator', isActive: true, mustChangePassword: true, passwordHash, failedLoginCount: 0, lockedUntil: null, lastLoginAt: null },
      })

      return { keptAdmin: admin.username ?? admin.email ?? admin.id, tempPassword, keptShelfTypes: keepShelves.map((s) => s.name), deleted }
    },
    { timeout: 60_000 },
  )
}

// CLI entry point
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (!process.argv.includes('--yes')) {
    console.error(`This permanently deletes all Trade Listing data in schema "${config.dbSchema}" except the admin account and the shelf types ${KEEP_SHELF_TYPES.join(' / ')}.\nRe-run with --yes to continue.`)
    process.exit(1)
  }
  const adminArg = process.argv.find((a) => a.startsWith('--admin='))?.slice('--admin='.length)
  const prisma = new PrismaService()
  try {
    const { tempPassword, ...summary } = await resetToEmpty(prisma, adminArg)
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.admin-initial-password')
    writeFileSync(
      file,
      `# Trade Listing first sign-in — delete this file after changing the password.\nsign in as: ${summary.keptAdmin}\ntemporary password: ${tempPassword}\n`,
      { mode: 0o600 },
    )
    console.log(`Schema "${config.dbSchema}" is now empty and ready:`, JSON.stringify(summary, null, 2))
    console.log(`Admin temporary password written to ${file} (must be changed at first sign-in).`)
  } finally {
    await prisma.$disconnect()
  }
}
