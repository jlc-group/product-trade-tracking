import { ROLE_LABEL, ROLE_SHORT, type Role, type User } from '@flowtrade/shared'
import { Building2Icon, RotateCcwIcon, SearchIcon, UserPlusIcon, UsersIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useDepartments, useResetPassword, useSetUserActive, useUpdateUser, useUsers } from '@/api/hooks'
import { useAuth, useCurrentUser } from '@/auth/auth'
import { EmptyState, PageHeader, useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { RoleMatrix } from '@/features/admin-users/role-matrix'
import { ROLE_ORDER, type IssuedPassword } from '@/features/admin-users/roles'
import { TempPasswordDialog } from '@/features/admin-users/temp-password'
import { UserFormDialog } from '@/features/admin-users/user-form-dialog'
import { UserCards, UsersTable, type UserRowHandlers } from '@/features/admin-users/users-list'
import { cn } from '@/lib/utils'

type Filter = 'ALL' | Role | 'INACTIVE'

/** Department filter values (Radix Select items can't use an empty string); anything else is a department name. */
const ALL_DEPARTMENTS = '__all__'
const NO_DEPARTMENT = '__none__'

interface DepartmentOption {
  name: string
  count: number
  isActive: boolean
}

function uniqueSorted(values: (string | null)[]) {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'th'))
}

function matchesDepartment(user: User, filter: string) {
  return filter === ALL_DEPARTMENTS ? true : filter === NO_DEPARTMENT ? !user.department : user.department === filter
}

function FilterChip({ active, label, count, tone, onClick }: { active: boolean; label: string; count: number; tone?: 'muted'; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        active ? 'border-primary/40 bg-brand-soft text-brand' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {label}
      <span className={cn('tabular text-sm font-semibold', active ? 'text-brand' : tone === 'muted' ? 'text-muted-foreground' : 'text-foreground')}>{count}</span>
    </button>
  )
}

/** "ทุกแผนก ▾" — sits next to the role chips and looks like one of them. */
function DepartmentFilter({ value, options, noneCount, total, onChange }: { value: string; options: DepartmentOption[]; noneCount: number; total: number; onChange: (value: string) => void }) {
  const active = value !== ALL_DEPARTMENTS
  // A department renamed / removed while selected stays in the list so the Select keeps showing it.
  const missing = active && value !== NO_DEPARTMENT && !options.some((o) => o.name === value)
  const list = missing ? [...options, { name: value, count: 0, isActive: true }] : options
  const count = (n: number) => <span className="tabular ml-auto pl-3 text-xs text-muted-foreground">{n}</span>
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label="กรองตามแผนก"
        className={cn(
          'h-8 max-w-64 rounded-full px-3 text-sm',
          active ? 'border-primary/40 bg-brand-soft text-brand' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <Building2Icon className="size-4" aria-hidden />
        <SelectValue>
          <span className="truncate">{value === ALL_DEPARTMENTS ? 'ทุกแผนก' : value === NO_DEPARTMENT ? 'ไม่ระบุแผนก' : value}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-h-80">
        <SelectItem value={ALL_DEPARTMENTS} className="[&>span:last-child]:flex-1">
          ทุกแผนก
          {count(total)}
        </SelectItem>
        {list.length > 0 && <SelectSeparator />}
        {list.map((o) => (
          <SelectItem key={o.name} value={o.name} className="[&>span:last-child]:flex-1">
            <span className={cn('truncate', !o.isActive && 'text-muted-foreground')}>{o.name}</span>
            {!o.isActive && <span className="shrink-0 text-xs text-muted-foreground">(ปิดใช้งาน)</span>}
            {count(o.count)}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={NO_DEPARTMENT} className="[&>span:last-child]:flex-1">
          <span className="text-muted-foreground">ไม่ระบุแผนก</span>
          {count(noneCount)}
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

function UsersSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card" aria-hidden>
      <div className="h-10 border-b bg-muted/40" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="hidden h-7 w-44 lg:block" />
          <Skeleton className="hidden h-4 w-20 lg:block" />
          <Skeleton className="hidden h-4 w-24 md:block" />
        </div>
      ))}
    </div>
  )
}

export default function AdminUsersPage() {
  const me = useCurrentUser()
  const { can } = useAuth()
  const { data: users, isLoading, isError, refetch } = useUsers()
  // With department.manage the list includes deactivated departments, so users still on one can be filtered and marked.
  const { data: departments } = useDepartments(can('department.manage'))
  const updateUser = useUpdateUser()
  const setActive = useSetUserActive()
  const resetPassword = useResetPassword()
  const [confirm, confirmDialog] = useConfirm()

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [department, setDepartment] = useState<string>(ALL_DEPARTMENTS)
  const [form, setForm] = useState<{ open: boolean; user: User | null; nonce: number }>({ open: false, user: null, nonce: 0 })
  const [issued, setIssued] = useState<IssuedPassword | null>(null)

  const all = useMemo(() => users ?? [], [users])
  // Role / status chip counts follow the department filter.
  const inDepartment = useMemo(() => all.filter((u) => matchesDepartment(u, department)), [all, department])
  const counts = useMemo(() => {
    const byRole: Record<Role, number> = { ADMIN: 0, MANAGER: 0, USER: 0 }
    for (const u of inDepartment) byRole[u.role] += 1
    return { byRole, inactive: inDepartment.filter((u) => !u.isActive).length }
  }, [inDepartment])

  /** Department filter options: the admin's list in its order (deactivated ones only while users are still on them), with user counts. */
  const departmentFilter = useMemo(() => {
    const byName = new Map<string, number>()
    let none = 0
    for (const u of all) {
      if (u.department) byName.set(u.department, (byName.get(u.department) ?? 0) + 1)
      else none += 1
    }
    const listed = [...(departments ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
    const options: DepartmentOption[] = listed.filter((d) => d.isActive || byName.has(d.name)).map((d) => ({ name: d.name, count: byName.get(d.name) ?? 0, isActive: d.isActive }))
    // A user's department missing from the list is a deactivated one (or the list hasn't loaded yet) — keep it filterable.
    const known = new Set(listed.map((d) => d.name))
    for (const name of uniqueSorted([...byName.keys()])) {
      if (!known.has(name)) options.push({ name, count: byName.get(name) ?? 0, isActive: departments === undefined })
    }
    return { options, none }
  }, [all, departments])
  const inactiveDepartments = useMemo(() => new Set(departmentFilter.options.filter((o) => !o.isActive).map((o) => o.name)), [departmentFilter])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return inDepartment
      .filter((u) => (filter === 'ALL' ? true : filter === 'INACTIVE' ? !u.isActive : u.role === filter))
      .filter((u) => !needle || [u.name, u.nickname, u.username, u.email, u.department, u.position].some((v) => v?.toLowerCase().includes(needle)))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name, 'th'))
  }, [inDepartment, q, filter])

  const positionOptions = useMemo(() => uniqueSorted(all.map((u) => u.position)), [all])

  const pendingIds = useMemo(() => {
    const ids = new Set<string>()
    if (updateUser.isPending && updateUser.variables) ids.add(updateUser.variables.id)
    if (setActive.isPending && setActive.variables) ids.add(setActive.variables.id)
    return ids
  }, [updateUser.isPending, updateUser.variables, setActive.isPending, setActive.variables])

  const openForm = (user: User | null) => setForm((f) => ({ open: true, user, nonce: f.nonce + 1 }))

  const handlers: UserRowHandlers = {
    currentUserId: me.id,
    pendingIds,
    inactiveDepartments,
    onEdit: (u) => openForm(u),
    onRoleChange: async (u, role) => {
      if (role === 'ADMIN' || u.role === 'ADMIN') {
        const promote = role === 'ADMIN'
        const ok = await confirm({
          title: promote ? `ให้ ${u.name} เป็นผู้ดูแลระบบ?` : `ลดสิทธิ์ ${u.name} จากผู้ดูแลระบบ?`,
          description: promote
            ? 'ผู้ดูแลระบบเพิ่ม / ปิดบัญชีผู้ใช้ รีเซ็ตรหัสผ่าน และแก้ไขข้อมูลหลักทั้งหมดได้'
            : `${u.name} จะจัดการผู้ใช้และข้อมูลหลักไม่ได้อีก บทบาทใหม่คือ ${ROLE_LABEL[role]}`,
          confirmLabel: promote ? 'ให้สิทธิ์ Admin' : 'เปลี่ยนบทบาท',
        })
        if (!ok) return
      }
      updateUser.mutate({ id: u.id, patch: { role } })
    },
    onActiveChange: async (u, isActive) => {
      if (!isActive) {
        const ok = await confirm({
          title: `ปิดการใช้งานบัญชี ${u.name}?`,
          description: 'ผู้ใช้จะเข้าสู่ระบบไม่ได้ทันที แต่งานและประวัติทั้งหมดยังอยู่ครบ — เปิดใช้งานกลับได้ทุกเมื่อ',
          confirmLabel: 'ปิดการใช้งาน',
          destructive: true,
        })
        if (!ok) return
      }
      setActive.mutate(
        { id: u.id, isActive },
        {
          onSuccess: ({ openTasks }) => {
            if (!isActive && openTasks > 0) toast.warning(`ปิดการใช้งาน ${u.name} แล้ว`, { description: `มีงานค้าง ${openTasks} งาน ควรมอบหมายให้คนอื่น`, duration: 8000 })
          },
        },
      )
    },
    onResetPassword: async (u) => {
      const ok = await confirm({
        title: `รีเซ็ตรหัสผ่านของ ${u.name}?`,
        description: 'ระบบจะสร้างรหัสผ่านชั่วคราวใหม่ รหัสเดิมจะใช้ไม่ได้ทันที และผู้ใช้ต้องตั้งรหัสใหม่เมื่อเข้าสู่ระบบครั้งถัดไป',
        confirmLabel: 'สร้างรหัสผ่านชั่วคราว',
      })
      if (!ok) return
      resetPassword.mutate(u.id, {
        onSuccess: (result) => setIssued(result),
      })
    },
  }

  const filtered = filter !== 'ALL' || department !== ALL_DEPARTMENTS || q.trim() !== ''

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ผู้ดูแลระบบ"
        title="ผู้ใช้และสิทธิ์"
        description="เฉพาะผู้ใช้ที่เพิ่มไว้ในหน้านี้เท่านั้นที่เข้าสู่ระบบได้ — เพิ่มบัญชีให้พนักงานใหม่ กำหนดบทบาท และปิดการใช้งานเมื่อพนักงานย้ายแผนกหรือลาออก"
        actions={
          <Button onClick={() => openForm(null)} className="h-9">
            <UserPlusIcon /> เพิ่มผู้ใช้
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="กรองตามบทบาทหรือสถานะ">
            <FilterChip active={filter === 'ALL'} label="ทั้งหมด" count={inDepartment.length} onClick={() => setFilter('ALL')} />
            {ROLE_ORDER.map((r) => (
              <FilterChip key={r} active={filter === r} label={ROLE_SHORT[r]} count={counts.byRole[r]} onClick={() => setFilter(filter === r ? 'ALL' : r)} />
            ))}
            <FilterChip active={filter === 'INACTIVE'} label="ปิดใช้งาน" count={counts.inactive} tone="muted" onClick={() => setFilter(filter === 'INACTIVE' ? 'ALL' : 'INACTIVE')} />
          </div>
          <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
          <DepartmentFilter value={department} options={departmentFilter.options} noneCount={departmentFilter.none} total={all.length} onChange={setDepartment} />
        </div>
        <div className="w-full lg:w-72">
          <Label htmlFor="user-search" className="sr-only">
            ค้นหาผู้ใช้
          </Label>
          <InputGroup className="h-9 bg-card">
            <InputGroupAddon>
              <SearchIcon aria-hidden />
            </InputGroupAddon>
            <InputGroupInput id="user-search" type="search" placeholder="ค้นหาชื่อ ชื่อผู้ใช้ อีเมล แผนก…" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label="ล้างคำค้นหา" onClick={() => setQ('')}>
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </div>
      </div>

      {isLoading ? (
        <UsersSkeleton />
      ) : isError ? (
        <EmptyState
          title="โหลดรายชื่อผู้ใช้ไม่สำเร็จ"
          description="ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              <RotateCcwIcon /> ลองอีกครั้ง
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<SearchIcon className="size-5" />}
            title="ไม่พบผู้ใช้ที่ตรงกับตัวกรอง"
            description="ลองค้นหาด้วยคำอื่น หรือดูผู้ใช้ทั้งหมด"
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQ('')
                  setFilter('ALL')
                  setDepartment(ALL_DEPARTMENTS)
                }}
              >
                ล้างตัวกรอง
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<UsersIcon className="size-5" />}
            title="ยังไม่มีผู้ใช้"
            description="เพิ่มบัญชีให้ทีมงานเพื่อให้เข้าสู่ระบบได้"
            action={
              <Button onClick={() => openForm(null)}>
                <UserPlusIcon /> เพิ่มผู้ใช้คนแรก
              </Button>
            }
          />
        )
      ) : (
        <>
          <div className="hidden lg:block">
            <UsersTable users={visible} {...handlers} />
          </div>
          <div className="lg:hidden">
            <UserCards users={visible} {...handlers} />
          </div>
          {filtered && (
            <p className="tabular text-xs text-muted-foreground">
              แสดง {visible.length} จาก {all.length} คน
            </p>
          )}
        </>
      )}

      <RoleMatrix />

      <UserFormDialog
        key={form.nonce}
        open={form.open}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        user={form.user}
        isSelf={form.user?.id === me.id}
        positionOptions={positionOptions}
      />
      <TempPasswordDialog issued={issued} onClose={() => setIssued(null)} />
      {confirmDialog}
    </div>
  )
}
