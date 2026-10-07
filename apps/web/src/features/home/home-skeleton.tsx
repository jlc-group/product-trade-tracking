import { Skeleton } from '@/components/ui/skeleton'

function Rows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className="flex items-start gap-3 px-4 py-2.5">
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="hidden h-7 w-24 sm:block" />
    </div>
  ))
}

/** Shaped like the loaded page (strip, agenda | projects + results), so nothing jumps when data arrives. */
export function HomeSkeleton({ withStrip }: { withStrip: boolean }) {
  return (
    <div className="space-y-6" aria-busy aria-label="กำลังโหลดหน้าหลัก">
      {withStrip && <Skeleton className="h-10 w-full rounded-xl" />}
      <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3.5">
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="px-4 pt-3 pb-1">
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Rows count={5} />
        </div>
        <div className="grid min-w-0 gap-6">
          <div className="rounded-xl border bg-card">
            <div className="border-b px-4 py-3.5">
              <Skeleton className="h-5 w-40" />
            </div>
            <div className="space-y-2 px-4 pt-3">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-2 w-32" />
            </div>
            <Rows count={3} />
          </div>
          <div className="rounded-xl border bg-card">
            <div className="border-b px-4 py-3.5">
              <Skeleton className="h-5 w-36" />
            </div>
            <Rows count={3} />
          </div>
        </div>
      </div>
    </div>
  )
}
