// TanStack Query hooks of the presentation track (API: ./api.ts). Every write answers the whole PresentationData,
// which goes straight into the cache.
import { can, workUnits, type ISODate, type Task, type User } from '@flowtrade/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'
import type { ProposalDetail } from '@/api'
import { errorMessage, qk, useChangeProposalStatus, useTasks, useUserLookup } from '@/api/hooks'
import { useCurrentUser } from '@/auth/auth'
import { productionKey } from '@/features/production/api'
import { storeWord } from '@/features/proposal-detail/utils'
import { today } from '@/lib/format'
import { presentationApi } from './api'
import { buildViews, canStartPresentation, headerLine, nextAction, stageItems, summarize } from './model'
import { canFinalizePresentation, canRecordPresentation } from './permissions'
import type { EventPatch, PresentationData, PresentationModel, PresentationStage, PresentationSummaryState, StageEvent } from './types'

export type { PresentationModel, PresentationSummaryState } from './types'

export const presentationKey = (proposalId: string) => ['presentation', proposalId] as const

/** The raw blob (packages + store tracks with their events, oldest first). */
export const usePresentation = (proposalId: string) => useQuery({ queryKey: presentationKey(proposalId), queryFn: () => presentationApi.get(proposalId) })

/** Cheap summary (no tasks query): header line, tab count, ready banner, proposal actions. */
export function usePresentationSummary(proposal: ProposalDetail): PresentationSummaryState {
  const { data } = usePresentation(proposal.id)
  return useMemo(() => {
    const views = buildViews(data, proposal)
    const summary = summarize(views, proposal)
    const gateOpen = canStartPresentation(proposal.progress)
    const word = storeWord(proposal.channel)
    // No data yet (loading, or the read failed): the banner, header line, tab count and soft check wait.
    return { ...summary, isLoading: !data, gateOpen, views, items: stageItems(proposal, views), header: headerLine(summary, gateOpen, word, proposal.status), storeWord: word }
  }, [data, proposal])
}

const byDue = (a: ISODate | null, b: ISODate | null) => (a ?? '9999-12-31').localeCompare(b ?? '9999-12-31')

/** Everything the tab and the sheet render: views, summary, next action, gate, task flags, permissions. */
export function usePresentationModel(proposal: ProposalDetail): PresentationModel {
  const me = useCurrentUser()
  const { data, isPending, isError, refetch } = usePresentation(proposal.id)
  const { data: tasks, isPending: tasksPending, isError: tasksError, refetch: refetchTasks } = useTasks(proposal.id)
  const { data: lookup } = useUserLookup()
  const todayStr = today()

  return useMemo<PresentationModel>(() => {
    const word = storeWord(proposal.channel)
    const views = buildViews(data, proposal)
    const summary = summarize(views, proposal)
    const gateOpen = canStartPresentation(proposal.progress)
    const progress = { done: proposal.progress.done, total: proposal.progress.total }
    const canRecord = canRecordPresentation(me, proposal)
    const canFinalize = canFinalizePresentation(me, proposal)

    const usersById = new Map<string, User>()
    for (const u of [proposal.owner, ...proposal.members, me, ...(lookup ?? [])]) usersById.set(u.id, u)
    const userName = (id: string | null | undefined) => {
      if (!id) return '—'
      const u = usersById.get(id)
      return u ? u.nickname || u.name : 'ไม่ทราบชื่อ'
    }

    const all = tasks ?? []
    const pickableIds = new Set([proposal.ownerId, ...proposal.memberIds, ...all.flatMap((t) => t.assigneeIds)])
    for (const u of lookup ?? []) if (can(u, 'proposal.read.all')) pickableIds.add(u.id)
    const doneLevel1Tasks = all.filter((t) => t.level === 1 && t.isDone).sort((a, b) => a.sortOrder - b.sortOrder)
    // What still blocks the prep gate: open work units (leaves, and parents whose own table isn't full yet).
    const openLeafTasks = workUnits(all)
      .filter((u) => !u.done)
      .map((u) => u.task)
      .sort((a, b) => byDue(a.dueDate, b.dueDate) || a.sortOrder - b.sortOrder)

    // Bundled tasks (package snapshots + the latest re-pitch of each store) that were reopened or deleted since.
    const bundled = new Set<string>()
    for (const p of data?.packages ?? []) for (const t of p.tasks) bundled.add(t.taskId)
    for (const v of views) for (const t of v.bundle) bundled.add(t.taskId)
    const reopenedTaskIds = new Set<string>()
    const deletedTaskIds = new Set<string>()
    if (tasks) {
      const byId = new Map(tasks.map((t) => [t.id, t]))
      for (const id of bundled) {
        const t = byId.get(id)
        if (!t) deletedTaskIds.add(id)
        else if (!t.isDone) reopenedTaskIds.add(id)
      }
    }

    return {
      isLoading: isPending || tasksPending,
      isError: isError || tasksError,
      refetch: () => {
        void refetch()
        void refetchTasks()
      },
      data,
      views,
      summary,
      items: stageItems(proposal, views),
      next: nextAction({ views, summary, status: proposal.status, gateOpen, progress, canRecord, canFinalize, word, today: todayStr, userName }),
      header: headerLine(summary, gateOpen, word, proposal.status),
      gateOpen,
      progress,
      packages: [...(data?.packages ?? [])].sort((a, b) => a.seq - b.seq),
      doneLevel1Tasks,
      openLeafTasks,
      tasks: all,
      reopenedTaskIds,
      deletedTaskIds,
      canRecord,
      canFinalize,
      storeWord: word,
      productCount: proposal.productIds.length,
      proposal,
      me,
      today: todayStr,
      userName,
      usersById,
      pickableIds,
      viewById: new Map(views.map((v) => [v.track.id, v])),
      viewByStore: new Map(views.map((v) => [v.store.id, v])),
    }
  }, [proposal, me, data, tasks, lookup, todayStr, isPending, tasksPending, isError, tasksError, refetch, refetchTasks])
}

/** Set the proposal COMPLETED ("ตั้งโปรเจกต์เป็นเสร็จสิ้น"); resolves false when it failed (already toasted). */
export function useCloseOut(proposal: ProposalDetail) {
  const changeStatus = useChangeProposalStatus()
  const closeOut = async () => {
    try {
      await changeStatus.mutateAsync({ id: proposal.id, status: 'COMPLETED' })
      return true
    } catch {
      return false
    }
  }
  return { closeOut, isPending: changeStatus.isPending }
}

// ---------- mutations ----------

/**
 * onSuccess puts the returned blob in the cache (and refreshes the activity log the server wrote);
 * onError toasts the server's message and refetches. Not only the presentation: many refusals come from a stale
 * proposal or task list (prep gate, a bundled task reopened, a store / SKU left the proposal, removed from the
 * team), so those are reloaded too and the dialogs, gate and permissions catch up. mutateAsync rejects only once
 * the refetches are done, so a dialog's catch already sees the fresh data.
 */
function usePresentationWrite<TVars, TResult>(
  proposal: ProposalDetail,
  run: (vars: TVars) => Promise<TResult>,
  dataOf: (result: TResult) => PresentationData,
) {
  const qc = useQueryClient()
  const key = presentationKey(proposal.id)
  return useMutation({
    mutationFn: (vars: TVars) => run(vars),
    onSuccess: async (result) => {
      // A read that started before this write would land older data on top of it.
      await qc.cancelQueries({ queryKey: key })
      qc.setQueryData(key, dataOf(result))
      void qc.invalidateQueries({ queryKey: ['activity'] })
      // Home agenda / project stages, the sidebar badge, Monitor and the proposal list read the tracks too.
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      void qc.invalidateQueries({ queryKey: ['proposals', 'list'] })
      // A PASS recorded / reverted / edited changes which SKUs wait for production.
      void qc.invalidateQueries({ queryKey: productionKey(proposal.id) })
    },
    onError: async (error) => {
      toast.error(errorMessage(error))
      await Promise.all([
        qc.invalidateQueries({ queryKey: key }),
        qc.invalidateQueries({ queryKey: qk.proposal(proposal.id) }),
        qc.invalidateQueries({ queryKey: qk.tasks(proposal.id) }),
      ])
    },
  })
}

export interface CreatePackageVars {
  /** Level-1 tasks to bundle (sent as ids; the server snapshots them). */
  tasks: Task[]
  /** Kept in the proposal's store order. */
  storeIds: string[]
  meetingDate: ISODate | null
  presenterIds: string[]
  note: string | null
}

/** Resolves { data, pkg }. */
export function useCreatePackage(proposal: ProposalDetail) {
  return usePresentationWrite(
    proposal,
    (v: CreatePackageVars) =>
      presentationApi.createPackage(proposal.id, {
        taskIds: v.tasks.map((t) => t.id),
        storeIds: v.storeIds,
        meetingDate: v.meetingDate,
        presenterIds: v.presenterIds,
        note: v.note,
      }),
    (r) => r.data,
  )
}

export interface RecordStepVars {
  trackIds: string[]
  /** Stage the dialog was opened in; a store that moved meanwhile fails with err.stale. */
  expectStage: PresentationStage
  /** From buildStepEvents(), or a single WITHDRAWN / REPITCH event (REPITCH tasks go up as ids). */
  events: StageEvent[]
}

/** Present / outcome / info sent / withdraw / re-pitch. */
export function useRecordStep(proposal: ProposalDetail) {
  return usePresentationWrite(proposal, (v: RecordStepVars) => presentationApi.record(proposal.id, v), (r) => r)
}

export interface ScheduleVars {
  trackId: string
  meetingDate: ISODate | null
  presenterIds: string[]
  contactName: string | null
}

export function useScheduleTrack(proposal: ProposalDetail) {
  return usePresentationWrite(
    proposal,
    (v: ScheduleVars) => presentationApi.schedule(proposal.id, v.trackId, { meetingDate: v.meetingDate, presenterIds: v.presenterIds, contactName: v.contactName }),
    (r) => r,
  )
}

/** targetEventId must be the track's lastRevertable. */
export function useRevertLast(proposal: ProposalDetail) {
  return usePresentationWrite(proposal, (v: { trackId: string; targetEventId: string }) => presentationApi.revertLast(proposal.id, v.trackId, v.targetEventId), (r) => r)
}

/** patch from diffPatch() / stepPatch(); an empty patch is a no-op. */
export function useEditEvent(proposal: ProposalDetail) {
  return usePresentationWrite(
    proposal,
    (v: { trackId: string; targetEventId: string; patch: EventPatch }) => presentationApi.editEvent(proposal.id, v.trackId, { targetEventId: v.targetEventId, patch: v.patch }),
    (r) => r,
  )
}

export function useRemoveTrack(proposal: ProposalDetail) {
  return usePresentationWrite(proposal, (v: { trackId: string }) => presentationApi.removeTrack(proposal.id, v.trackId), (r) => r)
}

export function useDeletePackage(proposal: ProposalDetail) {
  return usePresentationWrite(proposal, (v: { packageId: string }) => presentationApi.deletePackage(proposal.id, v.packageId), (r) => r)
}
