import { CheckIcon, PipetteIcon, TriangleAlertIcon } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { COLOR_PRESETS, isHexColor, isTooLightForWhiteText, normalizeHexInput, safeColor } from './color'

/**
 * Preset swatches + hex input + native picker. `id` goes on the hex input so a
 * <FormField id> label focuses it. Pass `checkContrast` when white text sits on the color.
 */
export function ColorField({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  describedBy,
  checkContrast = false,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  invalid?: boolean
  describedBy?: string
  checkContrast?: boolean
}) {
  const current = value.toLowerCase()
  const tooLight = checkContrast && isTooLightForWhiteText(current)

  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="สีที่แนะนำ">
        {COLOR_PRESETS.map((color) => {
          const selected = current === color
          return (
            <button
              key={color}
              type="button"
              aria-label={`ใช้สี ${color.toUpperCase()}`}
              aria-pressed={selected}
              onClick={() => onChange(color)}
              className={cn(
                'flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-popover transition outline-none hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/60',
                selected && 'ring-2 ring-foreground/70',
              )}
              style={{ backgroundColor: color }}
            >
              {selected && <CheckIcon className="size-3.5 text-white" strokeWidth={3} />}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <InputGroup className="w-44">
          <InputGroupAddon>
            <span className="size-4 rounded-[5px] border border-foreground/10" style={{ backgroundColor: safeColor(current, 'transparent') }} aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            id={id}
            value={value}
            onChange={(e) => onChange(normalizeHexInput(e.target.value))}
            onBlur={onBlur}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={7}
            placeholder="#2563EB"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className="font-mono tracking-wide uppercase"
          />
          <InputGroupAddon align="inline-end">
            <label className="relative flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
              <PipetteIcon className="size-3.5" />
              <span className="sr-only">เลือกสีเองจากจานสี</span>
              <input
                type="color"
                value={isHexColor(current) ? current : '#000000'}
                onChange={(e) => onChange(e.target.value.toLowerCase())}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </InputGroupAddon>
        </InputGroup>
      </div>

      {tooLight && (
        <p className="flex items-start gap-1.5 text-xs text-warning-foreground">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0 text-warning" />
          สีนี้อ่อนเกินไป ตัวอักษรสีขาวบนโลโก้อาจอ่านยาก — ลองเลือกสีที่เข้มขึ้น
        </p>
      )}
    </div>
  )
}
