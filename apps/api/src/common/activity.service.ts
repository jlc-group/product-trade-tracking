import { randomUUID } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { can, type EntityType, type NotificationType, type Permission, type Role, type User } from '@flowtrade/shared'
import { config } from '../config.js'
import type { Db, PrismaService } from '../prisma/prisma.service.js'

/** Callers pass the request user; a bare `{ id }` works too (the name is then read for the bell title). */
type Actor = Pick<User, 'id'> & Partial<Pick<User, 'name' | 'nickname'>>
type Notice = { type: NotificationType; title: string; body: string; link: string | null }
type Entry = { actorId: string; action: string; entityType: EntityType; entityId: string; proposalId: string | null; summary: string }

export interface LogOptions {
  /** The task the movement is about, when entityType isn't TASK (TASK uses entityId); null = not a task. */
  taskId?: string | null
  /** People who already got a direct notice for this movement outside the same transaction. */
  skipUserIds?: readonly string[]
  /**
   * More people to tell besides ADMIN / MANAGER and the task's current assignees — e.g. the assignees of a task that was
   * just deleted, or who were just taken off it. Active users only; the actor and `skipUserIds` are still left out.
   */
  extraRecipientIds?: readonly string[]
}

/** How every `task.update` summary starts; only those rows merge (see COALESCE_MS). */
export const TASK_UPDATE_PREFIX = 'แก้ไขงาน: '

/** These roles see every movement made by other people (the "oversight" readers of the bell). */
const OVERSIGHT_ROLES: Role[] = ['ADMIN', 'MANAGER']
/**
 * Repeated edits of one task (`task.update`, link `?task=`) by the same actor merge into the recipient's unread row of
 * an earlier edit of that task from this long ago (one row per edit burst). Every other movement is a row of its own.
 */
const COALESCE_MS = 10 * 60_000
const COALESCE_ACTION = 'task.update'
/** While the ACTIVITY enum value is missing (migration not applied yet), look again after this long. */
const RECHECK_MS = 30_000

/** Master-data pages; a reader without the page's permission is sent to the activity page instead. */
const ENTITY_PAGE: Partial<Record<EntityType, { path: string; permission: Permission }>> = {
  STORE: { path: '/admin/stores', permission: 'store.manage' },
  SHELF_TYPE: { path: '/admin/shelf-types', permission: 'shelfType.manage' },
  PRODUCT: { path: '/admin/products', permission: 'product.manage' },
  MANUFACTURER: { path: '/admin/manufacturers', permission: 'manufacturer.manage' },
  TEMPLATE: { path: '/admin/templates', permission: 'template.manage' },
  USER: { path: '/admin/users', permission: 'user.manage' },
  DEPARTMENT: { path: '/admin/departments', permission: 'department.manage' },
}

/** The page a link opens, without its query: a direct notice and an ACTIVITY row about one write share it. */
const pagePath = (link: string) => link.split('?')[0]
const pairKey = (userId: string, link: string) => `${userId} ${pagePath(link)}`

/** An ACTIVITY row this transaction wrote, and what to put back if a direct notice supersedes it. */
interface Written {
  inserted: boolean
  body: string
  createdAt: Date
}

/** Per-transaction bookkeeping that keeps one write from reaching a person as both a direct notice and an ACTIVITY row. */
interface TxNotices {
  /** "userId page" → ACTIVITY rows written for that person and page in this transaction (by row id). */
  activity: Map<string, Map<string, Written>>
  /** "userId page" pairs that already got a direct notice in this transaction. */
  noticed: Set<string>
}

/** Keyed by the interactive-transaction client, so it lives exactly as long as the transaction does. */
const perTransaction = new WeakMap<object, TxNotices>()

/**
 * The root client (not inside a transaction) is shared by every request, so it never carries bookkeeping.
 * Interactive-transaction clients have no `$connect` (Prisma 7 does give them `$transaction`, for nested savepoints).
 */
const isRoot = (db: Db): db is PrismaService => typeof (db as { $connect?: unknown }).$connect === 'function'

function txNotices(db: Db): TxNotices | null {
  if (isRoot(db)) return null
  let state = perTransaction.get(db)
  if (!state) {
    state = { activity: new Map(), noticed: new Set() }
    perTransaction.set(db, state)
  }
  return state
}

/**
 * Audit log + in-app notifications (the bell). Pass the transaction client so they commit / roll back with the change.
 *
 * Every logged movement also reaches the bell as an ACTIVITY notice: active ADMIN / MANAGER users see everyone's,
 * a task's assignees see the ones on their task (plus `extraRecipientIds`); never the actor. Direct notices (`notify`) of the same transaction
 * win over the ACTIVITY row for the same person and page.
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name)
  private activityEnum: { ok: boolean; checkedAt: number } | null = null

  log(
    db: Db,
    actor: Actor,
    action: string,
    entityType: EntityType,
    entityId: string,
    proposalId: string | null,
    summary: string,
    opts?: LogOptions,
  ) {
    const entry: Entry = { actorId: actor.id, action, entityType, entityId, proposalId, summary }
    // Outside a transaction: the log and its notices still commit together.
    if (isRoot(db)) return db.$transaction((tx) => this.write(tx, actor, entry, opts))
    return this.write(db, actor, entry, opts)
  }

  /** Notifies each user once, skipping the actor. Supersedes ACTIVITY rows this transaction wrote for them on the same page. */
  async notify(db: Db, userIds: readonly string[], n: Notice, exceptUserId?: string) {
    const targets = [...new Set(userIds)].filter((id) => id !== exceptUserId)
    if (targets.length === 0) return
    await db.notification.createMany({ data: targets.map((userId) => ({ userId, ...n })) })
    const state = txNotices(db)
    if (!state || !n.link) return
    const drop: string[] = []
    const restore: [string, Written][] = []
    for (const userId of targets) {
      const key = pairKey(userId, n.link)
      state.noticed.add(key)
      const rows = state.activity.get(key)
      if (!rows) continue
      state.activity.delete(key)
      for (const [id, w] of rows) {
        if (w.inserted) drop.push(id)
        else restore.push([id, w])
      }
    }
    if (drop.length) await db.notification.deleteMany({ where: { id: { in: drop } } })
    // A row from before this transaction that absorbed the movement goes back to what it said.
    for (const [id, w] of restore) await db.notification.updateMany({ where: { id }, data: { body: w.body, createdAt: w.createdAt } })
  }

  /** The same notice to every active ADMIN / MANAGER (for events that aren't logged, e.g. comments), minus `except`. */
  async notifyOversight(db: Db, n: Notice, except: string | readonly string[] = []) {
    const skip = new Set(typeof except === 'string' ? [except] : except)
    const staff = await db.user.findMany({ where: { isActive: true, role: { in: OVERSIGHT_ROLES } }, select: { id: true } })
    await this.notify(db, staff.map((u) => u.id).filter((id) => !skip.has(id)), n)
  }

  // ---------- fan-out ----------

  private async write(db: Db, actor: Actor, entry: Entry, opts: LogOptions | undefined) {
    const row = await db.activityLog.create({ data: entry })
    if (await this.activityReady(db)) await this.fanOut(db, actor, entry, opts)
    return row
  }

  private async fanOut(db: Db, actor: Actor, { action, entityType, entityId, proposalId, summary }: Entry, opts: LogOptions | undefined) {
    const taskId = opts?.taskId !== undefined ? opts.taskId : entityType === 'TASK' ? entityId : null
    // Gone (task.delete): no assignees left (the caller passes them as extraRecipientIds), and the link opens the proposal.
    const task = taskId
      ? await db.task.findUnique({
          where: { id: taskId },
          select: { assignees: { where: { user: { isActive: true } }, select: { user: { select: { id: true, role: true } } } } },
        })
      : null
    const staff = await db.user.findMany({ where: { isActive: true, role: { in: OVERSIGHT_ROLES } }, select: { id: true, role: true } })
    const extraIds = [...new Set(opts?.extraRecipientIds ?? [])]
    const extra = extraIds.length ? await db.user.findMany({ where: { id: { in: extraIds }, isActive: true }, select: { id: true, role: true } }) : []

    const skip = new Set([actor.id, ...(opts?.skipUserIds ?? [])])
    const recipients = new Map<string, Role>()
    for (const u of [...staff, ...(task?.assignees.map((a) => a.user) ?? []), ...extra]) if (!skip.has(u.id)) recipients.set(u.id, u.role)
    if (recipients.size === 0) return

    const proposalLink = proposalId ? `/proposals/${proposalId}${proposalQuery(action, task ? taskId : null)}` : null
    const page = ENTITY_PAGE[entityType]
    const linkFor = (id: string, role: Role): string | null => {
      if (proposalLink) return proposalLink
      if (!page) return null
      const who = { id, role }
      return can(who, page.permission) ? page.path : can(who, 'activity.read.all') ? '/admin/activity' : null
    }

    // Same transaction: whoever already got a direct notice for this page doesn't get the ACTIVITY row too.
    const state = txNotices(db)
    const byLink = new Map<string | null, string[]>()
    for (const [id, role] of recipients) {
      const link = linkFor(id, role)
      if (state && link && state.noticed.has(pairKey(id, link))) continue
      byLink.set(link, [...(byLink.get(link) ?? []), id])
    }
    if (byLink.size === 0) return

    const title = await this.title(db, actor, proposalId)
    const now = new Date()
    for (const [link, userIds] of byLink) {
      // Coalesce (edits of one task only): the newest unread row of the same actor's earlier edit of this task from the
      // last 10 minutes takes the new summary. Deletes, ticks, status / presentation / production steps always add a row.
      const coalesce = action === COALESCE_ACTION && !!link && link.includes('?task=')
      const open = coalesce
        ? await db.notification.findMany({
            where: {
              userId: { in: userIds },
              type: 'ACTIVITY',
              isRead: false,
              title,
              link,
              body: { startsWith: TASK_UPDATE_PREFIX },
              createdAt: { gte: new Date(now.getTime() - COALESCE_MS) },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { id: true, userId: true, body: true, createdAt: true },
          })
        : []
      const reused = new Map<string, (typeof open)[number]>()
      for (const n of open) if (!reused.has(n.userId)) reused.set(n.userId, n)
      if (reused.size) await db.notification.updateMany({ where: { id: { in: [...reused.values()].map((n) => n.id) } }, data: { body: summary, createdAt: now } })
      const fresh = userIds.filter((id) => !reused.has(id)).map((userId) => ({ id: randomUUID(), userId, type: 'ACTIVITY' as const, title, body: summary, link, createdAt: now }))
      if (fresh.length) await db.notification.createMany({ data: fresh })

      if (!state || !link) continue
      const remember = (userId: string, id: string, w: Written) => {
        const key = pairKey(userId, link)
        const rows = state.activity.get(key) ?? new Map<string, Written>()
        // The first write wins: it knows whether the row is new and what it said before this transaction.
        if (!rows.has(id)) rows.set(id, w)
        state.activity.set(key, rows)
      }
      for (const n of reused.values()) remember(n.userId, n.id, { inserted: false, body: n.body, createdAt: n.createdAt })
      for (const n of fresh) remember(n.userId, n.id, { inserted: true, body: summary, createdAt: now })
    }
  }

  /** "Nickname · P-0001" (the actor, and the proposal when there is one). */
  private async title(db: Db, actor: Actor, proposalId: string | null) {
    let name = actor.nickname || actor.name
    if (!name) {
      const row = await db.user.findUnique({ where: { id: actor.id }, select: { name: true, nickname: true } })
      name = row?.nickname || row?.name || 'ผู้ใช้'
    }
    const proposal = proposalId ? await db.proposal.findUnique({ where: { id: proposalId }, select: { code: true } }) : null
    return proposal ? `${name} · ${proposal.code}` : name
  }

  /**
   * Whether the database already has the ACTIVITY notification type. A server started on new code before
   * `prisma migrate deploy` ran keeps working (no bell fan-out, a warning) instead of failing every write.
   */
  private async activityReady(db: Db): Promise<boolean> {
    const known = this.activityEnum
    if (known && (known.ok || Date.now() - known.checkedAt < RECHECK_MS)) return known.ok
    const rows = await db.$queryRaw<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace s ON s.oid = t.typnamespace
        WHERE s.nspname = ${config.dbSchema} AND t.typname = 'NotificationType' AND e.enumlabel = 'ACTIVITY'
      ) AS ok`
    const ok = rows[0]?.ok === true
    this.activityEnum = { ok, checkedAt: Date.now() }
    if (!ok) this.logger.warn('NotificationType.ACTIVITY is missing — run `npm run db:migrate` (20261009000000_notification_activity); bell activity is off until then')
    return ok
  }
}

/** Opens the task (when it still exists), or the tab the movement happened on. */
function proposalQuery(action: string, taskId: string | null) {
  if (taskId) return `?task=${taskId}`
  if (action.startsWith('presentation.')) return '?tab=present'
  if (action.startsWith('production.')) return '?tab=production'
  return ''
}
