import {
  DESCRIPTION_FORMAT_LABEL,
  DETAIL_FIELDS_MAX,
  DETAIL_LABEL_MAX,
  DETAIL_VALUE_MAX,
  detailFieldsProgress,
  formatDetailFields,
  parseDetailText,
  type DescriptionFormat,
  type DetailField,
  type TaskNode,
} from '@flowtrade/shared'
import type { UpdateTaskInput } from '@flowtrade/shared/api-types'
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon, PlusIcon, TableIcon, TextIcon, Trash2Icon } from 'lucide-react'
import { useId, useState } from 'react'
import { useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { uuid } from '@/lib/id'
import { cn } from '@/lib/utils'
import { AutosaveText } from './autosave-text'
import { useTreeEnv } from './tree-context'

const FORMAT_OPTIONS: { value: DescriptionFormat; icon: typeof TextIcon }[] = [
  { value: 'TEXT', icon: TextIcon },
  { value: 'FIELDS', icon: TableIcon },
]

/**
 * The task's details: free text, or a table of "รายละเอียดสินค้า → ข้อมูล" rows.
 * Managers pick the format and define the rows; the task's assignees fill in the data.
 */
export function TaskDetails({ node, canManage, canFill }: { node: TaskNode; canManage: boolean; canFill: boolean }) {
  const { actions } = useTreeEnv()
  const [confirm, confirmDialog] = useConfirm()
  const id = useId()
  const isTable = node.descriptionFormat === 'FIELDS'

  const switchTo = async (format: DescriptionFormat) => {
    if (format === node.descriptionFormat) return
    if (format === 'FIELDS') {
      const rows = parseDetailText(node.description).map((r) => ({ id: uuid(), ...r }))
      actions.update(node.id, { descriptionFormat: 'FIELDS', detailFields: rows, description: null }, rows.length ? `แปลงรายละเอียดเป็นตาราง ${rows.length} แถวแล้ว` : 'เปลี่ยนเป็นแบบตารางแล้ว')
      return
    }
    if (node.detailFields.length > 0) {
      const ok = await confirm({
        title: 'เปลี่ยนเป็นแบบข้อความ?',
        description: `ตาราง ${node.detailFields.length} แถวจะกลายเป็นข้อความ “หัวข้อ: ข้อมูล” บรรทัดละแถว — เปลี่ยนกลับเป็นตารางได้ภายหลัง`,
        confirmLabel: 'เปลี่ยนเป็นข้อความ',
      })
      if (!ok) return
    }
    actions.update(node.id, { descriptionFormat: 'TEXT', description: formatDetailFields(node.detailFields) || null, detailFields: [] }, 'เปลี่ยนเป็นแบบข้อความแล้ว')
  }

  return (
    <section className="space-y-2" aria-labelledby={`${id}-label`}>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Label id={`${id}-label`} htmlFor={isTable ? undefined : id} className="text-xs text-muted-foreground">
            รายละเอียด
          </Label>
          {isTable && node.detailFields.length > 0 && <FilledBadge fields={node.detailFields} />}
        </div>
        {canManage && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={node.descriptionFormat}
            onValueChange={(v) => v && void switchTo(v as DescriptionFormat)}
            aria-label="รูปแบบรายละเอียด"
            className="bg-card"
          >
            {FORMAT_OPTIONS.map((o) => (
              <ToggleGroupItem key={o.value} value={o.value} className="gap-1 px-2.5 text-xs data-[state=on]:bg-brand-soft data-[state=on]:text-brand">
                <o.icon aria-hidden />
                {DESCRIPTION_FORMAT_LABEL[o.value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      {isTable ? (
        <DetailTable node={node} canManage={canManage} canFill={canFill} confirm={confirm} />
      ) : canFill ? (
        <AutosaveText
          id={id}
          serverValue={node.description ?? ''}
          onSave={(text) => actions.update(node.id, { description: text || null }, 'บันทึกรายละเอียดแล้ว')}
          placeholder="เพิ่มรายละเอียด เช่น เอกสารที่ต้องเตรียม ผู้ติดต่อฝั่งห้าง หรือเงื่อนไขพิเศษ (บันทึกอัตโนมัติเมื่อคลิกออก)"
          className="min-h-24 bg-background"
        />
      ) : node.description ? (
        <p className="text-sm break-words whitespace-pre-wrap">{node.description}</p>
      ) : (
        <p className="text-sm text-muted-foreground">ไม่มีรายละเอียด</p>
      )}
      {confirmDialog}
    </section>
  )
}

export function FilledBadge({ fields, className }: { fields: DetailField[]; className?: string }) {
  const { filled, total } = detailFieldsProgress(fields)
  const complete = filled === total
  return (
    <span
      className={cn('tabular inline-flex h-5 items-center rounded-md px-1.5 text-xs font-medium', complete ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning-foreground', className)}
      title={complete ? 'กรอกข้อมูลครบทุกแถวแล้ว' : `ยังไม่กรอก ${total - filled} แถว`}
    >
      {complete ? `กรอกครบ ${total}/${total}` : `กรอกแล้ว ${filled}/${total}`}
    </span>
  )
}

type Confirm = ReturnType<typeof useConfirm>[0]

function DetailTable({ node, canManage, canFill, confirm }: { node: TaskNode; canManage: boolean; canFill: boolean; confirm: Confirm }) {
  const { actions } = useTreeEnv()
  const fields = node.detailFields

  const update = (patch: UpdateTaskInput, message?: string) => actions.update(node.id, patch, message)
  const move = (index: number, delta: number) => {
    const next = [...fields]
    const [row] = next.splice(index, 1)
    next.splice(index + delta, 0, row)
    update({ detailFields: next })
  }
  const remove = async (field: DetailField) => {
    if (field.value.trim()) {
      const ok = await confirm({
        title: `ลบแถว “${field.label}”?`,
        description: 'ข้อมูลที่กรอกไว้ในแถวนี้จะหายไปด้วย',
        confirmLabel: 'ลบแถว',
        destructive: true,
      })
      if (!ok) return
    }
    update({ detailRemove: [field.id] }, 'ลบแถวแล้ว')
  }
  // Appended on the server to the latest rows, so quick successive adds never overwrite each other.
  const add = (rows: { label: string; value: string }[]) => update({ detailAppend: rows.map((r) => ({ id: uuid(), ...r })) })

  return (
    <div className="space-y-2">
      {fields.length > 0 ? (
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] border-b bg-muted/60 text-xs font-medium text-muted-foreground">
            <div className="px-3 py-2">รายละเอียดสินค้า</div>
            <div className="border-l px-3 py-2">ข้อมูล</div>
          </div>
          <ul className="divide-y">
            {fields.map((f, i) => {
              const empty = !f.value.trim()
              return (
                <li key={f.id} className="group/row grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <div className="flex min-w-0 items-start bg-muted/25">
                    {canManage ? (
                      <AutosaveText
                        serverValue={f.label}
                        onSave={(label) => update({ detailLabels: { [f.id]: label } })}
                        validate={(v) => v.length > 0}
                        singleLine
                        maxLength={DETAIL_LABEL_MAX}
                        aria-label={`หัวข้อแถวที่ ${i + 1}`}
                        className="min-h-9 resize-none rounded-none border-transparent bg-transparent px-3 py-2 text-sm font-medium shadow-none hover:border-input focus-visible:ring-inset md:text-sm dark:bg-transparent"
                      />
                    ) : (
                      <p className="px-3 py-2 text-sm font-medium break-words">{f.label}</p>
                    )}
                  </div>
                  <div className={cn('flex min-w-0 items-start border-l', canFill && empty && 'bg-warning-soft/40')}>
                    {canFill ? (
                      <AutosaveText
                        serverValue={f.value}
                        onSave={(value) => update({ detailValues: { [f.id]: value } })}
                        enterGroup={`detail-${node.id}`}
                        maxLength={DETAIL_VALUE_MAX}
                        placeholder="กรอกข้อมูล"
                        aria-label={`ข้อมูล: ${f.label}`}
                        className="min-h-9 flex-1 resize-none rounded-none border-transparent bg-transparent px-3 py-2 text-sm shadow-none hover:border-input focus-visible:ring-inset md:text-sm dark:bg-transparent"
                      />
                    ) : (
                      <p className={cn('flex-1 px-3 py-2 text-sm break-words whitespace-pre-wrap', empty && 'text-muted-foreground')}>{empty ? 'ยังไม่กรอก' : f.value}</p>
                    )}
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="m-0.5 shrink-0 text-muted-foreground" aria-label={`ตัวเลือกแถว “${f.label}”`}>
                            <EllipsisIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem disabled={i === 0} onSelect={() => move(i, -1)}>
                            <ArrowUpIcon />
                            ย้ายขึ้น
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={i === fields.length - 1} onSelect={() => move(i, 1)}>
                            <ArrowDownIcon />
                            ย้ายลง
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => void remove(f)}>
                            <Trash2Icon />
                            ลบแถว
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          {canManage ? 'ยังไม่มีแถว — เพิ่มหัวข้อที่ต้องการให้กรอกข้อมูลด้านล่าง' : 'ยังไม่มีหัวข้อให้กรอก'}
        </p>
      )}
      {canManage && fields.length < DETAIL_FIELDS_MAX && <AddRow onAdd={add} />}
      {canFill && fields.length > 0 && <p className="text-xs text-muted-foreground">กด Enter เพื่อบันทึกและไปช่องถัดไป · Shift+Enter ขึ้นบรรทัดใหม่</p>}
    </div>
  )
}

/** Type a heading + Enter to add a row; pasting several lines adds one row per line ("หัวข้อ: ข้อมูล" also fills the data). */
function AddRow({ onAdd }: { onAdd: (rows: { label: string; value: string }[]) => void }) {
  const [text, setText] = useState('')
  const submit = (raw: string) => {
    const rows = parseDetailText(raw)
    if (rows.length === 0) return
    onAdd(rows)
    setText('')
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit(text)
      }}
    >
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
          e.preventDefault()
          submit(text)
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text')
          if (!pasted.includes('\n')) return
          e.preventDefault()
          submit(pasted)
        }}
        maxLength={DETAIL_LABEL_MAX}
        placeholder="เพิ่มหัวข้อ เช่น ชื่อสินค้าภาษาไทย แล้วกด Enter"
        aria-label="เพิ่มหัวข้อใหม่"
        className="h-9 bg-background"
      />
      <Button type="submit" variant="outline" className="h-9 shrink-0" disabled={!text.trim()} aria-label="เพิ่มแถว">
        <PlusIcon />
        <span className="hidden sm:inline">เพิ่มแถว</span>
      </Button>
    </form>
  )
}
