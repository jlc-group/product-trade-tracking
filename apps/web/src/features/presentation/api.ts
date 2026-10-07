// The presentation track's API calls (/proposals/:id/presentation…), shaped for the hooks. The server checks the
// same rules as the dialogs (stage, permissions, gate) and answers the proposal's whole PresentationData.
import type { ISODate } from '@flowtrade/shared'
import { api, type PresentationStepInput } from '@/api'
import type { EventPatch, PresentationData, PresentationPackage, PresentationStage, StageEvent } from './types'

/** REPITCH goes up as task ids; the server snapshots the tasks itself. */
function toStepInput(event: StageEvent): PresentationStepInput {
  if (event.kind !== 'REPITCH') return event
  const { tasks, ...rest } = event
  return { ...rest, taskIds: tasks.map((t) => t.taskId) }
}

export const presentationApi = {
  get: (proposalId: string) => api.presentation.get(proposalId),

  /** Resolves the new package too: the one its first store's track points at (one track per store, ever). */
  async createPackage(
    proposalId: string,
    i: { taskIds: string[]; storeIds: string[]; meetingDate: ISODate | null; presenterIds: string[]; note: string | null },
  ): Promise<{ data: PresentationData; pkg: PresentationPackage }> {
    const data = await api.presentation.createPackage(proposalId, i)
    const packageId = data.tracks.find((t) => t.store.id === i.storeIds[0])?.packageId
    const pkg = data.packages.find((p) => p.id === packageId) ?? data.packages.reduce((a, b) => (b.seq > a.seq ? b : a))
    return { data, pkg }
  },

  /** Appends the same step(s) to every track; each must still be in `expectStage`. */
  record: (proposalId: string, i: { trackIds: string[]; expectStage: PresentationStage; events: StageEvent[] }) =>
    api.presentation.record(proposalId, { trackIds: i.trackIds, expectStage: i.expectStage, events: i.events.map(toStepInput) }),

  schedule: (proposalId: string, trackId: string, i: { meetingDate: ISODate | null; presenterIds: string[]; contactName: string | null }) =>
    api.presentation.schedule(proposalId, trackId, i),

  /** Undo the latest effective stage event (it stays in the timeline as reverted). */
  revertLast: (proposalId: string, trackId: string, targetEventId: string) => api.presentation.revert(proposalId, trackId, targetEventId),

  /** Patch an event's details; a patch that changes nothing is a no-op. */
  editEvent: (proposalId: string, trackId: string, i: { targetEventId: string; patch: EventPatch }) => api.presentation.editEvent(proposalId, trackId, i),

  /** Take an untouched store out of its package (the package goes when its last store does). */
  removeTrack: (proposalId: string, trackId: string) => api.presentation.removeTrack(proposalId, trackId),

  /** Delete a package whose stores are all untouched. */
  deletePackage: (proposalId: string, packageId: string) => api.presentation.deletePackage(proposalId, packageId),
}
