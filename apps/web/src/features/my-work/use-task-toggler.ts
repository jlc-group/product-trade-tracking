import { useState } from 'react'
import type { TaskRowItem } from '@/api'
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

  const run = async (item: TaskRowItem, isDone: boolean) => {
    const id = item.task.id
    setOverrides((prev) => ({ ...prev, [id]: { isDone, pending: true, settledAt: 0 } }))
    try {
      await toggle.mutateAsync({ id, isDone, proposalId: item.proposal.id })
      setOverrides((prev) => ({ ...prev, [id]: { isDone, pending: false, settledAt: Date.now() } }))
    } catch {
      clear(id)
    }
  }

  return {
    /** Effective done-state for a row (optimistic while pending). */
    isDone: (item: TaskRowItem) => active(item.task.id)?.isDone ?? item.task.isDone,
    isPending: (item: TaskRowItem) => !!overrides[item.task.id]?.pending,
    toggle: (item: TaskRowItem, isDone: boolean) => void run(item, isDone),
  }
}

export type TaskToggler = ReturnType<typeof useTaskToggler>
