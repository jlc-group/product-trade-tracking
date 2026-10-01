import { Skeleton } from '@/components/ui/skeleton'
import type { ViewMode } from './params'

function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="ml-auto h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="h-4 w-4/5" />
      <div className="flex gap-1">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="flex items-center gap-3 border-t pt-3">
        <Skeleton className="h-1.5 flex-1" />
        <Skeleton className="size-5 rounded-full" />
      </div>
    </div>
  )
}

function TableSkeleton() {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 lg:hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-xl border bg-card lg:block">
        <div className="flex h-10 items-center gap-6 border-b bg-muted/40 px-4">
          {[56, 160, 120, 80, 64, 120].map((w, i) => (
            <Skeleton key={i} className="h-3" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-start gap-6 border-b px-4 py-3 last:border-0">
            <Skeleton className="mt-0.5 h-3 w-16" />
            <div className="w-56 space-y-2">
              <Skeleton className="h-4 w-full" />
              <div className="flex gap-1">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-16" />
              </div>
            </div>
            <div className="flex w-36 items-center gap-2">
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="h-4 flex-1" />
            </div>
            <div className="w-20 space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="mt-2 h-1.5 w-36" />
            <Skeleton className="ml-auto size-8 rounded-full" />
          </div>
        ))}
      </div>
    </>
  )
}

function KanbanSkeleton() {
  return (
    <div className="-mx-4 overflow-hidden px-4 md:mx-0 md:px-0">
      <div className="flex w-max gap-3">
        {[3, 2, 1, 2, 1].map((n, i) => (
          <div key={i} className="w-[17.5rem] space-y-2 rounded-xl bg-muted/60 p-2 sm:w-72">
            <div className="flex items-center gap-2 px-1 py-1.5">
              <Skeleton className="h-4 w-24 bg-card" />
              <Skeleton className="ml-auto h-5 w-7 rounded-full bg-card" />
            </div>
            {Array.from({ length: n }, (_, j) => (
              <div key={j} className="space-y-2.5 rounded-xl border bg-card p-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-6 rounded-md" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-11/12" />
                <div className="flex items-end justify-between">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="size-9 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function GridSkeleton() {
  return (
    <div className="space-y-8">
      {[3, 2].map((n, i) => (
        <div key={i} className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: n }, (_, j) => (
              <CardSkeleton key={j} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ListSkeleton({ view }: { view: ViewMode }) {
  return (
    <div role="status" aria-label="กำลังโหลดรายการการเสนอสินค้า">
      {view === 'kanban' ? <KanbanSkeleton /> : view === 'grid' ? <GridSkeleton /> : <TableSkeleton />}
    </div>
  )
}
