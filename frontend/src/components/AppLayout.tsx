import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  CalendarClock,
  Car,
  CarFront,
  ClipboardList,
  FileBarChart,
  FileWarning,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Map,
  Menu,
  Moon,
  ParkingSquare,
  ScrollText,
  Settings,
  ShieldCheck,
  Sun,
  User as UserIcon,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/context/AuthContext'
import { useRealtime } from '@/context/RealtimeContext'
import { api } from '@/lib/api'
import type { Role } from '@/lib/types'
import { cn } from '@/lib/utils'
import { LiveIndicator } from './shared'

type NavItem = { to: string; label: string; icon: LucideIcon }
type NavGroup = { title?: string; items: NavItem[] }

const NAV: Record<Role, NavGroup[]> = {
  ADMIN: [
    {
      items: [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/availability', label: 'Live Parking Map', icon: Map },
        { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      ],
    },
    {
      title: 'Management',
      items: [
        { to: '/parking-spaces', label: 'Manage Parking Slots', icon: ParkingSquare },
        { to: '/event-parking', label: 'Event Parking', icon: CalendarClock },
        { to: '/verifications', label: 'ID Verification', icon: ShieldCheck },
        { to: '/users', label: 'Users', icon: Users },
        { to: '/vehicles', label: 'Vehicles', icon: Car },
        { to: '/transactions', label: 'Transactions', icon: ClipboardList },
      ],
    },
    {
      title: 'Gate Operations',
      items: [
        { to: '/entry', label: 'Vehicle Entry', icon: LogIn },
        { to: '/exit', label: 'Vehicle Exit', icon: LogOut },
        { to: '/parked', label: 'Parked Vehicles', icon: CarFront },
      ],
    },
    {
      title: 'Monitoring',
      items: [
        { to: '/reports', label: 'Reports', icon: FileBarChart },
        { to: '/email-history', label: 'Email History', icon: Mail },
        { to: '/incident-reports', label: 'Record Reports', icon: FileWarning },
        { to: '/audit-trail', label: 'Audit Trail', icon: ScrollText },
        { to: '/activity-logs', label: 'Activity Logs', icon: Activity },
        { to: '/settings', label: 'Parking Settings', icon: Settings },
      ],
    },
  ],
  STUDENT: [
    {
      items: [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/my-parking', label: 'My Parking', icon: CarFront },
        { to: '/availability', label: 'Parking Spaces', icon: Map },
        { to: '/my-vehicle', label: 'My Vehicle', icon: Car },
        { to: '/guidelines', label: 'Parking Guidelines', icon: BookOpen },
      ],
    },
  ],
  FACULTY: [],
}
NAV.FACULTY = NAV.STUDENT

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin / Security Guard',
  STUDENT: 'Student Assistant',
  FACULTY: 'Faculty Member',
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('cp_theme') === 'dark'
    } catch {
      return false
    }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('cp_theme', dark ? 'dark' : 'light')
    } catch {
      /* ignore */
    }
  }, [dark])
  return [dark, setDark] as const
}

function Sidebar({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <div className="bg-sidebar text-sidebar-foreground flex h-full flex-col">
      <Link to="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 px-5 py-5">
        <div className="bg-primary flex size-9 items-center justify-center rounded-lg text-white">
          <ParkingSquare className="size-5" />
        </div>
        <div className="leading-tight">
          <p className="font-semibold text-white">CampusPark</p>
          <p className="text-sidebar-foreground/70 text-xs">Parking Monitoring</p>
        </div>
      </Link>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {NAV[role].map((g, i) => (
          <div key={i}>
            {g.title && <p className="text-sidebar-foreground/50 mb-1.5 px-3 text-[11px] font-semibold tracking-wider uppercase">{g.title}</p>}
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive ? 'bg-sidebar-accent font-medium text-white' : 'hover:bg-sidebar-accent/60 hover:text-white',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <it.icon className={cn('size-4', isActive && 'text-sidebar-primary')} />
                      {it.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  )
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { unread, setUnread } = useRealtime()
  const [open, setOpen] = useState(false)
  const [dark, setDark] = useTheme()
  const nav = useNavigate()
  const loc = useLocation()

  useEffect(() => {
    api
      .get('/notifications/', { params: { page_size: 1 } })
      .then((r) => setUnread(r.data.unread))
      .catch(() => {})
  }, [loc.pathname, setUnread])

  if (!user) return null
  const initials = user.full_name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="flex min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 lg:block">
        <Sidebar role={user.role} />
      </aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <Sidebar role={user.role} onNavigate={() => setOpen(false)} />
            <button className="absolute top-5 right-3 cursor-pointer text-white/70" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="no-print bg-background/85 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <div className="hidden sm:block">
            <LiveIndicator />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} aria-label="Toggle theme">
              {dark ? <Sun /> : <Moon />}
            </Button>
            <Button variant="ghost" size="icon" className="relative" onClick={() => nav('/notifications')} aria-label="Notifications">
              <Bell />
              {unread > 0 && (
                <span className="bg-occupied absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md py-1 pr-2 pl-1">
                  <span className="bg-primary/15 text-primary flex size-8 items-center justify-center rounded-full text-xs font-semibold">{initials}</span>
                  <span className="hidden text-left leading-tight md:block">
                    <span className="block text-sm font-medium">{user.full_name}</span>
                    <span className="text-muted-foreground block text-xs">{ROLE_LABEL[user.role]}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="truncate">{user.full_name}</p>
                  <p className="text-muted-foreground truncate text-xs font-normal">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => nav('/profile')}>
                  <UserIcon /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav('/account-settings')}>
                  <KeyRound /> Account Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav('/notifications')}>
                  <Bell /> Notifications
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={async () => {
                    await logout()
                    nav('/login')
                  }}
                >
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="print-area mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
