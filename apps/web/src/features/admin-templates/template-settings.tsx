import { CHANNEL_SHORT, CHANNEL_TERMS, type Channel, type ShelfType, type Store, type TaskTemplateItem } from '@flowtrade/shared'
import { BlendIcon, GlobeIcon, StoreIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export interface TemplateDraft {
  name: string
  description: string
  /** null = every channel (Offline and Online); then shelf type and store must be null too. */
  channel: Channel | null
  shelfTypeId: string | null
  storeId: string | null
  items: TaskTemplateItem[]
}

type SettingsPatch = Partial<Omit<TemplateDraft, 'items'>>

/** Select value for "every shelf type / store". */
const ALL = '__all'
/** Toggle value for channel = null. */
const ANY_CHANNEL = 'ANY'

/** Terms when the template covers both channels. */
const ANY_TERMS = { store: 'ห้าง / แพลตฟอร์ม', shelf: 'ประเภท Shelf / การลงขาย' }

interface Props {
  draft: TemplateDraft
  onChange: (patch: SettingsPatch) => void
  stores: Store[]
  shelfTypes: ShelfType[]
  nameError: string | null
}

export function TemplateSettings({ draft, onChange, stores, shelfTypes, nameError }: Props) {
  const channel = draft.channel
  const terms = channel ? CHANNEL_TERMS[channel] : ANY_TERMS
  const storeWord = terms.store.split(' / ')[0]
  // Inactive options stay visible only when this template already points at them.
  const shelfOptions = channel ? shelfTypes.filter((s) => s.channel === channel && (s.isActive || s.id === draft.shelfTypeId)).sort((a, b) => a.sortOrder - b.sortOrder) : []
  const storeOptions = channel ? stores.filter((s) => s.channel === channel && (s.isActive || s.id === draft.storeId)).sort((a, b) => a.sortOrder - b.sortOrder) : []
  const selectedShelf = shelfTypes.find((s) => s.id === draft.shelfTypeId)
  const selectedStore = stores.find((s) => s.id === draft.storeId)

  const setChannel = (next: Channel | null) => {
    if (next === channel) return
    // Shelf types and stores belong to one channel — clear choices that no longer fit
    // ("every channel" can't point at a shelf type or store at all).
    onChange({
      channel: next,
      shelfTypeId: next && selectedShelf?.channel === next ? draft.shelfTypeId : null,
      storeId: next && selectedStore?.channel === next ? draft.storeId : null,
    })
  }

  const appliesTo = channel
    ? [CHANNEL_SHORT[channel], selectedStore?.name ?? `ทุก${storeWord}`, selectedShelf?.name ?? 'ทุกประเภท'].join(' · ')
    : 'ทุกช่องทาง · ทุกห้างและแพลตฟอร์ม · ทุกประเภท'

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="tpl-name">
          ชื่อแม่แบบ<span className="text-danger" aria-hidden>*</span>
        </Label>
        <Input
          id="tpl-name"
          value={draft.name}
          placeholder="เช่น เช็กลิสต์ข้อมูลสินค้าสำหรับเสนอห้าง"
          onChange={(e) => onChange({ name: e.target.value })}
          aria-invalid={!!nameError || undefined}
          aria-describedby={nameError ? 'tpl-name-error' : undefined}
          className="h-9"
        />
        {nameError && (
          <p id="tpl-name-error" className="text-xs text-danger">
            {nameError}
          </p>
        )}
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="tpl-description">คำอธิบาย</Label>
        <Textarea
          id="tpl-description"
          value={draft.description}
          placeholder="ใช้เมื่อไร ต่างจากแม่แบบอื่นอย่างไร — ช่วยให้ทีมเลือกถูก"
          onChange={(e) => onChange({ description: e.target.value })}
          className="min-h-16"
        />
      </div>

      <div className="grid content-start gap-1.5 sm:col-span-2">
        <span id="tpl-channel-label" className="text-sm leading-none font-medium">
          ช่องทาง
        </span>
        <div className="@container">
          <ToggleGroup
            type="single"
            value={channel ?? ANY_CHANNEL}
            onValueChange={(v) => {
              if (v === ANY_CHANNEL) setChannel(null)
              else if (v === 'OFFLINE' || v === 'ONLINE') setChannel(v)
            }}
            aria-labelledby="tpl-channel-label"
            aria-describedby="tpl-channel-hint"
            spacing={0.5}
            className="w-full rounded-lg bg-muted p-0.5"
          >
            {([ANY_CHANNEL, 'OFFLINE', 'ONLINE'] as const).map((c) => (
              <ToggleGroupItem
                key={c}
                value={c}
                aria-label={c === ANY_CHANNEL ? 'ทุกช่องทาง (Offline และ Online)' : CHANNEL_SHORT[c]}
                className={cn(
                  'h-8 min-w-0 gap-1.5 px-2 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm',
                  c === ANY_CHANNEL ? 'flex-[1.6]' : 'flex-1',
                )}
              >
                {c === ANY_CHANNEL ? <BlendIcon /> : c === 'OFFLINE' ? <StoreIcon /> : <GlobeIcon />}
                {c === ANY_CHANNEL ? (
                  <span className="truncate">
                    ทุกช่องทาง<span className="hidden @xl:inline"> (Offline และ Online)</span>
                  </span>
                ) : (
                  CHANNEL_SHORT[c]
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <p id="tpl-channel-hint" className="text-xs text-muted-foreground">
          {channel === null
            ? 'ใช้ได้ทั้ง Offline และ Online — แม่แบบทุกช่องทางระบุประเภทหรือห้าง/แพลตฟอร์มไม่ได้ ถ้าต้องการเจาะจง ให้เลือก Offline หรือ Online'
            : `ใช้เฉพาะช่องทาง ${CHANNEL_SHORT[channel]} — เลือกประเภทหรือ${storeWord}ด้านล่างเพื่อเจาะจงมากขึ้นได้`}
        </p>
      </div>

      <div className="grid content-start gap-1.5">
        <Label htmlFor="tpl-shelf" className={channel === null ? 'text-muted-foreground' : undefined}>
          {terms.shelf}
        </Label>
        <Select value={draft.shelfTypeId ?? ALL} onValueChange={(v) => onChange({ shelfTypeId: v === ALL ? null : v })} disabled={channel === null}>
          <SelectTrigger id="tpl-shelf" className="h-9 w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={ALL}>ทุกประเภท</SelectItem>
            {shelfOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="size-2 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
                {s.name}
                {!s.isActive && <span className="text-xs text-muted-foreground">(ปิดใช้งาน)</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid content-start gap-1.5">
        <Label htmlFor="tpl-store" className={channel === null ? 'text-muted-foreground' : undefined}>
          {terms.store} <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
        </Label>
        <Select value={draft.storeId ?? ALL} onValueChange={(v) => onChange({ storeId: v === ALL ? null : v })} disabled={channel === null}>
          <SelectTrigger id="tpl-store" className="h-9 w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={ALL}>{channel === null ? 'ทุกห้างและแพลตฟอร์ม' : `ทุก${channel === 'OFFLINE' ? 'ห้าง / ร้านค้า' : 'แพลตฟอร์ม'}`}</SelectItem>
            {storeOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="inline-flex h-4 min-w-6 items-center justify-center rounded px-1 text-[9px] font-bold text-white" style={{ backgroundColor: s.color }} aria-hidden>
                  {s.shortName}
                </span>
                {s.name}
                {!s.isActive && <span className="text-xs text-muted-foreground">(ปิดใช้งาน)</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground sm:col-span-2">
        ใช้กับ: <span className="font-medium text-foreground">{appliesTo}</span>
        <br />
        ตอนเสนอสินค้า ระบบจะแนะนำแม่แบบที่ตรงที่สุด (ระบุห้าง/แพลตฟอร์ม &gt; ระบุประเภท &gt; ทุกประเภท)
      </p>
    </div>
  )
}
