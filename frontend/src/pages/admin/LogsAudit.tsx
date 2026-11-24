import { Activity, ScrollText } from 'lucide-react'
import { PageHeader } from '@/components/shared'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/misc'
import { useTab } from '@/lib/useTab'
import ActivityLogs from './ActivityLogs'
import AuditTrail from './AuditTrail'

const TABS = ['audit', 'activity'] as const

/** Audit Trail and Activity Logs in one place. Both stay read-only; no record is changed or removed. */
export default function LogsAudit() {
  const [tab, setTab] = useTab(TABS, 'audit')
  return (
    <div>
      <PageHeader title="Logs & Audit" description="Administrative changes and system activity, with search and date filters." />
      <Tabs value={tab} onValueChange={setTab} className="mb-5">
        <TabsList aria-label="Log types" className="w-full sm:w-fit">
          <TabsTrigger value="audit">
            <ScrollText /> Audit Trail
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity /> Activity Logs
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div role="tabpanel" aria-label={tab === 'audit' ? 'Audit Trail' : 'Activity Logs'}>
        {tab === 'audit' ? <AuditTrail /> : <ActivityLogs />}
      </div>
    </div>
  )
}
