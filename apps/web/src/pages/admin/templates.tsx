import { LAUNCH_DAY_OF_MONTH, PREP_DAYS, type Channel, type TaskTemplate } from '@flowtrade/shared'
import { ListTreeIcon, Loader2Icon, MousePointerClickIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { templateMutations, useShelfTypes, useStores, useTemplates } from '@/api/hooks'
import { EmptyState, PageHeader, useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TemplateEditor } from '@/features/admin-templates/template-editor'
import { TemplateList, TemplateListSkeleton } from '@/features/admin-templates/template-list'
import { cloneItems, starterItems } from '@/features/admin-templates/tree-ops'
import { cn } from '@/lib/utils'

type ChannelFilter = 'ALL' | Channel

export default function AdminTemplatesPage() {
  const { data: templates, isLoading } = useTemplates(true)
  const { data: stores = [] } = useStores(true)
  const { data: shelfTypes = [] } = useShelfTypes(true)
  const create = templateMutations.useCreate()
  const update = templateMutations.useUpdate()
  const remove = templateMutations.useRemove()
  const [confirm, confirmDialog] = useConfirm()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id')
  const [dirty, setDirty] = useState(false)
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState<ChannelFilter>('ALL')

  const all = useMemo(() => templates ?? [], [templates])
  const selected = all.find((t) => t.id === selectedId) ?? null
  const storesById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores])
  const shelfTypesById = useMemo(() => new Map(shelfTypes.map((s) => [s.id, s])), [shelfTypes])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all
      // "Every channel" templates apply to Offline and Online, so they show under both filters.
      .filter((t) => channel === 'ALL' || t.channel === null || t.channel === channel)
      .filter((t) => !needle || t.name.toLowerCase().includes(needle) || (t.description ?? '').toLowerCase().includes(needle))
      .sort(
        (a, b) =>
          Number(a.channel !== null) - Number(b.channel !== null) ||
          Number(b.isActive) - Number(a.isActive) ||
          (a.channel ?? '').localeCompare(b.channel ?? '') ||
          a.name.localeCompare(b.name, 'th'),
      )
  }, [all, q, channel])

  const onDirtyChange = useCallback((d: boolean) => setDirty(d), [])

  const confirmDiscard = async () =>
    !dirty ||
    confirm({
      title: 'ทิ้งการแก้ไขที่ยังไม่บันทึก?',
      description: 'การแก้ไขแม่แบบที่เปิดอยู่จะหายไป ถ้าต้องการเก็บไว้ ให้กด "ยกเลิก" แล้วกดบันทึกก่อน',
      confirmLabel: 'ทิ้งการแก้ไข',
      destructive: true,
    })

  const select = async (id: string | null) => {
    if (id === selectedId) return
    if (!(await confirmDiscard())) return
    setDirty(false)
    setParams(id ? { id } : {})
    if (id) window.scrollTo({ top: 0 })
  }

  const createNew = async () => {
    if (!(await confirmDiscard())) return
    try {
      const created = await create.mutateAsync({
        name: 'แม่แบบใหม่',
        description: null,
        // Filter "ทั้งหมด" → a template for every channel; narrow it in the editor if needed.
        channel: channel === 'ALL' ? null : channel,
        shelfTypeId: null,
        storeId: null,
        isActive: false,
        items: starterItems(),
      })
      setDirty(false)
      setParams({ id: created.id })
    } catch {
      // toasted by the hook
    }
  }

  const duplicate = async (t: TaskTemplate) => {
    if (
      dirty &&
      !(await confirm({
        title: 'ทำสำเนาจากฉบับที่บันทึกล่าสุด?',
        description: 'สำเนาจะใช้ข้อมูลที่บันทึกไว้ล่าสุด การแก้ไขที่ยังไม่บันทึกของแม่แบบนี้จะถูกทิ้ง',
        confirmLabel: 'ทำสำเนา',
      }))
    )
      return
    try {
      const created = await create.mutateAsync({
        name: `${t.name} (สำเนา)`,
        description: t.description,
        channel: t.channel,
        shelfTypeId: t.shelfTypeId,
        storeId: t.storeId,
        isActive: false,
        items: cloneItems(t.items),
      })
      setDirty(false)
      setParams({ id: created.id })
    } catch {
      // toasted by the hook
    }
  }

  const deleteTemplate = async (t: TaskTemplate) => {
    const ok = await confirm({
      title: `ลบแม่แบบ "${t.name}"?`,
      description: 'โปรเจกต์ที่สร้างจากแม่แบบนี้ไปแล้วไม่ได้รับผลกระทบ งานทั้งหมดยังอยู่ครบ แต่จะเลือกแม่แบบนี้ตอนเสนอสินค้าใหม่ไม่ได้อีก — ถ้าแค่ไม่อยากให้ใช้ชั่วคราว ให้ปิดการใช้งานแทน',
      confirmLabel: 'ลบแม่แบบ',
      destructive: true,
    })
    if (!ok) return
    remove.mutate(t.id, {
      onSuccess: () => {
        setDirty(false)
        setParams({})
      },
    })
  }

  const toggleActive = (t: TaskTemplate, isActive: boolean) => update.mutate({ id: t.id, patch: { isActive } })
  const pendingActiveId = update.isPending && update.variables && 'isActive' in update.variables.patch ? update.variables.id : null

  const filtered = q.trim() !== '' || channel !== 'ALL'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ผู้ดูแลระบบ"
        title="แม่แบบ Task"
        description={`ชุดขั้นตอนมาตรฐานที่ระบบใช้สร้างรายการงานให้อัตโนมัติเมื่อเสนอสินค้า — วางขายวันที่ ${LAUNCH_DAY_OF_MONTH} ของเดือนเสมอ กำหนดวันเป็นจำนวนวันก่อน/หลังวันวางขาย (เช่น D-${PREP_DAYS} = เริ่มเตรียม ${PREP_DAYS} วันก่อน) แล้วระบบคำนวณวันจริงพร้อมแผนกที่รับผิดชอบให้`}
        actions={
          <Button className="h-9" onClick={() => void createNew()} disabled={create.isPending}>
            {create.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            สร้างแม่แบบใหม่
          </Button>
        }
      />

      <div className="items-start gap-6 xl:grid xl:grid-cols-[19rem_minmax(0,1fr)] 2xl:grid-cols-[22rem_minmax(0,1fr)]">
        {/* List pane — replaced by the editor below xl when a template is open. */}
        <section aria-label="รายการแม่แบบ" className={cn('space-y-3 xl:sticky xl:top-20 xl:max-h-[calc(100svh-6rem)] xl:overflow-y-auto xl:pr-1 xl:scrollbar-thin', selectedId && 'hidden xl:block')}>
          <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
            <div className="min-w-0 flex-1">
              <Label htmlFor="template-search" className="sr-only">
                ค้นหาแม่แบบ
              </Label>
              <InputGroup className="h-9 bg-card">
                <InputGroupAddon>
                  <SearchIcon aria-hidden />
                </InputGroupAddon>
                <InputGroupInput id="template-search" type="search" placeholder="ค้นหาชื่อแม่แบบ…" value={q} onChange={(e) => setQ(e.target.value)} />
                {q && (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton size="icon-xs" aria-label="ล้างคำค้นหา" onClick={() => setQ('')}>
                      <XIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                )}
              </InputGroup>
            </div>
            <ToggleGroup
              type="single"
              value={channel}
              onValueChange={(v) => {
                if (v === 'ALL' || v === 'OFFLINE' || v === 'ONLINE') setChannel(v)
              }}
              aria-label="กรองตามช่องทาง"
              spacing={0.5}
              className="w-full rounded-lg bg-muted p-0.5 sm:w-auto xl:w-full"
            >
              {(
                [
                  ['ALL', 'ทั้งหมด'],
                  ['OFFLINE', 'Offline'],
                  ['ONLINE', 'Online'],
                ] as const
              ).map(([value, label]) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  className="h-8 flex-1 px-3 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
                >
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {isLoading ? (
            <TemplateListSkeleton />
          ) : all.length === 0 ? (
            <EmptyState
              icon={<ListTreeIcon className="size-5" />}
              title="ยังไม่มีแม่แบบ Task"
              description="สร้างแม่แบบแรกเพื่อให้ทีมได้รายการงานอัตโนมัติเมื่อเสนอสินค้า"
              action={
                <Button onClick={() => void createNew()} disabled={create.isPending}>
                  <PlusIcon /> สร้างแม่แบบแรก
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<SearchIcon className="size-5" />}
              title="ไม่พบแม่แบบที่ตรงกับตัวกรอง"
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQ('')
                    setChannel('ALL')
                  }}
                >
                  ล้างตัวกรอง
                </Button>
              }
            />
          ) : (
            <>
              <TemplateList
                templates={visible}
                storesById={storesById}
                shelfTypesById={shelfTypesById}
                selectedId={selectedId}
                pendingActiveId={pendingActiveId}
                onSelect={(id) => void select(id)}
                onToggleActive={toggleActive}
                className="md:grid-cols-2 xl:grid-cols-1"
              />
              <p className="tabular text-xs text-muted-foreground">
                {filtered ? `แสดง ${visible.length} จาก ${all.length} แม่แบบ` : `${all.length} แม่แบบ · เปิดใช้งาน ${all.filter((t) => t.isActive).length}`}
              </p>
            </>
          )}
        </section>

        {/* Editor pane */}
        <section aria-label="แก้ไขแม่แบบ" className={cn('min-w-0', !selectedId && 'hidden xl:block')}>
          {selected ? (
            <TemplateEditor
              key={selected.id}
              template={selected}
              stores={stores}
              shelfTypes={shelfTypes}
              activePending={pendingActiveId === selected.id}
              onDirtyChange={onDirtyChange}
              onBack={() => void select(null)}
              onToggleActive={(v) => toggleActive(selected, v)}
              onDuplicate={() => void duplicate(selected)}
              onDelete={() => void deleteTemplate(selected)}
            />
          ) : selectedId && !isLoading ? (
            <EmptyState
              title="ไม่พบแม่แบบนี้"
              description="แม่แบบอาจถูกลบไปแล้ว เลือกแม่แบบอื่นจากรายการ"
              action={
                <Button variant="outline" onClick={() => setParams({})}>
                  กลับไปที่รายการ
                </Button>
              }
            />
          ) : isLoading ? null : (
            <EmptyState
              icon={<MousePointerClickIcon className="size-5" />}
              title="เลือกแม่แบบเพื่อแก้ไข"
              description="กดแม่แบบทางซ้ายเพื่อแก้ชื่อ ขั้นตอนงาน และระยะเวลา หรือสร้างแม่แบบใหม่"
              className="min-h-80"
            />
          )}
        </section>
      </div>

      {confirmDialog}
    </div>
  )
}
