import { ROLE_LABEL, type Role, signInName } from '@flowtrade/shared'
import { CalendarDaysIcon, InfoIcon, KeyRoundIcon, UserRoundIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { useCurrentUser } from '@/auth/auth'
import { PageHeader } from '@/components/common/misc'
import { UserAvatar } from '@/components/common/user-avatar'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { PasswordChangeForm } from '@/features/my-work/password-form'
import { formatDate, formatDateTime, today } from '@/lib/format'
import { usePrefs, usePrefsStore } from '@/lib/prefs'
import { cn } from '@/lib/utils'

const ROLE_TONE: Record<Role, string> = {
  ADMIN: 'bg-brand-soft text-brand',
  MANAGER: 'bg-info-soft text-info',
  USER: 'bg-muted text-muted-foreground',
}

function SettingsCard({ icon, title, description, children, className }: { icon: ReactNode; title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card', className)}>
      <header className={cn('flex gap-3 border-b px-5 py-4', description ? 'items-start' : 'items-center')}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

function ProfileCard() {
  const user = useCurrentUser()
  // Re-render the login date when the พ.ศ. switch flips (the page isn't remounted while it's open).
  usePrefs()
  const rows: { label: string; value: ReactNode }[] = [
    { label: 'ชื่อผู้ใช้', value: user.username ?? '—' },
    { label: 'อีเมล', value: <span className="break-all">{user.email ?? '—'}</span> },
    { label: 'ชื่อเล่น', value: user.nickname ?? '—' },
    { label: 'ฝ่าย / แผนก', value: user.department ?? '—' },
    { label: 'ตำแหน่ง', value: user.position ?? '—' },
    { label: 'เข้าสู่ระบบล่าสุด', value: <span className="tabular">{formatDateTime(user.lastLoginAt)}</span> },
  ]
  return (
    <SettingsCard icon={<UserRoundIcon />} title="ข้อมูลส่วนตัว">
      <div className="flex items-center gap-4">
        <UserAvatar user={user} size="lg" tooltip={false} className="size-14 text-lg" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{user.name}</p>
          <span className={cn('mt-1 inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium', ROLE_TONE[user.role])}>{ROLE_LABEL[user.role]}</span>
        </div>
      </div>
      <dl className="mt-5 divide-y text-sm">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2.5 first:pt-0">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="min-w-0">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/70 px-3 py-2 text-xs text-muted-foreground">
        <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
        ข้อมูลส่วนนี้แก้ไขเองไม่ได้ ติดต่อผู้ดูแลระบบเพื่อแก้ไขข้อมูล
      </p>
    </SettingsCard>
  )
}

function DisplayCard() {
  const { buddhistEra } = usePrefs()
  const t = today()
  return (
    <SettingsCard icon={<CalendarDaysIcon />} title="การแสดงผล" description="ตั้งค่านี้มีผลเฉพาะเบราว์เซอร์ที่คุณใช้อยู่">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="pref-buddhist-era">แสดงปีเป็นพุทธศักราช (พ.ศ.)</Label>
          <p id="pref-buddhist-era-desc" className="text-sm text-muted-foreground">
            ปิดเพื่อแสดงปีเป็นคริสต์ศักราช (ค.ศ.) ทั่วทั้งระบบ
          </p>
        </div>
        <Switch
          id="pref-buddhist-era"
          checked={buddhistEra}
          aria-describedby="pref-buddhist-era-desc"
          onCheckedChange={(checked) => usePrefsStore.set({ buddhistEra: checked })}
        />
      </div>
      <div className="mt-4 rounded-lg border border-dashed px-3 py-2.5 text-sm" aria-live="polite">
        <span className="text-xs text-muted-foreground">ตัวอย่างวันนี้</span>
        <div className="tabular mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-medium">{formatDate(t, { long: true })}</span>
          <span className="text-muted-foreground">{formatDate(t)}</span>
        </div>
      </div>
    </SettingsCard>
  )
}

export default function SettingsPage() {
  const user = useCurrentUser()

  return (
    <div className="@container space-y-6">
      <PageHeader title="ตั้งค่าบัญชี" description="ดูข้อมูลบัญชีของคุณ ปรับการแสดงผล และเปลี่ยนรหัสผ่าน" />
      <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="grid min-w-0 gap-6">
          <ProfileCard />
          <DisplayCard />
        </div>
        <div className="grid min-w-0 gap-6">
          <SettingsCard icon={<KeyRoundIcon />} title="เปลี่ยนรหัสผ่าน" description="เมื่อเปลี่ยนแล้ว ใช้รหัสผ่านใหม่ในการเข้าสู่ระบบครั้งถัดไป">
            <PasswordChangeForm
              idPrefix="settings-pw"
              username={signInName(user) || undefined}
              className="max-w-md"
              onSuccess={() => toast.success('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว', { description: 'ครั้งหน้าเข้าสู่ระบบด้วยรหัสผ่านใหม่' })}
            />
          </SettingsCard>
        </div>
      </div>
    </div>
  )
}
