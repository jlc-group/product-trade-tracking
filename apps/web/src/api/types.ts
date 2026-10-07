import type { EventPatch, ISODate, PresentationStage, StageEvent } from '@flowtrade/shared'

export * from '@flowtrade/shared/api-types'
export type { AppNotification } from '@flowtrade/shared'

// ---------- presentation (request bodies; every call answers the proposal's whole PresentationData) ----------

/** A step as sent: REPITCH carries task ids, the server snapshots the tasks itself. */
export type PresentationStepInput =
  | Exclude<StageEvent, { kind: 'REPITCH' }>
  | { kind: 'REPITCH'; taskIds: string[]; changes: string; meetingDate: ISODate | null; presenterIds: string[] }

/** The server snapshots the tasks and stores. */
export interface CreatePresentationPackageInput {
  taskIds: string[]
  storeIds: string[]
  meetingDate: ISODate | null
  presenterIds: string[]
  note: string | null
}

export interface RecordPresentationInput {
  trackIds: string[]
  /** Every track must still be in this stage (409 otherwise). */
  expectStage: PresentationStage
  events: PresentationStepInput[]
}

export interface SchedulePresentationInput {
  meetingDate: ISODate | null
  presenterIds: string[]
  contactName: string | null
}

export interface EditPresentationEventInput {
  targetEventId: string
  patch: EventPatch
}

/** Error raised by the HTTP client from the API error envelope: { status, code, message, fields? }. */
export class ApiError extends Error {
  status: number
  code: string
  fields?: Record<string, string>
  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}
