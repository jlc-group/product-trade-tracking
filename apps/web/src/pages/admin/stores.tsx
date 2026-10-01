import type { Channel, Store } from '@flowtrade/shared'
import { GlobeIcon, GripVerticalIcon, PlusIcon, RotateCwIcon, StoreIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { storeMutations, useReorderStores, useStores, useStoreUsage } from '@/api/hooks'
import { useAuth } from '@/auth/auth'
import { StoreLogo } from '@/components/common/badges'
import { EmptyState, PageHeader, useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { CHANNELS, ChannelTabsList, isChannel, useChannelParam } from '@/features/admin-master/channel-tabs'
import { ListSummary, MasterListSkeleton, MasterRow } from '@/features/admin-master/master-row'
import { SortableList } from '@/features/admin-master/sortable-list'
import { STORE_NOUN, StoreFormDialog } from '@/features/admin-master/store-form-dialog'

const TAB_LABEL: Record<Channel, string> = { OFFLINE: 'ห้าง (Offline)', ONLINE: 'แพลตฟอร์ม (Online)' }

export default function AdminStoresPage() {
  const { can } = useAuth()
  const canManage = can('store.manage')
  const [channel, setChannel] = useChannelParam()
  const { data: stores, isLoading, isError, refetch, isFetching } = useStores(true)
  const { data: usage } = useStoreUsage()
  const reorder = useReorderStores()
  const update = storeMutations.useUpdate()
  const remove = storeMutations.useRemove()
  const [confirm, confirmDialog] = useConfirm()
  const [dialog, setDialog] = useState<{ open: boolean; store: Store | null; channel: Channel }>({ open: false, store: null, channel: 'OFFLINE' })

  const byChannel = useMemo(
    () => ({
      OFFLINE: (stores ?? []).filter((s) => s.channel === 'OFFLINE'),
      ONLINE: (stores ?? []).filter((s) => s.channel === 'ONLINE'),
    }),
    [stores],
  )

  const usageOf = (id: string) => (usage ? (usage[id] ?? 0) : undefined)
  const openCreate = (c: Channel = channel) => setDialog({ open: true, store: null, channel: c })
  const openEdit = (store: Store) => setDialog({ open: true, store, channel: store.channel })

  const setActive = async (id: string, isActive: boolean) => {
    // Resolves after the list has refetched, so the switch doesn't flick back.
    await update.mutateAsync({ id, patch: { isActive } })
  }

  const renderChannel = (c: Channel) => {
    const noun = STORE_NOUN[c]
    if (isLoading) return <MasterListSkeleton rows={c === 'OFFLINE' ? 6 : 4} />
    if (isError)
      return (
        <EmptyState
          title={`โหลดรายชื่อ${noun}ไม่สำเร็จ`}
          description="ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง"
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RotateCwIcon className={isFetching ? 'animate-spin' : undefined} /> ลองใหม่
            </Button>
          }
        />
      )
    const list = byChannel[c]
    if (list.length === 0)
      return (
        <EmptyState
          icon={c === 'OFFLINE' ? <StoreIcon className="size-5" /> : <GlobeIcon className="size-5" />}
          title={`ยังไม่มี${noun}`}
          description={`เพิ่ม${noun}แรกเพื่อให้ทีมเลือกได้ในขั้นตอนเสนอสินค้า`}
          action={
            canManage && (
              <Button size="sm" onClick={() => openCreate(c)}>
                <PlusIcon /> เพิ่ม{noun}
              </Button>
            )
          }
        />
      )
    return (
      <div className="space-y-2.5">
        <ListSummary total={list.length} active={list.filter((s) => s.isActive).length} unit={noun}>
          <span className="hidden items-center gap-1 sm:inline-flex">
            <GripVerticalIcon className="size-3.5" /> ลากเพื่อจัดลำดับ — ใช้เป็นลำดับในขั้นตอนเสนอสินค้า
          </span>
        </ListSummary>
        <section className="rounded-xl border bg-card" aria-label={`รายชื่อ${noun}`}>
          <SortableList
            items={list}
            getLabel={(s) => s.name}
            onReorder={(ids) => reorder.mutateAsync(ids)}
            disabled={!canManage}
            renderItem={(s, handle) => (
              <MasterRow
                name={s.name}
                noun={noun}
                description={s.description}
                isActive={s.isActive}
                usage={usageOf(s.id)}
                handle={handle}
                leading={<StoreLogo store={s} size="lg" />}
                meta={
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground" title="ชื่อย่อบนโลโก้">
                    {s.shortName}
                  </span>
                }
                confirm={confirm}
                onEdit={() => openEdit(s)}
                onSetActive={(v) => setActive(s.id, v)}
                onDelete={() => remove.mutateAsync(s.id)}
              />
            )}
          />
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ข้อมูลหลัก"
        title="ห้าง / แพลตฟอร์ม"
        description="รายชื่อห้าง (Offline) และแพลตฟอร์ม (Online) ที่ทีมเลือกได้ตอนเสนอสินค้า — ที่ใช้งานแล้วลบไม่ได้ แต่ปิดการใช้งานเพื่อซ่อนจากการเสนอใหม่ได้"
        actions={
          canManage && (
            <Button onClick={() => openCreate()}>
              <PlusIcon /> {channel === 'OFFLINE' ? 'เพิ่มห้าง' : 'เพิ่มแพลตฟอร์ม'}
            </Button>
          )
        }
      />

      <Tabs value={channel} onValueChange={(v) => isChannel(v) && setChannel(v)} className="gap-4">
        <ChannelTabsList labels={TAB_LABEL} shortLabels={STORE_NOUN} counts={stores ? { OFFLINE: byChannel.OFFLINE.length, ONLINE: byChannel.ONLINE.length } : {}} />
        {CHANNELS.map((c) => (
          <TabsContent key={c} value={c}>
            {renderChannel(c)}
          </TabsContent>
        ))}
      </Tabs>

      <StoreFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        store={dialog.store}
        defaultChannel={dialog.channel}
        stores={stores ?? []}
        usage={dialog.store ? (usageOf(dialog.store.id) ?? 0) : 0}
        onSaved={({ channel: saved }) => saved !== channel && setChannel(saved)}
      />
      {confirmDialog}
    </div>
  )
}
