import { addDays, earliestOnTimeLaunch, LAUNCH_DAY_OF_MONTH, LEVEL_LABEL, PREP_DAYS, prepStartOf, templateLeadDays, type ShelfType, type Store, type TaskTemplate } from '@flowtrade/shared'
import {
  ArrowLeftIcon,
  CalendarRangeIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CopyIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
  Undo2Icon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { templateMutations } from '@/api/hooks'
import { useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { formatDate, fromNow, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TemplateGantt } from './template-gantt'
import { TemplateSettings, type TemplateDraft } from './template-settings'
import { TemplateTree, type TreeActions } from './template-tree'
import {
  addChild,
  addRoot,
  addSibling,
  allItemsHaveOffsets,
  childrenMap,
  departmentCounts,
  departmentSuggestions,
  descendantCounts,
  itemNumbers,
  levelCounts,
  moveItem,
  normalizeItems,
  offsetLabel,
  PREP_DUE_OFFSET,
  PREP_START_OFFSET,
  removeItem,
  setAllOffsets,
  updateItem,
  validateItems,
  type Items,
} from './tree-ops'

function toDraft(t: TaskTemplate): TemplateDraft {
  return { name: t.name, description: t.description ?? '', channel: t.channel, shelfTypeId: t.shelfTypeId, storeId: t.storeId, items: normalizeItems(t.items) }
}

const fingerprint = (d: TemplateDraft) => JSON.stringify({ ...d, name: d.name.trim(), description: d.description.trim(), items: normalizeItems(d.items) })

interface Props {
  template: TaskTemplate
  stores: Store[]
  shelfTypes: ShelfType[]
  activePending: boolean
  onDirtyChange: (dirty: boolean) => void
  onBack: () => void
  onToggleActive: (isActive: boolean) => void
  onDuplicate: () => void
  onDelete: () => void
}

export function TemplateEditor({ template, stores, shelfTypes, activePending, onDirtyChange, onBack, onToggleActive, onDuplicate, onDelete }: Props) {
  const update = templateMutations.useUpdate()
  const [confirm, confirmDialog] = useConfirm()
  const [baseline, setBaseline] = useState(() => toDraft(template))
  const [draft, setDraft] = useState(baseline)
  const [attempted, setAttempted] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [focusId, setFocusId] = useState<string | null>(null)

  const dirty = useMemo(() => fingerprint(draft) !== fingerprint(baseline), [draft, baseline])
  const map = useMemo(() => childrenMap(draft.items), [draft.items])
  const issues = useMemo(() => validateItems(draft.items), [draft.items])
  const counts = useMemo(() => levelCounts(draft.items), [draft.items])
  const nameError = attempted && !draft.name.trim() ? 'ตั้งชื่อแม่แบบก่อนบันทึก เพื่อให้ทีมเลือกใช้ได้ถูก' : null
  const blocking = issues.filter((i) => i.field !== 'title' || attempted)
  const parentIds = useMemo(() => draft.items.filter((i) => map.has(i.id)).map((i) => i.id), [draft.items, map])
  const numbers = useMemo(() => itemNumbers(map), [map])
  const descendants = useMemo(() => descendantCounts(map), [map])
  const departments = useMemo(() => departmentSuggestions(draft.items), [draft.items])
  const deptCounts = useMemo(() => departmentCounts(draft.items), [draft.items])
  const lead = templateLeadDays(draft.items)
  const inPrepWindow = allItemsHaveOffsets(draft.items, PREP_START_OFFSET, PREP_DUE_OFFSET)
  // Real-date example: the earliest launch (the 15th) whose 90-day preparation is still ahead of today.
  const exampleLaunch = useMemo(() => earliestOnTimeLaunch(today()), [])

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const setItems = useCallback((fn: (items: Items) => Items) => setDraft((d) => ({ ...d, items: fn(d.items) })), [])

  const save = async () => {
    setAttempted(true)
    const all = validateItems(draft.items)
    const firstProblem = !draft.name.trim() ? 'ตั้งชื่อแม่แบบก่อนบันทึก' : all[0]?.message
    if (firstProblem) {
      toast.error(`ยังบันทึกไม่ได้ — ${firstProblem}`)
      // Open collapsed branches that hide a problem row so the red highlights are visible.
      const byId = new Map(draft.items.map((i) => [i.id, i]))
      const reveal = new Set<string>()
      for (const issue of all) {
        let parent = issue.id ? byId.get(issue.id)?.parentId : null
        while (parent && !reveal.has(parent)) {
          reveal.add(parent)
          parent = byId.get(parent)?.parentId
        }
      }
      if ([...reveal].some((id) => collapsed.has(id))) setCollapsed((c) => new Set([...c].filter((id) => !reveal.has(id))))
      const target = !draft.name.trim() ? 'tpl-name' : all[0]?.id ? `tpl-${all[0].id}-${all[0].field === 'title' ? 'title' : all[0].field === 'start' ? 'start' : 'due'}` : null
      // Wait one frame so rows revealed above are mounted.
      if (target) requestAnimationFrame(() => document.getElementById(target)?.focus())
      return
    }
    const items = normalizeItems(draft.items)
    // "Every channel" can't point at a shelf type or store (the API rejects it).
    const scope = draft.channel === null ? { shelfTypeId: null, storeId: null } : {}
    const next: TemplateDraft = { ...draft, ...scope, name: draft.name.trim(), description: draft.description.trim(), items }
    try {
      await update.mutateAsync({
        id: template.id,
        patch: { name: next.name, description: next.description || null, channel: next.channel, shelfTypeId: next.shelfTypeId, storeId: next.storeId, items },
      })
      setBaseline(next)
      setDraft(next)
      setAttempted(false)
      toast.success('บันทึกแม่แบบแล้ว', { description: 'การเสนอสินค้าใหม่จะใช้ขั้นตอนชุดนี้ — โปรเจกต์เดิมไม่เปลี่ยน' })
    } catch {
      // toasted by the hook
    }
  }

  const discard = () => {
    setDraft(baseline)
    setAttempted(false)
    toast('ยกเลิกการแก้ไขแล้ว — กลับเป็นฉบับที่บันทึกล่าสุด')
  }

  // Ctrl/Cmd + S saves.
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const actions: TreeActions = {
    onUpdate: (id, patch) => setItems((items) => updateItem(items, id, patch)),
    onAddChild: (id) => {
      const result = addChild(draft.items, id)
      if (!result) return
      setItems(() => result.items)
      setCollapsed((c) => {
        const n = new Set(c)
        n.delete(id)
        return n
      })
      setFocusId(result.id)
    },
    onAddSibling: (id) => {
      const result = addSibling(draft.items, id)
      if (!result) return
      setItems(() => result.items)
      setFocusId(result.id)
    },
    onMove: (id, direction) => setItems((items) => moveItem(items, id, direction)),
    onRemove: async (id) => {
      const item = draft.items.find((i) => i.id === id)
      if (!item) return
      const { removed } = removeItem(draft.items, id)
      const name = item.title || 'งานที่ยังไม่มีชื่อ'
      if (removed.length > 1) {
        const ok = await confirm({
          title: `ลบ "${name}" และงานย่อย?`,
          description: `งานย่อยข้างใต้อีก ${removed.length - 1} งานจะถูกลบไปด้วย (ยังไม่บันทึกจนกว่าจะกด "บันทึกแม่แบบ")`,
          confirmLabel: `ลบ ${removed.length} งาน`,
          destructive: true,
        })
        if (!ok) return
      }
      setItems((items) => removeItem(items, id).items)
      toast(`ลบ "${name}"${removed.length > 1 ? ` และงานย่อย ${removed.length - 1} งาน` : ''} แล้ว`, {
        action: { label: 'เลิกทำ', onClick: () => setItems((items) => [...items.filter((i) => !removed.some((r) => r.id === i.id)), ...removed]) },
      })
    },
    onToggleCollapse: (id) =>
      setCollapsed((c) => {
        const n = new Set(c)
        if (n.has(id)) n.delete(id)
        else n.add(id)
        return n
      }),
  }

  const addTopLevel = () => {
    const result = addRoot(draft.items)
    setItems(() => result.items)
    setFocusId(result.id)
  }

  const allCollapsed = parentIds.length > 0 && parentIds.every((id) => collapsed.has(id))
  const noneCollapsed = parentIds.every((id) => !collapsed.has(id))
  // Rows hidden under a collapsed ancestor.
  const hiddenCount = useMemo(() => {
    let n = 0
    const walk = (parentId: string | null) => {
      for (const i of map.get(parentId) ?? []) {
        if (collapsed.has(i.id)) n += descendants.get(i.id) ?? 0
        else walk(i.id)
      }
    }
    walk(null)
    return n
  }, [map, collapsed, descendants])

  const applyPrepWindow = async () => {
    const ok = await confirm({
      title: `ตั้งทุกงานเป็น ${offsetLabel(PREP_START_OFFSET)} → ${offsetLabel(PREP_DUE_OFFSET)}?`,
      description: (
        <>
          ทั้ง {draft.items.length} งานจะเริ่ม {PREP_DAYS} วันก่อนวางขาย และต้องเสร็จก่อนวางขาย 1 วัน — เช่น วางขาย {formatDate(exampleLaunch)} → เริ่ม{' '}
          {formatDate(prepStartOf(exampleLaunch))} ถึง {formatDate(addDays(exampleLaunch, PREP_DUE_OFFSET))}
          <br />
          วันที่ที่ตั้งไว้เดิมของแต่ละงานจะถูกแทนที่ — ยังไม่บันทึกจนกว่าจะกด "บันทึกแม่แบบ" และกดเลิกทำได้
        </>
      ),
      confirmLabel: 'ตั้งวันทุกงาน',
    })
    if (!ok) return
    // Undo restores only the offsets, so edits made after the bulk change are kept.
    const before = new Map(draft.items.map((i) => [i.id, { startOffsetDays: i.startOffsetDays, dueOffsetDays: i.dueOffsetDays }]))
    setItems((items) => setAllOffsets(items, PREP_START_OFFSET, PREP_DUE_OFFSET))
    toast(`ตั้งทุกงานเป็น ${offsetLabel(PREP_START_OFFSET)} → ${offsetLabel(PREP_DUE_OFFSET)} แล้ว`, {
      description: 'กด "บันทึกแม่แบบ" เพื่อใช้กับการเสนอสินค้าใหม่',
      action: { label: 'เลิกทำ', onClick: () => setItems((items) => items.map((i) => ({ ...i, ...before.get(i.id) }))) },
    })
  }

  return (
    <div className="min-w-0 space-y-4">
      {/* Action bar stays visible while scrolling through a long tree. */}
      <div className="sticky top-14 z-10 -mx-4 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 xl:mx-0 xl:rounded-xl xl:border xl:px-3">
        <Button variant="ghost" size="sm" className="-ml-2 xl:hidden" onClick={onBack}>
          <ArrowLeftIcon /> แม่แบบทั้งหมด
        </Button>
        <div className="order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
          <h2 className="truncate text-base font-semibold">{draft.name.trim() || 'แม่แบบที่ยังไม่มีชื่อ'}</h2>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {dirty ? (
              <>
                <span className="size-1.5 rounded-full bg-warning" aria-hidden />
                <span className="font-medium text-warning-foreground">มีการแก้ไขที่ยังไม่บันทึก</span>
              </>
            ) : (
              <>บันทึกล่าสุด {fromNow(template.updatedAt)}</>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 pr-1">
            <Switch id="tpl-active" checked={template.isActive} disabled={activePending} onCheckedChange={onToggleActive} />
            <Label htmlFor="tpl-active" className="text-xs font-normal whitespace-nowrap">
              {template.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
            </Label>
          </div>
          {dirty && (
            <Button variant="ghost" size="sm" onClick={discard} disabled={update.isPending}>
              <Undo2Icon /> <span className="hidden sm:inline">ยกเลิกการแก้ไข</span>
              <span className="sr-only sm:hidden">ยกเลิกการแก้ไข</span>
            </Button>
          )}
          <Button size="sm" onClick={() => void save()} disabled={!dirty || update.isPending} title="บันทึก (Ctrl+S)">
            {update.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            บันทึกแม่แบบ
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="ตัวเลือกเพิ่มเติมของแม่แบบ">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={onDuplicate}>
                <CopyIcon /> ทำสำเนาแม่แบบนี้
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2Icon /> ลบแม่แบบ
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {attempted && blocking.length > 0 && (
        <div className="flex gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">แก้ {blocking.length} จุดก่อนบันทึก</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
              {blocking.slice(0, 5).map((i) => (
                <li key={`${i.id}-${i.field}`}>{i.message}</li>
              ))}
              {blocking.length > 5 && <li>และอีก {blocking.length - 5} จุด (ไฮไลต์สีแดงในรายการ)</li>}
            </ul>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลแม่แบบ</CardTitle>
          <CardDescription>กำหนดว่าแม่แบบนี้ใช้กับช่องทาง ประเภท Shelf หรือห้างใด</CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateSettings draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} stores={stores} shelfTypes={shelfTypes} nameError={nameError} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle>ขั้นตอนงาน</CardTitle>
              <CardDescription className="tabular">
                {([1, 2, 3] as const)
                  .filter((l) => counts[l] > 0)
                  .map((l) => `${counts[l]} ${LEVEL_LABEL[l]}`)
                  .join(' · ') || 'ยังไม่มีงาน'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void applyPrepWindow()}
                disabled={draft.items.length === 0 || inPrepWindow}
                title={inPrepWindow ? `ทุกงานเป็น ${offsetLabel(PREP_START_OFFSET)} → ${offsetLabel(PREP_DUE_OFFSET)} อยู่แล้ว` : `ให้ทุกงานเริ่ม ${PREP_DAYS} วันก่อนวางขาย และเสร็จก่อนวางขาย 1 วัน`}
              >
                <CalendarRangeIcon />
                ตั้งทุกงานเป็น {offsetLabel(PREP_START_OFFSET)} → {offsetLabel(PREP_DUE_OFFSET)}
              </Button>
              <Button variant="outline" size="sm" onClick={addTopLevel}>
                <PlusIcon /> เพิ่ม Task
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <p>
              วางขายวันที่ {LAUNCH_DAY_OF_MONTH} ของเดือนเสมอ และเตรียมทุกอย่างภายใน {PREP_DAYS} วัน — ตั้งวันของแต่ละงานเป็นจำนวนวันนับจากวันวางขาย (
              <span className="tabular font-semibold text-brand">D-{PREP_DAYS}</span> = {PREP_DAYS} วันก่อนวางขาย ·{' '}
              <span className="tabular font-semibold text-danger">D0</span> = วันวางขาย · <span className="tabular font-semibold text-success">D+7</span> = 7 วันหลังวางขาย)
              แล้วระบบคำนวณวันจริงให้เองตอนสร้างการเสนอสินค้า
            </p>
            <div>
              <p className="mb-1 font-medium text-foreground">ตัวอย่างวันจริง — ถ้าเลือกวางขาย {formatDate(exampleLaunch, { long: true })} (รอบที่เร็วที่สุดที่ยังเตรียมทันจากวันนี้)</p>
              <ol className="tabular flex flex-wrap items-center gap-1.5" aria-label="ตัวอย่างวันจริง">
                <li className="rounded-md bg-card px-2 py-1 shadow-xs">
                  <span className="font-semibold text-brand">{offsetLabel(PREP_START_OFFSET)}</span> เริ่มเตรียม{' '}
                  <span className="font-medium text-foreground">{formatDate(prepStartOf(exampleLaunch))}</span>
                </li>
                <li aria-hidden>→</li>
                <li className="rounded-md bg-card px-2 py-1 shadow-xs">
                  <span className="font-semibold text-brand">{offsetLabel(PREP_DUE_OFFSET)}</span> ต้องเสร็จ{' '}
                  <span className="font-medium text-foreground">{formatDate(addDays(exampleLaunch, PREP_DUE_OFFSET))}</span>
                </li>
                <li aria-hidden>→</li>
                <li className="rounded-md bg-card px-2 py-1 shadow-xs">
                  <span className="font-semibold text-danger">D0</span> วางขาย <span className="font-medium text-foreground">{formatDate(exampleLaunch)}</span>
                </li>
              </ol>
            </div>
            <p>สูงสุด 3 ระดับ: Task → Sub task → Mini task · วันที่สีเทาที่มุมขวาของแต่ละแถวคือวันจริงตามตัวอย่างนี้</p>
          </div>

          {lead > PREP_DAYS && (
            <p className="flex gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning-foreground" role="status">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                มีงานเริ่มก่อน {offsetLabel(PREP_START_OFFSET)} (เร็วสุด {offsetLabel(-lead)}) — เกินระยะเตรียม {PREP_DAYS} วันมาตรฐาน
                ถ้าทีมเสนอสินค้าล่วงหน้าแค่ 3 เดือน งานเหล่านั้นจะถูกเลื่อนมาเริ่มวันที่สร้างการเสนอ
              </span>
            </p>
          )}

          {deptCounts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">แผนกที่รับผิดชอบ:</span>
              {deptCounts.map((d) => (
                <span
                  key={d.name || '—'}
                  className={cn('tabular inline-flex h-6 items-center gap-1 rounded-md border bg-card px-2', d.name === '' && 'border-warning/40 bg-warning-soft text-warning-foreground')}
                  title={d.name ? `${d.name} รับผิดชอบ ${d.count} งาน` : `${d.count} งานยังไม่ได้ระบุแผนก`}
                >
                  {d.name || 'ยังไม่ระบุแผนก'}
                  <span className="font-semibold">{d.count}</span>
                </span>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {draft.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">แม่แบบนี้ยังไม่มีขั้นตอนงาน</p>
              <Button size="sm" onClick={addTopLevel}>
                <PlusIcon /> เพิ่ม Task แรก
              </Button>
            </div>
          ) : (
            <>
              {parentIds.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-1 border-b pb-2">
                  <Button variant="ghost" size="xs" onClick={() => setCollapsed(new Set(parentIds))} disabled={allCollapsed}>
                    <ChevronsDownUpIcon /> ย่อทั้งหมด
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => setCollapsed(new Set())} disabled={noneCollapsed}>
                    <ChevronsUpDownIcon /> ขยายทั้งหมด
                  </Button>
                  <span className="tabular ml-auto text-xs text-muted-foreground" aria-live="polite">
                    {hiddenCount > 0 ? `แสดง ${draft.items.length - hiddenCount} จาก ${draft.items.length} งาน · กดลูกศรหน้างานเพื่อย่อ/ขยาย` : `แสดงครบ ${draft.items.length} งาน · กดลูกศรหน้างานเพื่อย่อ/ขยาย`}
                  </span>
                </div>
              )}
              <TemplateTree
                map={map}
                collapsed={collapsed}
                issues={issues}
                showRequired={attempted}
                focusId={focusId}
                numbers={numbers}
                descendants={descendants}
                departments={departments}
                exampleLaunch={exampleLaunch}
                {...actions}
              />
              <Button variant="ghost" className="mt-3 w-full border border-dashed text-muted-foreground hover:text-foreground" onClick={addTopLevel}>
                <PlusIcon /> เพิ่ม Task หลัก
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ไทม์ไลน์ตัวอย่าง</CardTitle>
          <CardDescription>ภาพรวมช่วงเวลาของ Task หลักเทียบกับวันวางขาย อัปเดตตามที่แก้ไขทันที</CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateGantt items={draft.items} exampleLaunch={exampleLaunch} />
        </CardContent>
      </Card>

      {confirmDialog}
    </div>
  )
}
