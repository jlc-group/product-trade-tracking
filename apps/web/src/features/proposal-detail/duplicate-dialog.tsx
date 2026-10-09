import { diffDays, earliestOnTimeLaunch, isLaunchDate, LAUNCH_DAY_OF_MONTH, storeNamesLabel, type ISODate } from '@flowtrade/shared'
import { Loader2Icon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import type { ProposalDetail } from '@/api'
import { useDuplicateProposal, useStores } from '@/api/hooks'
import { LaunchMonthPicker } from '@/components/common/launch-month-picker'
import { StoreChecklist } from '@/components/common/store-checklist'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { today } from '@/lib/format'
import { LaunchCompare } from './launch-summary'
import { launchWord, shiftLabel, storeWord } from './utils'

interface Props {
  proposal: ProposalDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DuplicateDialog({ proposal, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DuplicateForm proposal={proposal} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function DuplicateForm({ proposal, onDone }: { proposal: ProposalDetail; onDone: () => void }) {
  const navigate = useNavigate()
  const word = launchWord(proposal.channel)
  const place = storeWord(proposal.channel)
  const { data: stores = [], isPending: storesLoading } = useStores()
  const duplicate = useDuplicateProposal()
  const t = today()
  const monthLabelId = useId()
  const storesLabelId = useId()
  const [storeIds, setStoreIds] = useState<string[]>([])
  // Same launch as the original when it's still ahead (and on the 15th); otherwise the first month with a full preparation window.
  const [date, setDate] = useState<ISODate | null>(() =>
    isLaunchDate(proposal.targetDate) && proposal.targetDate >= t ? proposal.targetDate : earliestOnTimeLaunch(t),
  )

  const options = stores.filter((s) => s.channel === proposal.channel)
  const picked = options.filter((s) => storeIds.includes(s.id))
  const pickedLabel = storeNamesLabel(picked.map((s) => s.name))
  const delta = date ? diffDays(proposal.targetDate, date) : 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (picked.length === 0 || !date) return
    try {
      const copy = await duplicate.mutateAsync({ id: proposal.id, storeIds: picked.map((s) => s.id), targetDate: date })
      onDone()
      navigate(`/proposals/${copy.id}`)
    } catch {
      // error already toasted by the hook
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>คัดลอกเป็นโปรเจกต์ใหม่</DialogTitle>
        <DialogDescription>ใช้สินค้า ทีมงาน และรายการงานชุดเดียวกับ {proposal.code} เป็นโปรเจกต์ใหม่โดยไม่ต้องเริ่มจากศูนย์ — {place}ของ {proposal.code} ไม่เปลี่ยน</DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <p id={storesLabelId} className="text-sm leading-none font-medium">
          {place}ของโปรเจกต์ใหม่ <span className="font-normal text-muted-foreground">(เลือกได้หลาย{place})</span>
        </p>
        {storesLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : options.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">ยังไม่มี{place}ในช่องทางนี้ — ให้ Admin เพิ่มได้ที่เมนู “ห้าง / แพลตฟอร์ม”</p>
        ) : (
          <StoreChecklist stores={options} value={storeIds} onChange={setStoreIds} labelledBy={storesLabelId} className="max-h-60 overflow-y-auto" />
        )}
      </div>

      <div role="group" aria-labelledby={monthLabelId} className="grid gap-2">
        <div className="grid gap-0.5">
          <p id={monthLabelId} className="text-sm font-medium">
            เดือนที่{word}ของโปรเจกต์ใหม่
          </p>
          <p className="text-xs text-muted-foreground">
            {word}คือวันที่ {LAUNCH_DAY_OF_MONTH} ของเดือนเสมอ{picked.length > 0 ? ` — แสดงการเสนออื่นของ ${pickedLabel} ในแต่ละเดือนด้วย` : ''}
          </p>
        </div>
        <LaunchMonthPicker value={date} onChange={setDate} today={t} storeIds={picked.length > 0 ? picked.map((s) => s.id) : undefined} compact />
      </div>

      <div className="grid gap-1.5">
        <LaunchCompare word={word} from={proposal.targetDate} to={date} today={t} fromLabel="ต้นฉบับ" toLabel="โปรเจกต์ใหม่" />
        <p className="text-xs text-muted-foreground">
          {!date ? `เลือกเดือนก่อน แล้ววันของทุกงานจะเลื่อนตาม${word}ใหม่` : delta === 0 ? 'วันของงานจะเหมือนต้นฉบับ' : `วันของทุกงานจะ${shiftLabel(delta)}ตาม${word}ใหม่`}
        </p>
      </div>

      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        <p className="mb-1.5 font-medium text-foreground">สิ่งที่จะได้</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            สินค้า {proposal.products.length} รายการ · {proposal.shelfType.name}
          </li>
          <li>งานทั้งหมดเริ่มใหม่เป็น “ยังไม่เสร็จ” ผู้รับผิดชอบเดิมยังอยู่</li>
          <li>คุณเป็นเจ้าของ สถานะเริ่มต้นเป็น “ร่าง”</li>
        </ul>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            ยกเลิก
          </Button>
        </DialogClose>
        <Button type="submit" disabled={picked.length === 0 || !date || duplicate.isPending}>
          {duplicate.isPending && <Loader2Icon className="animate-spin" />}
          {picked.length > 0 ? `คัดลอก (${picked.length} ${place})` : `เลือก${place}ก่อน`}
        </Button>
      </DialogFooter>
    </form>
  )
}
