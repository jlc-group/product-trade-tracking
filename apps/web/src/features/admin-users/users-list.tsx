import { ROLE_LABEL, type Role, type User } from '@flowtrade/shared'
import { KeyRoundIcon, PencilIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateTime, fromNow } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ROLE_ORDER, toRole } from './roles'

export interface UserRowHandlers {
  currentUserId: string
  /** User ids with a role / active change in flight. */
  pendingIds: ReadonlySet<string>
  /** Department names that have been deactivated (users may still be on one). */
  inactiveDepartments?: ReadonlySet<string>
  onRoleChange: (user: User, role: Role) => void
  onActiveChange: (user: User, isActive: boolean) => void
  onEdit: (user: User) => void
  onResetPassword: (user: User) => void
}

function WithTip({ tip, children, className }: { tip: string | null; children: ReactNode; className?: string }) {
  if (!tip) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex', className)} tabIndex={0}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

function UserIdentity({ user, isSelf, showEmail, showDepartment }: { user: User; isSelf: boolean; showEmail?: boolean; showDepartment?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar user={user} size="md" tooltip={false} />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5">
          <span className={cn('truncate font-medium', !user.isActive && 'text-muted-foreground')}>{user.name}</span>
          {user.nickname && <span className="text-muted-foreground">({user.nickname})</span>}
          {isSelf && <span className="rounded bg-brand-soft px-1.5 text-[10px] leading-4 font-semibold text-brand">คุณ</span>}
        </div>
        {showEmail && (
          <div className="truncate text-xs text-muted-foreground">
            {user.username && <span className="text-foreground/70">{user.username}</span>}
            {user.username && user.email && ' · '}
            {user.email}
          </div>
        )}
        {/* The table's แผนก column only fits from xl — below that the department rides under the name. */}
        {showDepartment && user.department && <div className="truncate text-xs text-muted-foreground xl:hidden">{user.department}</div>}
      </div>
    </div>
  )
}

function RoleSelect({ user, isSelf, pending, onChange, className }: { user: User; isSelf: boolean; pending: boolean; onChange: (role: Role) => void; className?: string }) {
  return (
    <WithTip tip={isSelf ? 'เปลี่ยนบทบาทของตัวเองไม่ได้ — ให้ Admin คนอื่นเปลี่ยนให้' : null} className={className}>
      <Select
        value={user.role}
        onValueChange={(v) => {
          const role = toRole(v)
          if (role && role !== user.role) onChange(role)
        }}
        disabled={isSelf || pending}
      >
        <SelectTrigger size="sm" className={cn('w-44 bg-card', className)} aria-label={`บทบาทของ ${user.name}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {ROLE_ORDER.map((r) => (
            <SelectItem key={r} value={r}>
              {ROLE_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </WithTip>
  )
}

function ActiveSwitch({ user, isSelf, pending, onChange }: { user: User; isSelf: boolean; pending: boolean; onChange: (active: boolean) => void }) {
  const id = `user-active-${user.id}`
  return (
    <WithTip tip={isSelf ? 'ปิดการใช้งานบัญชีของตัวเองไม่ได้' : null}>
      <div className="flex items-center gap-2">
        <Switch id={id} checked={user.isActive} disabled={isSelf || pending} onCheckedChange={onChange} />
        <Label htmlFor={id} className={cn('text-xs font-normal whitespace-nowrap', user.isActive ? 'text-success' : 'text-muted-foreground')}>
          <span className="sr-only">บัญชีของ {user.name}: </span>
          {user.isActive ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
        </Label>
      </div>
    </WithTip>
  )
}

function LastLogin({ user }: { user: User }) {
  return (
    <div className="grid justify-items-start gap-1">
      {user.lastLoginAt ? (
        <span className="text-sm" title={formatDateTime(user.lastLoginAt)}>
          {fromNow(user.lastLoginAt)}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">ยังไม่เคยเข้าใช้</span>
      )}
      {user.mustChangePassword && user.isActive && (
        <span className="rounded bg-warning-soft px-1.5 text-[11px] leading-5 text-warning-foreground" title="ผู้ใช้ยังใช้รหัสผ่านชั่วคราวอยู่">
          รอตั้งรหัสผ่านใหม่
        </span>
      )}
    </div>
  )
}

function DeptPosition({ user, inactiveDepartments }: { user: User; inactiveDepartments?: ReadonlySet<string> }) {
  if (!user.department && !user.position) return <span className="text-sm text-muted-foreground">ไม่ระบุแผนก</span>
  const deactivated = !!user.department && !!inactiveDepartments?.has(user.department)
  return (
    <div className="min-w-0 leading-tight">
      {user.department ? (
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className={cn('truncate', deactivated && 'text-muted-foreground')}>{user.department}</span>
          {deactivated && (
            <span className="shrink-0 rounded bg-muted px-1 text-[10px] leading-4 text-muted-foreground" title="แผนกนี้ถูกปิดการใช้งานแล้ว — แก้ไขผู้ใช้เพื่อเลือกแผนกใหม่">
              ปิดใช้งาน
            </span>
          )}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">ไม่ระบุแผนก</div>
      )}
      {user.position && <div className="truncate text-xs text-muted-foreground">{user.position}</div>}
    </div>
  )
}

function RowActions({ user, isSelf, onEdit, onResetPassword, compact }: { user: User; isSelf: boolean; onEdit: () => void; onResetPassword: () => void; compact?: boolean }) {
  if (!compact) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <PencilIcon /> แก้ไข
        </Button>
        {isSelf ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings">
              <KeyRoundIcon /> เปลี่ยนรหัสผ่านของฉัน
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onResetPassword}>
            <KeyRoundIcon /> รีเซ็ตรหัสผ่าน
          </Button>
        )}
      </div>
    )
  }
  return (
    <div className="flex justify-end gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`แก้ไขข้อมูล ${user.name}`}>
            <PencilIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>แก้ไขข้อมูล</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          {isSelf ? (
            <Button variant="ghost" size="icon-sm" asChild>
              <Link to="/settings" aria-label="เปลี่ยนรหัสผ่านของคุณที่หน้าตั้งค่า">
                <KeyRoundIcon />
              </Link>
            </Button>
          ) : (
            <Button variant="ghost" size="icon-sm" onClick={onResetPassword} aria-label={`รีเซ็ตรหัสผ่านของ ${user.name}`}>
              <KeyRoundIcon />
            </Button>
          )}
        </TooltipTrigger>
        <TooltipContent>{isSelf ? 'เปลี่ยนรหัสผ่านของคุณที่หน้าตั้งค่า' : 'รีเซ็ตรหัสผ่าน'}</TooltipContent>
      </Tooltip>
    </div>
  )
}

/** Desktop table (lg and up). */
export function UsersTable({ users, ...h }: { users: User[] } & UserRowHandlers) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="pl-4 text-xs text-muted-foreground">ผู้ใช้</TableHead>
            <TableHead className="text-xs text-muted-foreground">ชื่อผู้ใช้ / อีเมล</TableHead>
            <TableHead className="hidden text-xs text-muted-foreground xl:table-cell">แผนก / ตำแหน่ง</TableHead>
            <TableHead className="text-xs text-muted-foreground">บทบาท</TableHead>
            <TableHead className="text-xs text-muted-foreground">สถานะ</TableHead>
            <TableHead className="text-xs text-muted-foreground">เข้าใช้ล่าสุด</TableHead>
            <TableHead className="pr-4">
              <span className="sr-only">การจัดการ</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const isSelf = u.id === h.currentUserId
            const pending = h.pendingIds.has(u.id)
            return (
              <TableRow key={u.id} className={cn(!u.isActive && 'bg-muted/30')}>
                <TableCell className="max-w-64 py-3 pl-4">
                  <UserIdentity user={u} isSelf={isSelf} showDepartment />
                </TableCell>
                <TableCell className="max-w-56 text-muted-foreground">
                  {u.username && <span className="block truncate font-medium text-foreground/80">{u.username}</span>}
                  {u.email ? <span className="block truncate text-xs">{u.email}</span> : <span className="block text-xs text-muted-foreground/60">ไม่มีอีเมล</span>}
                </TableCell>
                <TableCell className="hidden max-w-48 xl:table-cell">
                  <DeptPosition user={u} inactiveDepartments={h.inactiveDepartments} />
                </TableCell>
                <TableCell>
                  <RoleSelect user={u} isSelf={isSelf} pending={pending} onChange={(r) => h.onRoleChange(u, r)} />
                </TableCell>
                <TableCell>
                  <ActiveSwitch user={u} isSelf={isSelf} pending={pending} onChange={(v) => h.onActiveChange(u, v)} />
                </TableCell>
                <TableCell>
                  <LastLogin user={u} />
                </TableCell>
                <TableCell className="pr-4">
                  <RowActions user={u} isSelf={isSelf} compact onEdit={() => h.onEdit(u)} onResetPassword={() => h.onResetPassword(u)} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/** Card list for phones and tablets. */
export function UserCards({ users, ...h }: { users: User[] } & UserRowHandlers) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {users.map((u) => {
        const isSelf = u.id === h.currentUserId
        const pending = h.pendingIds.has(u.id)
        return (
          <li key={u.id} className={cn('flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4', !u.isActive && 'bg-muted/30')}>
            <div className="flex items-start justify-between gap-3">
              <UserIdentity user={u} isSelf={isSelf} showEmail />
              <ActiveSwitch user={u} isSelf={isSelf} pending={pending} onChange={(v) => h.onActiveChange(u, v)} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div className="min-w-0">
                <dt className="mb-0.5 text-muted-foreground">แผนก / ตำแหน่ง</dt>
                <dd>
                  <DeptPosition user={u} inactiveDepartments={h.inactiveDepartments} />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="mb-0.5 text-muted-foreground">เข้าใช้ล่าสุด</dt>
                <dd>
                  <LastLogin user={u} />
                </dd>
              </div>
            </dl>
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
              <RoleSelect user={u} isSelf={isSelf} pending={pending} onChange={(r) => h.onRoleChange(u, r)} className="w-full sm:w-44" />
              <RowActions user={u} isSelf={isSelf} onEdit={() => h.onEdit(u)} onResetPassword={() => h.onResetPassword(u)} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
