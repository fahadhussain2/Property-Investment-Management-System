import type { ReactNode } from 'react'
import { Building2Icon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="mb-6 flex items-center gap-2 text-lg font-semibold">
        <Building2Icon className="size-6" aria-hidden />
        Property Ledger
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">{title}</h1>
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  )
}
