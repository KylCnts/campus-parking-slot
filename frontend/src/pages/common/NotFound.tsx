import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-primary text-6xl font-bold">404</p>
      <p className="text-lg font-semibold">Page not found</p>
      <p className="text-muted-foreground text-sm">The page you're looking for doesn't exist.</p>
      <Button asChild className="mt-2">
        <Link to="/dashboard">Go to dashboard</Link>
      </Button>
    </div>
  )
}
