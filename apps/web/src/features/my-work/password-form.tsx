import type { User } from '@flowtrade/shared'
import { CheckIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, Loader2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { errorMessage, useChangePassword } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export const MIN_PASSWORD_LENGTH = 8

type Field = 'current' | 'next' | 'confirm'
type Values = Record<Field, string>
const EMPTY: Values = { current: '', next: '', confirm: '' }

interface Strength {
  /** 0 = too short … 4 = very strong */
  score: 0 | 1 | 2 | 3 | 4
  label: string
  hint: string | null
  tone: 'danger' | 'warning' | 'info' | 'success'
}

export function passwordStrength(pw: string): Strength {
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return { score: 0, label: 'สั้นเกินไป', hint: `เพิ่มอีก ${MIN_PASSWORD_LENGTH - pw.length} ตัวอักษร`, tone: 'danger' }
  }
  const score = Math.min(4, 1 + (pw.length >= 12 ? 1 : 0) + (variety >= 2 ? 1 : 0) + (variety >= 3 ? 1 : 0)) as Strength['score']
  const hint = variety < 3 ? 'ผสมตัวพิมพ์ใหญ่-เล็ก ตัวเลข หรือสัญลักษณ์ จะเดายากขึ้น' : pw.length < 12 ? 'ยาว 12 ตัวขึ้นไปจะปลอดภัยยิ่งขึ้น' : null
  if (score === 1) return { score, label: 'พอใช้', hint, tone: 'warning' }
  if (score === 2) return { score, label: 'ดี', hint, tone: 'info' }
  if (score === 3) return { score, label: 'ดีมาก', hint, tone: 'success' }
  return { score, label: 'แข็งแรงมาก', hint, tone: 'success' }
}

const TONE_BAR: Record<Strength['tone'], string> = { danger: 'bg-danger', warning: 'bg-warning', info: 'bg-info', success: 'bg-success' }
const TONE_TEXT: Record<Strength['tone'], string> = { danger: 'text-danger', warning: 'text-warning-foreground', info: 'text-info', success: 'text-success' }

function StrengthMeter({ password, id }: { password: string; id: string }) {
  if (!password) {
    return (
      <p id={id} className="text-xs text-muted-foreground">
        อย่างน้อย {MIN_PASSWORD_LENGTH} ตัวอักษร และต้องไม่ซ้ำกับรหัสผ่านเดิม
      </p>
    )
  }
  const s = passwordStrength(password)
  return (
    <div id={id} className="space-y-1.5">
      <div className="grid grid-cols-4 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn('h-1 rounded-full transition-colors', i <= Math.max(1, s.score) ? TONE_BAR[s.tone] : 'bg-muted')} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        ความปลอดภัย: <span className={cn('font-medium', TONE_TEXT[s.tone])}>{s.label}</span>
        {s.hint && <> · {s.hint}</>}
      </p>
    </div>
  )
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  error,
  autoComplete,
  autoFocus,
  describedBy,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  autoComplete: string
  autoFocus?: boolean
  describedBy?: string
}) {
  const [visible, setVisible] = useState(false)
  const errorId = `${id}-error`
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <InputGroup className="h-9 bg-card">
        <InputGroupInput
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-invalid={!!error}
          aria-describedby={[error ? errorId : null, describedBy].filter(Boolean).join(' ') || undefined}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={visible ? `ซ่อน${label}` : `แสดง${label}`}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

function validate(v: Values): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {}
  if (!v.current) errors.current = 'กรุณากรอกรหัสผ่านปัจจุบัน'
  if (!v.next) errors.next = 'กรุณาตั้งรหัสผ่านใหม่'
  else if (v.next.length < MIN_PASSWORD_LENGTH) errors.next = `รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`
  else if (v.next === v.current) errors.next = 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม'
  if (!v.confirm) errors.confirm = 'กรุณากรอกรหัสผ่านใหม่อีกครั้ง'
  else if (v.confirm !== v.next) errors.confirm = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน ลองพิมพ์ใหม่อีกครั้ง'
  return errors
}

/** Current / new / confirm password form with a strength hint. Used by Settings and the forced change-password page. */
export function PasswordChangeForm({
  onSuccess,
  idPrefix = 'pw',
  submitLabel = 'บันทึกรหัสผ่านใหม่',
  currentLabel = 'รหัสผ่านปัจจุบัน',
  username,
  autoFocus,
  className,
  submitClassName,
}: {
  onSuccess: (user: User) => void
  idPrefix?: string
  submitLabel?: string
  currentLabel?: string
  /** Hidden username field so password managers save the new password against the right account. */
  username?: string
  autoFocus?: boolean
  className?: string
  submitClassName?: string
}) {
  const change = useChangePassword()
  const [values, setValues] = useState<Values>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [submitted, setSubmitted] = useState(false)

  const set = (field: Field) => (value: string) => {
    const next = { ...values, [field]: value }
    setValues(next)
    // After the first submit, re-validate as the user types so errors clear as soon as they're fixed.
    if (submitted) setErrors(validate(next))
    else if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    change.mutate(
      { current: values.current, next: values.next },
      {
        onSuccess: (user) => {
          setValues(EMPTY)
          setErrors({})
          setSubmitted(false)
          onSuccess(user)
        },
        onError: (err) => {
          const message = errorMessage(err)
          if (message.includes('ปัจจุบัน')) setErrors((prev) => ({ ...prev, current: message }))
        },
      },
    )
  }

  const matches = !!values.confirm && values.confirm === values.next

  return (
    <form onSubmit={submit} noValidate className={cn('space-y-4', className)}>
      {username && <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />}
      <PasswordInput
        id={`${idPrefix}-current`}
        label={currentLabel}
        value={values.current}
        onChange={set('current')}
        error={errors.current}
        autoComplete="current-password"
        autoFocus={autoFocus}
      />
      <div className="space-y-2">
        <PasswordInput
          id={`${idPrefix}-next`}
          label="รหัสผ่านใหม่"
          value={values.next}
          onChange={set('next')}
          error={errors.next}
          autoComplete="new-password"
          describedBy={`${idPrefix}-strength`}
        />
        <StrengthMeter password={values.next} id={`${idPrefix}-strength`} />
      </div>
      <div className="space-y-2">
        <PasswordInput
          id={`${idPrefix}-confirm`}
          label="ยืนยันรหัสผ่านใหม่"
          value={values.confirm}
          onChange={set('confirm')}
          error={errors.confirm}
          autoComplete="new-password"
        />
        {matches && !errors.confirm && (
          <p className="flex items-center gap-1 text-xs text-success">
            <CheckIcon className="size-3.5" /> รหัสผ่านตรงกัน
          </p>
        )}
      </div>
      <Button type="submit" className={cn('h-9 w-full gap-2 sm:w-auto', submitClassName)} disabled={change.isPending}>
        {change.isPending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
        {change.isPending ? 'กำลังบันทึก…' : submitLabel}
      </Button>
    </form>
  )
}
