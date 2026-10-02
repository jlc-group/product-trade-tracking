import { ArrowRightIcon, CheckCircle2Icon, Loader2Icon, LockIcon, UserRoundIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { errorMessage } from '@/api/hooks'
import { useAuth } from '@/auth/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { APP_MARK, APP_NAME } from '@/lib/brand'

const HIGHLIGHTS = [
  'เลือกห้าง ประเภท Shelf และวันวางขาย แล้วได้รายการงานอัตโนมัติ',
  'แบ่งงานได้ 3 ระดับ พร้อมกำหนดวันและผู้รับผิดชอบ',
  'ติดตามความคืบหน้าทุกโปรเจกต์ได้ในหน้าเดียว',
]

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to={user.mustChangePassword ? '/change-password' : from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('กรุณากรอกชื่อผู้ใช้หรืออีเมล และรหัสผ่าน')
      return
    }
    setSubmitting(true)
    try {
      const u = await login(email, password)
      navigate(u.mustChangePassword ? '/change-password' : from, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-base font-bold text-white">{APP_MARK}</span>
          <span className="text-lg font-semibold text-white">{APP_NAME}</span>
        </div>
        <div className="mt-auto max-w-md space-y-6">
          <h1 className="text-3xl leading-snug font-semibold text-white">จากการเสนอสินค้า ถึงวันที่สินค้าอยู่บนชั้นวาง</h1>
          <ul className="space-y-3">
            {HIGHLIGHTS.map((h) => (
              <li key={h} className="flex gap-3 text-sm leading-relaxed">
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-sidebar-primary" />
                {h}
              </li>
            ))}
          </ul>
        </div>
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full border-[40px] border-sidebar-primary/10" />
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">{APP_MARK}</span>
              <span className="font-semibold">{APP_NAME}</span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">เข้าสู่ระบบ</h2>
            <p className="text-sm text-muted-foreground">ใช้บัญชีที่ผู้ดูแลระบบสร้างให้ หากยังไม่มีบัญชี กรุณาติดต่อผู้ดูแลระบบ</p>
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">ชื่อผู้ใช้หรืออีเมล</Label>
              <div className="relative">
                <UserRoundIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="เช่น admin หรือ name@company.com" className="h-10 pl-9" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">รหัสผ่าน</Label>
              <div className="relative">
                <LockIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="password" type="password" autoComplete="current-password" className="h-10 pl-9" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="h-10 w-full gap-2" disabled={submitting}>
              {submitting ? <Loader2Icon className="animate-spin" /> : <ArrowRightIcon />}
              เข้าสู่ระบบ
            </Button>
            <p className="text-center text-xs text-muted-foreground">ลืมรหัสผ่าน? แจ้งผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่านชั่วคราว</p>
          </form>
        </div>
      </main>
    </div>
  )
}
