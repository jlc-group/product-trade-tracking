import { Injectable } from '@nestjs/common'
import { sameDepartment, type Department, type User } from '@flowtrade/shared'
import { ActivityService } from '../../common/activity.service.js'
import { iso } from '../../common/dates.js'
import { conflict, invalid, notFound } from '../../common/errors.js'
import { Prisma } from '../../generated/prisma/client.js'
import { PrismaService, type Db } from '../../prisma/prisma.service.js'
import { normalizeDepartmentName, type CreateDepartmentBody, type UpdateDepartmentBody } from './departments.schemas.js'

// Every change is written to the activity log (entity type DEPARTMENT) in the same transaction.

const DUPLICATE_NAME = 'มีแผนกชื่อนี้อยู่แล้ว'

const isPrismaError = (e: unknown, code: string) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === code

/** The unique indexes on name / lower(name) are the backstop for concurrent writes. */
function mapDuplicate(e: unknown): unknown {
  return isPrismaError(e, 'P2002') ? invalid(DUPLICATE_NAME, { name: DUPLICATE_NAME }) : e
}

const inUse = (users: number) => conflict(`ลบไม่ได้ เพราะมีผู้ใช้ ${users} คนอยู่ในแผนกนี้ — ปิดการใช้งานแทนได้`, 'IN_USE')

export function toDepartment(d: Prisma.DepartmentGetPayload<object>): Department {
  return { id: d.id, name: d.name, sortOrder: d.sortOrder, isActive: d.isActive, createdAt: iso(d.createdAt), updatedAt: iso(d.updatedAt) }
}

const ORDER: Prisma.DepartmentOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Ordered by sortOrder (admin-defined). */
  async list(includeInactive: boolean): Promise<Department[]> {
    const rows = await this.prisma.department.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: ORDER })
    return rows.map(toDepartment)
  }

  /** { [departmentId]: number of users (active or not) in it } — every department appears, 0 when unused. */
  async usage(): Promise<Record<string, number>> {
    const [departments, groups] = await Promise.all([
      this.prisma.department.findMany({ select: { id: true, name: true } }),
      this.prisma.user.groupBy({ by: ['department'], where: { department: { not: null } }, _count: { _all: true } }),
    ])
    const byName = new Map(groups.map((g) => [g.department, g._count._all]))
    return Object.fromEntries(departments.map((d) => [d.id, byName.get(d.name) ?? 0]))
  }

  /** New departments go last. */
  async create(actor: User, input: CreateDepartmentBody): Promise<Department> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertUniqueName(tx, input.name)
        const max = await tx.department.aggregate({ _max: { sortOrder: true } })
        const row = await tx.department.create({
          data: { name: input.name, sortOrder: Math.max(0, max._max.sortOrder ?? 0) + 1 },
        })
        await this.activity.log(tx, actor, 'department.create', 'DEPARTMENT', row.id, null, `เพิ่มแผนก ${row.name}`)
        return toDepartment(row)
      })
    } catch (e) {
      throw mapDuplicate(e)
    }
  }

  /**
   * Rename and/or (de)activate. A rename runs in one transaction; the FK users.department → departments.name
   * is ON UPDATE CASCADE, so every user in the department follows the new name, and the free-text department of
   * tasks and template steps (`responsible`, matched like sameDepartment) is rewritten to it — the department lock
   * compares the two, so the department's people keep their tasks. Deactivating keeps the department on its current
   * users but it can no longer be newly assigned.
   */
  async update(actor: User, id: string, patch: UpdateDepartmentBody): Promise<Department> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const department = await tx.department.findUnique({ where: { id } })
        if (!department) throw notFound('แผนก')
        const rename = patch.name !== undefined && patch.name !== department.name
        if (rename) await this.assertUniqueName(tx, patch.name!, id)
        const row = await tx.department.update({
          where: { id },
          data: { name: rename ? patch.name : undefined, isActive: patch.isActive },
        })
        const moved = rename ? await this.renameResponsible(tx, department.name, row.name) : null
        const changes: string[] = []
        if (moved) changes.push(`เปลี่ยนชื่อแผนก ${department.name} เป็น ${row.name} (ผู้ใช้ในแผนก งาน ${moved.tasks} รายการ และขั้นตอนในแม่แบบ ${moved.items} รายการเปลี่ยนตาม)`)
        if (patch.isActive !== undefined && patch.isActive !== department.isActive) changes.push(`${row.isActive ? 'เปิด' : 'ปิด'}การใช้งานแผนก ${row.name}`)
        if (changes.length) await this.activity.log(tx, actor, rename ? 'department.rename' : 'department.update', 'DEPARTMENT', row.id, null, changes.join(' และ'))
        return toDepartment(row)
      })
    } catch (e) {
      throw mapDuplicate(e)
    }
  }

  /** 409 IN_USE while any user (active or not) is in the department (FK ON DELETE RESTRICT). */
  async remove(actor: User, id: string): Promise<true> {
    let name = ''
    try {
      await this.prisma.$transaction(async (tx) => {
        const department = await tx.department.findUnique({ where: { id } })
        if (!department) throw notFound('แผนก')
        name = department.name
        const used = await tx.user.count({ where: { department: department.name } })
        if (used > 0) throw inUse(used)
        await tx.department.delete({ where: { id } })
        await this.activity.log(tx, actor, 'department.delete', 'DEPARTMENT', id, null, `ลบแผนก ${department.name}`)
      })
    } catch (e) {
      // A user was put in the department between the count and the delete (FK RESTRICT).
      if (isPrismaError(e, 'P2003')) throw inUse(await this.prisma.user.count({ where: { department: name } }))
      throw e
    }
    return true
  }

  /** sortOrder = position + 1 for the given ids; unknown ids are ignored. */
  async reorder(actor: User, ids: string[]): Promise<true> {
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.department.updateMany({ where: { id }, data: { sortOrder: index + 1 } })
      }
      await this.activity.log(tx, actor, 'department.reorder', 'DEPARTMENT', ids[0] ?? '', null, 'จัดลำดับรายชื่อแผนกใหม่')
    })
    return true
  }

  /**
   * Tasks and template steps whose department is `from` (trimmed, spaces collapsed, case-insensitive — the same match as
   * the department lock) now say `to`. Matched in JS over the distinct stored spellings, so it agrees with sameDepartment.
   */
  private async renameResponsible(db: Db, from: string, to: string) {
    const spellings = (rows: { responsible: string | null }[]) =>
      rows.flatMap((r) => (r.responsible !== null && r.responsible !== to && sameDepartment(r.responsible, from) ? [r.responsible] : []))
    const tasks = spellings(await db.task.findMany({ where: { responsible: { not: null } }, distinct: ['responsible'], select: { responsible: true } }))
    const items = spellings(await db.taskTemplateItem.findMany({ where: { responsible: { not: null } }, distinct: ['responsible'], select: { responsible: true } }))
    return {
      tasks: tasks.length ? (await db.task.updateMany({ where: { responsible: { in: tasks } }, data: { responsible: to } })).count : 0,
      items: items.length ? (await db.taskTemplateItem.updateMany({ where: { responsible: { in: items } }, data: { responsible: to } })).count : 0,
    }
  }

  /** Case-insensitive name check (compared in JS so "_" / "%" are never wildcards). */
  private async assertUniqueName(db: Db, name: string, exceptId?: string) {
    const rows = await db.department.findMany({ where: exceptId ? { id: { not: exceptId } } : {}, select: { name: true } })
    const needle = normalizeDepartmentName(name).toLowerCase()
    if (rows.some((r) => normalizeDepartmentName(r.name).toLowerCase() === needle)) throw invalid(DUPLICATE_NAME, { name: DUPLICATE_NAME })
  }
}
