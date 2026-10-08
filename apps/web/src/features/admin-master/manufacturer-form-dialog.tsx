import { zodResolver } from '@hookform/resolvers/zod'
import { MANUFACTURER_NAME_MAX, MANUFACTURER_NOTE_MAX, type Manufacturer } from '@flowtrade/shared'
import { Loader2Icon } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ApiError, type ManufacturerInput } from '@/api'
import { manufacturerMutations } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CharCount, fieldAria, FormField } from './form-field'

/** Trim and collapse inner spaces — the API stores names this way, so "ABC  Co" can't sit next to "ABC Co". */
const cleanName = (raw: string) => raw.trim().replace(/\s+/g, ' ')

// Same limits as the API (shared MANUFACTURER_NAME_MAX / MANUFACTURER_NOTE_MAX).
const schema = z.object({
  name: z.string().trim().min(1, 'กรุณาระบุชื่อบริษัท').max(MANUFACTURER_NAME_MAX, `ชื่อยาวเกินไป (ไม่เกิน ${MANUFACTURER_NAME_MAX} ตัวอักษร)`),
  note: z.string().trim().max(MANUFACTURER_NOTE_MAX, `หมายเหตุยาวเกินไป (ไม่เกิน ${MANUFACTURER_NOTE_MAX} ตัวอักษร)`),
})
type Values = z.infer<typeof schema>

export function ManufacturerFormDialog({
  open,
  onOpenChange,
  manufacturer,
  manufacturers,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create */
  manufacturer: Manufacturer | null
  /** All manufacturers (incl. inactive) — for the duplicate-name check. */
  manufacturers: Manufacturer[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <ManufacturerForm key={manufacturer?.id ?? 'new'} manufacturer={manufacturer} manufacturers={manufacturers} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ManufacturerForm({ manufacturer, manufacturers, onDone }: { manufacturer: Manufacturer | null; manufacturers: Manufacturer[]; onDone: () => void }) {
  const create = manufacturerMutations.useCreate()
  const update = manufacturerMutations.useUpdate()
  const isEdit = !!manufacturer
  const { register, control, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: manufacturer?.name ?? '', note: manufacturer?.note ?? '' },
  })
  const { errors, isSubmitting, isDirty } = formState
  const [name, note] = useWatch({ control, name: ['name', 'note'] })

  const onSubmit = handleSubmit(async (values) => {
    const cleanedName = cleanName(values.name)
    const needle = cleanedName.toLowerCase()
    const dup = manufacturers.find((m) => m.id !== manufacturer?.id && cleanName(m.name).toLowerCase() === needle)
    if (dup) {
      setError('name', { message: `มี “${dup.name}” อยู่แล้ว${dup.isActive ? '' : ' (ปิดใช้งานอยู่ — เปิดใช้งานแทนได้)'}` })
      return
    }
    const cleanedNote = values.note.trim() || null
    try {
      if (manufacturer) {
        // Changed fields only: the activity log tells a rename from a note edit.
        const patch: Partial<ManufacturerInput> = {}
        if (cleanedName !== manufacturer.name) patch.name = cleanedName
        if (cleanedNote !== manufacturer.note) patch.note = cleanedNote
        if (Object.keys(patch).length > 0) await update.mutateAsync({ id: manufacturer.id, patch })
        toast.success(`บันทึก ${cleanedName} แล้ว`)
      } else {
        await create.mutateAsync({ name: cleanedName, note: cleanedNote })
        toast.success(`เพิ่มบริษัทรับผลิต “${cleanedName}” แล้ว`, { description: 'เลือกได้ตอนยืนยันเริ่มผลิตทันที' })
      }
      onDone()
    } catch (error) {
      // e.g. the same name added by someone else meanwhile (the toast comes from the hook)
      if (error instanceof ApiError && error.status === 422) {
        const message = error.fields?.name ?? (error.message.includes('ชื่อ') ? error.message : null)
        if (message) setError('name', { message })
      }
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{manufacturer ? `แก้ไข ${manufacturer.name}` : 'เพิ่มบริษัทรับผลิต'}</DialogTitle>
        <DialogDescription>
          {isEdit ? 'ชื่อใหม่จะแสดงในใบสั่งผลิตทุกใบที่ใช้บริษัทนี้ทันที — ประวัติการยืนยันเดิมยังเป็นชื่อเดิม' : 'บริษัทที่เพิ่มจะให้เลือกได้ตอนยืนยันเริ่มผลิตทันที'}
        </DialogDescription>
      </DialogHeader>

      <FormField id="manufacturer-name" label="ชื่อบริษัท" required error={errors.name?.message} aside={<CharCount value={name} max={MANUFACTURER_NAME_MAX} />}>
        <Input {...register('name')} {...fieldAria('manufacturer-name', errors.name?.message)} placeholder="เช่น บริษัท เอบีซี แมนูแฟคเจอริ่ง จำกัด" autoComplete="off" autoFocus />
      </FormField>

      <FormField
        id="manufacturer-note"
        label="หมายเหตุ"
        optional
        error={errors.note?.message}
        hint="ข้อมูลที่ช่วยให้ทีมเลือกถูกบริษัท แสดงใต้ชื่อในตัวเลือก"
        aside={<CharCount value={note} max={MANUFACTURER_NOTE_MAX} />}
      >
        <Textarea {...register('note')} {...fieldAria('manufacturer-note', errors.note?.message, true)} rows={3} placeholder="เช่น ที่อยู่ เบอร์โทร หรือประเภทสินค้าที่รับผลิต" />
      </FormField>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            ยกเลิก
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting || (isEdit && !isDirty)}>
          {isSubmitting && <Loader2Icon className="animate-spin" />}
          {isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มบริษัท'}
        </Button>
      </DialogFooter>
    </form>
  )
}
