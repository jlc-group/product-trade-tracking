import { CHANNEL_TERMS, type Channel } from '@flowtrade/shared'
import { LayersIcon } from 'lucide-react'
import { Link } from 'react-router'
import { useShelfTypes } from '@/api/hooks'
import { useAuth } from '@/auth/auth'
import { EmptyState } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChoiceCard } from './choice-card'

export function StepShelf({ channel, value, onChange }: { channel: Channel; value: string | null; onChange: (id: string) => void }) {
  const { data, isLoading } = useShelfTypes()
  const { can } = useAuth()
  const shelfTypes = (data ?? []).filter((s) => s.channel === channel)
  const term = CHANNEL_TERMS[channel].shelf

  if (isLoading) {
    return (
      <div className="grid gap-3 @lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }

  if (shelfTypes.length === 0) {
    return (
      <EmptyState
        icon={<LayersIcon className="size-5" />}
        title={`ยังไม่มี${term}ในช่องทางนี้`}
        description={can('shelfType.manage') ? `เพิ่ม${term}ในหน้าข้อมูลหลักก่อน แล้วกลับมาเลือกได้ทันที` : `ติดต่อ Admin ให้เพิ่ม${term}ในระบบ`}
        action={
          can('shelfType.manage') ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/shelf-types">ไปหน้าจัดการ{term}</Link>
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div role="radiogroup" aria-label={term} className="grid gap-3 @lg:grid-cols-2">
      {shelfTypes.map((s) => (
        <ChoiceCard key={s.id} mode="radio" selected={value === s.id} onSelect={() => onChange(s.id)} className="overflow-hidden p-4 pl-5">
          {/* Color accent comes from the shelf type record (admin-defined). */}
          <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: s.color }} />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
              <span className="font-semibold">{s.name}</span>
            </span>
            <span className="block text-sm text-muted-foreground">{s.description || 'ไม่มีคำอธิบาย'}</span>
          </span>
        </ChoiceCard>
      ))}
    </div>
  )
}
