import {
  BadgeCheckIcon,
  ClipboardCheckIcon,
  HourglassIcon,
  InfoIcon,
  ListTreeIcon,
  LockIcon,
  MessageCircleQuestionMarkIcon,
  PackageCheckIcon,
  PlusIcon,
  PresentationIcon,
  SendIcon,
  StoreIcon,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TONE_SOFT } from './model'
import type { NextActionButton, NextActionKind, PresentationAction, PresentationModel } from './types'

const KIND_ICON: Record<NextActionKind, LucideIcon> = {
  cancelled: InfoIcon,
  locked: LockIcon,
  ready: PackageCheckIcon,
  needsInfoOverdue: MessageCircleQuestionMarkIcon,
  needsInfo: MessageCircleQuestionMarkIcon,
  awaiting: PresentationIcon,
  inReview: HourglassIcon,
  untracked: StoreIcon,
  allFinal: BadgeCheckIcon,
}

function actionIcon(action: PresentationAction, model: PresentationModel): ReactNode {
  switch (action.kind) {
    case 'create':
      return <PlusIcon />
    case 'record': {
      const stage = model.viewById.get(action.trackIds[0])?.stage
      return stage === 'IN_REVIEW' ? <ClipboardCheckIcon /> : stage === 'NEEDS_INFO' ? <SendIcon /> : <PresentationIcon />
    }
    case 'complete':
      return <BadgeCheckIcon />
    case 'goTasks':
      return <ListTreeIcon />
    default:
      return null
  }
}

function ActionButton({ button, model, onAction }: { button: NextActionButton; model: PresentationModel; onAction: (a: PresentationAction) => void }) {
  return (
    <Button variant={button.variant} className="w-full sm:w-auto" onClick={() => onAction(button.action)}>
      {actionIcon(button.action, model)}
      {button.label}
    </Button>
  )
}

/** The one thing to do now (model.next), with its single button — or, without permission, a calm note. */
export function NextActionCard({ model, onAction }: { model: PresentationModel; onAction: (a: PresentationAction) => void }) {
  const next = model.next
  const Icon = KIND_ICON[next.kind]
  const hasSide = !!(next.primary || next.secondary || next.note)

  return (
    <section aria-label="ขั้นต่อไป" className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5', TONE_SOFT[next.tone])}>
          <Icon aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground">ขั้นต่อไป</p>
          <h2 className="text-base font-semibold break-words">{next.title}</h2>
          {next.reason && <p className="text-sm break-words text-muted-foreground">{next.reason}</p>}
        </div>
        {hasSide && (
          <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:shrink-0 sm:flex-row sm:items-center">
            {next.secondary && <ActionButton button={next.secondary} model={model} onAction={onAction} />}
            {next.primary ? (
              <ActionButton button={next.primary} model={model} onAction={onAction} />
            ) : (
              next.note && <p className="text-xs text-muted-foreground sm:max-w-60 sm:text-right">{next.note}</p>
            )}
          </div>
        )}
      </div>
      {next.steps && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground sm:ml-14">{next.steps}</p>}
    </section>
  )
}
