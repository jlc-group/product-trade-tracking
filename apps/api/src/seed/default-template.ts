// The standard product-information checklist every new OFFLINE proposal starts with (every shelf type).
// Source: the Trade team's sheet "รายละเอียดข้อมูลระบบสินค้าของบริษัท" (37 rows), grouped into 7 main
// tasks (approved 1 Oct 2026). Since 2 Oct 2026 each main task is a table: the sheet rows are its labels
// and the team fills in the values (no sub tasks), as the team set up PRJ-2026-0004. Each group has its
// own window inside the PREP_DAYS before the launch on the 15th, ordered by what depends on what.
// Admins can refine any of it in Admin › แม่แบบ Task.
//
// Run: npm run db:default-template -w @flowtrade/api            (creates it if missing)
//      npm run db:default-template -w @flowtrade/api -- --replace (rewrites its items)
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { PREP_DAYS } from '@flowtrade/shared'
import { config } from '../config.js'
import { PrismaService } from '../prisma/prisma.service.js'

export const DEFAULT_TEMPLATE_NAME = 'เช็กลิสต์ข้อมูลสินค้าสำหรับวางขายออฟไลน์ (มาตรฐาน)'

export interface ChecklistGroup {
  title: string
  /** Lead department of the group. */
  responsible: string | null
  /** Window in days relative to the launch date (negative = before). */
  start: number
  due: number
  /** Table row labels — the sheet rows of this group. */
  fields: string[]
}

// Barcode and QR code rows belong to JOY (a person, not a department).
export const DEFAULT_CHECKLIST_GROUPS: ChecklistGroup[] = [
  {
    title: 'ข้อมูลพื้นฐานสินค้า',
    responsible: 'NPD',
    start: -PREP_DAYS,
    due: -76,
    fields: [
      'ชื่อสินค้าภาษาไทย',
      'ชื่อสินค้าภาษาอังกฤษ',
      'ชื่อเรียก',
      'ปริมาณสุทธิ',
      'ชนิดสินค้า (ซอง หลอด ขวด กระปุก)',
      'สีของสินค้า',
      'ประเภทของสินค้า',
      'อายุสินค้า',
    ],
  },
  {
    title: 'ผู้ผลิตและแหล่งที่มา',
    responsible: 'NPD',
    start: -PREP_DAYS,
    due: -76,
    fields: ['ประเทศผู้นำเข้า(ถ้ามี)', 'ชื่อและที่อยู่ผู้ผลิต', 'ชื่อและที่อยู่ผู้จัดจำหน่าย'],
  },
  {
    title: 'รหัสสินค้าและเอกสารราชการ',
    responsible: 'NPD',
    start: -83,
    due: -62,
    fields: ['เลขที่บาร์โค๊ต ชิ้น แพ็ค ลัง', 'เลขที่ใบรับจดแจ้ง/อย', 'รหัสสินค้าบริษัท', 'QR โค๊ต(ถ้ามี)', 'ไฟล์แนบเอกสารทางราชการ', 'ผลการทดสอบ/ผลการวิจัย'],
  },
  {
    title: 'เนื้อหาและรายละเอียดสินค้า',
    responsible: 'NPD',
    start: -76,
    due: -55,
    fields: ['ส่วนประกอบ', 'รายละเอียดของสินค้าภาษาไทย', 'รายละเอียดของสินค้าภาษาอังกฤษ', 'จุดขาย/จุดเด่นของสินค้า', 'SEO', 'วิธีการใช้', 'คำเตือน(ถ้ามี)'],
  },
  {
    title: 'ภาพสินค้าและสื่อการตลาด',
    responsible: 'Graphics',
    start: -69,
    due: -41,
    fields: ['ไฟล์พรีเซ้นต์การตลาด', 'รูปสินค้า 3D', 'รูปสินค้างานพิมพ์', 'ช่องทางการจำหน่าย', 'mock up สินค้า เสมือนจริง', 'ตัวอย่างสินค้า 2 ชิ้น/ห้าง/sku'],
  },
  {
    title: 'ขนาด บรรจุภัณฑ์ และน้ำหนัก',
    responsible: 'NPD',
    start: -76,
    due: -55,
    fields: [
      'ปริมาณบรรจุลงลัง',
      'ขนาดสินค้า กว้างXยาวXสูง ซม (ซอง ขวด กระปุก )',
      'ขนาดแพ็คสินค้า กว้างXยาวXสูง ซม',
      'ขนาดลังสินค้า กว้างXยาวXสูง ซม',
      'น้ำหนักรวมลัง',
      'ขนาดแพ็คสินค้าแต่ละช่องทาง กว้างXยาวXสูง ซม (ซอง ขวด กระปุก )',
    ],
  },
  {
    title: 'ราคา การผลิต และประมาณการขาย',
    responsible: 'Purchase',
    start: -62,
    due: -34,
    fields: ['ราคา', 'ระยะเวลาการผลิต', 'แบรนด์ forecast จำนวนชิ้นขาย lot1'],
  },
]

const FIELD_COUNT = DEFAULT_CHECKLIST_GROUPS.reduce((n, g) => n + g.fields.length, 0)

export const TEMPLATE_DESCRIPTION = `ข้อมูลสินค้า ${FIELD_COUNT} หัวข้อ ใน 7 ตาราง ทยอยกรอกภายใน ${PREP_DAYS} วันก่อนวันวางขาย (วันที่ 15) — ใช้กับการวางขายออฟไลน์ทุกประเภท Shelf`

export interface TemplateItemSeed {
  id: string
  parentId: string | null
  level: number
  title: string
  startOffsetDays: number
  dueOffsetDays: number
  responsible: string | null
  fieldLabels: string[]
  sortOrder: number
}

/** One table-format main task per group, with fresh ids. */
export function defaultChecklistItems(): TemplateItemSeed[] {
  return DEFAULT_CHECKLIST_GROUPS.map((group, g) => ({
    id: randomUUID(),
    parentId: null,
    level: 1,
    title: group.title,
    startOffsetDays: group.start,
    dueOffsetDays: group.due,
    responsible: group.responsible,
    fieldLabels: group.fields,
    sortOrder: (g + 1) * 1000,
  }))
}

/** Creates the default template when missing; with replace=true rewrites its items. */
export async function ensureDefaultTemplate(prisma: PrismaService, replace = false) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.taskTemplate.findFirst({ where: { name: DEFAULT_TEMPLATE_NAME } })
    if (existing && !replace) return { created: false, replaced: false, id: existing.id }
    const items = defaultChecklistItems()
    const template = existing
      ? await tx.taskTemplate.update({ where: { id: existing.id }, data: { description: TEMPLATE_DESCRIPTION, channel: 'OFFLINE', shelfTypeId: null, storeId: null, isActive: true } })
      : await tx.taskTemplate.create({
          data: {
            name: DEFAULT_TEMPLATE_NAME,
            description: TEMPLATE_DESCRIPTION,
            channel: 'OFFLINE',
            shelfTypeId: null,
            storeId: null,
            isActive: true,
          },
        })
    if (existing) await tx.taskTemplateItem.deleteMany({ where: { templateId: template.id } })
    await tx.taskTemplateItem.createMany({ data: items.map((i) => ({ ...i, templateId: template.id })) })
    return { created: !existing, replaced: !!existing, id: template.id, items: items.length }
  })
}

// CLI entry point
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const prisma = new PrismaService()
  try {
    const result = await ensureDefaultTemplate(prisma, process.argv.includes('--replace'))
    console.log(`Schema "${config.dbSchema}" default template:`, result)
  } finally {
    await prisma.$disconnect()
  }
}
