import type { Store } from '@flowtrade/shared'
import { ArrowLeftIcon, ArrowRightIcon, CircleAlertIcon, CornerDownLeftIcon, ListChecksIcon, Loader2Icon, RocketIcon, XIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useCreateProposal, useShelfTypes, useStores, useSuggestedTemplate, useTemplate } from '@/api/hooks'
import { useCurrentUser } from '@/auth/auth'
import { PageHeader, useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { StepChannel } from './step-channel'
import { StepDate } from './step-date'
import { StepProducts } from './step-products'
import { StepReview } from './step-review'
import { StepShelf } from './step-shelf'
import { StepStores } from './step-stores'
import { excludedClosure, planRows, planSource, toPlanInput, toPreviewItems } from './plan-state'
import { WizardStepper } from './wizard-stepper'
import { WizardSummary } from './wizard-summary'
import {
  effectiveTemplateId,
  firstIncompleteStep,
  getSteps,
  initialWizardState,
  isDirty,
  STEP_COUNT,
  stepIssue,
  wizardReducer,
} from './wizard-state'

const LAST = STEP_COUNT - 1

/** Elements where Enter already means something else — don't hijack it for "next". */
const ENTER_IGNORE = '[data-wizard-no-enter], textarea, button, a, select, [role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [role="combobox"], [cmdk-root], [contenteditable="true"], [data-radix-popper-content-wrapper]'

export function NewProposalWizard() {
  const me = useCurrentUser()
  const navigate = useNavigate()
  const headingId = useId()
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState)
  const [confirm, confirmDialog] = useConfirm()
  const [summaryOpen, setSummaryOpen] = useState(false)
  const create = useCreateProposal()
  const now = today()
  const steps = getSteps(state.channel)

  // ---------- reference data ----------
  const { data: allStores = [] } = useStores()
  const { data: allShelfTypes = [] } = useShelfTypes()
  const stores = state.storeIds.map((id) => allStores.find((s) => s.id === id)).filter((s): s is Store => !!s)
  const shelfType = allShelfTypes.find((s) => s.id === state.shelfTypeId) ?? null

  // ---------- template ----------
  const suggestion = useSuggestedTemplate(state.channel, state.shelfTypeId, state.storeIds[0] ?? null)
  const suggested = suggestion.data ?? null
  const templateId = effectiveTemplateId(state.template, suggested?.id)
  const picked = useTemplate(state.template.kind === 'id' ? templateId : null)
  const template = state.template.kind === 'none' ? null : state.template.kind === 'auto' ? suggested : (picked.data ?? null)
  const templateLoading = state.template.kind === 'auto' ? suggestion.isLoading : state.template.kind === 'id' ? picked.isLoading : false

  // ---------- editable plan ----------
  // (Re)load the plan whenever the effective template changes; tasks the user typed are kept.
  const wantedSource = planSource(templateId)
  const templateReady = templateId === null ? !templateLoading : template?.id === templateId
  useEffect(() => {
    if (state.plan.source !== wantedSource && templateReady) {
      dispatch({ type: 'plan/load', templateId, items: template?.items ?? [], keepCustom: true })
    }
  }, [state.plan.source, wantedSource, templateReady, templateId, template])
  const rows = useMemo(() => (state.targetDate ? planRows(state.plan, state.targetDate, now) : []), [state.plan, state.targetDate, now])
  const included = rows.filter((r) => !r.excluded)
  const plan = {
    items: toPreviewItems(rows),
    excluded: excludedClosure(state.plan.items, state.plan.excluded),
    count: {
      total: included.length,
      byLevel: { 1: included.filter((r) => r.level === 1).length, 2: included.filter((r) => r.level === 2).length, 3: included.filter((r) => r.level === 3).length },
    },
    isLoading: state.plan.source !== wantedSource,
    clampedCount: included.filter((r) => r.clamped).length,
  }
  const resetPlan = template ? () => dispatch({ type: 'plan/load', templateId, items: template.items, keepCustom: false }) : null

  // ---------- navigation ----------
  const firstIncomplete = firstIncompleteStep(state, now)
  const isReachable = (step: number) => step <= firstIncomplete
  const isComplete = (step: number) => step < LAST && !stepIssue(state, step, now)
  const issue = stepIssue(state, state.step, now)
  const canSubmit = firstIncomplete === LAST && !create.isPending

  const goTo = (step: number) => {
    if (isReachable(step)) dispatch({ type: 'goTo', step })
  }
  const goNext = () => {
    if (!issue && state.step < LAST) dispatch({ type: 'goTo', step: state.step + 1 })
  }
  const goBack = () => dispatch({ type: 'goTo', step: state.step - 1 })

  // Enter = next (only when the current step is valid and focus isn't on something that uses Enter).
  const enterRef = useRef({ goNext, enabled: false })
  useEffect(() => {
    enterRef.current = { goNext, enabled: !issue && state.step < LAST }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing || e.defaultPrevented || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest(ENTER_IGNORE)) return
      if (!enterRef.current.enabled) return
      e.preventDefault()
      enterRef.current.goNext()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // On step change: move focus to the step heading and bring the stepper back into view.
  const topRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const prevStep = useRef(state.step)
  useEffect(() => {
    if (prevStep.current === state.step) return
    prevStep.current = state.step
    headingRef.current?.focus({ preventScroll: true })
    const top = topRef.current
    if (top && top.getBoundingClientRect().top < 64) top.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [state.step])

  // ---------- actions ----------
  const cancel = async () => {
    if (isDirty(state)) {
      const ok = await confirm({
        title: 'ออกจากการเสนอสินค้านี้?',
        description: 'สิ่งที่เลือกไว้ทั้งหมดจะหายไป และยังไม่มีการสร้างโปรเจกต์ใด ๆ',
        confirmLabel: 'ทิ้งข้อมูลและออก',
        cancelLabel: 'ทำต่อ',
        destructive: true,
      })
      if (!ok) return
    }
    navigate('/proposals')
  }

  const submit = async () => {
    if (!canSubmit || !state.channel || !state.shelfTypeId || !state.targetDate) return
    try {
      const created = await create.mutateAsync({
        channel: state.channel,
        productIds: state.products.map((p) => p.id),
        storeIds: state.storeIds,
        shelfTypeId: state.shelfTypeId,
        targetDate: state.targetDate,
        title: state.title.trim() || undefined,
        note: state.note.trim() || null,
        templateId,
        plan: toPlanInput(rows),
        memberIds: state.memberIds,
        status: state.status,
      })
      const draft = state.status === 'DRAFT'
      if (created.length === 1) {
        toast.success(draft ? `บันทึกร่าง ${created[0].code} แล้ว` : `สร้าง ${created[0].code} เรียบร้อย เริ่มงานได้เลย`, { description: created[0].title })
        navigate(`/proposals/${created[0].id}`, { replace: true })
      } else {
        toast.success(`สร้าง ${created.length} โปรเจกต์เรียบร้อย`, { description: created.map((p) => p.code).join(', ') })
        navigate('/proposals?view=table', { replace: true })
      }
    } catch {
      // The mutation hook already shows the error toast; stay on the review step so nothing is lost.
    }
  }

  // ---------- render ----------
  const summary = (onJump: (step: number) => void) => (
    <WizardSummary
      state={state}
      steps={steps}
      stores={stores}
      shelfType={shelfType}
      template={template}
      templateLoading={templateLoading}
      isReachable={isReachable}
      onJump={onJump}
    />
  )

  const step = (() => {
    switch (state.step) {
      case 0:
        return <StepChannel value={state.channel} onChange={(channel) => dispatch({ type: 'setChannel', channel })} />
      case 1:
        return (
          <StepProducts
            selected={state.products}
            onToggle={(product) => dispatch({ type: 'toggleProduct', product })}
            onAdd={(product) => dispatch({ type: 'addProduct', product })}
            onRemove={(id) => dispatch({ type: 'removeProduct', id })}
            onClear={() => dispatch({ type: 'clearProducts' })}
          />
        )
      case 2:
        return state.channel ? (
          <StepStores
            channel={state.channel}
            selectedIds={state.storeIds}
            onToggle={(id) => dispatch({ type: 'toggleStore', id })}
            onSetAll={(ids) => dispatch({ type: 'setStores', ids })}
          />
        ) : null
      case 3:
        return state.channel ? <StepShelf channel={state.channel} value={state.shelfTypeId} onChange={(id) => dispatch({ type: 'setShelfType', id })} /> : null
      case 4:
        return state.channel ? (
          <StepDate
            channel={state.channel}
            value={state.targetDate}
            onChange={(date) => dispatch({ type: 'setTargetDate', date })}
            template={template}
            templateLoading={templateLoading}
            stores={stores}
            rows={rows}
            planEdited={state.plan.edited}
            dispatchPlan={dispatch}
            onResetPlan={resetPlan}
          />
        ) : null
      default:
        return (
          <StepReview
            state={state}
            dispatch={dispatch}
            me={me}
            stores={stores}
            shelfType={shelfType}
            suggested={suggested}
            effectiveTemplateId={templateId}
            plan={plan}
            excludedIds={state.plan.excluded}
          />
        )
    }
  })()

  const isLast = state.step === LAST
  const nextLabel = steps[state.step + 1]?.label

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        eyebrow="การเสนอสินค้า"
        title="เสนอสินค้าใหม่"
        description="ตอบ 6 ขั้นสั้น ๆ ระบบจะสร้างโปรเจกต์พร้อมรายการงานและกำหนดวันให้อัตโนมัติ"
        actions={
          <Button type="button" variant="ghost" onClick={cancel} className="text-muted-foreground">
            <XIcon />
            ยกเลิก
          </Button>
        }
      />

      <div ref={topRef} className="scroll-mt-20">
        <WizardStepper steps={steps} current={state.step} isComplete={isComplete} isReachable={isReachable} onJump={goTo} />
      </div>

      <div className="grid flex-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby={headingId} className="@container min-w-0 space-y-5">
          <div className="space-y-1">
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none">
              {steps[state.step].title}
            </h2>
            <p className="text-sm text-muted-foreground">{steps[state.step].description}</p>
          </div>
          {step}
        </section>

        <aside className="sticky top-20 hidden max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-xl border bg-card p-2 lg:block" aria-label="สรุปสิ่งที่เลือก">
          <p className="px-2.5 pt-1.5 pb-1 text-sm font-semibold">สรุปสิ่งที่เลือก</p>
          {summary(goTo)}
        </aside>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-auto -mb-6 border-t bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        {issue && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden" aria-hidden>
            <CircleAlertIcon className="size-3.5 shrink-0 text-warning" />
            {issue}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="lg" onClick={goBack} disabled={state.step === 0}>
            <ArrowLeftIcon />
            ย้อนกลับ
          </Button>

          <Sheet open={summaryOpen} onOpenChange={setSummaryOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="lg" className="text-muted-foreground lg:hidden">
                <ListChecksIcon />
                <span className="hidden sm:inline">ดูสรุป</span>
                <span className="sr-only sm:hidden">ดูสรุปสิ่งที่เลือก</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-6">
              <SheetHeader className="pb-0">
                <SheetTitle>สรุปสิ่งที่เลือก</SheetTitle>
                <SheetDescription>แตะรายการเพื่อกลับไปแก้ไขขั้นนั้น</SheetDescription>
              </SheetHeader>
              <div className="px-2">
                {summary((s) => {
                  setSummaryOpen(false)
                  goTo(s)
                })}
              </div>
            </SheetContent>
          </Sheet>

          <p className="ml-auto hidden min-w-0 truncate text-sm text-muted-foreground sm:block" aria-live="polite">
            {issue ? (
              <span className="inline-flex items-center gap-1.5">
                <CircleAlertIcon className="size-4 shrink-0 text-warning" />
                {issue}
              </span>
            ) : !isLast ? (
              <span className="hidden items-center gap-1.5 md:inline-flex">
                กด
                <kbd className="inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-sans text-[11px] text-muted-foreground">
                  <CornerDownLeftIcon className="size-3" />
                  Enter
                </kbd>
                เพื่อไปต่อ
              </span>
            ) : null}
          </p>

          {isLast ? (
            <Button type="button" size="lg" onClick={submit} disabled={!canSubmit} className={cn('ml-auto shrink-0 sm:ml-0')}>
              {create.isPending ? <Loader2Icon className="animate-spin" /> : <RocketIcon />}
              {create.isPending ? 'กำลังสร้าง…' : state.status === 'DRAFT' ? `บันทึกร่าง ${stores.length} โปรเจกต์` : `สร้าง ${stores.length} โปรเจกต์`}
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={goNext} disabled={!!issue} className="ml-auto shrink-0 sm:ml-0">
              ถัดไป
              {nextLabel && <span className="hidden sm:inline">: {nextLabel}</span>}
              <ArrowRightIcon />
            </Button>
          )}
        </div>
      </div>

      {confirmDialog}
    </div>
  )
}
