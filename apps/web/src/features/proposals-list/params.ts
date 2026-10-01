// URL-backed state for the proposals list: every filter, the view and the sort live in
// the query string so a filtered list can be shared as a link.
import { STATUS_ORDER, type Channel, type ProposalStatus } from '@flowtrade/shared'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { ProposalFilters, ProposalListItem } from '@/api/types'
import { useAuth } from '@/auth/auth'

export type ViewMode = 'table' | 'kanban' | 'grid'
export type SortKey = 'target' | 'progress' | 'code'
export type SortDir = 'asc' | 'desc'
export type StatusFilter = ProposalStatus | 'ACTIVE' | 'ALL'
export type Scope = 'mine' | 'all'

export interface ListParams {
  q: string
  status: StatusFilter
  channel: Channel | null
  storeId: string | null
  shelfTypeId: string | null
  ownerId: string | null
  scope: Scope
  view: ViewMode
  sort: SortKey
  dir: SortDir
}

export type ListParamsPatch = Partial<ListParams>

const VIEWS: ViewMode[] = ['table', 'kanban', 'grid']
const SORTS: SortKey[] = ['target', 'progress', 'code']
const CHANNELS: Channel[] = ['OFFLINE', 'ONLINE']

/** Search-param names (kept short so links stay readable). */
const KEY: Record<keyof ListParams, string> = {
  q: 'q',
  status: 'status',
  channel: 'channel',
  storeId: 'store',
  shelfTypeId: 'shelf',
  ownerId: 'owner',
  scope: 'scope',
  view: 'view',
  sort: 'sort',
  dir: 'dir',
}

function parseStatus(value: string | null): StatusFilter {
  if (value === 'ACTIVE') return 'ACTIVE'
  return STATUS_ORDER.includes(value as ProposalStatus) ? (value as ProposalStatus) : 'ALL'
}

export function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { can } = useAuth()
  const canReadAll = can('proposal.read.all')
  const defaultScope: Scope = canReadAll ? 'all' : 'mine'

  const params = useMemo<ListParams>(() => {
    const get = (k: keyof ListParams) => searchParams.get(KEY[k])
    const channel = get('channel')
    const view = get('view')
    const sort = get('sort')
    return {
      q: get('q') ?? '',
      status: parseStatus(get('status')),
      channel: CHANNELS.includes(channel as Channel) ? (channel as Channel) : null,
      storeId: get('storeId') || null,
      shelfTypeId: get('shelfTypeId') || null,
      ownerId: get('ownerId') || null,
      // Users without proposal.read.all only ever see their own work.
      scope: canReadAll ? (get('scope') === 'mine' ? 'mine' : 'all') : 'mine',
      view: VIEWS.includes(view as ViewMode) ? (view as ViewMode) : 'table',
      sort: SORTS.includes(sort as SortKey) ? (sort as SortKey) : 'target',
      dir: get('dir') === 'desc' ? 'desc' : 'asc',
    }
  }, [searchParams, canReadAll])

  /** Merge a patch into the URL; defaults are dropped so links stay short. */
  const update = useCallback(
    (patch: ListParamsPatch) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch) as [keyof ListParams, ListParams[keyof ListParams]][]) {
            const isDefault =
              v === null ||
              v === '' ||
              (k === 'status' && v === 'ALL') ||
              (k === 'scope' && v === defaultScope) ||
              (k === 'view' && v === 'table') ||
              (k === 'sort' && v === 'target') ||
              (k === 'dir' && v === 'asc')
            if (isDefault) next.delete(KEY[k])
            else next.set(KEY[k], String(v))
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams, defaultScope],
  )

  const activeFilterCount =
    (params.q.trim() ? 1 : 0) +
    (params.status !== 'ALL' ? 1 : 0) +
    (params.channel ? 1 : 0) +
    (params.storeId ? 1 : 0) +
    (params.shelfTypeId ? 1 : 0) +
    (params.ownerId ? 1 : 0) +
    (params.scope !== defaultScope ? 1 : 0)

  /** Filters only — the view and sort are kept. */
  const clearFilters = useCallback(
    () => update({ q: '', status: 'ALL', channel: null, storeId: null, shelfTypeId: null, ownerId: null, scope: defaultScope }),
    [update, defaultScope],
  )

  const filters = useMemo<ProposalFilters>(() => {
    const f: ProposalFilters = { scope: params.scope }
    if (params.q.trim()) f.q = params.q.trim()
    if (params.status !== 'ALL') f.status = params.status
    if (params.channel) f.channel = params.channel
    if (params.storeId) f.storeId = params.storeId
    if (params.shelfTypeId) f.shelfTypeId = params.shelfTypeId
    if (params.ownerId) f.ownerId = params.ownerId
    return f
  }, [params])

  return { params, filters, update, clearFilters, activeFilterCount, canReadAll, defaultScope }
}

export type ListParamsApi = ReturnType<typeof useListParams>

export function sortProposals(items: ProposalListItem[], sort: SortKey, dir: SortDir): ProposalListItem[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    let cmp = 0
    if (sort === 'progress') cmp = a.progress.percent - b.progress.percent
    else if (sort === 'code') cmp = a.code.localeCompare(b.code)
    else cmp = a.targetDate.localeCompare(b.targetDate)
    // Stable, predictable tie-breakers: earlier launch first, then code.
    if (cmp === 0) cmp = a.targetDate.localeCompare(b.targetDate) || a.code.localeCompare(b.code)
    return cmp * sign
  })
}

export const SORT_LABEL: Record<SortKey, string> = {
  target: 'วันวางขาย',
  progress: 'ความคืบหน้า',
  code: 'รหัส',
}
