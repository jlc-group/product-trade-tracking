import type { ISODate } from '@flowtrade/shared'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useMyTasks, useProposals } from '@/api/hooks'
import { useAuth } from '@/auth/auth'
import { today } from '@/lib/format'
import { ALL_LAYERS, bucketByDate, monthKey, parseMonth, type ChannelFilter, type DayBucket, type Layer } from './model'

export interface CalendarParams {
  month: string
  channel: ChannelFilter
  layers: Layer[]
}

/**
 * View state lives in the URL so a reload or a shared link keeps it:
 *   ?m=YYYY-MM   month shown (default: current month)
 *   ?ch=offline|online   channel filter (default: all)
 *   ?show=launches|tasks  only one layer (default: both)
 */
export function useCalendarParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const month = parseMonth(searchParams.get('m')) ?? monthKey(today())
  const ch = searchParams.get('ch')
  const channel: ChannelFilter = ch === 'offline' ? 'OFFLINE' : ch === 'online' ? 'ONLINE' : 'ALL'
  const show = searchParams.get('show')
  const layers: Layer[] = show === 'launches' || show === 'tasks' ? [show] : ALL_LAYERS

  const update = useCallback(
    (patch: Partial<CalendarParams>) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (patch.month !== undefined) next.set('m', patch.month)
          if (patch.channel !== undefined) {
            if (patch.channel === 'ALL') next.delete('ch')
            else next.set('ch', patch.channel.toLowerCase())
          }
          if (patch.layers !== undefined) {
            if (patch.layers.length === 1) next.set('show', patch.layers[0])
            else next.delete('show')
          }
          return next
        },
        { replace: true },
      ),
    [setSearchParams],
  )

  return { month, channel, layers, update }
}

/** Launches (proposal target dates) + my tasks (due dates), filtered and bucketed per day. */
export function useCalendarData(channel: ChannelFilter, layers: Layer[]) {
  const { can } = useAuth()
  const proposals = useProposals({ scope: can('proposal.read.all') ? 'all' : 'mine', status: 'ALL' })
  const tasks = useMyTasks({ status: 'all' })
  const todayDate = today()
  const showLaunches = layers.includes('launches')
  const showTasks = layers.includes('tasks')

  const buckets = useMemo<Map<ISODate, DayBucket>>(() => {
    const launches = showLaunches ? (proposals.data ?? []).filter((p) => channel === 'ALL' || p.channel === channel) : []
    const mine = showTasks ? (tasks.data ?? []).filter((t) => channel === 'ALL' || t.proposal.channel === channel) : []
    return bucketByDate(launches, mine, todayDate)
  }, [proposals.data, tasks.data, channel, showLaunches, showTasks, todayDate])

  return {
    buckets,
    isLoading: proposals.isLoading || tasks.isLoading,
    error: proposals.error ?? tasks.error,
    refetch: () => {
      void proposals.refetch()
      void tasks.refetch()
    },
  }
}
