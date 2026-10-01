import { Loader2Icon } from 'lucide-react'

export function FullPageSpinner({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2Icon className="size-4 animate-spin" />
      {label}
    </div>
  )
}
