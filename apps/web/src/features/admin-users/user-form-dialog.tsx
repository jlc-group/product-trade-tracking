import { ROLE_LABEL, signInName, type Role, type User } from '@flowtrade/shared'
import { ArrowLeftRightIcon, CircleCheckIcon, DicesIcon, ExternalLinkIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, Loader2Icon, UserPlusIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ApiError, type UserInput } from '@/api'
import { useCreateUser, useDepartments, useUpdateUser } from '@/api/hooks'
import { useAuth } from '@/auth/auth'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ROLE_DESCRIPTION, ROLE_ORDER, toRole, type IssuedPassword } from './roles'
import { TempPasswordPanel } from './temp-password'

interface FormValues {
  email: string
  username: string
  name: string
  nickname: string
  /** Name from the admin-managed department list; null = not set. */
  department: string | null
  position: string
  role: Role
  /** Empty = keep (edit) / let the system issue a temporary one (add). */
  password: string
  mustChangePassword: boolean
}

type FieldKey = 'email' | 'username' | 'name' | 'department' | 'password'
type FieldErrors = Partial<Record<FieldKey, string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/
/** Thai characters — a Thai name, or the keyboard was left on the Thai layout. */
const THAI_RE = /[฀-๿]/
/** Field order on screen: the first one with an error gets focus. */
const FIELD_ORDER = ['username', 'email', 'name', 'department', 'password'] as const
/** Select value for "no department" (Radix Select items can't use an empty string). */
const NO_DEPARTMENT = '__none__'

/** 12 readable characters (no 0/O, 1/l/I) for the "random" button. */
function randomPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function toValues(user: User | null): FormValues {
  return {
    email: user?.email ?? '',
    username: user?.username ?? '',
    name: user?.name ?? '',
    nickname: user?.nickname ?? '',
    department: user?.department ?? null,
    position: user?.position ?? '',
    role: user?.role ?? 'USER',
    password: '',
    mustChangePassword: false,
  }
}

const IDENTIFIER_REQUIRED = 'กรอกชื่อผู้ใช้ หรืออีเมล อย่างน้อย 1 ช่อง เพื่อใช้เข้าสู่ระบบ'

/** A name typed into the email field (no "@") that would be a valid username, e.g. "Pop" → "pop". */
function usernameFromEmailField(v: FormValues): string | null {
  const raw = v.email.trim().toLowerCase()
  return raw && !raw.includes('@') && !v.username.trim() && USERNAME_RE.test(raw) ? raw : null
}

function validate(v: FormValues): FieldErrors {
  const errors: FieldErrors = {}
  const email = v.email.trim()
  const username = v.username.trim().toLowerCase()
  if (!email && !username) errors.username = IDENTIFIER_REQUIRED
  else if (username && !USERNAME_RE.test(username)) {
    errors.username = THAI_RE.test(username) ? 'ชื่อผู้ใช้ต้องพิมพ์เป็นภาษาอังกฤษ (a-z 0-9 . _ -) ยาว 3–32 ตัวอักษร — ชื่อภาษาไทยให้กรอกในช่อง ชื่อ-นามสกุล' : 'ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3–32 ตัวอักษร'
  }
  if (email && !EMAIL_RE.test(email)) {
    errors.email = email.includes('@')
      ? 'รูปแบบอีเมลไม่ถูกต้อง เช่น somchai@company.co.th'
      : THAI_RE.test(email)
        ? 'ช่องนี้ใช้กับอีเมล (ภาษาอังกฤษ) เท่านั้น เช่น somchai@company.co.th — ชื่อภาษาไทยให้กรอกในช่อง ชื่อ-นามสกุล'
        : username
          ? 'ช่องนี้ใช้กับอีเมลเท่านั้น — ถ้าไม่มีอีเมล ให้เว้นว่างไว้'
          : 'ช่องนี้ใช้กับอีเมลเท่านั้น — ถ้าจะเข้าสู่ระบบด้วยชื่อ ให้กรอกในช่องชื่อผู้ใช้'
  }
  if (!v.name.trim()) errors.name = 'กรุณากรอกชื่อ-นามสกุล'
  if (v.password && v.password.length < 8) errors.password = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'
  else if (v.password.length > 128) errors.password = 'รหัสผ่านยาวเกินไป (ไม่เกิน 128 ตัวอักษร)'
  return errors
}

function Field({
  id,
  label,
  required,
  error,
  hint,
  labelAction,
  children,
  className,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  hint?: ReactNode
  /** Small link / button shown at the end of the label row. */
  labelAction?: ReactNode
  children: ReactNode
  className?: string
}) {
  const labelNode = (
    <Label htmlFor={id}>
      {label}
      {required && (
        <span className="text-danger" aria-hidden>
          *
        </span>
      )}
    </Label>
  )
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      {labelAction ? (
        <div className="flex min-w-0 items-center justify-between gap-2">
          {labelNode}
          {labelAction}
        </div>
      ) : (
        labelNode
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <div className="text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  )
}

interface UserFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = add a new user. */
  user: User | null
  isSelf: boolean
  positionOptions: string[]
}

/** Add / edit a user. After adding, the same dialog switches to the one-time temporary password. */
export function UserFormDialog({ open, onOpenChange, user, isSelf, positionOptions }: UserFormDialogProps) {
  const create = useCreateUser()
  const update = useUpdateUser()
  const { can } = useAuth()
  const canManageDepartments = can('department.manage')
  const { data: departments, isError: departmentsFailed, refetch: refetchDepartments } = useDepartments()
  const [values, setValues] = useState<FormValues>(() => toValues(user))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [issued, setIssued] = useState<IssuedPassword | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const pending = create.isPending || update.isPending
  const isEdit = !!user
  // Your own password changes through Settings (it asks for the current one).
  const canSetPassword = !isSelf

  // Only active departments can be picked, in the admin's order.
  const activeDepartments = useMemo(() => (departments ?? []).filter((d) => d.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [departments])
  /** The chosen department isn't on the active list — the user still has a deactivated one (or the list hasn't loaded yet). */
  const unlistedDepartment = values.department !== null && !activeDepartments.some((d) => d.name === values.department) ? values.department : null
  const departmentDeactivated = unlistedDepartment !== null && departments !== undefined

  // "จัดการรายชื่อแผนก" opens in a new tab: pick up a department added there when the admin comes back.
  useEffect(() => {
    if (!open || !canManageDepartments) return
    const onFocus = () => void refetchDepartments()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [open, canManageDepartments, refetchDepartments])

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs = validate(values)
    setErrors(errs)
    const firstError = FIELD_ORDER.find((k) => errs[k])
    if (firstError) {
      document.getElementById(`user-${firstError}`)?.focus()
      return
    }
    const password = canSetPassword && values.password ? values.password : undefined
    const input: UserInput = {
      email: values.email.trim().toLowerCase() || null,
      username: values.username.trim().toLowerCase() || null,
      name: values.name.trim(),
      nickname: values.nickname.trim() || null,
      department: values.department,
      position: values.position.trim() || null,
      role: values.role,
      ...(password ? { password, mustChangePassword: values.mustChangePassword } : {}),
    }
    try {
      if (user) {
        const { role, department, ...rest } = input
        // Leave the department out unless it changed — a user may still be on a since-deactivated one.
        const departmentPatch = department !== (user.department ?? null) ? { department } : {}
        await update.mutateAsync({ id: user.id, patch: isSelf ? { ...rest, ...departmentPatch } : { ...rest, ...departmentPatch, role } })
        toast.success(password ? `บันทึกข้อมูลและตั้งรหัสผ่านใหม่ของ ${input.name} แล้ว` : `บันทึกข้อมูลของ ${input.name} แล้ว`, {
          description: password ? 'ผู้ใช้ถูกออกจากระบบทุกอุปกรณ์ ให้เข้าสู่ระบบใหม่ด้วยรหัสผ่านนี้' : undefined,
        })
        onOpenChange(false)
      } else {
        const result = await create.mutateAsync(input)
        if (result.tempPassword) {
          setIssued({ user: result.user, tempPassword: result.tempPassword })
          toast.success(`เพิ่ม ${result.user.name} เข้าระบบแล้ว`)
        } else {
          toast.success(`เพิ่ม ${result.user.name} เข้าระบบแล้ว`, { description: `เข้าสู่ระบบด้วย ${signInName(result.user)} และรหัสผ่านที่ตั้งไว้` })
          onOpenChange(false)
        }
      }
    } catch (err) {
      // The hook already shows the error toast; also put field errors (e.g. duplicate email or username) under the field.
      const fields = err instanceof ApiError ? err.fields : undefined
      const firstServerError = fields && FIELD_ORDER.find((k) => fields[k])
      if (fields && firstServerError) {
        setErrors((er) => ({ ...er, ...Object.fromEntries(FIELD_ORDER.filter((k) => fields[k]).map((k) => [k, fields[k]])) }))
        document.getElementById(`user-${firstServerError}`)?.focus()
      }
    }
  }

  const addAnother = () => {
    setIssued(null)
    setValues(toValues(null))
    setErrors({})
    setShowPassword(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg"
        onInteractOutside={(e) => {
          // Don't lose a half-filled form or the one-time password to a stray click.
          if (issued || pending) e.preventDefault()
        }}
      >
        {issued ? (
          <>
            <DialogHeader>
              <div className="flex size-10 items-center justify-center rounded-full bg-success-soft text-success">
                <CircleCheckIcon className="size-5" />
              </div>
              <DialogTitle>เพิ่ม {issued.user.name} เรียบร้อย</DialogTitle>
              <DialogDescription>ส่งชื่อผู้ใช้และรหัสผ่านชั่วคราวด้านล่างให้ผู้ใช้ เพื่อใช้เข้าสู่ระบบครั้งแรก</DialogDescription>
            </DialogHeader>
            <TempPasswordPanel issued={issued} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={addAnother}>
                <UserPlusIcon /> เพิ่มผู้ใช้อีกคน
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                เสร็จสิ้น
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{user ? `แก้ไขข้อมูล ${user.name}` : 'เพิ่มผู้ใช้'}</DialogTitle>
              <DialogDescription>
                {isEdit ? 'การเปลี่ยนอีเมล ชื่อผู้ใช้ หรือรหัสผ่าน จะมีผลกับการเข้าสู่ระบบครั้งถัดไปของผู้ใช้' : 'ใส่แค่ชื่อผู้ใช้ก็พอ (อีเมลไม่บังคับ) — ตั้งรหัสผ่านเองได้เลย หรือเว้นว่างให้ระบบสร้างรหัสชั่วคราว'}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="user-username" label="ชื่อผู้ใช้ (ใช้เข้าสู่ระบบ)" error={errors.username} hint="เช่น pop หรือ somchai — ใช้ a-z 0-9 . _ - ได้">
                <Input
                  id="user-username"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="pop"
                  value={values.username}
                  onChange={(e) => {
                    set('username', e.target.value.toLowerCase())
                    if (errors.email && !values.email.includes('@')) setErrors((er) => ({ ...er, email: undefined }))
                  }}
                  aria-invalid={!!errors.username}
                  aria-describedby={errors.username ? 'user-username-error' : undefined}
                  className="h-9"
                  autoFocus={!isEdit}
                />
              </Field>
              <div className="grid content-start gap-1.5">
                <Field id="user-email" label="อีเมล" error={errors.email} hint="ไม่บังคับ — ถ้ามีชื่อผู้ใช้แล้วเว้นว่างได้">
                  <Input
                    id="user-email"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    placeholder="name@company.co.th"
                    value={values.email}
                    onChange={(e) => {
                      set('email', e.target.value)
                      // An email now fills the "username or email" requirement.
                      if (errors.username === IDENTIFIER_REQUIRED) setErrors((er) => ({ ...er, username: undefined }))
                    }}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'user-email-error' : undefined}
                    className="h-9"
                  />
                </Field>
                {usernameFromEmailField(values) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 justify-start border-dashed text-xs"
                    onClick={() => {
                      const name = usernameFromEmailField(values)!
                      setValues((v) => ({ ...v, username: name, email: '' }))
                      setErrors((er) => ({ ...er, email: undefined, username: undefined }))
                      document.getElementById('user-username')?.focus()
                    }}
                  >
                    <ArrowLeftRightIcon />
                    ใช้ “{usernameFromEmailField(values)}” เป็นชื่อผู้ใช้แทน
                  </Button>
                )}
              </div>
              <Field id="user-name" label="ชื่อ-นามสกุล" required error={errors.name}>
                <Input
                  id="user-name"
                  autoComplete="off"
                  placeholder="สมชาย ใจดี"
                  value={values.name}
                  onChange={(e) => set('name', e.target.value)}
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'user-name-error' : undefined}
                  className="h-9"
                />
              </Field>
              <Field id="user-nickname" label="ชื่อเล่น" hint="แสดงคู่กับชื่อ ช่วยให้ทีมหาเจอง่าย">
                <Input id="user-nickname" autoComplete="off" placeholder="ชาย" value={values.nickname} onChange={(e) => set('nickname', e.target.value)} className="h-9" />
              </Field>
              <Field
                id="user-department"
                label="แผนก"
                error={errors.department}
                hint={
                  departmentDeactivated ? (
                    <span className="inline-block rounded bg-warning-soft px-1.5 leading-5 text-warning-foreground">แผนกนี้ถูกปิดการใช้งาน — เลือกแผนกใหม่ได้</span>
                  ) : departmentsFailed ? (
                    <span>
                      โหลดรายชื่อแผนกไม่สำเร็จ{' '}
                      <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => void refetchDepartments()}>
                        ลองอีกครั้ง
                      </button>
                    </span>
                  ) : undefined
                }
                labelAction={
                  canManageDepartments ? (
                    <Link
                      to="/admin/departments"
                      target="_blank"
                      rel="noopener"
                      title="เปิดในแท็บใหม่"
                      className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
                    >
                      จัดการรายชื่อแผนก
                      <ExternalLinkIcon className="size-3" aria-hidden />
                    </Link>
                  ) : undefined
                }
              >
                <Select value={values.department ?? NO_DEPARTMENT} onValueChange={(v) => set('department', v === NO_DEPARTMENT ? null : v)}>
                  <SelectTrigger
                    id="user-department"
                    className={cn('h-9 w-full', departmentDeactivated && 'text-muted-foreground')}
                    aria-invalid={!!errors.department}
                    aria-describedby={errors.department ? 'user-department-error' : undefined}
                  >
                    <SelectValue placeholder="เลือกแผนก" />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start" className="max-h-72">
                    {activeDepartments.map((d) => (
                      <SelectItem key={d.id} value={d.name}>
                        {d.name}
                      </SelectItem>
                    ))}
                    {unlistedDepartment !== null && (
                      // Kept so the current value still shows; it can't be picked again once changed.
                      <SelectItem value={unlistedDepartment} disabled={departmentDeactivated}>
                        {unlistedDepartment}
                        {departmentDeactivated && <span className="text-xs">(ปิดใช้งาน)</span>}
                      </SelectItem>
                    )}
                    {(activeDepartments.length > 0 || unlistedDepartment !== null) && <SelectSeparator />}
                    <SelectItem value={NO_DEPARTMENT}>
                      <span className="text-muted-foreground">ไม่ระบุแผนก</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field id="user-position" label="ตำแหน่ง">
                <Input id="user-position" list="user-position-options" autoComplete="off" placeholder="Key Account Executive" value={values.position} onChange={(e) => set('position', e.target.value)} className="h-9" />
                <datalist id="user-position-options">
                  {positionOptions.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </Field>
            </div>

            <fieldset className="grid gap-3 rounded-lg border bg-muted/30 p-3">
              <legend className="flex items-center gap-1.5 px-1 text-sm font-medium">
                <KeyRoundIcon className="size-4 text-muted-foreground" />
                {isEdit ? 'ตั้งรหัสผ่านใหม่' : 'รหัสผ่าน'}
              </legend>
              {canSetPassword ? (
                <>
                  <Field
                    id="user-password"
                    label={isEdit ? 'รหัสผ่านใหม่' : 'รหัสผ่าน'}
                    error={errors.password}
                    hint={isEdit ? 'เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน — เมื่อเปลี่ยน ผู้ใช้จะถูกออกจากระบบทุกอุปกรณ์' : 'อย่างน้อย 8 ตัวอักษร — เว้นว่างไว้ ระบบจะสร้างรหัสผ่านชั่วคราวให้'}
                  >
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          id="user-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          spellCheck={false}
                          value={values.password}
                          onChange={(e) => set('password', e.target.value)}
                          aria-invalid={!!errors.password}
                          aria-describedby={errors.password ? 'user-password-error' : undefined}
                          className="h-9 pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                          aria-pressed={showPassword}
                          className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 shrink-0"
                        onClick={() => {
                          set('password', randomPassword())
                          setShowPassword(true)
                        }}
                      >
                        <DicesIcon />
                        สุ่มรหัส
                      </Button>
                    </div>
                  </Field>
                  {values.password && (
                    <Label htmlFor="user-must-change" className="items-start gap-2.5 font-normal">
                      <Checkbox
                        id="user-must-change"
                        checked={values.mustChangePassword}
                        onCheckedChange={(v) => set('mustChangePassword', v === true)}
                        className="mt-0.5"
                      />
                      <span className="grid gap-0.5">
                        <span className="text-sm">ให้ผู้ใช้เปลี่ยนรหัสผ่านเองเมื่อเข้าสู่ระบบครั้งถัดไป</span>
                        <span className="text-xs text-muted-foreground">ถ้าไม่เลือก ผู้ใช้จะใช้รหัสผ่านนี้ต่อได้เลย</span>
                      </span>
                    </Label>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">เปลี่ยนรหัสผ่านของตัวเองได้ที่หน้า ตั้งค่าบัญชี</p>
              )}
            </fieldset>

            <fieldset className="grid gap-2" disabled={isSelf}>
              <legend id="user-role-label" className="mb-2 text-sm font-medium">
                บทบาท
                {isSelf && <span className="ml-2 text-xs font-normal text-muted-foreground">เปลี่ยนบทบาทของตัวเองไม่ได้</span>}
              </legend>
              <RadioGroup
                value={values.role}
                onValueChange={(v) => {
                  const role = toRole(v)
                  if (role) set('role', role)
                }}
                aria-labelledby="user-role-label"
                disabled={isSelf}
              >
                {ROLE_ORDER.map((r) => (
                  <Label
                    key={r}
                    htmlFor={`user-role-${r}`}
                    className={cn(
                      'items-start gap-3 rounded-lg border p-3 leading-snug font-normal transition-colors has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-brand-soft/50',
                      isSelf ? 'opacity-60' : 'cursor-pointer hover:bg-muted/50',
                    )}
                  >
                    <RadioGroupItem id={`user-role-${r}`} value={r} className="mt-0.5" />
                    <span className="grid gap-0.5">
                      <span className="font-medium">{ROLE_LABEL[r]}</span>
                      <span className="text-xs text-muted-foreground">{ROLE_DESCRIPTION[r]}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2Icon className="animate-spin" /> : isEdit ? null : <UserPlusIcon />}
                {isEdit ? 'บันทึกการแก้ไข' : values.password ? 'เพิ่มผู้ใช้' : 'เพิ่มผู้ใช้และสร้างรหัสผ่านชั่วคราว'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
