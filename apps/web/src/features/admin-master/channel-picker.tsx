import { CHANNEL_SHORT, type Channel } from '@flowtrade/shared'
import { GlobeIcon, StoreIcon } from 'lucide-react'
import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { CHANNELS, isChannel } from './channel-tabs'

/** Two radio cards: Offline / Online, with a per-channel caption. */
export function ChannelPicker({
  value,
  onChange,
  captions,
  label = 'ช่องทาง',
  disabled,
  hint,
}: {
  value: Channel
  onChange: (channel: Channel) => void
  captions: Record<Channel, string>
  label?: string
  disabled?: boolean
  hint?: string
}) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <span id={`${id}-label`} className="text-sm leading-none font-medium">
        {label}
      </span>
      <RadioGroup
        value={value}
        onValueChange={(v) => isChannel(v) && onChange(v)}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={disabled}
        className="grid-cols-2"
      >
        {CHANNELS.map((c) => {
          const Icon = c === 'OFFLINE' ? StoreIcon : GlobeIcon
          return (
            <Label
              key={c}
              htmlFor={`${id}-${c}`}
              className={cn(
                'flex items-center gap-2.5 rounded-lg border p-2.5 font-normal transition-colors has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-brand-soft/60',
                disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/60',
              )}
            >
              <RadioGroupItem id={`${id}-${c}`} value={c} />
              <Icon className="size-4 text-muted-foreground" />
              <span className="grid min-w-0 gap-0.5">
                <span className="text-sm font-medium">{CHANNEL_SHORT[c]}</span>
                <span className="truncate text-xs text-muted-foreground">{captions[c]}</span>
              </span>
            </Label>
          )
        })}
      </RadioGroup>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}
