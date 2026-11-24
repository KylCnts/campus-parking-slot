import { Car, ShieldCheck, Users as UsersIcon } from 'lucide-react'
import { PageHeader } from '@/components/shared'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/misc'
import { useFetch } from '@/lib/hooks'
import type { Paginated, Verification } from '@/lib/types'
import { useTab } from '@/lib/useTab'
import UsersPage from './Users'
import VehiclesPage from './Vehicles'
import Verifications from './Verifications'

const TABS = ['verification', 'users', 'vehicles'] as const

/** ID Verification, Users and Vehicles in one place, one tab each. */
export default function UserManagement() {
  const [tab, setTab] = useTab(TABS, 'verification')
  const pending = useFetch<Paginated<Verification>>('/verifications/', { status: 'PENDING', page_size: 1 })
  const waiting = pending.data?.count ?? 0

  return (
    <div>
      <PageHeader title="User Management" description="Verify registrations and manage accounts and registered vehicles." />
      <Tabs value={tab} onValueChange={setTab} className="mb-5">
        <TabsList aria-label="User management sections" className="w-full sm:w-fit">
          <TabsTrigger value="verification">
            <ShieldCheck /> ID Verification
            {waiting > 0 && (
              <span className="bg-reserved/30 rounded px-1.5 text-xs font-semibold tabular-nums" aria-label={`${waiting} waiting`}>
                {waiting}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="users">
            <UsersIcon /> Users
          </TabsTrigger>
          <TabsTrigger value="vehicles">
            <Car /> Vehicles
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div role="tabpanel" aria-label={tab === 'verification' ? 'ID Verification' : tab === 'users' ? 'Users' : 'Vehicles'}>
        {tab === 'verification' && <Verifications onDecision={pending.reload} />}
        {tab === 'users' && <UsersPage />}
        {tab === 'vehicles' && <VehiclesPage />}
      </div>
    </div>
  )
}
