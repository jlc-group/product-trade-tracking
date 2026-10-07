// TanStack Query hooks of the "รอผลิต" tab (API: ./api.ts). Every write answers the whole ProductionView, which goes
// straight into the cache. The quantity drafts (sessionStorage) live here too.
import {
  canEditQuantity,
  deriveProduction,
  formatQty,
  PRODUCTION_LEAD_DAYS_DEFAULT,
  productionPerms,
  storeWord,
  type ISODate,
  type ProductionAdvanceInput,
  type ProductionConfirmInput,
  type ProductionDatesInput,
  type ProductionEvent,
  type ProductionPlanInput,
  type ProductionQuantitiesInput,
  type ProductionRow,
  type ProductionTrackView,
  type ProductionView,
  type User,
} from '@flowtrade/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ProposalDetail } from '@/api'
import { errorMessage, qk, useUserLookup } from '@/api/hooks'
import { useCurrentUser } from '@/auth/auth'
import { presentationKey } from '@/features/presentation/hooks'
import { today } from '@/lib/format'
import { productionApi, productionKey } from './api'
import { draftError, draftValue, impactText, productionImpact, readDrafts, savedQty, writeDrafts } from './model'
import type { DraftsModel, ProductionModel, QtyDraft, QtyDrafts } from './types'

export { productionKey }
export type { ProductionModel }

export const useProduction = (proposalId: string) => useQuery({ queryKey: productionKey(proposalId), queryFn: () => productionApi.get(proposalId) })

/** Cheap read for the header line, the tab pill and the proposal actions: same query, no users / permissions. */
export function useProductionSummary(proposalId: string) {
  const { data } = useProduction(proposalId)
  return { isLoading: !data, summary: data?.summary ?? null }
}

/** Summary of nothing passed yet (shown only until the view arrives). */
function emptySummary(targetDate: ISODate, todayStr: ISODate) {
  return deriveProduction({ productIds: [], targetDate, leadDays: PRODUCTION_LEAD_DAYS_DEFAULT, views: [], items: [] }, todayStr).summary
}

/** Everything the tab renders: rows, summary, permissions, names. */
export function useProductionModel(proposal: ProposalDetail): ProductionModel {
  const me = useCurrentUser()
  const { data, isPending, isError, refetch } = useProduction(proposal.id)
  const { data: lookup } = useUserLookup()
  const todayStr = today()

  return useMemo<ProductionModel>(() => {
    const { canWork, canDecide } = productionPerms(me, proposal)
    const usersById = new Map<string, User>()
    for (const u of [proposal.owner, ...proposal.members, me, ...(lookup ?? [])]) usersById.set(u.id, u)
    const userName = (id: string | null | undefined) => {
      if (!id) return '—'
      const u = usersById.get(id)
      return u ? u.nickname || u.name : 'ไม่ทราบชื่อ'
    }
    const all = data?.rows ?? []
    const events = new Map<string, ProductionEvent[]>()
    for (const e of data?.events ?? []) {
      if (!e.productId) continue
      const list = events.get(e.productId)
      if (list) list.push(e)
      else events.set(e.productId, [e])
    }
    return {
      isLoading: isPending,
      isError,
      refetch: () => void refetch(),
      view: data,
      rows: all.filter((r) => r.status !== 'CANCELLED'),
      cancelledRows: all.filter((r) => r.status === 'CANCELLED'),
      summary: data?.summary ?? emptySummary(proposal.targetDate, todayStr),
      canWork,
      canDecide,
      storeWord: storeWord(proposal.channel),
      today: data?.today ?? todayStr,
      targetDate: data?.targetDate ?? proposal.targetDate,
      proposal,
      me,
      userName,
      rowById: new Map(all.map((r) => [r.productId, r])),
      eventsOf: (productId) => events.get(productId) ?? [],
    }
  }, [proposal, me, data, lookup, todayStr, isPending, isError, refetch])
}

/** What reverting / editing a PASS would do to production (K29); null when nothing changes or the view isn't loaded. */
export function useProductionImpact(proposal: Pick<ProposalDetail, 'id' | 'productIds'>) {
  const qc = useQueryClient()
  return (before: ProductionTrackView[], after: ProductionTrackView[]) => {
    const view = qc.getQueryData<ProductionView>(productionKey(proposal.id))
    return view ? impactText(productionImpact(view, proposal.productIds, before, after)) : null
  }
}

// ---------- quantity drafts ----------

const isDirty = (d: QtyDraft) => draftValue(d.text) !== d.saved

/**
 * Unsaved quantities of the tab, kept in sessionStorage so they survive tab switches and reloads. A draft typed
 * against a row that has moved since (status or saved value), is no longer shown, or this viewer may not edit any
 * more is dropped (K25); the server's `before` check is the backstop.
 */
export function useQuantityDrafts(model: ProductionModel): DraftsModel {
  const proposalId = model.proposal.id
  const [raw, setRaw] = useState<QtyDrafts>(() => readDrafts(proposalId))
  const [attempted, setAttempted] = useState(false)
  const { view, rowById, rows, canWork, canDecide } = model

  const live = useMemo(() => {
    if (!view) return {}
    const out: QtyDrafts = {}
    for (const [id, d] of Object.entries(raw)) {
      const row = rowById.get(id)
      if (!row || row.status !== d.status || savedQty(row) !== d.saved || !canEditQuantity(row.status, { canWork, canDecide })) continue
      out[id] = d
    }
    return out
  }, [raw, view, rowById, canWork, canDecide])

  useEffect(() => {
    if (view) writeDrafts(proposalId, live)
  }, [proposalId, view, live])

  return useMemo<DraftsModel>(() => {
    const draftOf = (row: ProductionRow) => live[row.productId]
    const errorOf = (row: ProductionRow) => {
      const d = draftOf(row)
      return d && isDirty(d) ? draftError(row, d.text) : null
    }
    const confirmQty = (row: ProductionRow) => {
      const d = draftOf(row)
      const v = d ? draftValue(d.text) : undefined
      if (typeof v === 'number') return v
      // A cleared input counts as missing even when a quantity was saved before.
      if (v === null && d && isDirty(d)) return null
      return savedQty(row)
    }
    const dirtyRows = rows.filter((r) => {
      const d = draftOf(r)
      return !!d && isDirty(d)
    })
    const pending = rows.filter((r) => r.status === 'PENDING')
    return {
      textOf: (row) => draftOf(row)?.text ?? (savedQty(row) != null ? formatQty(savedQty(row)!) : ''),
      setText: (row, text) => setRaw((prev) => ({ ...prev, [row.productId]: { text, status: row.status, saved: savedQty(row) } })),
      settle: (row) => {
        const d = draftOf(row)
        if (!d) return
        const v = draftValue(d.text)
        if (v === d.saved)
          setRaw((prev) => {
            const next = { ...prev }
            delete next[row.productId]
            return next
          })
        else if (typeof v === 'number' && d.text !== formatQty(v)) setRaw((prev) => ({ ...prev, [row.productId]: { ...d, text: formatQty(v) } }))
      },
      errorOf,
      isDirty: (productId) => dirtyRows.some((r) => r.productId === productId),
      dirtyRows,
      invalidCount: dirtyRows.filter((r) => errorOf(r)).length,
      clear: (ids) =>
        setRaw((prev) => {
          if (!ids) return {}
          const next = { ...prev }
          for (const id of ids) delete next[id]
          return next
        }),
      confirmQty,
      missingRows: pending.filter((r) => confirmQty(r) == null),
      invalidPendingRows: pending.filter((r) => errorOf(r) !== null),
      attempted,
      setAttempted,
    }
  }, [live, rows, attempted])
}

// ---------- mutations ----------

/**
 * onSuccess puts the returned view in the cache (and refreshes the activity log, home and notifications the server
 * wrote); onError toasts the server's message and refetches the view, the proposal and the presentation (a 409 usually
 * means a PASS, a SKU or another teammate moved things), so a dialog's catch already sees the fresh data.
 */
function useProductionWrite<TVars>(proposal: ProposalDetail, run: (vars: TVars) => Promise<ProductionView>, onWritten?: (before: ProductionView | undefined, after: ProductionView) => void) {
  const qc = useQueryClient()
  const key = productionKey(proposal.id)
  return useMutation({
    mutationFn: (vars: TVars) => run(vars),
    onSuccess: async (view) => {
      // A read that started before this write would land older data on top of it.
      await qc.cancelQueries({ queryKey: key })
      const before = qc.getQueryData<ProductionView>(key)
      qc.setQueryData(key, view)
      onWritten?.(before, view)
      void qc.invalidateQueries({ queryKey: ['activity'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      void qc.invalidateQueries({ queryKey: qk.notifications })
    },
    onError: async (error) => {
      toast.error(errorMessage(error))
      await Promise.all([
        qc.invalidateQueries({ queryKey: key }),
        qc.invalidateQueries({ queryKey: qk.proposal(proposal.id) }),
        qc.invalidateQueries({ queryKey: presentationKey(proposal.id) }),
      ])
    },
  })
}

export function useSaveQuantities(proposal: ProposalDetail) {
  return useProductionWrite(proposal, (v: ProductionQuantitiesInput) => productionApi.saveQuantities(proposal.id, v))
}

export function useSavePlan(proposal: ProposalDetail) {
  return useProductionWrite(proposal, (v: ProductionPlanInput) => productionApi.savePlan(proposal.id, v))
}

export function useConfirmProduction(proposal: ProposalDetail) {
  return useProductionWrite(proposal, (v: ProductionConfirmInput) => productionApi.confirm(proposal.id, v))
}

/** Toasts "ส่งเข้าคลัง/ห้างครบทุก SKU แล้ว" when this write delivered the last SKU. */
export function useAdvanceProduction(proposal: ProposalDetail) {
  return useProductionWrite(
    proposal,
    (v: ProductionAdvanceInput) => productionApi.advance(proposal.id, v),
    (before, after) => {
      if (before?.summary.state === 'DONE' || after.summary.state !== 'DONE') return
      // Deferred past the dialog's own success toast so this one lands on top.
      setTimeout(() => toast.success(`ส่งเข้าคลัง/${storeWord(proposal.channel)}ครบทุก SKU แล้ว`), 0)
    },
  )
}

export function useBackProduction(proposal: ProposalDetail) {
  return useProductionWrite(proposal, (v: { productId: string; from: 'IN_PRODUCTION' | 'PRODUCED' | 'DELIVERED' }) => productionApi.back(proposal.id, v.productId, { from: v.from }))
}

export function useEditProductionDates(proposal: ProposalDetail) {
  return useProductionWrite(proposal, (v: { productId: string; input: ProductionDatesInput }) => productionApi.editDates(proposal.id, v.productId, v.input))
}

export function useCancelProduction(proposal: ProposalDetail) {
  return useProductionWrite(proposal, (v: { productId: string; reason: string; from: 'PENDING' | 'IN_PRODUCTION' | 'PRODUCED' }) =>
    productionApi.cancel(proposal.id, v.productId, { reason: v.reason, from: v.from }),
  )
}

export function useRestoreProduction(proposal: ProposalDetail) {
  return useProductionWrite(proposal, (v: { productId: string }) => productionApi.restore(proposal.id, v.productId))
}

export function useKeepProduction(proposal: ProposalDetail) {
  return useProductionWrite(proposal, (v: { productId: string; storeIds: string[] }) => productionApi.keep(proposal.id, v.productId, v.storeIds))
}
