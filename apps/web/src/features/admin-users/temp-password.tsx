import { signInName } from '@flowtrade/shared'
import { CheckIcon, CopyIcon, KeyRoundIcon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { IssuedPassword } from './roles'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Shows a one-time temporary password with copy buttons. */
export function TempPasswordPanel({ issued }: { issued: IssuedPassword }) {
  const [copied, setCopied] = useState<'password' | 'all' | null>(null)

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(null), 2000)
    return () => window.clearTimeout(t)
  }, [copied])

  const copy = async (what: 'password' | 'all') => {
    const text =
      what === 'password'
        ? issued.tempPassword
        : [`เข้าสู่ระบบ FlowTrade ที่ ${window.location.origin}/login`, `${issued.user.username ? 'ชื่อผู้ใช้' : 'อีเมล'}: ${signInName(issued.user)}`, `รหัสผ่านชั่วคราว: ${issued.tempPassword}`, 'ระบบจะให้ตั้งรหัสผ่านใหม่เมื่อเข้าสู่ระบบครั้งแรก'].join('\n')
    if (await copyText(text)) {
      setCopied(what)
      toast.success(what === 'password' ? 'คัดลอกรหัสผ่านแล้ว' : 'คัดลอกข้อมูลเข้าสู่ระบบแล้ว — วางส่งให้ผู้ใช้ได้เลย')
    } else {
      toast.error('คัดลอกอัตโนมัติไม่สำเร็จ — เลือกข้อความในกล่องแล้วกด Ctrl+C แทน')
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-muted/50 p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <KeyRoundIcon className="size-3.5" aria-hidden />
          รหัสผ่านชั่วคราวของ {issued.user.name}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code
            className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2 font-mono text-lg font-semibold tracking-wider break-all select-all"
            aria-label="รหัสผ่านชั่วคราว"
          >
            {issued.tempPassword}
          </code>
          <Button type="button" variant={copied === 'password' ? 'secondary' : 'default'} className="h-11 px-3" onClick={() => copy('password')}>
            {copied === 'password' ? <CheckIcon /> : <CopyIcon />}
            {copied === 'password' ? 'คัดลอกแล้ว' : 'คัดลอก'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          เข้าสู่ระบบด้วย: <span className="font-medium break-all text-foreground">{signInName(issued.user)}</span>
        </p>
      </div>
      <p className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning-foreground">
        <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        ผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก — รหัสนี้จะแสดงครั้งเดียว
      </p>
      <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => copy('all')}>
        {copied === 'all' ? <CheckIcon /> : <CopyIcon />}
        คัดลอกข้อความสำหรับส่งให้ผู้ใช้ (ลิงก์ + ชื่อผู้ใช้ + รหัส)
      </Button>
    </div>
  )
}

/** Dialog used after "รีเซ็ตรหัสผ่าน". Outside clicks don't close it, so the password isn't lost by accident. */
export function TempPasswordDialog({ issued, onClose }: { issued: IssuedPassword | null; onClose: () => void }) {
  return (
    <Dialog open={!!issued} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>รีเซ็ตรหัสผ่านแล้ว</DialogTitle>
          <DialogDescription>ส่งรหัสผ่านชั่วคราวนี้ให้ {issued?.user.name} — รหัสเดิมใช้ไม่ได้แล้ว</DialogDescription>
        </DialogHeader>
        {issued && <TempPasswordPanel issued={issued} />}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            เสร็จสิ้น
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
