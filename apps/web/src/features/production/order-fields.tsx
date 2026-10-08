import { arrivalLate, orderExpectedOn, PRODUCTION_REF_MAX, productionDaysError, type ISODate, type Manufacturer } from '@flowtrade/shared'
import { CircleAlertIcon, FileTextIcon, TriangleAlertIcon, TruckIcon } from 'lucide-react'
import { useMemo } from 'react'
import { DateField } from '@/components/common/date-field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Field, PeoplePicker, PICKER_HINT } from '@/features/presentation/dialog-parts'
import { fieldAria } from '@/features/presentation/dialog-utils'
import { Callout } from '@/features/wizard/choice-card'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ManufacturerPicker } from './manufacturer-picker'
import { arrivalWarning, PROD_ERR, readDays, relativeTo, withMainContact, type StartRange } from './model'
import { orderFieldId } from './utils'
import type { OrderDraft, OrderErrors, OrderField, ProductionModel } from './types'

const optional = <span className="font-normal text-muted-foreground">(ถ้ามี)</span>

/** What the schedule row of OrderFields needs besides the draft. */
export interface ScheduleProps {
  range: StartRange
  /** The "วันที่ต้องการสินค้า" the arrival is compared with (confirm: the dialog's; edit: the order's SKUs still on their way). */
  neededOn: ISODate | null
  /** Warn about a late arrival (an edit of an order with nothing on its way any more: no). */
  warn: boolean
  /** The start may be cleared: an order without a schedule yet (it gets both fields or neither). */
  clearable?: boolean
}

/**
 * "ของถึงประมาณ {date} (อีก n วัน)" = start + days, live, with a yellow callout when it is after the need date and a red
 * one when after the launch; a muted prompt while either field is missing or invalid.
 */
function ArrivalPreview({ value, schedule, today, targetDate }: { value: OrderDraft; schedule: ScheduleProps; today: ISODate; targetDate: ISODate }) {
  const days = readDays(value.productionDays)
  const expected = orderExpectedOn(value.startedOn, days)
  if (!expected) {
    // A typed duration that isn't 1–365 whole days says so now, not only after submit.
    const daysProblem = value.productionDays.trim() ? productionDaysError(days, PROD_ERR) : null
    return (
      <p className={cn('flex items-start gap-2 text-xs sm:col-span-2', daysProblem ? 'text-warning-foreground' : 'text-muted-foreground')}>
        <TruckIcon className="mt-px size-3.5 shrink-0" aria-hidden />
        {daysProblem ??
          (schedule.clearable && !value.startedOn && !value.productionDays.trim()
            ? 'ใบนี้ยืนยันก่อนมีกำหนดการผลิต — ใส่วันที่เริ่มผลิตพร้อมระยะเวลาผลิต หรือเว้นว่างทั้งคู่'
            : 'เลือกวันที่เริ่มผลิตและกรอกระยะเวลาผลิต แล้วจะเห็นวันที่ของถึงประมาณ')}
      </p>
    )
  }
  const late = schedule.warn ? arrivalLate(expected, schedule.neededOn, targetDate) : null
  return (
    <div className="grid min-w-0 gap-2 sm:col-span-2">
      <p className="flex min-w-0 items-start gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
        <TruckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0">
          ของถึงประมาณ <span className="tabular font-semibold">{formatDate(expected)}</span>{' '}
          <span className="tabular text-muted-foreground">({relativeTo(expected, today)})</span>
        </span>
      </p>
      {late && (
        <Callout tone={late.kind === 'LAUNCH' ? 'danger' : 'warning'} icon={late.kind === 'LAUNCH' ? <CircleAlertIcon /> : <TriangleAlertIcon />}>
          {arrivalWarning(late)}
        </Callout>
      )}
    </div>
  )
}

/**
 * "ข้อมูลใบสั่งผลิต" (confirm and order-edit dialogs): บริษัทรับผลิต + รหัสเอกสารอ้างอิง, วันที่ดำเนินการ (เริ่มผลิต) +
 * ระยะเวลาผลิตทั้งหมด with the live "ของถึงประมาณ" under them, then ผู้ติดต่อหลัก + ผู้ติดต่อร่วม — two columns from `sm`,
 * one on phones (the shared OrderField order). Errors show as given (the caller decides when: after submit, or the
 * server's).
 */
export function OrderFields({
  formId,
  model,
  value,
  onChange,
  errors,
  schedule,
  known,
  keep,
}: {
  formId: string
  model: ProductionModel
  value: OrderDraft
  onChange: (next: OrderDraft) => void
  errors: OrderErrors
  schedule: ScheduleProps
  /** Manufacturers the record already names (a deactivated current one stays shown). */
  known?: Pick<Manufacturer, 'id' | 'name' | 'isActive'>[]
  /**
   * The edited order's contacts as saved. Besides the project team (model.pickableIds), its main contact may stay main
   * and its co-contacts may stay co-contacts even if they left the team since — only in that role, like the API: moved
   * to the other role, they must be on the team again.
   */
  keep?: Pick<OrderDraft, 'mainContactId' | 'coContactIds'>
}) {
  const team = model.pickableIds
  const keepMain = keep?.mainContactId
  const keepCo = keep?.coContactIds
  const mainAllowed = useMemo(() => (keepMain ? new Set([...team, keepMain]) : team), [team, keepMain])
  const coAllowed = useMemo(() => (keepCo?.length ? new Set([...team, ...keepCo]) : team), [team, keepCo])
  const fid = (key: OrderField) => orderFieldId(formId, key)
  const describedBy = (key: OrderField) => (errors[key] ? `${fid(key)}-error` : undefined)
  return (
    <fieldset className="grid min-w-0 gap-4 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 sm:p-4">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-medium">
        <FileTextIcon className="size-4 text-muted-foreground" />
        ข้อมูลใบสั่งผลิต
      </legend>
      <Field id={fid('manufacturerId')} label="บริษัทรับผลิต" required error={errors.manufacturerId}>
        <ManufacturerPicker
          id={fid('manufacturerId')}
          value={value.manufacturerId}
          onChange={(manufacturerId) => onChange({ ...value, manufacturerId })}
          known={known}
          invalid={!!errors.manufacturerId}
          aria-describedby={describedBy('manufacturerId')}
        />
      </Field>
      <Field id={fid('referenceNo')} label={<>รหัสเอกสารอ้างอิง {optional}</>} error={errors.referenceNo}>
        <Input
          {...fieldAria(fid('referenceNo'), errors.referenceNo)}
          value={value.referenceNo}
          onChange={(e) => onChange({ ...value, referenceNo: e.target.value })}
          maxLength={PRODUCTION_REF_MAX}
          placeholder="เช่น PO-2026-0012"
          autoComplete="off"
          className="bg-card"
        />
      </Field>
      <Field id={fid('startedOn')} label="วันที่ดำเนินการ (เริ่มผลิต)" required error={errors.startedOn} hint={schedule.range.hint}>
        <DateField
          id={fid('startedOn')}
          value={value.startedOn}
          onChange={(startedOn) => onChange({ ...value, startedOn })}
          min={schedule.range.pick.min}
          max={schedule.range.pick.max}
          clearable={!!schedule.clearable}
          disabled={schedule.range.locked}
          className={cn('w-full bg-card', errors.startedOn && 'border-destructive ring-3 ring-destructive/20')}
        />
      </Field>
      <Field id={fid('productionDays')} label="ระยะเวลาผลิตทั้งหมด" required error={errors.productionDays} hint="จำนวนวันโดยประมาณ นับจากวันที่เริ่มผลิตจนของถึง">
        <InputGroup className="h-9 bg-card">
          <InputGroupInput
            {...fieldAria(fid('productionDays'), errors.productionDays, true)}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="ประมาณกี่วัน"
            value={value.productionDays}
            onChange={(e) => onChange({ ...value, productionDays: e.target.value })}
            className="tabular"
          />
          <InputGroupAddon align="inline-end">วัน</InputGroupAddon>
        </InputGroup>
      </Field>
      <ArrivalPreview value={value} schedule={schedule} today={model.today} targetDate={model.targetDate} />
      <Field id={fid('mainContactId')} label="ผู้ติดต่อหลัก" required error={errors.mainContactId}>
        <PeoplePicker
          id={fid('mainContactId')}
          single
          value={value.mainContactId ? [value.mainContactId] : []}
          onChange={(ids) => onChange(withMainContact(value, ids[0] ?? null))}
          usersById={model.usersById}
          allowedIds={mainAllowed}
          placeholder="เลือกผู้ติดต่อหลัก"
          invalid={!!errors.mainContactId}
          aria-describedby={describedBy('mainContactId')}
        />
      </Field>
      <Field id={fid('coContactIds')} label={<>ผู้ติดต่อร่วม {optional}</>} error={errors.coContactIds}>
        <PeoplePicker
          id={fid('coContactIds')}
          value={value.coContactIds}
          onChange={(coContactIds) => onChange({ ...value, coContactIds })}
          usersById={model.usersById}
          allowedIds={coAllowed}
          excludeIds={value.mainContactId ? [value.mainContactId] : undefined}
          placeholder="เพิ่มผู้ติดต่อร่วม"
          invalid={!!errors.coContactIds}
          aria-describedby={describedBy('coContactIds')}
        />
      </Field>
      <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">{PICKER_HINT}</p>
    </fieldset>
  )
}
