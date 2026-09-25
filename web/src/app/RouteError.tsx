import { AlertTriangleIcon } from 'lucide-react'
import { useRouteError } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { friendlyError } from '@/lib/forms'

/** Friendly full-page fallback for errors thrown while rendering a route. */
export function RouteError() {
  const error = useRouteError()
  return (
    <main role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangleIcon className="size-8 text-destructive" aria-hidden />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">{friendlyError(error)}</p>
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </main>
  )
}
