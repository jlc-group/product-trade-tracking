import { addDays, type EntityType, type User } from '@flowtrade/shared'
import { HistoryIcon, RotateCcwIcon, SearchIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useActivity, useProposals } from '@/api/hooks'
import { EmptyState, PageHeader } from '@/components/common/misc'
import { UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ActivityFeed, ActivitySkeleton, activityDay, ENTITY_META, ENTITY_ORDER, groupByDay } from '@/features/admin-activity/activity-feed'
import { today } from '@/lib/format'
import { cn } from '@/lib/utils'

const LIMIT = 300
const PAGE = 100
const ALL = '__all'

type TypeFilter = 'ALL' | EntityType

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tabular mt-0.5 text-xl font-semibold">{value}</div>
    </div>
  )
}

export default function AdminActivityPage() {
  const { data, isLoading, isError, refetch } = useActivity(undefined, LIMIT)
  const proposals = useProposals({ scope: 'all', status: 'ALL' })
  const [type, setType] = useState<TypeFilter>('ALL')
  const [actorId, setActorId] = useState<string>(ALL)
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(PAGE)

  const items = useMemo(() => data ?? [], [data])
  const proposalsById = useMemo(() => new Map((proposals.data ?? []).map((p) => [p.id, p])), [proposals.data])

  const actors = useMemo(() => {
    const map = new Map<string, User>()
    for (const a of items) map.set(a.actor.id, a.actor)
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }, [items])

  const typeCounts = useMemo(() => {
    const counts = new Map<EntityType, number>()
    for (const a of items) counts.set(a.entityType, (counts.get(a.entityType) ?? 0) + 1)
    return counts
  }, [items])

  const stats = useMemo(() => {
    const t = today()
    const weekStart = addDays(t, -6)
    const week = items.filter((a) => activityDay(a.createdAt) >= weekStart)
    return {
      today: items.filter((a) => activityDay(a.createdAt) === t).length,
      week: week.length,
      people: new Set(week.map((a) => a.actorId)).size,
    }
  }, [items])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter(
      (a) =>
        (type === 'ALL' || a.entityType === type) &&
        (actorId === ALL || a.actorId === actorId) &&
        (!needle || a.summary.toLowerCase().includes(needle) || a.actor.name.toLowerCase().includes(needle) || (a.actor.nickname ?? '').toLowerCase().includes(needle)),
    )
  }, [items, type, actorId, q])

  const groups = useMemo(() => groupByDay(filtered.slice(0, shown)), [filtered, shown])
  const hasFilter = type !== 'ALL' || actorId !== ALL || q.trim() !== ''

  const resetFilters = () => {
    setType('ALL')
    setActorId(ALL)
    setQ('')
    setShown(PAGE)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ผู้ดูแลระบบ"
        title="ประวัติการใช้งาน"
        description={`ใครทำอะไรในระบบเมื่อไร — แสดง ${LIMIT} รายการล่าสุด กดชื่อโปรเจกต์เพื่อเปิดดูรายละเอียด`}
      />

      {!isLoading && !isError && (
        <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
          <Stat label="วันนี้" value={stats.today} />
          <Stat label="7 วันล่าสุด" value={stats.week} />
          <Stat label="คนที่ใช้งาน (7 วัน)" value={stats.people} />
        </div>
      )}

      <div className="space-y-3">
        <div className="-mx-4 overflow-x-auto px-4 scrollbar-thin md:mx-0 md:px-0">
          <div className="flex w-max gap-1.5 md:w-auto md:flex-wrap" role="group" aria-label="กรองตามประเภทข้อมูล">
            {(['ALL', ...ENTITY_ORDER] as const).map((t) => {
              const active = type === t
              const Icon = t === 'ALL' ? HistoryIcon : ENTITY_META[t].icon
              const count = t === 'ALL' ? items.length : (typeCounts.get(t) ?? 0)
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setType(t)
                    setShown(PAGE)
                  }}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    active ? 'border-primary/40 bg-brand-soft text-brand' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {t === 'ALL' ? 'ทั้งหมด' : ENTITY_META[t].label}
                  <span className={cn('tabular text-xs font-semibold', active ? 'text-brand' : 'text-foreground/70')}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <Label htmlFor="activity-search" className="sr-only">
              ค้นหาในประวัติ
            </Label>
            <InputGroup className="h-9 bg-card">
              <InputGroupAddon>
                <SearchIcon aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                id="activity-search"
                type="search"
                placeholder="ค้นหา เช่น ชื่องาน รหัสโปรเจกต์ ชื่อคน…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setShown(PAGE)
                }}
              />
              {q && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-xs" aria-label="ล้างคำค้นหา" onClick={() => setQ('')}>
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="activity-actor" className="sr-only">
              กรองตามผู้ใช้
            </Label>
            <Select
              value={actorId}
              onValueChange={(v) => {
                setActorId(v)
                setShown(PAGE)
              }}
            >
              <SelectTrigger id="activity-actor" className="h-9 w-full bg-card sm:w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-80">
                <SelectItem value={ALL}>ทุกคน</SelectItem>
                {actors.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    <UserAvatar user={u} size="xs" tooltip={false} />
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilter && (
              <Button variant="ghost" size="sm" className="h-9 shrink-0" onClick={resetFilters}>
                ล้างตัวกรอง
              </Button>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <ActivitySkeleton />
      ) : isError ? (
        <EmptyState
          title="โหลดประวัติการใช้งานไม่สำเร็จ"
          description="ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              <RotateCcwIcon /> ลองอีกครั้ง
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState icon={<HistoryIcon className="size-5" />} title="ยังไม่มีประวัติการใช้งาน" description="เมื่อทีมเริ่มสร้างการเสนอสินค้าหรือแก้ไขข้อมูล รายการจะแสดงที่นี่" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchIcon className="size-5" />}
          title="ไม่พบรายการที่ตรงกับตัวกรอง"
          description="ลองเปลี่ยนประเภท ผู้ใช้ หรือคำค้นหา"
          action={
            <Button variant="outline" onClick={resetFilters}>
              ล้างตัวกรอง
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <ActivityFeed groups={groups} proposalsById={proposalsById} proposalsReady={proposals.isSuccess} />
          <div className="flex flex-col items-center gap-2 pt-2 text-xs text-muted-foreground">
            <span className="tabular">
              แสดง {Math.min(shown, filtered.length)} จาก {filtered.length} รายการ
              {hasFilter && ` (กรองจาก ${items.length})`}
            </span>
            {shown < filtered.length && (
              <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                แสดงเพิ่มอีก {Math.min(PAGE, filtered.length - shown)} รายการ
              </Button>
            )}
            {shown >= filtered.length && items.length >= LIMIT && <span>รายการที่เก่ากว่านี้ไม่แสดงในหน้านี้</span>}
          </div>
        </div>
      )}
    </div>
  )
}
