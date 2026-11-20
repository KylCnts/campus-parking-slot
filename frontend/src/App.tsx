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

import ActivityLogs from '@/pages/admin/ActivityLogs'
import AdminDashboard from '@/pages/admin/AdminDashboard'
import AuditTrail from '@/pages/admin/AuditTrail'
import Verifications from '@/pages/admin/Verifications'
import EmailHistory from '@/pages/admin/EmailHistory'
import EventParking from '@/pages/admin/EventParking'
import Analytics from '@/pages/admin/Analytics'
import ParkingSpaces from '@/pages/admin/ParkingSpaces'
import Reports from '@/pages/admin/Reports'
import SettingsPage from '@/pages/admin/Settings'
import UsersPage from '@/pages/admin/Users'
import VehiclesPage from '@/pages/admin/Vehicles'

import ParkedVehicles from '@/pages/security/ParkedVehicles'
import VehicleEntry from '@/pages/security/VehicleEntry'
import VehicleExit from '@/pages/security/VehicleExit'

import Guidelines from '@/pages/user/Guidelines'
import MyParking from '@/pages/user/MyParking'
import MyVehicle from '@/pages/user/MyVehicle'
import UserDashboard from '@/pages/user/UserDashboard'

import AccountSettings from '@/pages/common/AccountSettings'
import Availability from '@/pages/common/Availability'
import IncidentReports from '@/pages/common/IncidentReports'
import NotFound from '@/pages/common/NotFound'
import Notifications from '@/pages/common/Notifications'
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
          <Route path="/availability" element={<Availability />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/account-settings" element={<AccountSettings />} />
          <Route path="/notifications" element={<Notifications />} />

          <Route path="/analytics" element={only(ADMIN, <Analytics />)} />
          <Route path="/parking-spaces" element={only(ADMIN, <ParkingSpaces />)} />
          <Route path="/event-parking" element={only(ADMIN, <EventParking />)} />
          <Route path="/email-history" element={only(ADMIN, <EmailHistory />)} />
          <Route path="/verifications" element={only(ADMIN, <Verifications />)} />
          <Route path="/audit-trail" element={only(ADMIN, <AuditTrail />)} />
          <Route path="/users" element={only(ADMIN, <UsersPage />)} />
          <Route path="/vehicles" element={only(ADMIN, <VehiclesPage />)} />
          <Route path="/reports" element={only(ADMIN, <Reports />)} />
          <Route path="/activity-logs" element={only(ADMIN, <ActivityLogs />)} />
          <Route path="/settings" element={only(ADMIN, <SettingsPage />)} />

          <Route path="/transactions" element={only(ADMIN, <Transactions />)} />
          <Route path="/incident-reports" element={only(ADMIN, <IncidentReports />)} />
          <Route path="/entry" element={only(ADMIN, <VehicleEntry />)} />
          <Route path="/exit" element={only(ADMIN, <VehicleExit />)} />
          <Route path="/parked" element={only(ADMIN, <ParkedVehicles />)} />

          <Route path="/my-parking" element={only(MEMBERS, <MyParking />)} />
          <Route path="/my-vehicle" element={only(MEMBERS, <MyVehicle />)} />
          <Route path="/guidelines" element={<Guidelines />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
