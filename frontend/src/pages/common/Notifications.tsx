import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, Info, Trash2 } from 'lucide-react'
import { EmptyState, PageHeader, Pagination } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc'
import { useRealtime } from '@/context/RealtimeContext'
import { api } from '@/lib/api'
import { useFetch } from '@/lib/hooks'
import type { Notification, Paginated } from '@/lib/types'
import { cn, timeAgo } from '@/lib/utils'

const icons = { INFO: Info, SUCCESS: CheckCircle2, WARNING: AlertTriangle, ALERT: AlertTriangle }
const tone = { INFO: 'text-primary', SUCCESS: 'text-available', WARNING: 'text-[oklch(0.6_0.14_70)]', ALERT: 'text-occupied' }

export default function Notifications() {
  const nav = useNavigate()
  const { unread, setUnread } = useRealtime()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('all')
  const list = useFetch<Paginated<Notification> & { unread: number }>('/notifications/', { page, is_read: filter === 'unread' ? 'false' : '', page_size: 15 })

  // Reload when a new notification arrives over the socket.
  useEffect(() => {
    list.reload()
  }, [unread]) // eslint-disable-line react-hooks/exhaustive-deps

  const markRead = async (n: Notification) => {
    if (!n.is_read) {
      await api.patch(`/notifications/${n.id}/`, { is_read: true })
      setUnread((u) => Math.max(0, u - 1))
      list.reload()
    }
    if (n.link) nav(n.link)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        actions={
          <Button
            variant="outline"
            disabled={!list.data?.unread}
            onClick={async () => {
              await api.post('/notifications/mark-all-read/')
              setUnread(0)
              list.reload()
            }}
          >
            <CheckCheck /> Mark all as read
          </Button>
        }
      />
      <Tabs value={filter} onValueChange={(v) => { setFilter(v); setPage(1) }} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread {list.data?.unread ? `(${list.data.unread})` : ''}</TabsTrigger>
        </TabsList>
      </Tabs>
      {!list.data ? (
        <Skeleton className="h-64" />
      ) : (
        <Card className="gap-0 py-0">
          {!list.data.results.length ? (
            <EmptyState icon={Bell} title="You're all caught up" />
          ) : (
            <ul className="divide-y">
              {list.data.results.map((n) => {
                const Icon = icons[n.level]
                return (
                  <li key={n.id} className={cn('group flex gap-3 px-5 py-4', !n.is_read && 'bg-primary/5')}>
                    <Icon className={cn('mt-0.5 size-5 shrink-0', tone[n.level])} />
                    <button className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => markRead(n)}>
                      <p className={cn('text-sm', !n.is_read && 'font-semibold')}>{n.title}</p>
                      <p className="text-muted-foreground text-sm">{n.message}</p>
                      <p className="text-muted-foreground mt-1 text-xs">{timeAgo(n.created_at)}</p>
                    </button>
                    {!n.is_read && <span className="bg-primary mt-2 size-2 shrink-0 rounded-full" />}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 opacity-0 group-hover:opacity-100 focus:opacity-100"
                      aria-label="Delete notification"
                      onClick={async () => {
                        await api.delete(`/notifications/${n.id}/`)
                        if (!n.is_read) setUnread((u) => Math.max(0, u - 1))
                        list.reload()
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="pb-4">
            <Pagination page={page} count={list.data.count} pageSize={15} onPage={setPage} />
          </div>
        </Card>
      )}
    </div>
  )
}
