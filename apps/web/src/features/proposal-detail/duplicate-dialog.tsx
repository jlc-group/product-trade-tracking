import { diffDays, earliestOnTimeLaunch, isLaunchDate, LAUNCH_DAY_OF_MONTH, prepStartOf, type ISODate } from '@flowtrade/shared'
import { Loader2Icon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { ProposalDetail } from '@/api'
import { useDuplicateProposal, useStores } from '@/api/hooks'
import { StoreLogo } from '@/components/common/badges'
import { LaunchMonthPicker } from '@/components/common/launch-month-picker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, today } from '@/lib/format'
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
  const [storeId, setStoreId] = useState('')
  // Same launch as the original when it's still ahead (and on the 15th); otherwise the first month with a full preparation window.
  const [date, setDate] = useState<ISODate | null>(() =>
    isLaunchDate(proposal.targetDate) && proposal.targetDate >= t ? proposal.targetDate : earliestOnTimeLaunch(t),
  )

  const options = stores.filter((s) => s.channel === proposal.channel && s.id !== proposal.storeId)
  const store = options.find((s) => s.id === storeId)
  const delta = date ? diffDays(proposal.targetDate, date) : 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!store || !date) return
    try {
      const copy = await duplicate.mutateAsync({ id: proposal.id, storeId: store.id, targetDate: date })
      toast.success(`สร้าง ${copy.code} สำหรับ ${store.name} แล้ว`, {
        description: `${word} ${formatDate(date, { long: true })} · เริ่มเตรียม ${formatDate(prepStartOf(date), { long: true })} — สถานะเริ่มต้นเป็น "ร่าง" ตรวจวันที่ของงาน แล้วเปลี่ยนเป็น "กำลังดำเนินการ" เมื่อพร้อม`,
      })
      onDone()
      navigate(`/proposals/${copy.id}`)
    } catch {
      // error already toasted by the hook
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>คัดลอกไป{place}อื่น</DialogTitle>
        <DialogDescription>ใช้สินค้า ทีมงาน และรายการงานชุดเดียวกับ {proposal.code} เพื่อเสนอเข้า{place}ใหม่โดยไม่ต้องเริ่มจากศูนย์</DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="duplicate-store">{place}ปลายทาง</Label>
        {storesLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : options.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">ยังไม่มี{place}อื่นในช่องทางนี้ — ให้ Admin เพิ่มได้ที่เมนู “ห้าง / แพลตฟอร์ม”</p>
        ) : (
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger id="duplicate-store" className="h-9 w-full">
              <SelectValue placeholder={`เลือก${place}`} />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-72">
              {options.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <StoreLogo store={s} size="sm" />
                  <span className="truncate">{s.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div role="group" aria-labelledby={monthLabelId} className="grid gap-2">
        <div className="grid gap-0.5">
          <p id={monthLabelId} className="text-sm font-medium">
            เดือนที่{word}ที่{place}ใหม่
          </p>
          <p className="text-xs text-muted-foreground">
            {word}คือวันที่ {LAUNCH_DAY_OF_MONTH} ของเดือนเสมอ{store ? ` — แสดงการเสนออื่นของ ${store.name} ในแต่ละเดือนด้วย` : ''}
          </p>
        </div>
        <LaunchMonthPicker value={date} onChange={setDate} today={t} storeIds={store ? [store.id] : undefined} compact />
      </div>

      <div className="grid gap-1.5">
        <LaunchCompare word={word} from={proposal.targetDate} to={date} today={t} fromLabel="ต้นฉบับ" toLabel={`${place}ใหม่`} />
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
        <Button type="submit" disabled={!store || !date || duplicate.isPending}>
          {duplicate.isPending && <Loader2Icon className="animate-spin" />}
          {store ? `คัดลอกไป ${store.name}` : `เลือก${place}ก่อน`}
        </Button>
      </DialogFooter>
    </form>
  )
}
