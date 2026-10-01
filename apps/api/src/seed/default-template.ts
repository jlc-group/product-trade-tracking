// The standard product-information checklist every new OFFLINE proposal starts with (every shelf type).
// Source: the Trade team's checklist sheet (ลำดับ / รายการ / ผู้รับผิดชอบ), 1 Oct 2026.
// Dates: everything is prepared inside the PREP_DAYS window before the launch on the 15th —
// each item starts at D-PREP_DAYS and is due the day before launch; admins can refine per item
// in Admin › แม่แบบ Task.
//
// Run: npm run db:default-template -w @flowtrade/api            (creates it if missing)
//      npm run db:default-template -w @flowtrade/api -- --replace (rewrites its items)
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { PREP_DAYS } from '@flowtrade/shared'
import { config } from '../config.js'
import { PrismaService } from '../prisma/prisma.service.js'

export const DEFAULT_TEMPLATE_NAME = 'เช็กลิสต์ข้อมูลสินค้าสำหรับวางขายออฟไลน์ (มาตรฐาน)'

type Row = [title: string, responsible: string | null, children?: Row[]]

/** Main task → the 37 sheet rows as sub tasks → 20.1 / 20.2 as mini tasks. Text as given by the Trade team. */
export const DEFAULT_CHECKLIST: { title: string; rows: Row[] } = {
  title: 'เตรียมข้อมูลสินค้าสำหรับเสนอห้าง',
  rows: [
    ['ชื่อสินค้าภาษาไทย', 'NPD'],
    ['ชื่อสินค้าภาษาอังกฤษ', 'NPD'],
    ['ชื่อเรียก', 'NPD'],
    ['ปริมาณสุทธิ', 'NPD'],
    ['ชนิดสินค้า(ซอง หลอด ขวด กระปุก)', 'NPD'],
    ['สีของสินค้า', 'NPD'],
    ['ประเภทของสินค้า', 'NPD'],
    ['ประเทศผู้นำเข้า(ถ้ามี)', 'NPD'],
    ['เลขที่บาร์โค๊ต ชิ้น แพ็ค ลัง', null], // JOY (a person, not a department)
    ['เลขที่ใบรับจดแจ้ง/อย', 'NPD'],
    ['รหัสสินค้าบริษัท', 'NPD'],
    ['QR โค๊ต(ถ้ามี)', null], // JOY (a person, not a department)
    ['ชื่อและที่อยู่ผู้ผลิต', 'NPD'],
    ['ชื่อและที่อยู่ผู้จัดจำหน่าย', 'NPD'],
    ['อายุสินค้า', 'NPD'],
    ['ราคา', 'NPD'],
    ['ไฟล์แนบเอกสารทางราชการ', 'NPD'],
    ['ไฟล์พรีเซ็นการตลาด', 'Branding & Marketing'],
    ['ผลการทดสอบ/ผลการวิจัย', 'NPD'],
    ['รูปสินค้า 3D', 'Graphics', [
      ['mock up สินค้า เสมือนจริง', 'NPD'],
      ['ตัวอย่างสินค้า 2 ชิ้น/ห้าง/sku', 'NPD'],
    ]],
    ['รูปสินค้างานพิมพ์', 'Graphics'],
    ['ส่วนประกอบ', 'NPD'],
    ['รายละเอียดของสินค้าภาษาไทย', 'NPD'],
    ['รายละเอียดสินค้าภาษาอังกฤษ', 'NPD'],
    ['จุดขาย/จุดเด่นของสินค้า', 'NPD'],
    ['ช่องทางการจำหน่าย', 'Branding & Marketing'],
    ['SEO', 'NPD'],
    ['วิธีการใช้', 'NPD'],
    ['คำเตือน(ถ้ามี)', 'NPD'],
    ['ปริมาณบรรจุลงลัง', 'NPD'],
    ['ขนาดสินค้า กว้างXยาวXสูง ซม (ซอง ขวด กระปุก )', 'NPD'],
    ['ขนาดแพ็คสินค้า กว้างXยาวXสูง ซม', 'NPD'],
    ['ขนาดลังสินค้า กว้างXยาวXสูง ซม', 'NPD'],
    ['น้ำหนักรวมลัง', 'NPD'],
    ['ระยะเวลาการผลิต', 'Purchase'],
    ['ขนาดแพ็คสินค้าแต่ละช่องทาง กว้างXยาวXสูง ซม (ซอง ขวด กระปุก )', null],
    ['แบรนด์ forecast จำนวนชิ้นที่จะขาย lot1', null],
  ],
}

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

/** Flat item list, parents before children, with fresh ids. */
export function defaultChecklistItems(): TemplateItemSeed[] {
  const start = -PREP_DAYS
  const due = -1
  const rootId = randomUUID()
  const items: TemplateItemSeed[] = [{ id: rootId, parentId: null, level: 1, title: DEFAULT_CHECKLIST.title, startOffsetDays: start, dueOffsetDays: due, responsible: null, sortOrder: 1000 }]
  DEFAULT_CHECKLIST.rows.forEach(([title, responsible, children], i) => {
    const id = randomUUID()
    items.push({ id, parentId: rootId, level: 2, title, startOffsetDays: start, dueOffsetDays: due, responsible, sortOrder: (i + 1) * 1000 })
    children?.forEach(([childTitle, childResponsible], j) => {
      items.push({ id: randomUUID(), parentId: id, level: 3, title: childTitle, startOffsetDays: start, dueOffsetDays: due, responsible: childResponsible, sortOrder: (j + 1) * 1000 })
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
      ? await tx.taskTemplate.update({ where: { id: existing.id }, data: { channel: 'OFFLINE', shelfTypeId: null, storeId: null, isActive: true } })
      : await tx.taskTemplate.create({
          data: {
            name: DEFAULT_TEMPLATE_NAME,
            description: `ข้อมูลสินค้าที่ต้องเตรียมให้ครบภายใน ${PREP_DAYS} วันก่อนวันวางขาย (วันที่ 15) — ใช้กับการวางขายออฟไลน์ทุกประเภท Shelf`,
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
