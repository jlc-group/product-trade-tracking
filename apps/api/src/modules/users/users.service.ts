import { Injectable } from '@nestjs/common'
import type { User } from '@flowtrade/shared'
import { generateTempPassword, hashPassword } from '../../auth/password.js'
import { SessionService } from '../../auth/session.service.js'
import { ActivityService } from '../../common/activity.service.js'
import { conflict, invalid, notFound } from '../../common/errors.js'
import { toUser } from '../../common/mappers.js'
import { Prisma } from '../../generated/prisma/client.js'
import { PrismaService, type Db } from '../../prisma/prisma.service.js'
import { normalizeDepartmentName } from '../departments/departments.schemas.js'
import { DEPARTMENT_INACTIVE, DEPARTMENT_UNKNOWN, IDENTIFIER_REQUIRED, type CreateUserBody, type UpdateUserBody } from './users.schemas.js'

/** Avatar colours for new users. */
const AVATAR_PALETTE = ['#2563eb', '#db2777', '#0891b2', '#ea580c', '#16a34a', '#7c3aed', '#ca8a04'] as const

const EMAIL_TAKEN = 'อีเมลนี้มีในระบบแล้ว'
const emailTaken = () => invalid(EMAIL_TAKEN, { email: EMAIL_TAKEN })
const USERNAME_TAKEN = 'ชื่อผู้ใช้นี้มีในระบบแล้ว'
const usernameTaken = () => invalid(USERNAME_TAKEN, { username: USERNAME_TAKEN })
const departmentUnknown = () => invalid(DEPARTMENT_UNKNOWN, { department: DEPARTMENT_UNKNOWN })
const departmentInactive = () => invalid(DEPARTMENT_INACTIVE, { department: DEPARTMENT_INACTIVE })

/** Role / active changes run serializable so two admins can't demote each other into "no admin left". */
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
const MAX_ATTEMPTS = 3

export interface IssuedPasswordResult {
  user: User
  tempPassword: string
}

export interface CreateUserResult {
  user: User
  /** null when the admin set the password in the form. */
  tempPassword: string | null
}

export interface SetActiveResult {
  user: User
  openTasks: number
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly sessions: SessionService,
  ) {}

  /** Active users for pickers, sorted by Thai name. */
  async lookup(): Promise<User[]> {
    const rows = await this.prisma.user.findMany({ where: { isActive: true } })
    return rows.map(toUser).sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }

  /** Every user, in creation order. */
  async list(): Promise<User[]> {
    const rows = await this.prisma.user.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    return rows.map(toUser)
  }

  async create(actor: User, input: CreateUserBody): Promise<CreateUserResult> {
    if (input.email && (await this.emailInUse(this.prisma, input.email))) throw emailTaken()
    if (input.username && (await this.usernameInUse(this.prisma, input.username))) throw usernameTaken()
    // Admin-chosen password, or a one-time temporary one that must be changed at first sign-in.
    const tempPassword = input.password ? null : generateTempPassword()
    const passwordHash = await hashPassword(input.password ?? tempPassword!)
    const mustChangePassword = tempPassword ? true : (input.mustChangePassword ?? false)
    const row = await this.guard(() =>
      this.prisma.$transaction(async (tx) => {
        if (input.email && (await this.emailInUse(tx, input.email))) throw emailTaken()
        if (input.username && (await this.usernameInUse(tx, input.username))) throw usernameTaken()
        const department = await this.resolveDepartment(tx, input.department ?? null, null)
        const count = await tx.user.count()
        const created = await tx.user.create({
          data: {
            email: input.email ?? null,
            username: input.username ?? null,
            name: input.name,
            nickname: input.nickname ?? null,
            department,
            position: input.position ?? null,
            role: input.role,
            isActive: true,
            mustChangePassword,
            passwordHash,
            avatarColor: AVATAR_PALETTE[count % AVATAR_PALETTE.length],
          },
        })
        await this.activity.log(tx, actor, 'user.create', 'USER', created.id, null, `เพิ่มผู้ใช้ ${created.name} (${created.role})`)
        return created
      }),
    )
    return { user: toUser(row), tempPassword }
  }

  async update(actor: User, id: string, patch: UpdateUserBody): Promise<User> {
    if (patch.password && id === actor.id) {
      throw invalid('เปลี่ยนรหัสผ่านของตัวเองได้ที่หน้า ตั้งค่าบัญชี', { password: 'เปลี่ยนรหัสผ่านของตัวเองได้ที่หน้า ตั้งค่าบัญชี' })
    }
    const passwordHash = patch.password ? await hashPassword(patch.password) : null
    const row = await this.guard(() =>
      this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id } })
        if (!user) throw notFound('ผู้ใช้')
        // Unchecked input: `department` is the FK scalar (users.department → departments.name).
        const data: Prisma.UserUncheckedUpdateInput = {}
        if (patch.role && patch.role !== user.role) {
          if (user.id === actor.id) throw invalid('ไม่สามารถเปลี่ยนสิทธิ์ของตัวเองได้', { role: 'ไม่สามารถเปลี่ยนสิทธิ์ของตัวเองได้' })
          if (user.role === 'ADMIN' && user.isActive && !(await this.hasOtherActiveAdmin(tx, user.id))) {
            throw invalid('ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน', { role: 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน' })
          }
          data.role = patch.role
        }
        if (patch.email !== undefined) {
          if (patch.email && (await this.emailInUse(tx, patch.email, id))) throw emailTaken()
          data.email = patch.email
        }
        if (patch.username !== undefined) {
          if (patch.username && (await this.usernameInUse(tx, patch.username, id))) throw usernameTaken()
          data.username = patch.username
        }
        // Whatever changes, the user must keep a way to sign in.
        const nextEmail = patch.email !== undefined ? patch.email : user.email
        const nextUsername = patch.username !== undefined ? patch.username : user.username
        if (!nextEmail && !nextUsername) throw invalid(IDENTIFIER_REQUIRED, { username: IDENTIFIER_REQUIRED })
        if (passwordHash) {
          // Admin sets a new password: also lifts a brute-force lock; sessions are revoked below.
          data.passwordHash = passwordHash
          data.mustChangePassword = patch.mustChangePassword ?? false
          data.failedLoginCount = 0
          data.lockedUntil = null
        }
        if (patch.name !== undefined) data.name = patch.name
        if (patch.nickname !== undefined) data.nickname = patch.nickname
        if (patch.department !== undefined) data.department = await this.resolveDepartment(tx, patch.department, user.department)
        if (patch.position !== undefined) data.position = patch.position
        const updated = await tx.user.update({ where: { id }, data })
        await this.activity.log(tx, actor, 'user.update', 'USER', updated.id, null, `แก้ไขข้อมูลผู้ใช้ ${updated.name}${passwordHash ? ' และตั้งรหัสผ่านใหม่' : ''}`)
        return updated
      }, SERIALIZABLE),
    )
    // A new password signs the user out everywhere.
    if (passwordHash) await this.sessions.revokeAll(id)
    return toUser(row)
  }

  async setActive(actor: User, id: string, isActive: boolean): Promise<SetActiveResult> {
    const result = await this.guard(() =>
      this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id } })
        if (!user) throw notFound('ผู้ใช้')
        if (!isActive && user.id === actor.id) throw invalid('ไม่สามารถปิดการใช้งานบัญชีของตัวเองได้')
        if (!isActive && user.role === 'ADMIN' && user.isActive && !(await this.hasOtherActiveAdmin(tx, user.id))) {
          throw invalid('ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน')
        }
        const updated = await tx.user.update({ where: { id }, data: { isActive } })
        await this.activity.log(tx, actor, isActive ? 'user.activate' : 'user.deactivate', 'USER', updated.id, null, `${isActive ? 'เปิด' : 'ปิด'}การใช้งานผู้ใช้ ${updated.name}`)
        const openTasks = await tx.task.count({ where: { isDone: false, assignees: { some: { userId: id } } } })
        return { user: toUser(updated), openTasks }
      }, SERIALIZABLE),
    )
    // A deactivated user is signed out everywhere.
    if (!isActive) await this.sessions.revokeAll(id)
    return result
  }

  /** Issues a new temporary password; the user must change it at next sign-in and is signed out everywhere. */
  async resetPassword(actor: User, id: string, actorSessionId?: string): Promise<IssuedPasswordResult> {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw notFound('ผู้ใช้')
    const tempPassword = generateTempPassword()
    const passwordHash = await hashPassword(tempPassword)
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        // A reset also lifts a brute-force lock, so the user can sign in with the new password.
        data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
      })
      await this.activity.log(tx, actor, 'user.resetPassword', 'USER', updated.id, null, `รีเซ็ตรหัสผ่านของ ${updated.name}`)
      return updated
    })
    // Resetting your own password keeps the current session (it is then forced to change the password).
    await this.sessions.revokeAll(id, id === actor.id ? actorSessionId : undefined)
    return { user: toUser(row), tempPassword }
  }

  // ---------- helpers ----------

  private async emailInUse(db: Db, email: string, exceptId?: string) {
    const hit = await db.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    })
    return !!hit
  }

  private async usernameInUse(db: Db, username: string, exceptId?: string) {
    const hit = await db.user.findFirst({ where: { username, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } })
    return !!hit
  }

  /**
   * Department name → canonical name from the departments table (case-insensitive; compared in JS so
   * "_" / "%" are never wildcards). Unknown → 422. An inactive department can't be newly assigned, but a
   * user who already has it (`current`) keeps it.
   */
  private async resolveDepartment(db: Db, name: string | null, current: string | null): Promise<string | null> {
    if (!name) return null
    const needle = normalizeDepartmentName(name).toLowerCase()
    const departments = await db.department.findMany({ select: { name: true, isActive: true } })
    const hit = departments.find((d) => normalizeDepartmentName(d.name).toLowerCase() === needle)
    if (!hit) throw departmentUnknown()
    if (!hit.isActive && hit.name !== current) throw departmentInactive()
    return hit.name
  }

  private async hasOtherActiveAdmin(db: Db, exceptId: string) {
    const others = await db.user.count({ where: { role: 'ADMIN', isActive: true, id: { not: exceptId } } })
    return others > 0
  }

  /** Retries serialization conflicts; maps a racing duplicate email / vanished department to the same Thai validation error. */
  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn()
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          // CHECK users_sign_in_identifier_check (race with a concurrent edit).
          if (JSON.stringify(e.meta ?? {}).includes('sign_in_identifier')) throw invalid(IDENTIFIER_REQUIRED, { username: IDENTIFIER_REQUIRED })
          // FK users.department → departments.name (the users table's only FK): the department was renamed / deleted meanwhile.
          if (e.code === 'P2003') throw departmentUnknown()
          if (e.code === 'P2002') throw JSON.stringify(e.meta ?? {}).includes('username') ? usernameTaken() : emailTaken()
          if (e.code === 'P2034') {
            if (attempt < MAX_ATTEMPTS) continue
            throw conflict('มีการแก้ไขข้อมูลผู้ใช้พร้อมกัน กรุณาลองใหม่อีกครั้ง')
          }
        }
        throw e
      }
    }
  }
}
