import { zodResolver } from '@hookform/resolvers/zod'
import { CHANNEL_TERMS, type Channel, type ShelfType } from '@flowtrade/shared'
import { Loader2Icon } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ApiError, type ShelfTypeInput } from '@/api'
import { shelfTypeMutations } from '@/api/hooks'
import { ShelfTypeBadge } from '@/components/common/badges'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ChannelPicker } from './channel-picker'
import { HEX_RE, safeColor } from './color'
import { ColorField } from './color-field'
import { CharCount, fieldAria, FormField } from './form-field'
import { ShelfTypeOptionCard } from './shelf-type-card'

/** "ประเภท Shelf" (offline) / "ประเภทการลงขาย" (online). */
export const SHELF_NOUN: Record<Channel, string> = { OFFLINE: CHANNEL_TERMS.OFFLINE.shelf, ONLINE: CHANNEL_TERMS.ONLINE.shelf }

const schema = z.object({
  channel: z.enum(['OFFLINE', 'ONLINE']),
  name: z.string().trim().min(1, 'กรุณาระบุชื่อประเภท').max(50, 'ชื่อยาวเกินไป (ไม่เกิน 50 ตัวอักษร)'),
  color: z.string().regex(HEX_RE, 'รหัสสีต้องเป็นรูปแบบ #RRGGBB เช่น #7C3AED'),
  description: z.string().trim().max(160, 'คำอธิบายยาวเกินไป (ไม่เกิน 160 ตัวอักษร)'),
})
type Values = z.infer<typeof schema>

export function ShelfTypeFormDialog({
  open,
  onOpenChange,
  shelfType,
  defaultChannel,
  shelfTypes,
  usage,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create */
  shelfType: ShelfType | null
  defaultChannel: Channel
  /** All shelf types (incl. inactive) — for the duplicate-name check. */
  shelfTypes: ShelfType[]
  usage: number
  onSaved?: (saved: { channel: Channel }) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <ShelfTypeForm
          key={shelfType?.id ?? 'new'}
          shelfType={shelfType}
          defaultChannel={defaultChannel}
          shelfTypes={shelfTypes}
          usage={usage}
          onDone={(c) => {
            onSaved?.({ channel: c })
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function ShelfTypeForm({ shelfType, defaultChannel, shelfTypes, usage, onDone }: { shelfType: ShelfType | null; defaultChannel: Channel; shelfTypes: ShelfType[]; usage: number; onDone: (channel: Channel) => void }) {
  const create = shelfTypeMutations.useCreate()
  const update = shelfTypeMutations.useUpdate()
  const isEdit = !!shelfType
  const { register, control, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      channel: shelfType?.channel ?? defaultChannel,
      name: shelfType?.name ?? '',
      color: shelfType?.color ?? '#7c3aed',
      description: shelfType?.description ?? '',
    },
  })
  const { errors, isSubmitting, isDirty } = formState
  const [channel, name, color, description] = useWatch({ control, name: ['channel', 'name', 'color', 'description'] })
  const noun = SHELF_NOUN[channel]
  const channelLocked = isEdit && usage > 0
  const preview = { channel, name: name.trim(), description: description.trim() || null, color: safeColor(color) }

  const onSubmit = handleSubmit(async (values) => {
    const cleanName = values.name.trim()
    const dup = shelfTypes.find((s) => s.id !== shelfType?.id && s.channel === values.channel && s.name.trim().toLowerCase() === cleanName.toLowerCase())
    if (dup) {
      setError('name', { message: `มี “${dup.name}” อยู่แล้วใน${SHELF_NOUN[values.channel]}${dup.isActive ? '' : ' (ปิดใช้งานอยู่ — เปิดใช้งานแทนได้)'}` })
      return
    }
    const input: ShelfTypeInput = { channel: values.channel, name: cleanName, color: values.color.toLowerCase(), description: values.description.trim() || null }
    try {
      if (shelfType) {
        const { channel: nextChannel, ...rest } = input
        await update.mutateAsync({ id: shelfType.id, patch: nextChannel === shelfType.channel ? rest : input })
        toast.success(`บันทึก ${cleanName} แล้ว`)
      } else {
        await create.mutateAsync(input)
        toast.success(`เพิ่ม${SHELF_NOUN[values.channel]} “${cleanName}” แล้ว`, { description: 'แสดงเป็นตัวเลือกในขั้นตอนเสนอสินค้าทันที' })
      }
      onDone(values.channel)
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && error.message.includes('ชื่อ')) setError('name', { message: error.message })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{shelfType ? `แก้ไข ${shelfType.name}` : `เพิ่ม${noun}`}</DialogTitle>
        <DialogDescription>
          {isEdit ? 'การแก้ไขจะแสดงผลในทุกโปรเจกต์ที่ใช้ประเภทนี้ทันที' : 'ประเภทที่เพิ่มจะแสดงเป็นตัวเลือกในขั้นตอนเสนอสินค้าทันที'}
        </DialogDescription>
      </DialogHeader>

      {/* Live preview: wizard option card + list badge */}
      <div className="grid gap-3 rounded-xl border border-dashed bg-muted/40 p-3 sm:p-4" aria-label="ตัวอย่างการแสดงผล">
        <div className="text-[11px] font-medium tracking-wide text-muted-foreground">ตัวอย่างในขั้นตอนเสนอสินค้า</div>
        <ShelfTypeOptionCard shelfType={preview} selected className="max-w-sm" />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>ในรายการโปรเจกต์:</span>
          <ShelfTypeBadge shelfType={{ name: preview.name || 'ชื่อประเภท', color: preview.color }} />
        </div>
      </div>

      <Controller
        control={control}
        name="channel"
        render={({ field }) => (
          <ChannelPicker
            value={field.value}
            onChange={field.onChange}
            captions={{ OFFLINE: 'ประเภท Shelf ในห้าง', ONLINE: 'ประเภทการลงขาย' }}
            disabled={channelLocked}
            hint={channelLocked ? `เปลี่ยนช่องทางไม่ได้ เพราะมีการเสนอสินค้าใช้อยู่ ${usage} รายการ` : undefined}
          />
        )}
      />

      <FormField id="shelf-name" label={`ชื่อ${noun}`} required error={errors.name?.message} aside={<CharCount value={name} max={50} />}>
        <Input
          {...register('name')}
          {...fieldAria('shelf-name', errors.name?.message)}
          placeholder={channel === 'OFFLINE' ? 'เช่น หัวกอนโดลา (End Cap), Island Display' : 'เช่น Flash Sale, Live Commerce'}
          autoComplete="off"
          autoFocus
        />
      </FormField>

      <FormField id="shelf-color" label="สีประจำประเภท" required error={errors.color?.message} hint="ใช้ในป้ายประเภทและการ์ดตัวเลือก">
        <Controller
          control={control}
          name="color"
          render={({ field }) => (
            <ColorField id="shelf-color" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.color} describedBy={errors.color ? 'shelf-color-error' : 'shelf-color-hint'} />
          )}
        />
      </FormField>

      <FormField
        id="shelf-desc"
        label="คำอธิบาย"
        optional
        error={errors.description?.message}
        hint="อธิบายว่าต่างจากประเภทอื่นอย่างไร เช่น ต้องออกแบบพื้นที่ หรือมีค่าใช้จ่ายเพิ่ม"
        aside={<CharCount value={description} max={160} />}
      >
        <Textarea {...register('description')} {...fieldAria('shelf-desc', errors.description?.message, true)} rows={2} placeholder="เช่น พื้นที่หัวชั้น สำหรับโปรโมชันช่วงเปิดตัว" />
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
