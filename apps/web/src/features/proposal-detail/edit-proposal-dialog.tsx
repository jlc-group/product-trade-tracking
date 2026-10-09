import { can, canEditProposalStores, CHANNEL_TERMS, PROPOSAL_TITLE_MAX, type User } from '@flowtrade/shared'
import { Loader2Icon, LockIcon, UserPlusIcon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import type { ProposalDetail, UpdateProposalInput } from '@/api'
import { useShelfTypes, useStores, useUpdateProposal, useUserLookup } from '@/api/hooks'
import { useCurrentUser } from '@/auth/auth'
import { StoreLogo } from '@/components/common/badges'
import { StoreChecklist } from '@/components/common/store-checklist'
import { AvatarStack, UserAvatar } from '@/components/common/user-avatar'
import { UserPicker } from '@/components/common/user-picker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { displayName } from '@/lib/format'
import { ProductMultiSelect } from './product-multi-select'
import { sameSet, storeWord } from './utils'

interface Props {
  proposal: ProposalDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditProposalDialog({ proposal, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <EditForm proposal={proposal} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function EditForm({ proposal, onDone }: { proposal: ProposalDetail; onDone: () => void }) {
  const me = useCurrentUser()
  const canChangeOwner = can(me, 'proposal.update.any')
  const canChangeStores = canEditProposalStores(me)
  const terms = CHANNEL_TERMS[proposal.channel]
  const place = storeWord(proposal.channel)
  const storesLabelId = useId()
  const update = useUpdateProposal()
  const { data: activeUsers = [] } = useUserLookup()
  const { data: shelfTypes = [] } = useShelfTypes()
  const { data: activeStores = [] } = useStores()

  const [title, setTitle] = useState(proposal.title)
  const [note, setNote] = useState(proposal.note ?? '')
  const [shelfTypeId, setShelfTypeId] = useState(proposal.shelfTypeId)
  const [storeIds, setStoreIds] = useState(proposal.storeIds)
  const [productIds, setProductIds] = useState(proposal.productIds)
  const [ownerId, setOwnerId] = useState(proposal.ownerId)
  const [memberIds, setMemberIds] = useState(proposal.memberIds)
  const [submitted, setSubmitted] = useState(false)

  const usersById = new Map<string, User>()
  for (const u of [proposal.owner, ...proposal.members, ...activeUsers]) usersById.set(u.id, u)
  const owner = usersById.get(ownerId)
  const visibleMemberIds = memberIds.filter((id) => id !== ownerId)
  const members = visibleMemberIds.map((id) => usersById.get(id)).filter((u): u is User => !!u)

  const channelShelves = shelfTypes.filter((s) => s.channel === proposal.channel)
  const shelfOptions = channelShelves.some((s) => s.id === proposal.shelfTypeId) ? channelShelves : [proposal.shelfType, ...channelShelves]
  // The proposal's own stores stay listed even if deactivated since.
  const storeOptions = [...proposal.stores.filter((s) => !s.isActive), ...activeStores.filter((s) => s.channel === proposal.channel)]

  const ownerChanged = ownerId !== proposal.ownerId
  const previousOwnerActive = activeUsers.some((u) => u.id === proposal.ownerId)
  const membersChanged = ownerChanged || !sameSet(visibleMemberIds, proposal.memberIds)
  const dirty =
    title.trim() !== proposal.title ||
    (note.trim() || null) !== proposal.note ||
    shelfTypeId !== proposal.shelfTypeId ||
    !sameSet(storeIds, proposal.storeIds) ||
    !sameSet(productIds, proposal.productIds) ||
    membersChanged

  const titleError = submitted && !title.trim() ? 'กรุณาตั้งชื่อการเสนอ เช่น “ชื่อสินค้า → ชื่อห้าง”' : null
  const productError = productIds.length === 0 ? 'ต้องมีสินค้าอย่างน้อย 1 รายการ — เลือกเพิ่มจากรายการด้านบน' : null
  const storeError = storeIds.length === 0 ? `ต้องมี${place}อย่างน้อย 1 แห่ง` : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!title.trim() || productIds.length === 0 || storeIds.length === 0) return
    const patch: UpdateProposalInput = {
      note: note.trim() || null,
      productIds,
    }
    // Only resend the title when it changed, so an over-long stored title never blocks other edits.
    if (title.trim() !== proposal.title) patch.title = title.trim()
    if (shelfTypeId !== proposal.shelfTypeId) patch.shelfTypeId = shelfTypeId
    if (canChangeStores && !sameSet(storeIds, proposal.storeIds)) patch.storeIds = storeIds
    if (membersChanged) {
      const active = new Set(activeUsers.map((u) => u.id))
      let next = visibleMemberIds
      // Keep the previous owner on the team so they don't lose access.
      if (ownerChanged && previousOwnerActive && !next.includes(proposal.ownerId)) next = [...next, proposal.ownerId]
      // Deactivated accounts can't be (re)saved as members.
      patch.memberIds = active.size ? next.filter((id) => active.has(id)) : next
    }
    if (canChangeOwner && ownerChanged) patch.ownerId = ownerId
    try {
      await update.mutateAsync({ id: proposal.id, patch })
      onDone()
    } catch {
      // error already toasted by the hook
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>แก้ไขข้อมูลการเสนอสินค้า</DialogTitle>
        <DialogDescription>
          {proposal.code} — ต้องการเปลี่ยนวันใช้ปุ่ม “เลื่อนวัน” แทน
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="edit-title">ชื่อการเสนอ</Label>
        <Input
          id="edit-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={!!titleError || undefined}
          aria-describedby={titleError ? 'edit-title-error' : undefined}
          maxLength={PROPOSAL_TITLE_MAX}
        />
        {titleError && (
          <p id="edit-title-error" className="text-xs text-danger">
            {titleError}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <p id={storesLabelId} className="text-sm leading-none font-medium">
          {terms.store}
        </p>
        {canChangeStores ? (
          <>
            <StoreChecklist stores={storeOptions} value={storeIds} onChange={setStoreIds} labelledBy={storesLabelId} invalid={!!storeError} />
            <p className={storeError ? 'text-xs text-danger' : 'text-xs text-muted-foreground'}>
              {storeError ?? `เฉพาะ Admin ที่เพิ่มหรือลด${place}ได้ — ทุก${place}ใช้รายการงานชุดเดียวกัน`}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-2.5 py-2 text-sm">
              <ul className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1.5">
                {proposal.stores.map((s) => (
                  <li key={s.id} className="flex min-w-0 items-center gap-1.5">
                    <StoreLogo store={s} size="sm" />
                    <span className="truncate">{s.name}</span>
                  </li>
                ))}
              </ul>
              <LockIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-xs text-muted-foreground">{place}ล็อกไว้หลังสร้างโปรเจกต์ — ติดต่อ Admin หากต้องการเพิ่มหรือลด{place}</p>
          </>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="edit-shelf">{terms.shelf}</Label>
        <Select value={shelfTypeId} onValueChange={setShelfTypeId}>
          <SelectTrigger id="edit-shelf" className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {shelfOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
                {s.name}
                {!s.isActive && <span className="text-xs text-muted-foreground">(ปิดใช้งานแล้ว)</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="edit-products">สินค้า</Label>
        <ProductMultiSelect
          id="edit-products"
          value={productIds}
          onChange={setProductIds}
          knownProducts={proposal.products}
          invalid={!!productError}
          describedBy={productError ? 'edit-products-error' : undefined}
        />
        {productError && (
          <p id="edit-products-error" className="text-xs text-danger">
            {productError}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={canChangeOwner ? 'edit-owner' : undefined}>เจ้าของ</Label>
          {canChangeOwner ? (
            <UserPicker
              single
              value={[ownerId]}
              onChange={(ids) => ids[0] && setOwnerId(ids[0])}
              trigger={
                <Button id="edit-owner" type="button" variant="outline" className="h-9 w-full justify-start gap-2 px-2.5 font-normal">
                  {owner ? <UserAvatar user={owner} size="xs" tooltip={false} /> : null}
                  <span className="truncate">{owner ? displayName(owner) : 'เลือกเจ้าของ'}</span>
                </Button>
              }
            />
          ) : (
            <div id="edit-owner" className="flex h-9 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-sm">
              {owner && <UserAvatar user={owner} size="xs" tooltip={false} />}
              <span className="min-w-0 flex-1 truncate">{owner ? displayName(owner) : '—'}</span>
              <LockIcon className="size-3.5 text-muted-foreground" aria-hidden />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {!canChangeOwner
              ? 'เฉพาะผู้จัดการหรือ Admin ที่เปลี่ยนเจ้าของได้'
              : ownerChanged && previousOwnerActive
                ? `${proposal.owner.name} จะยังอยู่ในทีมงาน`
                : 'เจ้าของดูแลภาพรวมและเปลี่ยนสถานะได้'}
          </p>
        </div>

        <div className="grid content-start gap-2">
          <Label htmlFor="edit-members">ทีมงาน</Label>
          <UserPicker
            value={visibleMemberIds}
            onChange={setMemberIds}
            excludeIds={[ownerId]}
            trigger={
              <Button id="edit-members" type="button" variant="outline" className="h-9 w-full justify-start gap-2 px-2.5 font-normal">
                {members.length ? (
                  <>
                    <AvatarStack users={members} max={4} size="xs" />
                    <span className="truncate">{members.length === 1 ? members[0].name : `${members.length} คน`}</span>
                  </>
                ) : (
                  <>
                    <UserPlusIcon className="text-muted-foreground" />
                    <span className="text-muted-foreground">เพิ่มทีมงาน</span>
                  </>
                )}
              </Button>
            }
          />
          <p className="text-xs text-muted-foreground">ทีมงานเพิ่ม แก้ไข และติ๊กงานได้ทุกงาน</p>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="edit-note">
          หมายเหตุ <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
        </Label>
        <Textarea
          id="edit-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น เงื่อนไขพิเศษจากห้าง ชื่อผู้ติดต่อฝั่งห้าง หรือสิ่งที่ทีมควรรู้"
          maxLength={1000}
        />
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            ยกเลิก
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!dirty || update.isPending}>
          {update.isPending && <Loader2Icon className="animate-spin" />}
          บันทึกการแก้ไข
        </Button>
      </DialogFooter>
    </form>
  )
}
