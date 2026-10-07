import type { ISODate } from '@flowtrade/shared'
import { CalendarIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { th } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { dayjs, formatDate } from '@/lib/format'
import { usePrefs } from '@/lib/prefs'
import { cn } from '@/lib/utils'

const toDate = (value: ISODate) => new Date(`${value}T00:00:00`)
const toIso = (date: Date): ISODate => dayjs(date).format('YYYY-MM-DD')

/** Thai calendar with Buddhist-Era captions when the user prefers it. */
export function ThaiCalendar(props: {
  selected: ISODate | null
  onSelect: (value: ISODate | null) => void
  min?: ISODate | null
  max?: ISODate | null
  /** Days to highlight (e.g. milestone dates). */
  marked?: ISODate[]
  /** Clicking the selected day keeps it (single mode would otherwise clear it). */
  required?: boolean
}) {
  const { buddhistEra } = usePrefs()
  return (
    <Calendar
      mode="single"
      locale={th}
      selected={props.selected ? toDate(props.selected) : undefined}
      defaultMonth={props.selected ? toDate(props.selected) : props.min ? toDate(props.min) : undefined}
      onSelect={(d) => {
        if (d || !props.required) props.onSelect(d ? toIso(d) : null)
      }}
      disabled={[...(props.min ? [{ before: toDate(props.min) }] : []), ...(props.max ? [{ after: toDate(props.max) }] : [])]}
      modifiers={{ marked: (props.marked ?? []).map(toDate) }}
      modifiersClassNames={{ marked: 'after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-warning relative' }}
      formatters={{ formatCaption: (date) => dayjs(date).format(buddhistEra ? 'MMMM BBBB' : 'MMMM YYYY') }}
    />
  )
}

interface DateFieldProps {
  value: ISODate | null
  onChange: (value: ISODate | null) => void
  placeholder?: string
  min?: ISODate | null
  max?: ISODate | null
  clearable?: boolean
  className?: string
  size?: 'default' | 'sm'
  disabled?: boolean
  id?: string
}

export function DateField({ value, onChange, placeholder = 'เลือกวันที่', min, max, clearable = true, className, size = 'default', disabled, id }: DateFieldProps) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          size={size}
          disabled={disabled}
          className={cn('justify-start gap-2 font-normal', size === 'default' && 'h-9', !value && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="text-muted-foreground" />
          <span className="flex-1 truncate text-left">{value ? formatDate(value, { long: true }) : placeholder}</span>
          {clearable && value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="ล้างวันที่"
              className="-mr-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation()
                  onChange(null)
                }
              }}
            >
              <XIcon className="size-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <ThaiCalendar
          selected={value}
          min={min}
          max={max}
          required={!clearable}
          onSelect={(v) => {
            onChange(v)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
