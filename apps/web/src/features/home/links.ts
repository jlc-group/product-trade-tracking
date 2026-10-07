// Where home rows lead. Buyer buttons deep-link into the presentation tab (PresentationTab handles ?do=…, §3.10).
import type { BuyerAgendaItem, HomeProject, ProductionAgendaItem, ProposalAgendaItem } from '@/api'

const proposalPath = (id: string) => `/proposals/${id}`

/** The store sheet on the presentation tab. */
export const storeHref = (p: { id: string }, storeId: string) => `${proposalPath(p.id)}?store=${storeId}`

/** PREP projects open on the task list, listed ones with production on the production tab, the rest on the presentation tab. */
export function projectHref(p: Pick<HomeProject, 'proposal' | 'phase' | 'production'>) {
  if (p.phase === 'PREP') return proposalPath(p.proposal.id)
  return `${proposalPath(p.proposal.id)}?tab=${p.phase === 'LISTED' && p.production ? 'production' : 'present'}`
}

/**
 * One click to the record / schedule dialog of the row's tracks. `stage` is what the row showed, so a track recorded
 * meanwhile is not opened in its next stage; single-store rows also open the store sheet behind the dialog.
 */
export function buyerHref(item: Pick<BuyerAgendaItem, 'proposal' | 'tracks' | 'view'>, action: 'record' | 'schedule') {
  const store = item.tracks.length === 1 ? `&store=${item.tracks[0].store.id}` : ''
  return `${proposalPath(item.proposal.id)}?tab=present&do=${action}&stage=${item.view.stage}&tracks=${item.tracks.map((t) => t.trackId).join(',')}${store}`
}

/** A buyer row itself: its store sheet, or the presentation tab for a merged row. */
export const buyerRowHref = (item: Pick<BuyerAgendaItem, 'proposal' | 'tracks'>) =>
  item.tracks.length === 1 ? storeHref(item.proposal, item.tracks[0].store.id) : `${proposalPath(item.proposal.id)}?tab=present`

/** The button of a proposal step: create dialog, the open tasks before close-out, or the presentation tab. */
export function proposalStepHref(item: Pick<ProposalAgendaItem, 'proposal' | 'action' | 'openTasks'>) {
  if (item.action === 'createPackage') return `${proposalPath(item.proposal.id)}?tab=present&create=1`
  return `${proposalPath(item.proposal.id)}?tab=${item.openTasks > 0 ? 'tasks' : 'present'}`
}

/** The production tab; confirmProduction also opens the confirm dialog (ProductionTab handles ?do=confirm). */
export function productionHref(item: Pick<ProductionAgendaItem, 'proposal' | 'action'>) {
  return `${proposalPath(item.proposal.id)}?tab=production${item.action === 'confirmProduction' ? '&do=confirm' : ''}`
}
