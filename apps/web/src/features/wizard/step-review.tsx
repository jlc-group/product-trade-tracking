import { CHANNEL_TERMS, prepStartOf, PROPOSAL_TITLE_MAX, templateLeadDays, type ShelfType, type Store, type TaskTemplate, type User } from '@flowtrade/shared'
import { AlertTriangleIcon, FileTextIcon, ListTreeIcon, PlayIcon, SparklesIcon, UserPlusIcon, UsersIcon } from 'lucide-react'
import { useId, type Dispatch, type ReactNode } from 'react'
import type { TemplatePreviewItem } from '@/api'
import { useTemplates, useUserLookup } from '@/api/hooks'
import { ShelfTypeBadge, StoreLogo } from '@/components/common/badges'
import { AvatarStack } from '@/components/common/user-avatar'
import { UserPicker } from '@/components/common/user-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { daysUntil, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Callout } from './choice-card'
import { TemplateTreePreview } from './template-tree-preview'
import { autoTitle, type ProposalStartStatus, type WizardAction, type WizardState } from './wizard-state'

const NONE = '__none__'

export interface ReviewPlan {
  items: (TemplatePreviewItem & { custom: boolean })[]
  excluded: Set<string>
  count: { total: number; byLevel: Record<1 | 2 | 3, number> }
  isLoading: boolean
  clampedCount: number
}

export function StepReview({
  state,
  dispatch,
  me,
  stores,
  shelfType,
  suggested,
  effectiveTemplateId,
  plan,
  excludedIds,
}: {
  state: WizardState
  dispatch: Dispatch<WizardAction>
  me: User
  stores: Store[]
  shelfType: ShelfType | null
  suggested: TaskTemplate | null
  effectiveTemplateId: string | null
  plan: ReviewPlan
  excludedIds: string[]
}) {
  const id = useId()
  const channel = state.channel ?? 'OFFLINE'
  const terms = CHANNEL_TERMS[channel]
  const unit = channel === 'ONLINE' ? 'แพลตฟอร์ม' : 'ห้าง'
  const { data: allTemplates = [], isLoading: templatesLoading } = useTemplates()
  // A template without a channel (e.g. the standard checklist) fits every channel.
  const templates = allTemplates.filter((t) => t.channel === channel || t.channel === null)
  const template = templates.find((t) => t.id === effectiveTemplateId) ?? (suggested?.id === effectiveTemplateId ? suggested : null)
  const lead = template ? templateLeadDays(template.items) : 0
  const remaining = state.targetDate ? daysUntil(state.targetDate) : 0
  const placeholder = autoTitle(state.products, stores) || 'ตั้งชื่อโปรเจกต์'

  return (
    <div className="space-y-5">
      {/* What will be created */}
      <section className="rounded-xl border border-brand/20 bg-brand-soft/70 p-4" aria-label="สรุปสิ่งที่จะสร้าง">
        <p className="text-base font-semibold text-brand">
          จะสร้าง 1 โปรเจกต์ สำหรับ{stores.length > 1 ? <> <span className="tabular">{stores.length}</span> {unit}</> : unit}: {stores.map((s) => s.name).join(', ')}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {stores.map((s) => (
            <StoreLogo key={s.id} store={s} size="md" />
          ))}
        </div>
        <p className="tabular mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground/80">
          <span>สินค้า {state.products.length} รายการ</span>
          {shelfType && (
            <>
              <span aria-hidden>·</span>
              <ShelfTypeBadge shelfType={shelfType} className="bg-card" />
            </>
          )}
          <span aria-hidden>·</span>
          <span>
            {terms.date} {formatDate(state.targetDate, { long: true })}
          </span>
          {state.targetDate && (
            <>
              <span aria-hidden>·</span>
              <span>เริ่มเตรียม {formatDate(prepStartOf(state.targetDate), { long: true })}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>{plan.items.length > 0 ? `${plan.count.total} งาน${stores.length > 1 ? ` ใช้ร่วมกันทุก${unit}` : ''}` : 'เริ่มจากรายการว่าง'}</span>
        </p>
      </section>

      {/* Template & tasks */}
      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ListTreeIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold">แม่แบบและรายการงาน</h3>
            <p className="text-sm text-muted-foreground">
              {plan.items.length > 0
                ? 'เอาเครื่องหมายออกจากงานที่ไม่ต้องทำ — เอางานหลักออก งานย่อยข้างในจะไม่ถูกสร้างด้วย (แก้วัน แผนกที่รับผิดชอบ และเพิ่มงานได้ที่ขั้นวันวางขาย)'
                : 'เลือกแม่แบบ หรือกลับไปขั้นวันวางขายเพื่อพิมพ์เพิ่มงานของคุณเอง'}
            </p>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-template`}>แม่แบบ Task</Label>
          <Select
            value={effectiveTemplateId ?? NONE}
            onValueChange={(v) => dispatch({ type: 'setTemplate', choice: v === NONE ? { kind: 'none' } : { kind: 'id', id: v } })}
            disabled={templatesLoading}
          >
            <SelectTrigger id={`${id}-template`} className="h-9 w-full">
              <SelectValue placeholder="เลือกแม่แบบ" />
            </SelectTrigger>
            <SelectContent position="popper" className="max-w-[calc(100vw-2rem)]">
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="truncate">{t.name}</span>
                  {t.id === suggested?.id && (
                    <span className="ml-1 inline-flex shrink-0 items-center gap-0.5 rounded bg-brand-soft px-1 text-[10px] font-medium text-brand">
                      <SparklesIcon className="size-2.5" />
                      แนะนำ
                    </span>
                  )}
                </SelectItem>
              ))}
              {templates.length > 0 && <SelectSeparator />}
              <SelectItem value={NONE}>ไม่ใช้แม่แบบ (เริ่มจากรายการว่าง)</SelectItem>
            </SelectContent>
          </Select>
          {template && (
            <p className="text-xs text-muted-foreground">
              {template.description || <span className="tabular">ใช้เวลาเตรียมประมาณ {lead} วันก่อนวางขาย</span>}
            </p>
          )}
        </div>

        {template && lead > remaining && (
          <Callout tone="warning" icon={<AlertTriangleIcon />}>
            แม่แบบนี้ต้องใช้เวลาประมาณ <span className="tabular font-semibold">{lead}</span> วัน แต่เหลือเวลา <span className="tabular font-semibold">{remaining}</span> วัน
            งานช่วงแรกจะถูกเลื่อนมาเริ่มวันนี้
            {plan.clampedCount > 0 && <> ({plan.clampedCount} งาน)</>}
          </Callout>
        )}

        {plan.items.length > 0 ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-4" aria-live="polite">
              <p className="text-sm">
                จะสร้าง <span className="tabular text-base font-semibold text-primary">{plan.count.total}</span> งาน
                {stores.length > 1 && <span className="text-muted-foreground"> ใช้ร่วมกันทุก{unit}</span>}
              </p>
              <p className="tabular text-xs text-muted-foreground">
                Task {plan.count.byLevel[1]} · Sub task {plan.count.byLevel[2]} · Mini task {plan.count.byLevel[3]}
              </p>
            </div>
            {plan.count.total === 0 && !plan.isLoading && (
              <Callout tone="warning" icon={<AlertTriangleIcon />}>
                ยังไม่ได้เลือกงานไว้เลย โปรเจกต์จะเริ่มจากรายการว่าง — กด “ใช้ทุกงาน” เพื่อเลือกกลับมา
              </Callout>
            )}
            <TemplateTreePreview
              items={plan.items}
              excluded={plan.excluded}
              excludedIds={excludedIds}
              isLoading={plan.isLoading}
              onChange={(ids) => dispatch({ type: 'plan/setExcluded', keys: ids })}
            />
          </>
        ) : (
          <Callout tone="info" icon={<FileTextIcon />}>
            จะสร้างโปรเจกต์โดยยังไม่มี Task — เพิ่มงานเองได้ในหน้าโปรเจกต์หลังสร้างเสร็จ
          </Callout>
        )}
      </section>

      {/* Details */}
      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
        <h3 className="font-semibold">รายละเอียดโปรเจกต์</h3>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-title`}>
            ชื่อโปรเจกต์ <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
          </Label>
          <Input
            id={`${id}-title`}
            value={state.title}
            onChange={(e) => dispatch({ type: 'setTitle', title: e.target.value })}
            placeholder={placeholder}
            maxLength={PROPOSAL_TITLE_MAX}
            aria-describedby={`${id}-title-hint`}
          />
          <p id={`${id}-title-hint`} className="text-xs text-muted-foreground">
            เว้นว่างไว้ ระบบจะใช้ชื่อตามตัวอย่างในช่อง
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-note`}>
            หมายเหตุถึงทีม <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
          </Label>
          <Textarea
            id={`${id}-note`}
            value={state.note}
            onChange={(e) => dispatch({ type: 'setNote', note: e.target.value })}
            placeholder="เช่น เงื่อนไขพิเศษจากห้าง ราคาที่ตกลงไว้ หรือสิ่งที่ทีมควรรู้"
            rows={3}
          />
        </div>

        <MembersField id={`${id}-members`} me={me} value={state.memberIds} onChange={(ids) => dispatch({ type: 'setMembers', ids })} />
      </section>

      {/* Start status */}
      <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
        <h3 className="font-semibold" id={`${id}-status-label`}>
          สถานะเริ่มต้น
        </h3>
        <RadioGroup
          value={state.status}
          onValueChange={(v) => dispatch({ type: 'setStatus', status: v as ProposalStartStatus })}
          aria-labelledby={`${id}-status-label`}
          className="grid gap-3 @xl:grid-cols-2"
        >
          <StatusOption
            id={`${id}-status-run`}
            value="IN_PROGRESS"
            selected={state.status === 'IN_PROGRESS'}
            icon={<PlayIcon className="size-4" />}
            title="เริ่มดำเนินการทันที"
            description="ทีมเห็นงานและเริ่มนับกำหนดส่งได้เลย"
          />
          <StatusOption
            id={`${id}-status-draft`}
            value="DRAFT"
            selected={state.status === 'DRAFT'}
            icon={<FileTextIcon className="size-4" />}
            title="บันทึกเป็นร่าง"
            description="เก็บไว้ปรับรายละเอียดก่อน แล้วค่อยกดเริ่มในหน้าโปรเจกต์"
          />
        </RadioGroup>
      </section>
    </div>
  )
}

function StatusOption({ id, value, selected, icon, title, description }: { id: string; value: ProposalStartStatus; selected: boolean; icon: ReactNode; title: string; description: string }) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 font-normal transition hover:border-primary/40',
        selected && 'border-primary bg-brand-soft/60 ring-1 ring-primary',
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className={cn(selected ? 'text-primary' : 'text-muted-foreground')}>{icon}</span>
          {title}
        </span>
        <span className="block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </Label>
  )
}

function MembersField({ id, me, value, onChange }: { id: string; me: User; value: string[]; onChange: (ids: string[]) => void }) {
  const { data: users = [] } = useUserLookup()
  const selected = users.filter((u) => value.includes(u.id))
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        ทีมงานร่วม <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <UserPicker
          value={value}
          onChange={onChange}
          excludeIds={[me.id]}
          placeholder="เพิ่มทีมงาน"
          trigger={
            <Button id={id} type="button" variant="outline" className="h-9 justify-start gap-2 px-2.5 font-normal">
              {selected.length > 0 ? (
                <>
                  <AvatarStack users={selected} max={4} size="xs" />
                  <span className="text-sm">{selected.length} คน</span>
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
        {selected.length > 0 && (
          <span className="min-w-0 truncate text-sm text-muted-foreground">{selected.map((u) => u.nickname || u.name).join(', ')}</span>
        )}
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <UsersIcon className="mt-px size-3.5 shrink-0" />
        คุณเป็นเจ้าของโปรเจกต์อยู่แล้ว ทีมงานที่เพิ่มจะเห็นโปรเจกต์ จัดการ Task ได้ และได้รับการแจ้งเตือน
      </p>
    </div>
  )
}
