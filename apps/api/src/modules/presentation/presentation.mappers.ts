// Rows ↔ PresentationData (packages/shared/src/presentation.ts). An event row keeps its date, REJECTED reason and
// target id in columns and every other field of the kind in `payload`; reading merges them back through parseEvent.
import { randomUUID } from 'node:crypto'
import {
  parseEvent,
  type EventKind,
  type ISODate,
  type MetaEvent,
  type PackageTask,
  type PresentationData,
  type RejectReason,
  type StageEvent,
  type StoreTrack,
  type TrackEvent,
} from '@flowtrade/shared'
import { fromDateOnly, iso, isoOrNull, toDateOnly } from '../../common/dates.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../prisma/prisma.service.js'

export const packageInclude = {
  tasks: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.PresentationPackageInclude

export const trackInclude = {
  events: { orderBy: { seq: 'asc' } },
} satisfies Prisma.PresentationTrackInclude

/** trackInclude + the package seq, for reading tracks without their packages (dashboard). */
export const trackWithSeqInclude = {
  ...trackInclude,
  package: { select: { seq: true } },
} satisfies Prisma.PresentationTrackInclude

export type PackageRow = Prisma.PresentationPackageGetPayload<{ include: typeof packageInclude }>
export type TrackRow = Prisma.PresentationTrackGetPayload<{ include: typeof trackInclude }>
export type TrackWithSeqRow = Prisma.PresentationTrackGetPayload<{ include: typeof trackWithSeqInclude }>
export type EventRow = Prisma.PresentationEventGetPayload<object>

/** Kinds whose `date` lives in the column (CHECK presentation_events_date_check). */
const DATED: ReadonlySet<EventKind> = new Set<EventKind>(['PRESENTED', 'NEEDS_INFO', 'INFO_SENT', 'PASSED', 'REJECTED', 'WITHDRAWN'])

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function toTrackEvent(row: EventRow): TrackEvent | null {
  return parseEvent({
    ...(isObject(row.payload) ? row.payload : {}),
    id: row.id,
    kind: row.kind,
    actorId: row.actorId,
    recordedAt: iso(row.recordedAt),
    ...(row.date ? { date: toDateOnly(row.date) } : {}),
    ...(row.rejectReason ? { reason: row.rejectReason } : {}),
    ...(row.targetEventId ? { targetEventId: row.targetEventId } : {}),
  })
}

export function toPresentationData(proposalId: string, packages: PackageRow[], tracks: TrackRow[]): PresentationData {
  return {
    version: 1,
    proposalId,
    packages: packages.map((p) => ({
      id: p.id,
      proposalId: p.proposalId,
      seq: p.seq,
      tasks: p.tasks.map((t) => ({ taskId: t.taskId, title: t.title, completedAt: isoOrNull(t.completedAt), fieldsFilled: t.fieldsFilled, fieldsTotal: t.fieldsTotal })),
      note: p.note,
      createdById: p.createdById,
      createdAt: iso(p.createdAt),
    })),
    tracks: tracks.map(toStoreTrack),
  }
}

export function toStoreTrack(t: TrackRow): StoreTrack {
  return {
    id: t.id,
    proposalId: t.proposalId,
    packageId: t.packageId,
    store: { id: t.storeId, name: t.storeName, shortName: t.storeShortName, color: t.storeColor },
    events: t.events.map(toTrackEvent).filter((e): e is TrackEvent => e !== null),
  }
}

/** The proposal's whole presentation, plus each track's latest event seq (the next append is seq + 1). */
export async function loadPresentation(db: Db, proposalId: string) {
  const packages = await db.presentationPackage.findMany({ where: { proposalId }, include: packageInclude, orderBy: { seq: 'asc' } })
  const tracks = await db.presentationTrack.findMany({ where: { proposalId }, include: trackInclude, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  const lastSeq = new Map(tracks.map((t) => [t.id, t.events.at(-1)?.seq ?? 0]))
  return { data: toPresentationData(proposalId, packages, tracks), lastSeq }
}

export const packageTaskRows = (tasks: PackageTask[]) =>
  tasks.map((t, i) => ({
    taskId: t.taskId,
    title: t.title,
    completedAt: t.completedAt ? new Date(t.completedAt) : null,
    fieldsFilled: t.fieldsFilled,
    fieldsTotal: t.fieldsTotal,
    sortOrder: i,
  }))

/** One new event row (fresh id); `seq` is the track's next one. */
export function eventRow(trackId: string, seq: number, event: StageEvent | MetaEvent, actorId: string, recordedAt: Date): Prisma.PresentationEventCreateManyInput {
  const { kind, ...fields } = event as { kind: EventKind } & Record<string, unknown>
  const take = (key: string) => {
    const value = fields[key]
    delete fields[key]
    return value
  }
  return {
    id: randomUUID(),
    trackId,
    seq,
    kind,
    actorId,
    recordedAt,
    date: DATED.has(kind) ? fromDateOnly(take('date') as ISODate) : null,
    rejectReason: kind === 'REJECTED' ? (take('reason') as RejectReason) : null,
    targetEventId: kind === 'REVERTED' || kind === 'EDITED' ? (take('targetEventId') as string) : null,
    payload: fields as Prisma.InputJsonObject,
  }
}
