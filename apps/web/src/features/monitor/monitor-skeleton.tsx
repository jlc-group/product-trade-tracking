import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

function CardShell({ className, rows, variant }: { className?: string; rows: number; variant: 'list' | 'bars' }) {
  return (
    <div className={cn('space-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10', className)}>
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) =>
          variant === 'list' ? (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="hidden h-1.5 w-24 sm:block" />
            </div>
          ) : (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-20 shrink-0" />
              <Skeleton className="h-4 rounded-sm" style={{ width: `${85 - i * 11}%` }} />
            </div>
          ),
        )}
      </div>
    </div>
  )
}

/** Placeholder shaped like the dashboard, so nothing jumps when data arrives. */
export function MonitorSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="กำลังโหลดภาพรวม">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 3xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="size-7 rounded-lg" />
            </div>
            <Skeleton className="h-7 w-14" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <CardShell className="xl:col-span-7" rows={5} variant="list" />
        <CardShell className="xl:col-span-5" rows={5} variant="list" />
        <CardShell className="xl:col-span-7" rows={4} variant="list" />
        <CardShell className="xl:col-span-5" rows={4} variant="bars" />
        <CardShell className="xl:col-span-6" rows={6} variant="bars" />
        <CardShell className="xl:col-span-6" rows={6} variant="bars" />
      </div>
    </div>
  )
}
