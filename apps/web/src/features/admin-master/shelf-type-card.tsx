import type { Channel, ShelfType } from '@flowtrade/shared'
import { LayersIcon, TagIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { safeColor, tint } from './color'

/** Colored icon tile for a shelf type (Layers = offline shelf, Tag = online listing). */
export function ShelfTypeIcon({ color, channel, size = 'md', className }: { color: string; channel: Channel; size?: 'md' | 'lg'; className?: string }) {
  const Icon = channel === 'OFFLINE' ? LayersIcon : TagIcon
  const c = safeColor(color)
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', size === 'lg' ? 'size-11 rounded-xl' : 'size-9 rounded-lg', className)}
      style={{ backgroundColor: tint(c, 0.12), color: c, boxShadow: `inset 0 0 0 1px ${tint(c, 0.25)}` }}
      aria-hidden
    >
      <Icon className={size === 'lg' ? 'size-5' : 'size-4'} />
    </span>
  )
}

/**
 * Mirrors the option card users pick from in the proposal wizard's shelf-type step,
 * so admins see the result of name / color / description edits before saving.
 */
export function ShelfTypeOptionCard({
  shelfType,
  selected = false,
  className,
}: {
  shelfType: Pick<ShelfType, 'name' | 'description' | 'color' | 'channel'>
  selected?: boolean
  className?: string
}) {
  const c = safeColor(shelfType.color)
  return (
    <div
      className={cn('relative flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-shadow', className)}
      style={selected ? { borderColor: c, boxShadow: `0 0 0 1px ${c}, 0 4px 14px -6px ${tint(c, 0.45)}` } : undefined}
    >
      <ShelfTypeIcon color={c} channel={shelfType.channel} />
      <div className="min-w-0 flex-1 pr-5">
        <div className="truncate text-sm font-semibold">{shelfType.name || 'ชื่อประเภท'}</div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{shelfType.description || 'คำอธิบายสั้น ๆ ช่วยให้ผู้ใช้เลือกได้ถูกต้อง'}</p>
      </div>
      <span
        className="absolute top-3 right-3 flex size-4 items-center justify-center rounded-full border"
        style={selected ? { borderColor: c, backgroundColor: c } : undefined}
        aria-hidden
      >
        {selected && <span className="size-1.5 rounded-full bg-white" />}
      </span>
    </div>
  )
}
