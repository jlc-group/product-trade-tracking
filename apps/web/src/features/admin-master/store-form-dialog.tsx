import { zodResolver } from '@hookform/resolvers/zod'
import type { Channel, Store } from '@flowtrade/shared'
import { Loader2Icon } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { ApiError, type StoreInput } from '@/api'
import { storeMutations } from '@/api/hooks'
import { ChannelBadge, StoreChip, StoreLogo } from '@/components/common/badges'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ChannelPicker } from './channel-picker'
import { HEX_RE, safeColor } from './color'
import { ColorField } from './color-field'
import { CharCount, fieldAria, FormField } from './form-field'

export const STORE_NOUN: Record<Channel, string> = { OFFLINE: 'ห้าง', ONLINE: 'แพลตฟอร์ม' }
const SHORT_MAX = 6
const NAME_REQUIRED = 'กรุณาระบุชื่อ'

const schema = z.object({
  channel: z.enum(['OFFLINE', 'ONLINE']),
  name: z.string().trim().min(1, NAME_REQUIRED).max(60, 'ชื่อยาวเกินไป (ไม่เกิน 60 ตัวอักษร)'),
  shortName: z.string().trim().min(1, 'กรุณาระบุชื่อย่อที่จะแสดงบนโลโก้').max(SHORT_MAX, `ชื่อย่อได้ไม่เกิน ${SHORT_MAX} ตัวอักษร`),
  color: z.string().regex(HEX_RE, 'รหัสสีต้องเป็นรูปแบบ #RRGGBB เช่น #2563EB'),
  description: z.string().trim().max(200, 'คำอธิบายยาวเกินไป (ไม่เกิน 200 ตัวอักษร)'),
})
type Values = z.infer<typeof schema>

/** "Big C Extra" → "BigCEx" — a starting point the admin can overwrite. */
function suggestShortName(name: string) {
  return name.replace(/\s+/g, '').slice(0, SHORT_MAX)
}

export function StoreFormDialog({
  open,
  onOpenChange,
  store,
  defaultChannel,
  stores,
  usage,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create */
  store: Store | null
  defaultChannel: Channel
  /** All stores (incl. inactive) — for the duplicate-name check. */
  stores: Store[]
  /** Usage of the store being edited; locks the channel when > 0. */
  usage: number
  onSaved?: (store: { channel: Channel }) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <StoreForm key={store?.id ?? 'new'} store={store} defaultChannel={defaultChannel} stores={stores} usage={usage} onDone={(c) => { onSaved?.({ channel: c }); onOpenChange(false) }} />
      </DialogContent>
    </Dialog>
  )
}

function StoreForm({ store, defaultChannel, stores, usage, onDone }: { store: Store | null; defaultChannel: Channel; stores: Store[]; usage: number; onDone: (channel: Channel) => void }) {
  const create = storeMutations.useCreate()
  const update = storeMutations.useUpdate()
  const isEdit = !!store
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      channel: store?.channel ?? defaultChannel,
      name: store?.name ?? '',
      shortName: store?.shortName ?? '',
      color: store?.color ?? (defaultChannel === 'OFFLINE' ? '#16a34a' : '#ee4d2d'),
      description: store?.description ?? '',
    },
  })
  const { register, control, handleSubmit, setValue, setError, getFieldState, formState } = form
  const { errors, isSubmitting, isDirty, isSubmitted } = formState
  const [channel, name, shortName, color, description] = useWatch({ control, name: ['channel', 'name', 'shortName', 'color', 'description'] })
  const noun = STORE_NOUN[channel]
  const channelLocked = isEdit && usage > 0
  const nameError = errors.name?.message === NAME_REQUIRED ? `กรุณาระบุชื่อ${noun}` : errors.name?.message

  const onSubmit = handleSubmit(async (values) => {
    const cleanName = values.name.trim()
    const dup = stores.find((s) => s.id !== store?.id && s.channel === values.channel && s.name.trim().toLowerCase() === cleanName.toLowerCase())
    if (dup) {
      setError('name', { message: `มี “${dup.name}” อยู่แล้วใน${values.channel === 'OFFLINE' ? 'ห้าง (Offline)' : 'แพลตฟอร์ม (Online)'}${dup.isActive ? '' : ' (ปิดใช้งานอยู่ — เปิดใช้งานแทนได้)'}` })
      return
    }
    const input: StoreInput = {
      channel: values.channel,
      name: cleanName,
      shortName: values.shortName.trim(),
      color: values.color.toLowerCase(),
      description: values.description.trim() || null,
    }
    try {
      if (store) {
        const { channel: nextChannel, ...rest } = input
        await update.mutateAsync({ id: store.id, patch: nextChannel === store.channel ? rest : input })
      } else {
        await create.mutateAsync(input)
      }
      onDone(values.channel)
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && error.message.includes('ชื่อ')) setError('name', { message: error.message })
    }
  })

  const nameField = register('name', {
    onChange: (e: { target: { value: string } }) => {
      if (!isEdit && !getFieldState('shortName').isDirty) setValue('shortName', suggestShortName(e.target.value), { shouldValidate: isSubmitted })
    },
  })

  const previewStore = { name: name.trim() || `ชื่อ${noun}`, shortName: shortName.trim() || '?', color: safeColor(color) }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{store ? `แก้ไข${noun} ${store.name}` : `เพิ่ม${noun}ใหม่`}</DialogTitle>
        <DialogDescription>
          {isEdit ? 'การแก้ไขชื่อและสีจะแสดงผลในทุกโปรเจกต์ที่ใช้อยู่ทันที' : `${noun}ที่เพิ่มจะให้เลือกในขั้นตอนเสนอสินค้าได้ทันที`}
        </DialogDescription>
      </DialogHeader>

      {/* Live preview */}
      <div className="flex items-center gap-4 rounded-xl border border-dashed bg-muted/40 p-3 sm:p-4" aria-label="ตัวอย่างการแสดงผล">
        <StoreLogo store={previewStore} size="xl" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground">ตัวอย่างที่ผู้ใช้จะเห็น</div>
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{previewStore.name}</span>
            <ChannelBadge channel={channel} className="hidden sm:inline-flex" />
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">ในรายการ:</span>
            <StoreChip store={previewStore} className="text-foreground" />
          </div>
        </div>
      </div>

      <Controller
        control={control}
        name="channel"
        render={({ field }) => (
          <ChannelPicker
            value={field.value}
            onChange={field.onChange}
            captions={{ OFFLINE: 'ห้าง / ร้านค้า', ONLINE: 'แพลตฟอร์มออนไลน์' }}
            disabled={channelLocked}
            hint={channelLocked ? `เปลี่ยนช่องทางไม่ได้ เพราะมีการเสนอสินค้าใช้อยู่ ${usage} รายการ` : undefined}
          />
        )}
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <FormField id="store-name" label={`ชื่อ${noun}`} required error={nameError}>
          <Input {...nameField} {...fieldAria('store-name', nameError)} placeholder={channel === 'OFFLINE' ? 'เช่น Big C, Watsons' : 'เช่น Shopee, Lazada'} autoComplete="off" autoFocus />
        </FormField>
        <FormField id="store-short" label="ชื่อย่อบนโลโก้" required error={errors.shortName?.message} hint="ไม่เกิน 6 ตัวอักษร" aside={<CharCount value={shortName} max={SHORT_MAX} />}>
          <Input {...register('shortName')} {...fieldAria('store-short', errors.shortName?.message, true)} maxLength={SHORT_MAX} placeholder="เช่น BigC" autoComplete="off" />
        </FormField>
      </div>

      <FormField id="store-color" label="สีประจำ" required error={errors.color?.message} hint="ใช้เป็นสีพื้นของโลโก้และสีในกราฟ">
        <Controller
          control={control}
          name="color"
          render={({ field }) => (
            <ColorField
              id="store-color"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              invalid={!!errors.color}
              describedBy={errors.color ? 'store-color-error' : 'store-color-hint'}
              checkContrast
            />
          )}
        />
      </FormField>

      <FormField id="store-desc" label="คำอธิบาย" optional error={errors.description?.message} aside={<CharCount value={description} max={200} />}>
        <Textarea {...register('description')} {...fieldAria('store-desc', errors.description?.message)} rows={2} placeholder={channel === 'OFFLINE' ? 'เช่น ไฮเปอร์มาร์เก็ต / ร้านสะดวกซื้อ' : 'เช่น Marketplace, Social commerce'} />
      </FormField>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            ยกเลิก
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting || (isEdit && !isDirty)}>
          {isSubmitting && <Loader2Icon className="animate-spin" />}
          {isEdit ? 'บันทึกการแก้ไข' : `เพิ่ม${noun}`}
        </Button>
      </DialogFooter>
    </form>
  )
}
