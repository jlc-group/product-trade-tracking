// Row titles of the home agenda (also used by the header summary line).
import { storeWord } from '@flowtrade/shared'
import type { AgendaItem, BuyerAgendaItem, ProductionAgendaItem, ProposalAgendaItem, StoreStage } from '@/api'
import { storeNamesText } from '@/features/presentation/model'
import { formatDate } from '@/lib/format'

/** "Watsons" / "2 ห้าง: Makro, Lotus's". */
export function storesLabel(stores: { name: string }[], word: string) {
  const names = stores.map((s) => s.name)
  return names.length > 1 ? `${names.length} ${word}: ${storeNamesText(names, word)}` : (names[0] ?? '')
}

export function buyerTitle(item: Pick<BuyerAgendaItem, 'action' | 'tracks' | 'proposal'>) {
  const stores = storesLabel(
    item.tracks.map((t) => t.store),
    storeWord(item.proposal.channel),
  )
  switch (item.action) {
    case 'sendInfo':
      return `ส่งข้อมูลเพิ่มให้ ${stores}`
    case 'present':
      return `นำเสนอ ${stores}`
    case 'confirmPresented':
      return `นำเสนอ ${stores} แล้วหรือยัง?`
    case 'schedule':
      return `นัดวันนำเสนอ ${stores}`
    case 'followUp':
      return `ติดตามผลจาก ${stores}`
  }
}

/** Every store final: listed (≥ 1 passed), all rejected, or all withdrawn. */
export function closeOutResult(stores: Pick<StoreStage, 'stage'>[]): 'LISTED' | 'REJECTED' | 'WITHDRAWN' {
  if (stores.some((s) => s.stage === 'PASSED')) return 'LISTED'
  return stores.some((s) => s.stage === 'REJECTED') ? 'REJECTED' : 'WITHDRAWN'
}

export function proposalTitle(item: Pick<ProposalAgendaItem, 'action' | 'stores' | 'proposal'>) {
  const word = storeWord(item.proposal.channel)
  if (item.action === 'createPackage') {
    const untracked = item.stores.filter((s) => !s.stage).length
    return untracked < item.stores.length ? `ยังไม่ได้นำเสนอ ${untracked} ${word} — เพิ่มเข้าชุดนำเสนอ` : 'พร้อมนำเสนอ — สร้างชุดนำเสนอ'
  }
  switch (closeOutResult(item.stores)) {
    case 'LISTED':
      return `ได้ผลครบทุก${word}แล้ว — ปิดโปรเจกต์`
    case 'REJECTED':
      return `ไม่ผ่านทุก${word} — ปิดโปรเจกต์ หรือเสนอใหม่`
    case 'WITHDRAWN':
      return `ยุติการนำเสนอทุก${word} — ปิดโปรเจกต์ หรือเสนอใหม่`
  }
}

export function productionTitle(item: Pick<ProductionAgendaItem, 'action' | 'count' | 'deadline' | 'overdueDays' | 'proposal'>) {
  switch (item.action) {
    case 'confirmProduction':
      return `ยืนยันเริ่มผลิต ${item.count} SKU`
    case 'fillQuantity':
      return `กรอกจำนวนผลิต ${item.count} SKU`
    case 'deliverProduction':
      return item.overdueDays > 0
        ? `เลยกำหนดผลิต ${item.overdueDays} วัน — ยังไม่ส่ง ${item.count} SKU`
        : `ส่งสินค้าเข้าคลัง/${storeWord(item.proposal.channel)}ภายใน ${formatDate(item.deadline)} — เหลือ ${item.count} SKU`
    case 'reviewProduction':
      return `${item.count} SKU ที่ยืนยันผลิตแล้วต้องตรวจสอบ`
  }
}

export function agendaTitle(item: AgendaItem) {
  switch (item.kind) {
    case 'task':
      return item.task.title
    case 'buyer':
      return buyerTitle(item)
    case 'production':
      return productionTitle(item)
    default:
      return proposalTitle(item)
  }
}
