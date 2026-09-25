import { ConstructionIcon } from 'lucide-react'
import { PageHeader } from './PageHeader'

/** Placeholder for screens scheduled in later milestones (see intent/001-core-ledger/plan.md). */
export function ComingSoon({ title, milestone }: { title: string; milestone: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        <ConstructionIcon className="size-8" aria-hidden />
        <p>This screen arrives in {milestone}.</p>
      </div>
    </>
  )
}
