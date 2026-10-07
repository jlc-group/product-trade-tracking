import { compareAgenda, countByBucket, storeWord } from '@flowtrade/shared'
import type { AgendaBucket, HomeDashboard } from '@/api'
import { agendaTitle, storesLabel } from './agenda-copy'

/** One sentence under the greeting: the first rule that matches (§3.1). */
export function summaryLine(agenda: HomeDashboard['agenda']): string {
  const items = [...agenda.items].sort(compareAgenda)
  const { overdue, today, week, next, waiting } = countByBucket(items)
  const inBucket = (bucket: AgendaBucket) => items.filter((i) => i.bucket === bucket)
  if (overdue > 0) return `มี ${overdue} เรื่องเลยกำหนด — เริ่มที่ "${agendaTitle(inBucket('overdue')[0])}" ก่อน`
  if (today > 0) {
    const pitch = inBucket('today').find((i) => i.kind === 'buyer' && i.action === 'present')
    const stores = pitch?.kind === 'buyer' ? ` รวมนัดนำเสนอ ${storesLabel(pitch.tracks.map((t) => t.store), storeWord(pitch.proposal.channel))}` : ''
    return `วันนี้มี ${today} เรื่องต้องทำ${stores}`
  }
  if (week > 0) return `วันนี้ว่าง — 7 วันข้างหน้ามี ${week} เรื่องรออยู่`
  if (next > 0) return `วันนี้ว่าง — มี ${next} ขั้นต่อไปที่รอคุณ`
  if (waiting > 0) {
    const inReview = inBucket('waiting').filter((i) => i.kind === 'buyer' && i.action === 'followUp').length
    return inReview > 0 ? `ไม่มีเรื่องค้าง — กำลังรอผลจาก Buyer ${inReview} รายการ` : `ไม่มีเรื่องค้าง — มีนัดนำเสนอรออยู่ ${waiting} นัด`
  }
  if (agenda.laterTasks > 0) return 'วันนี้ไม่มีงานครบกำหนด ลองหยิบงานถัดไปมาทำล่วงหน้า'
  return 'ไม่มีงานค้างเลย ใช้เวลาวางแผนโปรเจกต์ถัดไปได้เต็มที่'
}
