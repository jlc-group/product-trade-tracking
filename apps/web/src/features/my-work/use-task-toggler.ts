import { useState } from 'react'
import { toast } from 'sonner'
import type { TaskWithContext } from '@/api'
import { useToggleAnyTask } from '@/api/hooks'

interface Override {
  isDone: boolean
  pending: boolean
  /** When the server confirmed the change; the override holds until newer list data arrives. */
  settledAt: number
}

/**
 * Tick / untick tasks from a list whose rows come from different proposals (Home, My tasks).
 * The checkbox flips immediately and stays flipped until the refetched list arrives, so rows
 * don't flicker back between "mutation done" and "list refreshed". Errors roll back (the hook toasts them).
 *
 * @param dataUpdatedAt the list query's `dataUpdatedAt`
 */
export function useTaskToggler(dataUpdatedAt: number) {
  const toggle = useToggleAnyTask()
  const [overrides, setOverrides] = useState<Record<string, Override>>({})

  const active = (id: string): Override | null => {
    const o = overrides[id]
    if (!o) return null
    return o.pending || dataUpdatedAt < o.settledAt ? o : null
  }

  const clear = (id: string) =>
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })

  const run = async (item: TaskWithContext, isDone: boolean, opts: { undoable?: boolean } = {}) => {
    const { undoable = true } = opts
    const id = item.task.id
    setOverrides((prev) => ({ ...prev, [id]: { isDone, pending: true, settledAt: 0 } }))
    try {
      await toggle.mutateAsync({ id, isDone, proposalId: item.proposal.id })
      setOverrides((prev) => ({ ...prev, [id]: { isDone, pending: false, settledAt: Date.now() } }))
      if (undoable) {
        toast.success(isDone ? 'ทำเครื่องหมายว่าเสร็จแล้ว' : 'ย้ายกลับเป็นงานที่ยังไม่เสร็จแล้ว', {
          description: `${item.task.title} · ${item.proposal.code}`,
          duration: 6000,
          action: { label: 'เลิกทำ', onClick: () => void run(item, !isDone, { undoable: false }) },
        })
      }
    } catch {
      clear(id)
    }
  }

  return {
    /** Effective done-state for a row (optimistic while pending). */
    isDone: (item: TaskWithContext) => active(item.task.id)?.isDone ?? item.task.isDone,
    isPending: (item: TaskWithContext) => !!overrides[item.task.id]?.pending,
    toggle: (item: TaskWithContext, isDone: boolean) => void run(item, isDone),
  }
}

export type TaskToggler = ReturnType<typeof useTaskToggler>
