import type { TaskNode, TaskStructureRights, User } from '@flowtrade/shared'
import { createContext, useContext } from 'react'
import type { ProposalDetail, UpdateTaskInput } from '@/api'

/** Stable callbacks shared by every row and the drawer (identity never changes). */
export interface TreeActions {
  openTask: (id: string, opts?: { focusComments?: boolean }) => void
  toggle: (node: TaskNode, isDone: boolean) => void
  update: (id: string, patch: UpdateTaskInput) => void
  toggleExpanded: (id: string) => void
  startAdd: (parentId: string | null) => void
  stopAdd: () => void
  startRename: (id: string) => void
  stopRename: () => void
  requestMove: (node: TaskNode) => void
  moveBy: (node: TaskNode, delta: -1 | 1) => void
  duplicate: (node: TaskNode) => void
  remove: (node: TaskNode) => void
}

/** Things that rarely change while the tree is on screen. */
export interface TreeEnv {
  me: User
  proposal: ProposalDetail
  /** May add tasks to this proposal (team / MANAGER / ADMIN). Rights on each existing task: useTaskRights. */
  canAddTasks: boolean
  cancelled: boolean
  usersById: Map<string, User>
  /** Department suggestions: the standard ones plus any already used in this proposal. */
  departments: string[]
  /** The drag-handle column is shown (task managers, no filter active); each row is draggable only if it may be reordered. */
  dragEnabled: boolean
  /** Reorder / move / copy / delete rights per task id (keeps its identity while no right changes). */
  structure: ReadonlyMap<string, TaskStructureRights>
  actions: TreeActions
}

/** UI state that changes with user interaction. */
export interface TreeView {
  isExpanded: (id: string) => boolean
  /** null when no filter is active. */
  filter: { matches: Set<string>; visible: Set<string> } | null
  /** Parent id whose inline-add input is open ('__root__' for top level). */
  addingKey: string | null
  renamingId: string | null
  selectedId: string | null
  /** Sibling group of the item being dragged — other groups stop being drop targets. */
  dragGroup: string | null
  commentCounts: Record<string, number>
}

export const TreeEnvContext = createContext<TreeEnv | null>(null)
export const TreeViewContext = createContext<TreeView | null>(null)

export function useTreeEnv() {
  const ctx = useContext(TreeEnvContext)
  if (!ctx) throw new Error('useTreeEnv must be used inside <TaskTree>')
  return ctx
}

export function useTreeView() {
  const ctx = useContext(TreeViewContext)
  if (!ctx) throw new Error('useTreeView must be used inside <TaskTree>')
  return ctx
}
