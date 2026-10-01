// The standard product-information checklist every new OFFLINE proposal starts with (every shelf type).
// Source: the Trade team's sheet "รายละเอียดข้อมูลระบบสินค้าของบริษัท" (37 rows), grouped into 7 main
// tasks (approved 1 Oct 2026). Each group has its own window inside the PREP_DAYS before the launch on
// the 15th, ordered by what depends on what; its sub tasks inherit the window. Admins can refine any
// of it in Admin › แม่แบบ Task.
//
// Run: npm run db:default-template -w @flowtrade/api            (creates it if missing)
//      npm run db:default-template -w @flowtrade/api -- --replace (rewrites its items)
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { PREP_DAYS } from '@flowtrade/shared'
import { config } from '../config.js'
import { PrismaService } from '../prisma/prisma.service.js'

export const DEFAULT_TEMPLATE_NAME = 'เช็กลิสต์ข้อมูลสินค้าสำหรับวางขายออฟไลน์ (มาตรฐาน)'

/** [title, responsible department, mini tasks]. Titles are the sheet text verbatim (JOY is a person, not a department). */
type Row = [title: string, responsible: string | null, children?: Row[]]

export interface ChecklistGroup {
  title: string
  /** Lead department of the group. */
  responsible: string | null
  /** Window in days relative to the launch date (negative = before). */
  start: number
  due: number
  rows: Row[]
}

export const DEFAULT_CHECKLIST_GROUPS: ChecklistGroup[] = [
  {
    title: 'ข้อมูลพื้นฐานสินค้า',
    responsible: 'NPD',
    start: -PREP_DAYS,
    due: -76,
    rows: [
      ['ชื่อสินค้าภาษาไทย', 'NPD'],
      ['ชื่อสินค้าภาษาอังกฤษ', 'NPD'],
      ['ชื่อเรียก', 'NPD'],
      ['ปริมาณสุทธิ', 'NPD'],
      ['ชนิดสินค้า(ซอง หลอด ขวด กระปุก)', 'NPD'],
      ['สีของสินค้า', 'NPD'],
      ['ประเภทของสินค้า', 'NPD'],
      ['อายุสินค้า', 'NPD'],
    ],
  },
  {
    title: 'ผู้ผลิตและแหล่งที่มา',
    responsible: 'NPD',
    start: -PREP_DAYS,
    due: -76,
    rows: [
      ['ประเทศผู้นำเข้า(ถ้ามี)', 'NPD'],
      ['ชื่อและที่อยู่ผู้ผลิต', 'NPD'],
      ['ชื่อและที่อยู่ผู้จัดจำหน่าย', 'NPD'],
    ],
  },
  {
    title: 'รหัสสินค้าและเอกสารราชการ',
    responsible: 'NPD',
    start: -83,
    due: -62,
    rows: [
      ['เลขที่บาร์โค๊ต ชิ้น แพ็ค ลัง', null], // JOY
      ['เลขที่ใบรับจดแจ้ง/อย', 'NPD'],
      ['รหัสสินค้าบริษัท', 'NPD'],
      ['QR โค๊ต(ถ้ามี)', null], // JOY
      ['ไฟล์แนบเอกสารทางราชการ', 'NPD'],
      ['ผลการทดสอบ/ผลการวิจัย', 'NPD'],
    ],
  },
  {
    title: 'เนื้อหาและรายละเอียดสินค้า',
    responsible: 'NPD',
    start: -76,
    due: -55,
    rows: [
      ['ส่วนประกอบ', 'NPD'],
      ['รายละเอียดของสินค้าภาษาไทย', 'NPD'],
      ['รายละเอียดสินค้าภาษาอังกฤษ', 'NPD'],
      ['จุดขาย/จุดเด่นของสินค้า', 'NPD'],
      ['SEO', 'NPD'],
      ['วิธีการใช้', 'NPD'],
      ['คำเตือน(ถ้ามี)', 'NPD'],
    ],
  },
  {
    title: 'ภาพสินค้าและสื่อการตลาด',
    responsible: 'Graphics',
    start: -69,
    due: -41,
    rows: [
      ['ไฟล์พรีเซ็นการตลาด', 'Branding & Marketing'],
      ['รูปสินค้า 3D', 'Graphics', [
        ['mock up สินค้า เสมือนจริง', 'NPD'],
        ['ตัวอย่างสินค้า 2 ชิ้น/ห้าง/sku', 'NPD'],
      ]],
      ['รูปสินค้างานพิมพ์', 'Graphics'],
      ['ช่องทางการจำหน่าย', 'Branding & Marketing'],
    ],
  },
  {
    title: 'ขนาด บรรจุภัณฑ์ และน้ำหนัก',
    responsible: 'NPD',
    start: -76,
    due: -55,
    rows: [
      ['ปริมาณบรรจุลงลัง', 'NPD'],
      ['ขนาดสินค้า กว้างXยาวXสูง ซม (ซอง ขวด กระปุก )', 'NPD'],
      ['ขนาดแพ็คสินค้า กว้างXยาวXสูง ซม', 'NPD'],
      ['ขนาดลังสินค้า กว้างXยาวXสูง ซม', 'NPD'],
      ['น้ำหนักรวมลัง', 'NPD'],
      ['ขนาดแพ็คสินค้าแต่ละช่องทาง กว้างXยาวXสูง ซม (ซอง ขวด กระปุก )', null],
    ],
  },
  {
    title: 'ราคา การผลิต และประมาณการขาย',
    responsible: 'Purchase',
    start: -62,
    due: -34,
    rows: [
      ['ราคา', 'NPD'],
      ['ระยะเวลาการผลิต', 'Purchase'],
      ['แบรนด์ forecast จำนวนชิ้นที่จะขาย lot1', null],
    ],
  },
]

export const TEMPLATE_DESCRIPTION = `ข้อมูลสินค้า 37 รายการ จัดเป็น 7 กลุ่ม ทยอยทำภายใน ${PREP_DAYS} วันก่อนวันวางขาย (วันที่ 15) — ใช้กับการวางขายออฟไลน์ทุกประเภท Shelf`

export interface TemplateItemSeed {
  id: string
  parentId: string | null
  level: number
  title: string
  startOffsetDays: number
  dueOffsetDays: number
  responsible: string | null
  sortOrder: number
}

/** Flat item list, parents before children, with fresh ids. Sub/mini tasks inherit their group's window. */
export function defaultChecklistItems(): TemplateItemSeed[] {
  const items: TemplateItemSeed[] = []
  DEFAULT_CHECKLIST_GROUPS.forEach((group, g) => {
    const groupId = randomUUID()
    items.push({ id: groupId, parentId: null, level: 1, title: group.title, startOffsetDays: group.start, dueOffsetDays: group.due, responsible: group.responsible, sortOrder: (g + 1) * 1000 })
    group.rows.forEach(([title, responsible, children], i) => {
      const id = randomUUID()
      items.push({ id, parentId: groupId, level: 2, title, startOffsetDays: group.start, dueOffsetDays: group.due, responsible, sortOrder: (i + 1) * 1000 })
      children?.forEach(([childTitle, childResponsible], j) => {
        items.push({ id: randomUUID(), parentId: id, level: 3, title: childTitle, startOffsetDays: group.start, dueOffsetDays: group.due, responsible: childResponsible, sortOrder: (j + 1) * 1000 })
      })
    })
  })
  return items
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
