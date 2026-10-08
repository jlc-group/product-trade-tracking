// TanStack Query hooks — the only way pages read/write data.
import { applyDetailPatch, computeProgress, computeToggle, deriveCompletion, type Channel, type Department, type Manufacturer, type Product, type ProposalStatus, type ShelfType, type Store, type Task, type TaskTemplate, type User } from '@flowtrade/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { uuid } from '@/lib/id'
import { api, ApiError } from './index'
import type {
  CreateProposalInput,
  DepartmentInput,
  CreateTaskInput,
  ManufacturerInput,
  MoveTaskInput,
  MyTasksFilters,
  NavBadges,
  ProductInput,
  ProposalDetail,
  ProposalFilters,
  ShelfTypeInput,
  StoreInput,
  TemplateInput,
  UpdateProposalInput,
  UpdateTaskInput,
  UserInput,
} from './types'

export const qk = {
  me: ['me'] as const,
  userLookup: ['users', 'lookup'] as const,
  users: ['users', 'list'] as const,
  departments: (includeInactive = false) => ['departments', { includeInactive }] as const,
  departmentUsage: ['departments', 'usage'] as const,
  manufacturers: (includeInactive = false) => ['manufacturers', { includeInactive }] as const,
  manufacturerUsage: ['manufacturers', 'usage'] as const,
  stores: (includeInactive = false) => ['stores', { includeInactive }] as const,
  storeUsage: ['stores', 'usage'] as const,
  shelfTypes: (includeInactive = false) => ['shelf-types', { includeInactive }] as const,
  shelfTypeUsage: ['shelf-types', 'usage'] as const,
  products: (q = '', includeInactive = false) => ['products', { q, includeInactive }] as const,
  templates: (includeInactive = false) => ['templates', { includeInactive }] as const,
  template: (id: string) => ['templates', 'detail', id] as const,
  templateSuggest: (channel: Channel | null, shelfTypeId: string | null, storeId: string | null) => ['templates', 'suggest', channel, shelfTypeId, storeId] as const,
  templatePreview: (id: string | null, targetDate: string | null, excluded: string[]) => ['templates', 'preview', id, targetDate, excluded] as const,
  proposals: (filters: ProposalFilters = {}) => ['proposals', 'list', filters] as const,
  proposal: (id: string) => ['proposals', 'detail', id] as const,
  proposalReport: (id: string) => ['proposals', 'report', id] as const,
  tasks: (proposalId: string) => ['tasks', proposalId] as const,
  myTasks: (filters: MyTasksFilters = {}) => ['my-tasks', filters] as const,
  comments: (taskId: string) => ['comments', taskId] as const,
  commentCounts: (proposalId: string) => ['comments', 'counts', proposalId] as const,
  activity: (proposalId?: string, limit?: number) => ['activity', proposalId ?? 'all', limit ?? 100] as const,
  notifications: ['notifications'] as const,
  home: ['dashboard', 'home'] as const,
  badge: ['dashboard', 'badge'] as const,
  dashboard: ['dashboard', 'summary'] as const,
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
}

const onError = (error: unknown) => {
  toast.error(errorMessage(error))
}

/** Anything that changes tasks or proposals can move dashboards, lists and activity. */
function invalidateWork(qc: QueryClient, proposalId?: string) {
  qc.invalidateQueries({ queryKey: ['proposals'] })
  qc.invalidateQueries({ queryKey: ['my-tasks'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
  qc.invalidateQueries({ queryKey: ['activity'] })
  qc.invalidateQueries({ queryKey: qk.notifications })
  if (proposalId) qc.invalidateQueries({ queryKey: qk.tasks(proposalId) })
}

/** SKUs, stores, launch date and status move the "รอผลิต" view (not task ticks, so not in invalidateWork). */
function invalidateProduction(qc: QueryClient, proposalId: string) {
  qc.invalidateQueries({ queryKey: ['production', proposalId] })
}

// ---------- auth & users ----------

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: api.auth.me, staleTime: Infinity })
export const useUserLookup = () => useQuery({ queryKey: qk.userLookup, queryFn: api.users.lookup, staleTime: 60_000 })
export const useUsers = () => useQuery({ queryKey: qk.users, queryFn: api.users.list })

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (input: UserInput) => api.users.create(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }), onError })
}
export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<UserInput> }) => api.users.update(id, patch),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      // Edited yourself (e.g. a new username, or the email cleared) — keep the menu / Settings sign-in name in sync.
      qc.setQueryData<User | null>(qk.me, (me) => (me && me.id === user.id ? user : me))
    },
    onError,
  })
}
export function useSetUserActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.users.setActive(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError,
  })
}
export function useResetPassword() {
  const qc = useQueryClient()
  // The user now has mustChangePassword = true — refresh the list so the badge shows.
  return useMutation({ mutationFn: (id: string) => api.users.resetPassword(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }), onError })
}
export function useChangePassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) => api.auth.changePassword(current, next),
    onSuccess: (user) => qc.setQueryData(qk.me, user),
    onError,
  })
}

// ---------- master data ----------

export const useStores = (includeInactive = false) => useQuery({ queryKey: qk.stores(includeInactive), queryFn: () => api.stores.list({ includeInactive }) })
export const useStoreUsage = () => useQuery({ queryKey: qk.storeUsage, queryFn: api.stores.usage })
export const useShelfTypes = (includeInactive = false) => useQuery({ queryKey: qk.shelfTypes(includeInactive), queryFn: () => api.shelfTypes.list({ includeInactive }) })
export const useShelfTypeUsage = () => useQuery({ queryKey: qk.shelfTypeUsage, queryFn: api.shelfTypes.usage })
export const useProducts = (q = '', includeInactive = false, opts: { keepPrevious?: boolean } = {}) =>
  useQuery({ queryKey: qk.products(q, includeInactive), queryFn: () => api.products.list({ q, includeInactive }), placeholderData: opts.keepPrevious ? keepPreviousData : undefined })
export const useTemplates = (includeInactive = false) => useQuery({ queryKey: qk.templates(includeInactive), queryFn: () => api.templates.list({ includeInactive }) })
export const useTemplate = (id: string | null) => useQuery({ queryKey: qk.template(id ?? ''), queryFn: () => api.templates.get(id!), enabled: !!id })
export const useSuggestedTemplate = (channel: Channel | null, shelfTypeId: string | null, storeId: string | null) =>
  useQuery({ queryKey: qk.templateSuggest(channel, shelfTypeId, storeId), queryFn: () => api.templates.suggest(channel!, shelfTypeId, storeId), enabled: !!channel })
export const useTemplatePreview = (id: string | null, targetDate: string | null, excluded: string[] = []) =>
  useQuery({ queryKey: qk.templatePreview(id, targetDate, excluded), queryFn: () => api.templates.preview(id!, targetDate!, excluded), enabled: !!id && !!targetDate })

/**
 * CRUD hooks for a master-data collection. onSuccess returns the refetch promise, so
 * `await mutateAsync(...)` resolves only once the lists on screen show the change (no switch flicker).
 */
function masterMutations<TInput, TPatch, TEntity>(
  key: string,
  calls: { create: (i: TInput) => Promise<TEntity>; update: (id: string, p: TPatch) => Promise<TEntity>; remove: (id: string) => Promise<unknown> },
) {
  return {
    useCreate() {
      const qc = useQueryClient()
      return useMutation({ mutationFn: (input: TInput) => calls.create(input), onSuccess: () => qc.invalidateQueries({ queryKey: [key] }), onError })
    },
    useUpdate() {
      const qc = useQueryClient()
      return useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: TPatch }) => calls.update(id, patch),
        onSuccess: () => {
          // Lists are awaited; proposal read models (which embed store/shelf/product) refresh in the background.
          qc.invalidateQueries({ queryKey: ['proposals'] })
          return qc.invalidateQueries({ queryKey: [key] })
        },
        onError,
      })
    },
    useRemove() {
      const qc = useQueryClient()
      return useMutation({ mutationFn: (id: string) => calls.remove(id), onSuccess: () => qc.invalidateQueries({ queryKey: [key] }), onError })
    },
  }
}

export const useDepartments = (includeInactive = false) => useQuery({ queryKey: qk.departments(includeInactive), queryFn: () => api.departments.list({ includeInactive }), staleTime: 60_000 })
export const useDepartmentUsage = () => useQuery({ queryKey: qk.departmentUsage, queryFn: api.departments.usage })
const departmentBase = masterMutations<DepartmentInput, Partial<DepartmentInput> & { isActive?: boolean }, Department>('departments', api.departments)
/** Renaming a department cascades to users (FK ON UPDATE CASCADE), so user lists and "me" refresh too. */
export const departmentMutations = {
  ...departmentBase,
  useUpdate() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<DepartmentInput> & { isActive?: boolean } }) => api.departments.update(id, patch),
      onSuccess: () =>
        Promise.all([qc.invalidateQueries({ queryKey: ['departments'] }), qc.invalidateQueries({ queryKey: ['users'] }), qc.invalidateQueries({ queryKey: qk.me })]),
      onError,
    })
  },
}
export function useReorderDepartments() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (ids: string[]) => api.departments.reorder(ids), onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }), onError })
}

export const useManufacturers = (includeInactive = false) =>
  useQuery({ queryKey: qk.manufacturers(includeInactive), queryFn: () => api.manufacturers.list({ includeInactive }), staleTime: 60_000 })
export const useManufacturerUsage = () => useQuery({ queryKey: qk.manufacturerUsage, queryFn: api.manufacturers.usage })
const manufacturerBase = masterMutations<ManufacturerInput, Partial<ManufacturerInput> & { isActive?: boolean }, Manufacturer>('manufacturers', api.manufacturers)
export const manufacturerMutations = {
  ...manufacturerBase,
  /**
   * The confirm dialog's inline add: no error toast — the picker shows a name problem (422) under its search box. The
   * list refreshes either way: a duplicate usually means a teammate just added (or deactivated) that name.
   */
  useQuickCreate() {
    const qc = useQueryClient()
    return useMutation({ mutationFn: (input: ManufacturerInput) => api.manufacturers.create(input), onSettled: () => qc.invalidateQueries({ queryKey: ['manufacturers'] }) })
  },
  /** Production orders embed the manufacturer's name and active flag, so the "รอผลิต" views refresh too (in the background). */
  useUpdate() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<ManufacturerInput> & { isActive?: boolean } }) => api.manufacturers.update(id, patch),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['production'] })
        return qc.invalidateQueries({ queryKey: ['manufacturers'] })
      },
      onError,
    })
  },
}
export function useReorderManufacturers() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (ids: string[]) => api.manufacturers.reorder(ids), onSuccess: () => qc.invalidateQueries({ queryKey: ['manufacturers'] }), onError })
}

export const storeMutations = masterMutations<StoreInput, Partial<StoreInput> & { isActive?: boolean }, Store>('stores', api.stores)
export const shelfTypeMutations = masterMutations<ShelfTypeInput, Partial<ShelfTypeInput> & { isActive?: boolean }, ShelfType>('shelf-types', api.shelfTypes)
export const productMutations = masterMutations<ProductInput, Partial<ProductInput> & { isActive?: boolean }, Product>('products', api.products)
export const templateMutations = masterMutations<TemplateInput, Partial<TemplateInput>, TaskTemplate>('templates', api.templates)

export function useReorderStores() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (ids: string[]) => api.stores.reorder(ids), onSuccess: () => qc.invalidateQueries({ queryKey: ['stores'] }), onError })
}
export function useReorderShelfTypes() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (ids: string[]) => api.shelfTypes.reorder(ids), onSuccess: () => qc.invalidateQueries({ queryKey: ['shelf-types'] }), onError })
}

// ---------- proposals ----------

/** `keepPrevious`: keep showing the last result while a new filter loads (lists with live filters). */
export const useProposals = (filters: ProposalFilters = {}, opts: { keepPrevious?: boolean } = {}) =>
  useQuery({ queryKey: qk.proposals(filters), queryFn: () => api.proposals.list(filters), placeholderData: opts.keepPrevious ? keepPreviousData : undefined })
export const useProposal = (id: string) => useQuery({ queryKey: qk.proposal(id), queryFn: () => api.proposals.get(id), retry: false })
/** Extras for the PDF export page: task users, all task comments, last change per task. */
export const useProposalReport = (id: string) => useQuery({ queryKey: qk.proposalReport(id), queryFn: () => api.proposals.report(id), retry: false })

export function useCreateProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProposalInput) => api.proposals.create(input),
    onSuccess: () => invalidateWork(qc),
    onError,
  })
}
export function useUpdateProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateProposalInput }) => api.proposals.update(id, patch),
    onSuccess: (_d, v) => {
      invalidateWork(qc, v.id)
      invalidateProduction(qc, v.id)
    },
    onError,
  })
}
export function useChangeProposalStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProposalStatus }) => api.proposals.changeStatus(id, status),
    onSuccess: (_d, v) => {
      invalidateWork(qc, v.id)
      invalidateProduction(qc, v.id)
    },
    onError,
  })
}
export function useChangeTargetDate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, targetDate, shiftTasks }: { id: string; targetDate: string; shiftTasks: boolean }) => api.proposals.changeTargetDate(id, targetDate, shiftTasks),
    onSuccess: (_d, v) => {
      invalidateWork(qc, v.id)
      invalidateProduction(qc, v.id)
    },
    onError,
  })
}
export function useDuplicateProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, storeIds, targetDate }: { id: string; storeIds: string[]; targetDate: string }) => api.proposals.duplicate(id, storeIds, targetDate),
    onSuccess: () => invalidateWork(qc),
    onError,
  })
}
export function useDeleteProposal() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.proposals.remove(id), onSuccess: () => invalidateWork(qc), onError })
}

// ---------- tasks ----------

export const useTasks = (proposalId: string) => useQuery({ queryKey: qk.tasks(proposalId), queryFn: () => api.tasks.listByProposal(proposalId) })
export const useMyTasks = (filters: MyTasksFilters = {}) => useQuery({ queryKey: qk.myTasks(filters), queryFn: () => api.tasks.mine(filters) })

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (input: CreateTaskInput) => api.tasks.create(input), onSuccess: (_t, v) => invalidateWork(qc, v.proposalId), onError })
}

/** The server's PATCH /tasks/:id rules, for the optimistic copy (new rows always carry client ids). */
function applyTaskPatch(t: Task, patch: UpdateTaskInput): Task {
  const { detailFields, detailAppend, detailLabels, detailRemove, detailValues, ...rest } = patch
  const rows = applyDetailPatch(t.detailFields, { detailFields, detailAppend, detailLabels, detailRemove, detailValues }, uuid).fields
  return { ...t, ...rest, detailFields: rows }
}

/** The list after a PATCH of task `id`, with the completion it implies (a filled table ticks the task and its parents). */
export function patchTasks(tasks: Task[], id: string, patch: UpdateTaskInput) {
  const patched = tasks.map((t) => (t.id === id ? applyTaskPatch(t, patch) : t))
  const flips = deriveCompletion(patched)
  const byId = new Map(flips.map((c) => [c.id, c.isDone]))
  return { next: flips.length ? patched.map((t) => (byId.has(t.id) ? { ...t, isDone: byId.get(t.id)! } : t)) : patched, flips }
}

/** Task writes of one proposal share a key: the list is refetched only after the last one settles. */
const taskWriteKey = (proposalId: string) => ['task-write', proposalId] as const

/**
 * Refetch after a task write — unless another write of the same proposal is still in flight (each table cell saves on
 * its own), whose refetch would land first and briefly overwrite the newer optimistic rows with older server data.
 */
function settleTaskWrite(qc: ReturnType<typeof useQueryClient>, proposalId: string) {
  if (qc.isMutating({ mutationKey: taskWriteKey(proposalId) }) > 1) return
  invalidateWork(qc, proposalId)
  qc.invalidateQueries({ queryKey: qk.proposal(proposalId) })
}

export function useUpdateTask(proposalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: taskWriteKey(proposalId),
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTaskInput }) => api.tasks.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.tasks(proposalId) })
      const previous = qc.getQueryData<Task[]>(qk.tasks(proposalId))
      if (previous) {
        const { next, flips } = patchTasks(previous, id, patch)
        qc.setQueryData(qk.tasks(proposalId), next)
        if (flips.length) qc.setQueryData<ProposalDetail>(qk.proposal(proposalId), (old) => (old ? { ...old, progress: computeProgress(next) } : old))
      }
      return { previous }
    },
    onError: (error, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.tasks(proposalId), ctx.previous)
      onError(error)
    },
    onSettled: () => settleTaskWrite(qc, proposalId),
  })
}

/** Optimistic tick with the same completion rules as the server. */
export function useToggleTask(proposalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: taskWriteKey(proposalId),
    mutationFn: ({ id, isDone }: { id: string; isDone: boolean }) => api.tasks.toggle(id, isDone),
    onMutate: async ({ id, isDone }) => {
      await qc.cancelQueries({ queryKey: qk.tasks(proposalId) })
      const previous = qc.getQueryData<Task[]>(qk.tasks(proposalId))
      if (previous) {
        const changes = new Map(computeToggle(previous, id, isDone).map((c) => [c.id, c.isDone]))
        const next = previous.map((t) => (changes.has(t.id) ? { ...t, isDone: changes.get(t.id)! } : t))
        qc.setQueryData(qk.tasks(proposalId), next)
        qc.setQueryData<ProposalDetail>(qk.proposal(proposalId), (old) => (old ? { ...old, progress: computeProgress(next) } : old))
      }
      return { previous }
    },
    onError: (error, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.tasks(proposalId), ctx.previous)
      onError(error)
    },
    onSettled: () => settleTaskWrite(qc, proposalId),
  })
}

/** Toggle from a list where the proposal id varies per row (My tasks, Home). */
export function useToggleAnyTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isDone }: { id: string; isDone: boolean; proposalId: string }) => api.tasks.toggle(id, isDone),
    onSuccess: (_r, v) => {
      invalidateWork(qc, v.proposalId)
      qc.invalidateQueries({ queryKey: qk.proposal(v.proposalId) })
    },
    onError,
  })
}

export function useMoveTask(proposalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MoveTaskInput }) => api.tasks.move(id, input),
    onSuccess: (tasks) => {
      qc.setQueryData(qk.tasks(proposalId), tasks)
      invalidateWork(qc, proposalId)
    },
    onError: (error) => {
      onError(error)
      qc.invalidateQueries({ queryKey: qk.tasks(proposalId) })
    },
  })
}

export function useDeleteTask(proposalId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.tasks.remove(id), onSuccess: () => invalidateWork(qc, proposalId), onError })
}

export function useDuplicateTask(proposalId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.tasks.duplicate(id), onSuccess: () => invalidateWork(qc, proposalId), onError })
}

// ---------- comments, activity, notifications, dashboards ----------

export const useComments = (taskId: string | null) => useQuery({ queryKey: qk.comments(taskId ?? ''), queryFn: () => api.comments.list(taskId!), enabled: !!taskId })
export const useCommentCounts = (proposalId: string) => useQuery({ queryKey: qk.commentCounts(proposalId), queryFn: () => api.comments.counts(proposalId) })
export function useAddComment(proposalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: string }) => api.comments.create(taskId, body),
    onSuccess: (_c, v) => {
      qc.invalidateQueries({ queryKey: qk.comments(v.taskId) })
      qc.invalidateQueries({ queryKey: qk.commentCounts(proposalId) })
    },
    onError,
  })
}

export const useActivity = (proposalId?: string, limit?: number) => useQuery({ queryKey: qk.activity(proposalId, limit), queryFn: () => api.activity.list({ proposalId, limit }) })
export const useNotifications = () => useQuery({ queryKey: qk.notifications, queryFn: api.notifications.list, refetchInterval: 60_000 })
export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string | 'all') => api.notifications.markRead(id), onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }) })
}

/** Home dashboard; also primes the sidebar badge (its overdue task rows are the badge's count by definition). */
export function useHome() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: qk.home,
    queryFn: async () => {
      const home = await api.dashboard.home()
      const overdueTasks = home.agenda.items.filter((i) => i.kind === 'task' && i.bucket === 'overdue').length
      qc.setQueryData<NavBadges>(qk.badge, { overdueTasks })
      return home
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}
/** Sidebar badge on "งานของฉัน" — the only dashboard query mounted on every page. */
export const useBadge = () => useQuery({ queryKey: qk.badge, queryFn: api.dashboard.badge, staleTime: 60_000, refetchOnWindowFocus: true })
export const useDashboard = () => useQuery({ queryKey: qk.dashboard, queryFn: api.dashboard.summary })
