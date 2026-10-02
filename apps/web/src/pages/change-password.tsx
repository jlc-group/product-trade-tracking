import { signInName } from '@flowtrade/shared'
import { ArrowLeftIcon, LogOutIcon, ShieldCheckIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAuth, useCurrentUser } from '@/auth/auth'
import { PageHeader } from '@/components/common/misc'
import { UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { PasswordChangeForm } from '@/features/my-work/password-form'
import { APP_MARK, APP_NAME } from '@/lib/brand'

/** Rendered outside the app shell: users with an admin-issued temporary password land here first. */
export default function ChangePasswordPage() {
  const user = useCurrentUser()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const forced = user.mustChangePassword

  const signOut = async () => {
    setSigningOut(true)
    try {
      await logout()
      navigate('/login', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">{APP_MARK}</span>
          <span className="font-semibold">{APP_NAME}</span>
        </div>

        <main className="space-y-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="space-y-4">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <ShieldCheckIcon className="size-5" />
            </span>
            <PageHeader
              title={forced ? 'ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน' : 'เปลี่ยนรหัสผ่าน'}
              description={
                forced
                  ? 'ผู้ดูแลระบบออกรหัสผ่านชั่วคราวให้คุณ เพื่อความปลอดภัยของบัญชี กรุณาตั้งรหัสผ่านใหม่ที่รู้เฉพาะคุณก่อนใช้งานต่อ'
                  : 'ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ'
              }
            />
            <div className="flex items-center gap-2.5 rounded-lg bg-muted/70 px-3 py-2">
              <UserAvatar user={user} size="md" tooltip={false} />
              <div className="min-w-0 text-sm leading-tight">
                <p className="truncate font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{signInName(user)}</p>
              </div>
            </div>
          </div>

          <PasswordChangeForm
            idPrefix="first-pw"
            username={signInName(user) || undefined}
            currentLabel={forced ? 'รหัสผ่านชั่วคราว (ที่ได้รับจากผู้ดูแลระบบ)' : 'รหัสผ่านปัจจุบัน'}
            submitLabel={forced ? 'บันทึกและเริ่มใช้งาน' : 'บันทึกรหัสผ่านใหม่'}
            autoFocus
            submitClassName="sm:w-full"
            onSuccess={() => {
              toast.success(forced ? `ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว ยินดีต้อนรับสู่ ${APP_NAME}` : 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว')
              navigate('/', { replace: true })
            }}
          />
        </main>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {!forced && (
            <Button asChild variant="link" size="sm" className="h-auto gap-1 p-0 text-muted-foreground">
              <Link to="/">
                <ArrowLeftIcon />
                กลับหน้าหลัก
              </Link>
            </Button>
          )}
          <span className="inline-flex items-center gap-1">
            ไม่ใช่บัญชีของคุณ?
            <Button variant="link" size="sm" className="h-auto gap-1 p-0" onClick={signOut} disabled={signingOut}>
              <LogOutIcon />
              ออกจากระบบ
            </Button>
          </span>
        </div>
      </div>
    </div>
  )
}
