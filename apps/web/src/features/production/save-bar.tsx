import { Loader2Icon, PencilIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DraftsModel } from './types'

/** Sticky bar at the bottom of the table while quantities are unsaved (§5.9.2). */
export function SaveBar({ drafts, saving, onSave }: { drafts: DraftsModel; saving: boolean; onSave: () => void }) {
  const n = drafts.dirtyRows.length
  if (n === 0) return null
  const invalid = drafts.invalidCount > 0
  return (
    <div role="region" aria-label="จำนวนผลิตที่ยังไม่บันทึก" className="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-card/95 px-4 py-2 backdrop-blur">
      <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
        <PencilIcon className="size-4 shrink-0 text-warning-foreground" aria-hidden />
        <span>
          แก้ไขจำนวนผลิต <span className="tabular">{n}</span> SKU ยังไม่บันทึก
        </span>
      </p>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {invalid && <span className="text-xs text-danger">แก้ช่องที่ไม่ถูกต้องก่อน</span>}
        <Button type="button" variant="ghost" size="sm" onClick={() => drafts.clear()} disabled={saving}>
          ล้างที่แก้
        </Button>
        <Button type="button" size="sm" onClick={onSave} disabled={saving || invalid}>
          {saving && <Loader2Icon className="animate-spin" />}
          {saving ? 'กำลังบันทึก…' : 'บันทึกจำนวน'}
        </Button>
      </div>
    </div>
  )
}
