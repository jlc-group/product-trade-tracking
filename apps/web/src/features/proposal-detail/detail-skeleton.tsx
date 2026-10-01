import { Skeleton } from '@/components/ui/skeleton'

/** Placeholder shaped like the breadcrumb, header card, tabs and task list. */
export function ProposalDetailSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="กำลังโหลดการเสนอสินค้า">
      <Skeleton className="h-4 w-56" />
      <div className="rounded-xl border bg-card">
        <div className="flex items-start gap-4 p-4 sm:p-5">
          <Skeleton className="size-11 shrink-0 rounded-xl sm:size-14 sm:rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-7 w-full max-w-md" />
            <div className="flex gap-1.5">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
          </div>
          <div className="hidden gap-2 md:flex">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
        <div className="grid gap-5 border-t p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_auto] md:gap-8">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-28" />
              </div>
            ))}
            <div className="col-span-2 flex flex-wrap gap-1.5 lg:col-span-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-6 w-48" />
            </div>
          </div>
          <div className="order-first flex items-center gap-4 md:order-last md:border-l md:pl-8">
            <Skeleton className="size-[76px] rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
      </div>
      <Skeleton className="h-8 w-72" />
      <div className="space-y-2 rounded-xl border bg-card p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
