import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import AppLayout from '@/components/AppLayout'
import { useAuth } from '@/context/AuthContext'
import { RealtimeProvider } from '@/context/RealtimeContext'
import type { Role } from '@/lib/types'

import ForgotPassword from '@/pages/auth/ForgotPassword'
import Login from '@/pages/auth/Login'
import Register from '@/pages/auth/Register'
import ResetPassword from '@/pages/auth/ResetPassword'

import AdminDashboard from '@/pages/admin/AdminDashboard'
import EmailHistory from '@/pages/admin/EmailHistory'
import EventParking from '@/pages/admin/EventParking'
import Analytics from '@/pages/admin/Analytics'
import LogsAudit from '@/pages/admin/LogsAudit'
import ParkingSpaces from '@/pages/admin/ParkingSpaces'
import Reports from '@/pages/admin/Reports'
import SettingsPage from '@/pages/admin/Settings'
import UserManagement from '@/pages/admin/UserManagement'
import UserReports from '@/pages/admin/UserReports'

import Guidelines from '@/pages/user/Guidelines'
import MyParking from '@/pages/user/MyParking'
import MyReports from '@/pages/user/MyReports'
import MyVehicle from '@/pages/user/MyVehicle'
import UserDashboard from '@/pages/user/UserDashboard'

import AccountSettings from '@/pages/common/AccountSettings'
import IncidentReports from '@/pages/common/IncidentReports'
import NotFound from '@/pages/common/NotFound'
import Notifications from '@/pages/common/Notifications'
import ParkingMap from '@/pages/common/ParkingMap'
import Profile from '@/pages/common/Profile'
import Transactions from '@/pages/common/Transactions'

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="text-primary size-8 animate-spin" />
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace />
  if (user.must_change_password && location.pathname !== '/account-settings') return <Navigate to="/account-settings" replace />
  return <RealtimeProvider>{children}</RealtimeProvider>
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (user) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

/**
 * Old addresses of pages that were combined. They keep working (bookmarks and links in older notifications),
 * and any query such as ?plate= is carried over.
 */
function MovedTo({ to, set }: { to: string; set?: Record<string, string> }) {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  Object.entries(set ?? {}).forEach(([k, v]) => params.set(k, v))
  const search = params.toString()
  return <Navigate to={{ pathname: to, search: search ? `?${search}` : '' }} replace />
}

function Dashboard() {
  const { user } = useAuth()
  if (user?.role === 'ADMIN') return <AdminDashboard />
  return <UserDashboard />
}

const ADMIN: Role[] = ['ADMIN']
const MEMBERS: Role[] = ['STUDENT', 'FACULTY']

export default function App() {
  const only = (roles: Role[], el: ReactNode) => <RequireRole roles={roles}>{el}</RequireRole>
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/register" element={<Navigate to="/register/student" replace />} />
        <Route path="/register/:type" element={<PublicOnly><Register /></PublicOnly>} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          {/* Live map + vehicle entry + vehicle exit + parked vehicles (admin); read-only map for members. */}
          <Route path="/parking-map" element={<ParkingMap />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/account-settings" element={<AccountSettings />} />
          <Route path="/notifications" element={<Notifications />} />

          <Route path="/analytics" element={only(ADMIN, <Analytics />)} />
          <Route path="/parking-spaces" element={only(ADMIN, <ParkingSpaces />)} />
          <Route path="/event-parking" element={only(ADMIN, <EventParking />)} />
          <Route path="/email-history" element={only(ADMIN, <EmailHistory />)} />
          <Route path="/user-management" element={only(ADMIN, <UserManagement />)} />
          <Route path="/logs" element={only(ADMIN, <LogsAudit />)} />
          <Route path="/user-reports" element={only(ADMIN, <UserReports />)} />
          <Route path="/reports" element={only(ADMIN, <Reports />)} />
          <Route path="/settings" element={only(ADMIN, <SettingsPage />)} />
          <Route path="/transactions" element={only(ADMIN, <Transactions />)} />
          <Route path="/incident-reports" element={only(ADMIN, <IncidentReports />)} />

          <Route path="/my-parking" element={only(MEMBERS, <MyParking />)} />
          <Route path="/my-vehicle" element={only(MEMBERS, <MyVehicle />)} />
          <Route path="/my-reports" element={only(MEMBERS, <MyReports />)} />
          <Route path="/guidelines" element={<Guidelines />} />

          {/* Addresses of pages that were combined into the pages above. */}
          <Route path="/availability" element={<MovedTo to="/parking-map" />} />
          <Route path="/entry" element={<MovedTo to="/parking-map" />} />
          <Route path="/exit" element={<MovedTo to="/parking-map" />} />
          <Route path="/parked" element={<MovedTo to="/parking-map" set={{ view: 'parked' }} />} />
          <Route path="/verifications" element={<MovedTo to="/user-management" set={{ tab: 'verification' }} />} />
          <Route path="/users" element={<MovedTo to="/user-management" set={{ tab: 'users' }} />} />
          <Route path="/vehicles" element={<MovedTo to="/user-management" set={{ tab: 'vehicles' }} />} />
          <Route path="/audit-trail" element={<MovedTo to="/logs" />} />
          <Route path="/activity-logs" element={<MovedTo to="/logs" set={{ tab: 'activity' }} />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
