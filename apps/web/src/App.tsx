import { lazy, useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import { RequireAuth, RequirePermission } from '@/auth/auth'
import { AppShell } from '@/components/layout/app-shell'
import { usePrefs } from '@/lib/prefs'

const LoginPage = lazy(() => import('@/pages/login'))
const ChangePasswordPage = lazy(() => import('@/pages/change-password'))
const HomePage = lazy(() => import('@/pages/home'))
const MyTasksPage = lazy(() => import('@/pages/my-tasks'))
const ProposalsPage = lazy(() => import('@/pages/proposals/list'))
const NewProposalPage = lazy(() => import('@/pages/proposals/new'))
const ProposalDetailPage = lazy(() => import('@/pages/proposals/detail'))
const CalendarPage = lazy(() => import('@/pages/calendar'))
const AdminMonitorPage = lazy(() => import('@/pages/admin/monitor'))
const AdminStoresPage = lazy(() => import('@/pages/admin/stores'))
const AdminShelfTypesPage = lazy(() => import('@/pages/admin/shelf-types'))
const AdminProductsPage = lazy(() => import('@/pages/admin/products'))
const AdminTemplatesPage = lazy(() => import('@/pages/admin/templates'))
const AdminUsersPage = lazy(() => import('@/pages/admin/users'))
const AdminDepartmentsPage = lazy(() => import('@/pages/admin/departments'))
const AdminActivityPage = lazy(() => import('@/pages/admin/activity'))
const SettingsPage = lazy(() => import('@/pages/settings'))
const NotFoundPage = lazy(() => import('@/pages/not-found'))

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

function AppRoutes() {
  // formatDate() reads the BE/CE preference at render time, so the routes remount when it flips.
  // Not while on /settings, which hosts the switch: remounting there would drop keyboard focus and
  // half-typed passwords. Its own dates subscribe to the preference; the rest catches up on the next navigation.
  const { buddhistEra } = usePrefs()
  const { pathname } = useLocation()
  const [era, setEra] = useState(buddhistEra)
  if (era !== buddhistEra && pathname !== '/settings') setEra(buddhistEra)
  return (
    <Routes key={era ? 'be' : 'ce'}>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="my-tasks" element={<MyTasksPage />} />
          <Route path="proposals" element={<ProposalsPage />} />
          <Route path="proposals/new" element={<RequirePermission permission="proposal.create"><NewProposalPage /></RequirePermission>} />
          <Route path="proposals/:id" element={<ProposalDetailPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin">
            <Route index element={<RequirePermission permission="dashboard.monitor"><AdminMonitorPage /></RequirePermission>} />
            <Route path="stores" element={<RequirePermission permission="store.manage"><AdminStoresPage /></RequirePermission>} />
            <Route path="shelf-types" element={<RequirePermission permission="shelfType.manage"><AdminShelfTypesPage /></RequirePermission>} />
            <Route path="products" element={<RequirePermission permission="product.manage"><AdminProductsPage /></RequirePermission>} />
            <Route path="templates" element={<RequirePermission permission="template.manage"><AdminTemplatesPage /></RequirePermission>} />
            <Route path="users" element={<RequirePermission permission="user.manage"><AdminUsersPage /></RequirePermission>} />
            <Route path="departments" element={<RequirePermission permission="department.manage"><AdminDepartmentsPage /></RequirePermission>} />
            <Route path="activity" element={<RequirePermission permission="activity.read.all"><AdminActivityPage /></RequirePermission>} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
