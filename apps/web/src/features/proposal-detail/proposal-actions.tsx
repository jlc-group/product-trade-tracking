import { can, canDeleteProposal, canEditProposal, isProposalOwner, STATUS_LABEL, STATUS_ORDER, type ProposalStatus } from '@flowtrade/shared'
import { CalendarClockIcon, ChevronDownIcon, CopyIcon, FileDownIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { ProposalDetail } from '@/api'
import { useChangeProposalStatus, useDeleteProposal } from '@/api/hooks'
import { useCurrentUser } from '@/auth/auth'
import { statusDotClass } from '@/components/common/badges'
import { useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePresentationSummary } from '@/features/presentation/hooks'
import { useProductionSummary } from '@/features/production/hooks'
import { cn } from '@/lib/utils'
import { DuplicateDialog } from './duplicate-dialog'
import { EditProposalDialog } from './edit-proposal-dialog'
import { RescheduleDialog } from './reschedule-dialog'
import { launchWord } from './utils'

const STATUS_HINT: Record<Exclude<ProposalStatus, 'COMPLETED'>, string> = {
  DRAFT: 'ยังวางแผนอยู่ ยังไม่เริ่มงาน',
  IN_PROGRESS: 'ทีมกำลังทำงานตามรายการ',
  ON_HOLD: 'หยุดไว้ชั่วคราว งานยังอยู่ครบ',
  CANCELLED: 'ไม่ไปต่อ เก็บไว้เป็นประวัติ',
}

/** word = storeWord(channel): "ห้าง" / "แพลตฟอร์ม". */
const statusHint = (status: ProposalStatus, word: string) => (status === 'COMPLETED' ? `ได้ผลพิจารณาจาก Buyer ครบทุก${word}แล้ว` : STATUS_HINT[status])

type DialogKind = 'reschedule' | 'edit' | 'duplicate'

function StatusRadioItems({ current, openLeft, word, onPick }: { current: ProposalStatus; openLeft: number; word: string; onPick: (status: ProposalStatus) => void }) {
  return (
    <DropdownMenuRadioGroup
      value={current}
      onValueChange={(v) => {
        const next = STATUS_ORDER.find((s) => s === v)
        if (next) onPick(next)
      }}
    >
      {STATUS_ORDER.map((s) => (
        <DropdownMenuRadioItem key={s} value={s} className="items-start py-1.5">
          <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', statusDotClass(s))} aria-hidden />
          <span className="grid gap-0.5">
            <span>{STATUS_LABEL[s]}</span>
            <span className={cn('text-xs', s === 'COMPLETED' && openLeft > 0 ? 'text-warning-foreground' : 'text-muted-foreground')}>
              {s === 'COMPLETED' && openLeft > 0 ? `ยังเหลืออีก ${openLeft} งานที่ยังไม่เสร็จ` : statusHint(s, word)}
            </span>
          </span>
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}

/** Header actions. Wide screens get separate buttons; < md collapses everything into one menu. Everyone who can view gets the PDF export. */
export function ProposalActions({ proposal }: { proposal: ProposalDetail }) {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [confirm, confirmDialog] = useConfirm()
  const changeStatus = useChangeProposalStatus()
  const remove = useDeleteProposal()
  const pres = usePresentationSummary(proposal)
  const prod = useProductionSummary(proposal.id).summary

  const canEdit = canEditProposal(user, proposal)
  const canDelete = canDeleteProposal(user, proposal)
  const canDuplicate = can(user, 'proposal.create')
  const word = launchWord(proposal.channel)
  const openLeft = proposal.progress.total - proposal.progress.done
  const deleteBlockedReason = !canDelete
    ? proposal.status !== 'DRAFT' && isProposalOwner(user, proposal)
      ? 'ลบได้เฉพาะงานร่าง — ใช้สถานะ "ยกเลิก" แทน'
      : 'เฉพาะเจ้าของงานร่างหรือ Admin ที่ลบได้'
    : null
  // Opens the printable report in a new tab, so the detail page stays as it was.
  const printHref = `/proposals/${proposal.id}/print`

  async function onStatus(next: ProposalStatus) {
    if (next === proposal.status || changeStatus.isPending) return
    if (next === 'COMPLETED' && (openLeft > 0 || proposal.openTaskCount > 0)) {
      const left = Math.max(openLeft, 1)
      toast.warning('ยังปิดงานไม่ได้', {
        description: `เหลืออีก ${left} งานที่ยังไม่เสร็จ — ทำเครื่องหมายให้ครบในแท็บ "รายการงาน" ก่อน แล้วค่อยเปลี่ยนเป็น "เสร็จสิ้น"`,
      })
      return
    }
    // Soft check only (skipped until the buyer results have loaded).
    if (next === 'COMPLETED' && !pres.isLoading && !pres.allFinal) {
      const sw = pres.storeWord
      const ok = await confirm({
        title: `ยังได้ผลพิจารณาไม่ครบทุก${sw}`,
        description:
          pres.tracked === 0
            ? 'ยังไม่ได้นำเสนอ Buyer เลย — ตั้งเป็น “เสร็จสิ้น” เลยไหม?'
            : `ยังมี ${pres.storesTotal - pres.finalCount} ${sw}ที่ยังไม่ได้ผลจาก Buyer — ตั้งโปรเจกต์เป็น “เสร็จสิ้น” เลยไหม?`,
        confirmLabel: 'ตั้งเป็นเสร็จสิ้น',
      })
      if (!ok) return
    }
    if (next === 'ON_HOLD') {
      const ok = await confirm({
        title: `พัก ${proposal.code} ไว้ก่อน?`,
        description: 'งานทั้งหมดยังอยู่ครบ ทีมงานจะได้รับแจ้งว่าโปรเจกต์นี้ถูกพักไว้ เปลี่ยนกลับเป็น "กำลังดำเนินการ" ได้ทุกเมื่อ',
        confirmLabel: 'พักโปรเจกต์ไว้',
      })
      if (!ok) return
    }
    if (next === 'CANCELLED') {
      const making = prod ? prod.inProduction + prod.produced : 0
      const ok = await confirm({
        title: `ยกเลิกการเสนอ ${proposal.code}?`,
        description: `โปรเจกต์นี้จะไม่ถูกนับเป็นงานที่กำลังดำเนินการ และงานที่ค้างอยู่จะหายไปจาก "งานของฉัน" ของทุกคน ข้อมูลยังเก็บไว้ครบ และเปลี่ยนสถานะกลับได้ภายหลัง${
          making > 0 ? ` · มี ${making} SKU ที่ยืนยันผลิตแล้วและยังไม่ส่ง — หลังยกเลิกจะบันทึกการผลิตต่อไม่ได้จนกว่าจะเปลี่ยนสถานะกลับ` : ''
        }`,
        confirmLabel: 'ยกเลิกการเสนอนี้',
        destructive: true,
      })
      if (!ok) return
    }
    try {
      await changeStatus.mutateAsync({ id: proposal.id, status: next })
      toast.success(`เปลี่ยนสถานะเป็น "${STATUS_LABEL[next]}" แล้ว`)
    } catch {
      // error already toasted by the hook
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: `ลบ ${proposal.code} ถาวร?`,
      description: 'งานทุกระดับ ความคิดเห็น ข้อมูลการนำเสนอ ข้อมูลการผลิต และการแจ้งเตือนของโปรเจกต์นี้จะถูกลบไปด้วย และกู้คืนไม่ได้',
      confirmLabel: 'ลบถาวร',
      destructive: true,
    })
    if (!ok) return
    try {
      await remove.mutateAsync(proposal.id)
      toast.success(`ลบ ${proposal.code} แล้ว`)
      navigate('/proposals', { replace: true })
    } catch {
      // error already toasted by the hook
    }
  }

  const deleteItem = canDelete ? (
    <DropdownMenuItem variant="destructive" onSelect={onDelete}>
      <Trash2Icon /> ลบการเสนอนี้
    </DropdownMenuItem>
  ) : canEdit && deleteBlockedReason ? (
    <DropdownMenuItem disabled className="items-start">
      <Trash2Icon className="mt-0.5" />
      <span className="grid gap-0.5">
        <span>ลบการเสนอนี้</span>
        <span className="text-xs text-muted-foreground">{deleteBlockedReason}</span>
      </span>
    </DropdownMenuItem>
  ) : null

  const duplicateItem = canDuplicate ? (
    <DropdownMenuItem onSelect={() => setDialog('duplicate')}>
      <CopyIcon /> คัดลอกเป็นโปรเจกต์ใหม่
    </DropdownMenuItem>
  ) : null

  return (
    <>
      {/* ≥ md: separate buttons */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        {canEdit && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={changeStatus.isPending}>
                {changeStatus.isPending ? <Loader2Icon className="animate-spin" /> : <span className={cn('size-2 rounded-full', statusDotClass(proposal.status))} aria-hidden />}
                เปลี่ยนสถานะ
                <ChevronDownIcon className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>สถานะของการเสนอ</DropdownMenuLabel>
              <StatusRadioItems current={proposal.status} openLeft={openLeft} word={pres.storeWord} onPick={onStatus} />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {canEdit && (
          <Button variant="outline" onClick={() => setDialog('reschedule')}>
            <CalendarClockIcon /> เลื่อน{word}
          </Button>
        )}
        {canEdit && (
          <Button variant="outline" onClick={() => setDialog('edit')}>
            <PencilIcon /> แก้ไขข้อมูล
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to={printHref} target="_blank" rel="noopener">
            <FileDownIcon /> ส่งออก PDF
          </Link>
        </Button>
        {(duplicateItem || deleteItem) && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="ตัวเลือกเพิ่มเติม">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {duplicateItem}
              {duplicateItem && deleteItem && <DropdownMenuSeparator />}
              {deleteItem}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* < md: one menu */}
      <div className="md:hidden">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={changeStatus.isPending}>
              {changeStatus.isPending ? <Loader2Icon className="animate-spin" /> : <MoreHorizontalIcon />}
              จัดการ
              <ChevronDownIcon className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[min(18rem,calc(100vw-2rem))]">
            {canEdit && (
              <>
                <DropdownMenuLabel>เปลี่ยนสถานะ</DropdownMenuLabel>
                <StatusRadioItems current={proposal.status} openLeft={openLeft} word={pres.storeWord} onPick={onStatus} />
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDialog('reschedule')}>
                  <CalendarClockIcon /> เลื่อน{word}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog('edit')}>
                  <PencilIcon /> แก้ไขข้อมูล
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem asChild>
              <Link to={printHref} target="_blank" rel="noopener">
                <FileDownIcon /> ส่งออก PDF
              </Link>
            </DropdownMenuItem>
            {duplicateItem}
            {deleteItem && (
              <>
                <DropdownMenuSeparator />
                {deleteItem}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {canEdit && <RescheduleDialog proposal={proposal} open={dialog === 'reschedule'} onOpenChange={(open) => !open && setDialog(null)} />}
      {canEdit && <EditProposalDialog proposal={proposal} open={dialog === 'edit'} onOpenChange={(open) => !open && setDialog(null)} />}
      {canDuplicate && <DuplicateDialog proposal={proposal} open={dialog === 'duplicate'} onOpenChange={(open) => !open && setDialog(null)} />}
      {confirmDialog}
    </>
  )
}
