import type { Channel, ShelfType } from '@flowtrade/shared'
import { EyeIcon, GlobeIcon, GripVerticalIcon, InfoIcon, LayersIcon, PlusIcon, RotateCwIcon, StoreIcon, TriangleAlertIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { shelfTypeMutations, useReorderShelfTypes, useShelfTypes, useShelfTypeUsage, useTemplates } from '@/api/hooks'
import { useAuth } from '@/auth/auth'
import { EmptyState, PageHeader, useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { CHANNELS, ChannelTabsList, isChannel, useChannelParam } from '@/features/admin-master/channel-tabs'
import { ListSummary, MasterListSkeleton, MasterRow } from '@/features/admin-master/master-row'
import { ShelfTypeIcon, ShelfTypeOptionCard } from '@/features/admin-master/shelf-type-card'
import { SHELF_NOUN, ShelfTypeFormDialog } from '@/features/admin-master/shelf-type-form-dialog'
import { SortableList } from '@/features/admin-master/sortable-list'

const TAB_LABEL: Record<Channel, string> = { OFFLINE: 'Offline', ONLINE: 'Online' }

function Explainer() {
  return (
    <div className="flex gap-3 rounded-xl border border-info/20 bg-info-soft/60 p-3.5 text-sm sm:p-4">
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-info" />
      <div className="grid gap-2">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-6">
          <p className="flex items-start gap-1.5">
            <StoreIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span>
              <span className="font-medium">Offline</span> = ประเภท Shelf <span className="text-muted-foreground">(เช่น Exclusive, Normal)</span>
            </span>
          </p>
          <p className="flex items-start gap-1.5">
            <GlobeIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span>
              <span className="font-medium">Online</span> = ประเภทการลงขาย <span className="text-muted-foreground">(เช่น Official Store, Campaign)</span>
            </span>
          </p>
        </div>
        <p className="text-muted-foreground">ประเภทที่เพิ่มจะแสดงในขั้นตอนเสนอสินค้าทันที ตามลำดับในรายการนี้ — แม่แบบ Task เลือกผูกกับประเภทได้ที่หน้า “แม่แบบ Task”</p>
      </div>
    </div>
  )
}

/** What the wizard's shelf-type step will offer for this channel, in order. */
function WizardPreview({ channel, items }: { channel: Channel; items: ShelfType[] }) {
  const active = items.filter((s) => s.isActive)
  return (
    <aside className="hidden space-y-3 lg:block" aria-label="ตัวอย่างในขั้นตอนเสนอสินค้า">
      <div className="flex items-center gap-2 text-sm font-medium">
        <EyeIcon className="size-4 text-muted-foreground" /> ผู้ใช้จะเห็นแบบนี้
      </div>
      <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
        <div className="text-xs text-muted-foreground">ขั้นตอน “เลือก{SHELF_NOUN[channel]}”</div>
        {active.length === 0 ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-warning-soft p-2.5 text-xs text-warning-foreground">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0 text-warning" />
            ยังไม่มีประเภทที่เปิดใช้งาน — ผู้ใช้จะเสนอสินค้าช่องทาง {channel === 'OFFLINE' ? 'Offline' : 'Online'} ไม่ได้จนกว่าจะเปิดอย่างน้อย 1 ประเภท
          </p>
        ) : (
          active.map((s, i) => <ShelfTypeOptionCard key={s.id} shelfType={s} selected={i === 0} />)
        )}
      </div>
      {active.length < items.length && <p className="text-xs text-muted-foreground">ประเภทที่ปิดใช้งาน {items.length - active.length} รายการจะไม่แสดงให้เลือก</p>}
    </aside>
  )
}

export default function AdminShelfTypesPage() {
  const { can } = useAuth()
  const canManage = can('shelfType.manage')
  const [channel, setChannel] = useChannelParam()
  const { data: shelfTypes, isLoading, isError, refetch, isFetching } = useShelfTypes(true)
  const { data: usage } = useShelfTypeUsage()
  const { data: templates } = useTemplates(true)
  const reorder = useReorderShelfTypes()
  const update = shelfTypeMutations.useUpdate()
  const remove = shelfTypeMutations.useRemove()
  const [confirm, confirmDialog] = useConfirm()
  const [dialog, setDialog] = useState<{ open: boolean; shelfType: ShelfType | null; channel: Channel }>({ open: false, shelfType: null, channel: 'OFFLINE' })

  const byChannel = useMemo(
    () => ({
      OFFLINE: (shelfTypes ?? []).filter((s) => s.channel === 'OFFLINE'),
      ONLINE: (shelfTypes ?? []).filter((s) => s.channel === 'ONLINE'),
    }),
    [shelfTypes],
  )
  const templateCount = useMemo(() => {
    const out: Record<string, number> = {}
    for (const t of templates ?? []) if (t.shelfTypeId) out[t.shelfTypeId] = (out[t.shelfTypeId] ?? 0) + 1
    return out
  }, [templates])

  const usageOf = (id: string) => (usage ? (usage[id] ?? 0) : undefined)
  const openCreate = (c: Channel = channel) => setDialog({ open: true, shelfType: null, channel: c })
  const openEdit = (shelfType: ShelfType) => setDialog({ open: true, shelfType, channel: shelfType.channel })

  const setActive = async (id: string, isActive: boolean) => {
    // Resolves after the list has refetched, so the switch doesn't flick back.
    await update.mutateAsync({ id, patch: { isActive } })
  }

  const renderChannel = (c: Channel) => {
    const noun = SHELF_NOUN[c]
    if (isLoading) return <MasterListSkeleton rows={3} />
    if (isError)
      return (
        <EmptyState
          title={`โหลด${noun}ไม่สำเร็จ`}
          description="ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง"
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RotateCwIcon className={isFetching ? 'animate-spin' : undefined} /> ลองใหม่
            </Button>
          }
        />
      )
    const list = byChannel[c]
    return (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        {list.length === 0 ? (
          <EmptyState
            icon={<LayersIcon className="size-5" />}
            title={`ยังไม่มี${noun}`}
            description={`เพิ่ม${noun}อย่างน้อย 1 รายการ เพื่อให้ทีมเสนอสินค้าช่องทาง ${c === 'OFFLINE' ? 'Offline' : 'Online'} ได้`}
            action={
              canManage && (
                <Button size="sm" onClick={() => openCreate(c)}>
                  <PlusIcon /> เพิ่ม{noun}
                </Button>
              )
            }
          />
        ) : (
          <div className="min-w-0 space-y-2.5">
            <ListSummary total={list.length} active={list.filter((s) => s.isActive).length} unit="ประเภท">
              <span className="hidden items-center gap-1 sm:inline-flex">
                <GripVerticalIcon className="size-3.5" /> ลากเพื่อจัดลำดับการแสดงผล
              </span>
            </ListSummary>
            <section className="rounded-xl border bg-card" aria-label={`รายการ${noun}`}>
              <SortableList
                items={list}
                getLabel={(s) => s.name}
                onReorder={(ids) => reorder.mutateAsync(ids)}
                disabled={!canManage}
                renderItem={(s, handle) => {
                  const linked = templateCount[s.id] ?? 0
                  return (
                    <MasterRow
                      name={s.name}
                      noun={noun}
                      description={s.description}
                      isActive={s.isActive}
                      usage={usageOf(s.id)}
                      handle={handle}
                      leading={<ShelfTypeIcon color={s.color} channel={s.channel} size="lg" />}
                      meta={
                        linked > 0 ? (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground" title="จำนวนแม่แบบ Task ที่ผูกกับประเภทนี้">
                            แม่แบบ <span className="tabular">{linked}</span>
                          </span>
                        ) : undefined
                      }
                      confirm={confirm}
                      onEdit={() => openEdit(s)}
                      onSetActive={(v) => setActive(s.id, v)}
                      onDelete={() => remove.mutateAsync(s.id)}
                      deleteNote={linked > 0 ? `แม่แบบ Task ${linked} รายการที่ผูกกับประเภทนี้จะเปลี่ยนเป็นใช้ได้กับทุกประเภท` : undefined}
                    />
                  )
                }}
              />
            </section>
          </div>
        )}
        <WizardPreview channel={c} items={list} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ข้อมูลหลัก"
        title="ประเภท Shelf / การลงขาย"
        description="กำหนดตัวเลือกที่ทีมใช้ตอนเสนอสินค้า นอกจาก Exclusive และ Normal แล้ว เพิ่มประเภทใหม่ได้ตามที่ห้างหรือแพลตฟอร์มมี"
        actions={
          canManage && (
            <Button onClick={() => openCreate()}>
              <PlusIcon /> เพิ่ม{SHELF_NOUN[channel]}
            </Button>
          )
        }
      />

      <Explainer />

      <Tabs value={channel} onValueChange={(v) => isChannel(v) && setChannel(v)} className="gap-4">
        <ChannelTabsList
          labels={{ OFFLINE: `${TAB_LABEL.OFFLINE} · ${SHELF_NOUN.OFFLINE}`, ONLINE: `${TAB_LABEL.ONLINE} · ${SHELF_NOUN.ONLINE}` }}
          shortLabels={TAB_LABEL}
          counts={shelfTypes ? { OFFLINE: byChannel.OFFLINE.length, ONLINE: byChannel.ONLINE.length } : {}}
        />
        {CHANNELS.map((c) => (
          <TabsContent key={c} value={c}>
            {renderChannel(c)}
          </TabsContent>
        ))}
      </Tabs>

      <ShelfTypeFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        shelfType={dialog.shelfType}
        defaultChannel={dialog.channel}
        shelfTypes={shelfTypes ?? []}
        usage={dialog.shelfType ? (usageOf(dialog.shelfType.id) ?? 0) : 0}
        onSaved={({ channel: saved }) => saved !== channel && setChannel(saved)}
      />
      {confirmDialog}
    </div>
  )
}
