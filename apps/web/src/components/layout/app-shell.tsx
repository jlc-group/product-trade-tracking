import { ROLE_SHORT, signInName, type Permission } from '@flowtrade/shared'
import {
  BellIcon,
  Building2Icon,
  CalendarDaysIcon,
  ChevronsUpDownIcon,
  HistoryIcon,
  HomeIcon,
  LayersIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  ListTreeIcon,
  LogOutIcon,
  PackageIcon,
  SettingsIcon,
  ShoppingBagIcon,
  StoreIcon,
  UsersIcon,
} from 'lucide-react'
import { Suspense } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useHome, useMarkNotificationRead, useNotifications } from '@/api/hooks'
import { useAuth, useCurrentUser } from '@/auth/auth'
import { FullPageSpinner } from '@/components/common/full-page-spinner'
import { UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { fromNow } from '@/lib/format'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: typeof HomeIcon
  permission?: Permission
  end?: boolean
}

const WORK_NAV: NavItem[] = [
  { to: '/', label: 'หน้าหลัก', icon: HomeIcon, end: true },
  { to: '/my-tasks', label: 'งานของฉัน', icon: ListChecksIcon },
  { to: '/proposals', label: 'การเสนอสินค้า', icon: ShoppingBagIcon },
  { to: '/calendar', label: 'ปฏิทิน', icon: CalendarDaysIcon },
]

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Monitor ภาพรวม', icon: LayoutDashboardIcon, permission: 'dashboard.monitor', end: true },
  { to: '/admin/stores', label: 'ห้าง / แพลตฟอร์ม', icon: StoreIcon, permission: 'store.manage' },
  { to: '/admin/shelf-types', label: 'ประเภท Shelf', icon: LayersIcon, permission: 'shelfType.manage' },
  { to: '/admin/products', label: 'สินค้า', icon: PackageIcon, permission: 'product.manage' },
  { to: '/admin/templates', label: 'แม่แบบ Task', icon: ListTreeIcon, permission: 'template.manage' },
  { to: '/admin/users', label: 'ผู้ใช้และสิทธิ์', icon: UsersIcon, permission: 'user.manage' },
  { to: '/admin/departments', label: 'แผนก', icon: Building2Icon, permission: 'department.manage' },
  { to: '/admin/activity', label: 'ประวัติการใช้งาน', icon: HistoryIcon, permission: 'activity.read.all' },
]

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const { can } = useAuth()
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  const { data: home } = useHome()
  const visible = items.filter((i) => !i.permission || can(i.permission))
  if (visible.length === 0) return null
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-sidebar-foreground/50">{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {visible.map((item) => {
            const active = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                  <NavLink to={item.to} end={item.end} onClick={() => setOpenMobile(false)}>
                    <item.icon />
                    <span>{item.label}</span>
                  </NavLink>
                </SidebarMenuButton>
                {item.to === '/my-tasks' && !!home?.counts.overdue && (
                  <SidebarMenuBadge className="rounded-full bg-danger text-[10px] text-white">{home.counts.overdue}</SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function UserMenu() {
  const user = useCurrentUser()
  const { logout } = useAuth()
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
          <UserAvatar user={user} size="md" tooltip={false} className="ring-sidebar" />
          <span className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-sm font-medium text-sidebar-accent-foreground">{user.name}</span>
            <span className="truncate text-xs text-sidebar-foreground/60">{ROLE_SHORT[user.role]} · {user.position ?? user.department ?? ''}</span>
          </span>
          <ChevronsUpDownIcon className="ml-auto size-4 opacity-60" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{user.name}</div>
          <div className="text-xs text-muted-foreground">{signInName(user)}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <SettingsIcon /> ตั้งค่าบัญชี
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={async () => {
            await logout()
            navigate('/login', { replace: true })
          }}
        >
          <LogOutIcon /> ออกจากระบบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationBell() {
  const { data: items = [] } = useNotifications()
  const markRead = useMarkNotificationRead()
  const navigate = useNavigate()
  const unread = items.filter((n) => !n.isRead).length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`การแจ้งเตือน ${unread} รายการใหม่`}>
          <BellIcon />
          {unread > 0 && <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">การแจ้งเตือน</span>
          {unread > 0 && (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => markRead.mutate('all')}>
              อ่านทั้งหมดแล้ว
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">ยังไม่มีการแจ้งเตือน</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                className={cn('flex w-full gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/60', !n.isRead && 'bg-accent/50')}
                onClick={() => {
                  if (!n.isRead) markRead.mutate(n.id)
                  if (n.link) navigate(n.link)
                }}
              >
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.isRead ? 'bg-transparent' : n.type === 'TASK_OVERDUE' ? 'bg-danger' : 'bg-primary')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{n.title}</span>
                  <span className="block truncate text-sm text-muted-foreground">{n.body}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground/80">{fromNow(n.createdAt)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function AppShell() {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild className="hover:bg-transparent">
                <Link to="/">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">FT</span>
                  <span className="grid leading-tight">
                    <span className="text-base font-semibold text-sidebar-accent-foreground">FlowTrade</span>
                    <span className="text-[11px] text-sidebar-foreground/60">ระบบงานเสนอสินค้าเข้าห้าง</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <NavGroup label="งานของฉัน" items={WORK_NAV} />
          <NavGroup label="ผู้ดูแลระบบ" items={ADMIN_NAV} />
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <UserMenu />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
          <SidebarTrigger className="-ml-1" />
          <div className="ml-auto flex items-center gap-1.5">
            <NotificationBell />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-1 flex-col px-4 py-6 md:px-6 lg:px-8">
          <Suspense fallback={<FullPageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
