// "รอผลิต" API calls (/proposals/:id/production…), shaped for the hooks. The server checks the same rules as the
// dialogs (shared production.ts) and answers the proposal's whole ProductionView.
import type {
  ProductionAdvanceInput,
  ProductionBackInput,
  ProductionCancelInput,
  ProductionConfirmInput,
  ProductionDatesInput,
  ProductionPlanInput,
  ProductionQuantitiesInput,
} from '@flowtrade/shared'
import { api } from '@/api'

/** Also invalidated by presentation writes and proposal edits (a PASS, a SKU or the launch date moves the view). */
export const productionKey = (proposalId: string) => ['production', proposalId] as const

export const productionApi = {
  get: (proposalId: string) => api.production.get(proposalId),
  /** Changed rows only; `before` = the saved value the row showed (409 when someone else changed it). */
  saveQuantities: (proposalId: string, i: ProductionQuantitiesInput) => api.production.saveQuantities(proposalId, i),
  /** Changed keys only (leadDays needs the owner / a manager). */
  savePlan: (proposalId: string, i: ProductionPlanInput) => api.production.savePlan(proposalId, i),
  /** Exactly the pending set, in pendingIds order. */
  confirm: (proposalId: string, i: ProductionConfirmInput) => api.production.confirm(proposalId, i),
  advance: (proposalId: string, i: ProductionAdvanceInput) => api.production.advance(proposalId, i),
  back: (proposalId: string, productId: string, i: ProductionBackInput) => api.production.back(proposalId, productId, i),
  editDates: (proposalId: string, productId: string, i: ProductionDatesInput) => api.production.editDates(proposalId, productId, i),
  /** From PENDING = "ไม่ผลิต". */
  cancel: (proposalId: string, productId: string, i: ProductionCancelInput) => api.production.cancel(proposalId, productId, i),
  restore: (proposalId: string, productId: string) => api.production.restore(proposalId, productId),
  keep: (proposalId: string, productId: string, storeIds: string[]) => api.production.keep(proposalId, productId, { storeIds }),
}
