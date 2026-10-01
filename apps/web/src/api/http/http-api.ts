// HTTP client of the FlowTrade API (apps/api, NestJS + PostgreSQL) — the app's only data source.
// Routes follow apps/api/ENDPOINTS.md; `Api` (bottom) is the contract the hooks are typed against.
import type {
  AppNotification,
  Channel,
  Department,
  Product,
  Progress,
  Proposal,
  ProposalStatus,
  ShelfType,
  Store,
  Task,
  TaskTemplate,
  User,
} from '@flowtrade/shared'
import {
  ApiError,
  type ActivityWithActor,
  type CommentWithAuthor,
  type CreateProposalInput,
  type CreateTaskInput,
  type DepartmentInput,
  type DashboardSummary,
  type HomeSummary,
  type MoveTaskInput,
  type MyTasksFilters,
  type ProductInput,
  type ProposalDetail,
  type ProposalFilters,
  type ProposalListItem,
  type ShelfTypeInput,
  type StoreInput,
  type TaskWithContext,
  type TemplateInput,
  type TemplatePreviewItem,
  type UpdateProposalInput,
  type UpdateTaskInput,
  type UserInput,
} from '../types'

// ---------- transport ----------

const FALLBACK_MESSAGE = 'เกิดข้อผิดพลาด กรุณาลองใหม่'
const NETWORK_MESSAGE = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบว่า API ทำงานอยู่'

const envUrl: unknown = import.meta.env.VITE_API_URL
const BASE_URL = (typeof envUrl === 'string' && envUrl.trim() ? envUrl.trim() : '/api/v1').replace(/\/+$/, '')

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type QueryValue = string | number | boolean | readonly string[] | null | undefined
type Query = Record<string, QueryValue>

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'VALIDATION',
  423: 'LOCKED',
  429: 'RATE_LIMITED',
}

/** Query string: undefined/null/empty/false are omitted, true → "true", arrays comma-joined. */
function buildQuery(query?: Query): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === false) continue
    if (typeof value === 'string') {
      if (value !== '') params.set(key, value)
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) params.set(key, String(value))
    } else if (value === true) {
      params.set(key, 'true')
    } else {
      const list = value.filter((v) => v !== '')
      if (list.length > 0) params.set(key, list.join(','))
    }
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

const id = (value: string) => encodeURIComponent(value)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function readFields(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const fields: Record<string, string> = {}
  for (const [key, message] of Object.entries(value)) if (typeof message === 'string') fields[key] = message
  return Object.keys(fields).length > 0 ? fields : undefined
}

function toApiError(status: number, body: unknown): ApiError {
  const fallbackCode = STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL' : 'ERROR')
  if (!isRecord(body)) return new ApiError(status, fallbackCode, FALLBACK_MESSAGE)
  const code = typeof body.code === 'string' && body.code ? body.code : fallbackCode
  const message = typeof body.message === 'string' && body.message.trim() ? body.message : FALLBACK_MESSAGE
  return new ApiError(status, code, message, readFields(body.fields))
}

const networkError = () => new ApiError(0, 'NETWORK', NETWORK_MESSAGE)

/** Body text → JSON; empty body → null. `ok: false` when the text is not JSON. */
function parseBody(text: string): { ok: true; value: unknown } | { ok: false } {
  if (!text.trim()) return { ok: true, value: null }
  try {
    const value: unknown = JSON.parse(text)
    return { ok: true, value }
  } catch {
    return { ok: false }
  }
}

async function request<T>(method: Method, path: string, options: { query?: Query; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-FlowTrade-Request': '1' }
  const init: RequestInit = { method, credentials: 'include', headers }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }

  let text: string
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}${buildQuery(options.query)}`, init)
    text = await response.text()
  } catch {
    throw networkError()
  }

  const parsed = parseBody(text)
  if (!response.ok) throw toApiError(response.status, parsed.ok ? parsed.value : null)
  if (!parsed.ok) throw new ApiError(response.status, 'INVALID_RESPONSE', FALLBACK_MESSAGE)
  return parsed.value as T
}

const get = <T>(path: string, query?: Query) => request<T>('GET', path, { query })
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, { body })
const put = <T>(path: string, body?: unknown) => request<T>('PUT', path, { body })
const patch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body })
const del = <T>(path: string) => request<T>('DELETE', path)

// =====================================================================

export const httpApi = {
  auth: {
    login: (email: string, password: string) => post<User>('/auth/login', { email, password }),
    logout: () => post<true>('/auth/logout'),
    me: async () => (await get<User | null>('/auth/me')) ?? null,
    changePassword: (currentPassword: string, newPassword: string) => post<User>('/auth/change-password', { currentPassword, newPassword }),
  },

  users: {
    lookup: () => get<User[]>('/users/lookup'),
    list: () => get<User[]>('/users'),
    /** tempPassword is null when the admin typed the password in the form. */
    create: (input: UserInput) => post<{ user: User; tempPassword: string | null }>('/users', input),
    update: (userId: string, changes: Partial<UserInput>) => patch<User>(`/users/${id(userId)}`, changes),
    setActive: (userId: string, isActive: boolean) => post<{ user: User; openTasks: number }>(`/users/${id(userId)}/active`, { isActive }),
    resetPassword: (userId: string) => post<{ user: User; tempPassword: string }>(`/users/${id(userId)}/reset-password`),
  },

  departments: {
    /** Active departments (all of them with includeInactive — needs department.manage). */
    list: (opts: { includeInactive?: boolean } = {}) => get<Department[]>('/departments', { includeInactive: opts.includeInactive }),
    /** { [departmentId]: number of users in it } */
    usage: () => get<Record<string, number>>('/departments/usage'),
    create: (input: DepartmentInput) => post<Department>('/departments', input),
    update: (departmentId: string, changes: Partial<DepartmentInput> & { isActive?: boolean }) => patch<Department>(`/departments/${id(departmentId)}`, changes),
    remove: (departmentId: string) => del<true>(`/departments/${id(departmentId)}`),
    reorder: (ids: string[]) => put<true>('/departments/order', { ids }),
  },

  stores: {
    list: (opts: { includeInactive?: boolean } = {}) => get<Store[]>('/stores', { includeInactive: opts.includeInactive }),
    usage: () => get<Record<string, number>>('/stores/usage'),
    create: (input: StoreInput) => post<Store>('/stores', input),
    update: (storeId: string, changes: Partial<StoreInput> & { isActive?: boolean }) => patch<Store>(`/stores/${id(storeId)}`, changes),
    remove: (storeId: string) => del<true>(`/stores/${id(storeId)}`),
    reorder: (ids: string[]) => put<true>('/stores/order', { ids }),
  },

  shelfTypes: {
    list: (opts: { includeInactive?: boolean } = {}) => get<ShelfType[]>('/shelf-types', { includeInactive: opts.includeInactive }),
    usage: () => get<Record<string, number>>('/shelf-types/usage'),
    create: (input: ShelfTypeInput) => post<ShelfType>('/shelf-types', input),
    update: (shelfTypeId: string, changes: Partial<ShelfTypeInput> & { isActive?: boolean }) => patch<ShelfType>(`/shelf-types/${id(shelfTypeId)}`, changes),
    remove: (shelfTypeId: string) => del<true>(`/shelf-types/${id(shelfTypeId)}`),
    reorder: (ids: string[]) => put<true>('/shelf-types/order', { ids }),
  },

  products: {
    list: (opts: { q?: string; includeInactive?: boolean } = {}) => get<Product[]>('/products', { q: opts.q?.trim(), includeInactive: opts.includeInactive }),
    create: (input: ProductInput) => post<Product>('/products', input),
    update: (productId: string, changes: Partial<ProductInput> & { isActive?: boolean }) => patch<Product>(`/products/${id(productId)}`, changes),
    remove: (productId: string) => del<true>(`/products/${id(productId)}`),
  },

  templates: {
    list: (opts: { includeInactive?: boolean } = {}) => get<TaskTemplate[]>('/task-templates', { includeInactive: opts.includeInactive }),
    get: (templateId: string) => get<TaskTemplate>(`/task-templates/${id(templateId)}`),
    /** Most specific active template for the combination, or null when none matches (empty body). */
    suggest: async (channel: Channel, shelfTypeId: string | null, storeId: string | null) =>
      (await get<TaskTemplate | null>('/task-templates/suggest', { channel, shelfTypeId, storeId })) ?? null,
    preview: (templateId: string, targetDate: string, excludedItemIds: string[] = []) =>
      get<TemplatePreviewItem[]>(`/task-templates/${id(templateId)}/preview`, { targetDate, excluded: excludedItemIds }),
    create: (input: TemplateInput) => post<TaskTemplate>('/task-templates', input),
    update: (templateId: string, input: Partial<TemplateInput>) => patch<TaskTemplate>(`/task-templates/${id(templateId)}`, input),
    remove: (templateId: string) => del<true>(`/task-templates/${id(templateId)}`),
  },

  proposals: {
    list: (filters: ProposalFilters = {}) =>
      get<ProposalListItem[]>('/proposals', {
        q: filters.q?.trim(),
        status: filters.status,
        channel: filters.channel,
        storeId: filters.storeId,
        shelfTypeId: filters.shelfTypeId,
        ownerId: filters.ownerId,
        scope: filters.scope,
      }),
    get: (proposalId: string) => get<ProposalDetail>(`/proposals/${id(proposalId)}`),
    create: (input: CreateProposalInput) => post<Proposal[]>('/proposals', input),
    update: (proposalId: string, changes: UpdateProposalInput) => patch<Proposal>(`/proposals/${id(proposalId)}`, changes),
    changeStatus: (proposalId: string, status: ProposalStatus) => post<Proposal>(`/proposals/${id(proposalId)}/status`, { status }),
    changeTargetDate: (proposalId: string, targetDate: string, shiftTasks: boolean) =>
      post<Proposal>(`/proposals/${id(proposalId)}/target-date`, { targetDate, shiftTasks }),
    duplicate: (proposalId: string, storeId: string, targetDate: string) => post<Proposal>(`/proposals/${id(proposalId)}/duplicate`, { storeId, targetDate }),
    remove: (proposalId: string) => del<true>(`/proposals/${id(proposalId)}`),
  },

  tasks: {
    listByProposal: (proposalId: string) => get<Task[]>(`/proposals/${id(proposalId)}/tasks`),
    create: (input: CreateTaskInput) => post<Task>('/tasks', input),
    update: (taskId: string, changes: UpdateTaskInput) => patch<Task>(`/tasks/${id(taskId)}`, changes),
    toggle: (taskId: string, isDone: boolean) => post<{ changed: Task[]; progress: Progress; allDone: boolean }>(`/tasks/${id(taskId)}/toggle`, { isDone }),
    move: (taskId: string, input: MoveTaskInput) => post<Task[]>(`/tasks/${id(taskId)}/move`, input),
    remove: (taskId: string) => del<{ removed: string[] }>(`/tasks/${id(taskId)}`),
    duplicate: (taskId: string) => post<Task>(`/tasks/${id(taskId)}/duplicate`),
    mine: (filters: MyTasksFilters = {}) =>
      get<TaskWithContext[]>('/tasks/mine', { status: filters.status, due: filters.due, proposalId: filters.proposalId }),
  },

  comments: {
    list: (taskId: string) => get<CommentWithAuthor[]>(`/tasks/${id(taskId)}/comments`),
    counts: (proposalId: string) => get<Record<string, number>>(`/proposals/${id(proposalId)}/comment-counts`),
    create: (taskId: string, body: string) => post<CommentWithAuthor>(`/tasks/${id(taskId)}/comments`, { body }),
  },

  activity: {
    list: (opts: { proposalId?: string; limit?: number } = {}) =>
      get<ActivityWithActor[]>('/activity', { proposalId: opts.proposalId, limit: opts.limit }),
  },

  notifications: {
    list: () => get<AppNotification[]>('/notifications'),
    markRead: (notificationId: string | 'all') => post<true>('/notifications/read', { id: notificationId }),
  },

  dashboard: {
    home: () => get<HomeSummary>('/dashboard/home'),
    summary: () => get<DashboardSummary>('/dashboard/summary'),
  },
}

export type Api = typeof httpApi
