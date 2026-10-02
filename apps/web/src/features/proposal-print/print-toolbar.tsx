import { ArrowLeftIcon, FileDownIcon, Loader2Icon } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { ReportOptions } from './report-model'

function Toggle({ label, checked, disabled, hint, onChange }: { label: string; checked: boolean; disabled?: boolean; hint?: string; onChange: (checked: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex items-center gap-2" title={hint}>
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id} className="font-normal whitespace-nowrap">
        {label}
      </Label>
    </div>
  )
}

/** Screen-only bar above the A4 preview: options and the "Save as PDF" button. Never printed. */
export function PrintToolbar({
  backTo,
  title,
  options,
  storeLabel,
  printing,
  onChange,
  onPrint,
}: {
  backTo: string
  title: string
  options: ReportOptions
  /** "ฉบับส่งห้าง" / "ฉบับส่งแพลตฟอร์ม" */
  storeLabel: string
  printing: boolean
  onChange: (patch: Partial<ReportOptions>) => void
  onPrint: () => void
}) {
  return (
    <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปหน้าการเสนอสินค้า" title="กลับไปหน้าการเสนอสินค้า">
            <Link to={backTo}>
              <ArrowLeftIcon />
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">ส่งออก PDF · {title}</p>
            <p className="text-xs text-muted-foreground">กดบันทึก แล้วเลือกปลายทาง “บันทึกเป็น PDF” (Save as PDF) ในหน้าต่างที่เปิดขึ้น</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Toggle label="แสดงหัวข้อที่ยังไม่กรอก" checked={options.showEmpty} onChange={(showEmpty) => onChange({ showEmpty })} />
          <Toggle
            label="ความคิดเห็น"
            checked={options.showComments && !options.storeVersion}
            disabled={options.storeVersion}
            hint={options.storeVersion ? `${storeLabel}ไม่แสดงความคิดเห็น` : undefined}
            onChange={(showComments) => onChange({ showComments })}
          />
          <Toggle label={storeLabel} hint="ซ่อนข้อมูลภายใน: สถานะ ผู้รับผิดชอบ ความคืบหน้า ความคิดเห็น และประวัติ" checked={options.storeVersion} onChange={(storeVersion) => onChange({ storeVersion })} />
        </div>
        <Button onClick={onPrint} disabled={printing}>
          {printing ? <Loader2Icon className="animate-spin" /> : <FileDownIcon />}
          บันทึกเป็น PDF
        </Button>
      </div>
    </div>
  )
}
