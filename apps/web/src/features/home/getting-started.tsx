import { ArrowRightIcon } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { APP_NAME } from '@/lib/brand'

const STEPS = [
  { title: 'เสนอสินค้าใหม่', text: 'เลือกสินค้า ห้าง และรอบวางขาย (วันที่ 15)' },
  { title: 'ทำงานเตรียมข้อมูลให้ครบ', text: 'ระบบสร้างงานจาก template นับถอยหลัง 90 วัน' },
  { title: 'นำเสนอ Buyer และบันทึกผลรายห้าง/แพลตฟอร์ม', text: 'ผ่าน / ไม่ผ่าน / ขอข้อมูลเพิ่ม' },
]

/** Replaces the agenda, projects and results while the user is involved in nothing yet. */
export function GettingStarted({ canCreate, canMonitor }: { canCreate: boolean; canMonitor: boolean }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 id={headingId} className="text-base font-semibold">
        เริ่มต้นใช้งาน {APP_NAME}
      </h2>
      <ol className="mt-4 space-y-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{i + 1}</span>
            <div className="min-w-0 space-y-2 pt-0.5">
              <p className="text-sm">
                <span className="font-medium">{step.title}</span> <span className="text-muted-foreground">— {step.text}</span>
              </p>
              {i === 0 && canCreate && (
                <Button asChild size="sm">
                  <Link to="/proposals/new">เสนอสินค้าใหม่</Link>
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {canMonitor && (
        <Link to="/admin" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">
          ดูภาพรวมฝ่าย
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      )}
    </section>
  )
}
