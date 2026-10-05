// State of the new-proposal wizard: one reducer, pure helpers for validation and derived values.
import { autoProposalTitle, CHANNEL_TERMS, isLaunchDate, LAUNCH_DAY_OF_MONTH, PREP_DAYS, type Channel, type ISODate, type Product, type Store } from '@flowtrade/shared'
import { initialPlanState, planReducer, type PlanAction, type PlanState } from './plan-state'

export type ProposalStartStatus = 'DRAFT' | 'IN_PROGRESS'

/** 'auto' = follow the suggested template; 'none' = start with an empty task list. */
export type TemplateChoice = { kind: 'auto' } | { kind: 'none' } | { kind: 'id'; id: string }

export interface WizardState {
  step: number
  channel: Channel | null
  /** Kept as objects so chips/summary still show products that the current search filters out. */
  products: Product[]
  storeIds: string[]
  shelfTypeId: string | null
  targetDate: ISODate | null
  template: TemplateChoice
  /** The editable task list (template items + tasks the user typed), dates relative to targetDate. */
  plan: PlanState
  title: string
  note: string
  memberIds: string[]
  status: ProposalStartStatus
}

export const initialWizardState: WizardState = {
  step: 0,
  channel: null,
  products: [],
  storeIds: [],
  shelfTypeId: null,
  targetDate: null,
  template: { kind: 'auto' },
  plan: initialPlanState,
  title: '',
  note: '',
  memberIds: [],
  status: 'IN_PROGRESS',
}

export type WizardAction =
  | { type: 'goTo'; step: number }
  | { type: 'setChannel'; channel: Channel }
  | { type: 'toggleProduct'; product: Product }
  | { type: 'addProduct'; product: Product }
  | { type: 'removeProduct'; id: string }
  | { type: 'clearProducts' }
  | { type: 'toggleStore'; id: string }
  | { type: 'setStores'; ids: string[] }
  | { type: 'setShelfType'; id: string }
  | { type: 'setTargetDate'; date: ISODate | null }
  | { type: 'setTemplate'; choice: TemplateChoice }
  | { type: 'setTitle'; title: string }
  | { type: 'setNote'; note: string }
  | { type: 'setMembers'; ids: string[] }
  | { type: 'setStatus'; status: ProposalStartStatus }
  | PlanAction

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'goTo':
      return { ...state, step: Math.max(0, Math.min(STEP_COUNT - 1, action.step)) }
    case 'setChannel':
      if (state.channel === action.channel) return state
      // Stores, shelf types and templates all belong to a channel — start those choices over.
      return { ...state, channel: action.channel, storeIds: [], shelfTypeId: null, template: { kind: 'auto' }, plan: initialPlanState }
    case 'toggleProduct':
      return state.products.some((p) => p.id === action.product.id)
        ? { ...state, products: state.products.filter((p) => p.id !== action.product.id) }
        : { ...state, products: [...state.products, action.product] }
    case 'addProduct':
      return state.products.some((p) => p.id === action.product.id) ? state : { ...state, products: [...state.products, action.product] }
    case 'removeProduct':
      return { ...state, products: state.products.filter((p) => p.id !== action.id) }
    case 'clearProducts':
      return { ...state, products: [] }
    case 'toggleStore':
      return {
        ...state,
        storeIds: state.storeIds.includes(action.id) ? state.storeIds.filter((id) => id !== action.id) : [...state.storeIds, action.id],
      }
    case 'setStores':
      return { ...state, storeIds: action.ids }
    case 'setShelfType':
      return { ...state, shelfTypeId: action.id }
    case 'setTargetDate':
      return { ...state, targetDate: action.date }
    case 'setTemplate':
      // The plan reloads from the new template (typed tasks are kept) — see NewProposalWizard.
      return { ...state, template: action.choice }
    case 'setTitle':
      return { ...state, title: action.title }
    case 'setNote':
      return { ...state, note: action.note }
    case 'setMembers':
      return { ...state, memberIds: action.ids }
    case 'setStatus':
      return { ...state, status: action.status }
    default:
      return { ...state, plan: planReducer(state.plan, action) }
  }
}

// ---------- steps ----------

export const STEP_COUNT = 6

export interface StepInfo {
  label: string
  title: string
  description: string
}

export function getSteps(channel: Channel | null): StepInfo[] {
  const terms = CHANNEL_TERMS[channel ?? 'OFFLINE']
  const storeLabel = channel ? terms.store : 'ห้าง / แพลตฟอร์ม'
  const shelfLabel = channel ? terms.shelf : 'ประเภท Shelf'
  const dateLabel = channel ? terms.date : 'วันที่วางขาย'
  const verb = dateLabel.replace(/^วันที่/, '')
  return [
    { label: 'ช่องทาง', title: 'จะเสนอสินค้าผ่านช่องทางไหน', description: 'ช่องทางกำหนดว่าจะเลือกห้างหรือแพลตฟอร์ม และใช้แม่แบบงานแบบไหน' },
    { label: 'สินค้า', title: 'เลือกสินค้าที่จะเสนอ', description: 'เลือกได้หลายรายการ ถ้ายังไม่มีในระบบ เพิ่มสินค้าใหม่ได้ทันที' },
    { label: storeLabel, title: channel === 'ONLINE' ? 'เลือกแพลตฟอร์มที่จะลงขาย' : 'เลือกห้างที่จะนำสินค้าเข้า', description: `ระบบจะแนะนำแม่แบบงานจาก${channel === 'ONLINE' ? 'แพลตฟอร์ม' : 'ห้าง'}แรกที่เลือก` },
    { label: shelfLabel, title: `เลือก${shelfLabel}`, description: 'ประเภทที่ต่างกันจะใช้ขั้นตอนและระยะเวลาเตรียมงานต่างกัน' },
    {
      label: dateLabel,
      title: `เลือกเดือน${verb}และดูไทม์ไลน์เตรียมงาน`,
      description: `${dateLabel}คือวันที่ ${LAUNCH_DAY_OF_MONTH} ของเดือนที่เลือกเสมอ ระบบนับย้อนหลัง ${PREP_DAYS} วันให้ว่าต้องเริ่มเตรียมวันไหน แล้ววางทุกงานพร้อมแผนกที่รับผิดชอบให้อัตโนมัติ`,
    },
    { label: 'ตรวจสอบและสร้าง', title: 'ตรวจสอบรายการงานและสร้างโปรเจกต์', description: 'ตรวจรายการงานทั้งหมด ตัดงานที่ไม่ต้องใช้ และเพิ่มทีมงานได้ก่อนกดสร้าง' },
  ]
}

/** Why the user can't leave `step` yet (null = valid). */
export function stepIssue(state: WizardState, step: number, today: ISODate): string | null {
  const terms = CHANNEL_TERMS[state.channel ?? 'OFFLINE']
  switch (step) {
    case 0:
      return state.channel ? null : 'เลือกช่องทางก่อน แล้วค่อยไปขั้นถัดไป'
    case 1:
      return state.products.length > 0 ? null : 'เลือกสินค้าอย่างน้อย 1 รายการ'
    case 2:
      return state.storeIds.length > 0 ? null : `เลือก${state.channel === 'ONLINE' ? 'แพลตฟอร์ม' : 'ห้าง'}อย่างน้อย 1 แห่ง`
    case 3:
      return state.shelfTypeId ? null : `เลือก${terms.shelf} 1 แบบ`
    case 4: {
      const verb = terms.date.replace(/^วันที่/, '')
      if (!state.targetDate) return `เลือกเดือน${verb}`
      if (!isLaunchDate(state.targetDate)) return `${terms.date}ต้องเป็นวันที่ ${LAUNCH_DAY_OF_MONTH} ของเดือน — เลือกเดือนใหม่อีกครั้ง`
      return state.targetDate < today ? `วันที่ ${LAUNCH_DAY_OF_MONTH} ของเดือนนี้ผ่านไปแล้ว เลือกเดือนถัดไป` : null
    }
    default:
      return null
  }
}

/** First step that still needs input; steps after it are locked. */
export function firstIncompleteStep(state: WizardState, today: ISODate): number {
  for (let i = 0; i < STEP_COUNT - 1; i++) if (stepIssue(state, i, today)) return i
  return STEP_COUNT - 1
}

export function isDirty(state: WizardState) {
  return !!state.channel || state.products.length > 0 || !!state.targetDate || !!state.title.trim() || !!state.note.trim() || state.memberIds.length > 0
}

/** The title the server generates when none is given. */
export function autoTitle(products: Pick<Product, 'name'>[], stores: Pick<Store, 'name'>[]) {
  return autoProposalTitle(
    products.map((p) => p.name),
    stores.map((s) => s.name),
  )
}

/** Resolves the template choice against the server suggestion. */
export function effectiveTemplateId(choice: TemplateChoice, suggestedId: string | null | undefined): string | null {
  if (choice.kind === 'none') return null
  if (choice.kind === 'id') return choice.id
  return suggestedId ?? null
}
