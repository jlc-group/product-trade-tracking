import { rejectReasonLabel, storeWord } from '@flowtrade/shared'
import { HistoryIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { BuyerResult, HomeDashboard } from '@/api'
import { StoreLogo } from '@/components/common/badges'
import { StageBadge } from '@/features/presentation/stage-badge'
import { formatDate } from '@/lib/format'
import { storeHref } from './links'
import { MoreToggle, Panel } from './panel'

const LIMIT = 3

const clip = (text: string, max = 40) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** PASSED: SKUs taken; REJECTED: reason + quote; WITHDRAWN: the reason. */
function outcomeLine(result: BuyerResult) {
  const { view } = result
  const o = view.outcome
  if (view.stage === 'PASSED') return view.accepted ? `รับ ${view.accepted.count} จาก ${view.accepted.total} SKU` : 'รับครบทุก SKU'
  if (o?.kind === 'REJECTED') return `${rejectReasonLabel(o.reason, storeWord(result.proposal.channel))}${o.detail ? ` — “${clip(o.detail)}”` : ''}`
  if (o?.kind === 'WITHDRAWN') return `“${clip(o.reason)}”`
  return null
}

function ResultRow({ result }: { result: BuyerResult }) {
  const { proposal, store, view } = result
  const line = outcomeLine(result)
  return (
    <li className="relative px-4 py-2.5 transition-colors hover:bg-muted/50">
      <div className="flex items-start gap-2">
        <StageBadge stage={view.stage} round={view.round} className="h-5 shrink-0 px-2 text-[11px]" />
        <StoreLogo store={store} size="sm" />
        <Link
          to={storeHref(proposal, store.id)}
          className="line-clamp-2 min-w-0 flex-1 text-sm leading-5 font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/60 focus-visible:after:ring-inset"
        >
          {proposal.title}
          <span className="sr-only"> · {store.name}</span>
        </Link>
        <span className="tabular shrink-0 text-xs leading-5 text-muted-foreground">{formatDate(view.outcome?.date)}</span>
      </div>
      {line && <p className="mt-1 line-clamp-2 text-xs break-words text-muted-foreground">{line}</p>}
    </li>
  )
}

/** "ผลจาก Buyer · 14 วันล่าสุด": latest outcomes of my projects; the tally counts the same rows. */
export function ResultsPanel({ results }: { results: HomeDashboard['results'] }) {
  const [expanded, setExpanded] = useState(false)
  const { items, passed, rejected, withdrawn } = results
  const shown = expanded ? items : items.slice(0, LIMIT)
  const hidden = items.length - LIMIT
  const capped = items.length < passed + rejected + withdrawn
  return (
    <Panel id="results" title="ผลจาก Buyer · 14 วันล่าสุด" icon={<HistoryIcon />}>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">ยังไม่มีผลจาก Buyer ใน 14 วันนี้</p>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-x-1.5 px-4 pt-3 pb-1 text-xs text-muted-foreground">
            {[
              passed > 0 && <span key="p" className="font-medium text-success">ผ่าน {passed}</span>,
              rejected > 0 && <span key="r" className="font-medium text-danger">ไม่ผ่าน {rejected}</span>,
              withdrawn > 0 && <span key="w" className="font-medium text-foreground/70">ยุติ {withdrawn}</span>,
              <span key="scope">เฉพาะโปรเจกต์ที่คุณเกี่ยวข้อง</span>,
              capped && <span key="cap">แสดง {items.length} รายการล่าสุด</span>,
            ]
              .filter(Boolean)
              .flatMap((part, i) => (i === 0 ? [part] : [<span key={`sep-${i}`} aria-hidden>·</span>, part]))}
          </p>
          <ul className="divide-y">
            {shown.map((r) => (
              <ResultRow key={r.trackId} result={r} />
            ))}
          </ul>
          {hidden > 0 && <MoreToggle expanded={expanded} label={`แสดงอีก ${hidden} รายการ`} onToggle={() => setExpanded((v) => !v)} className="border-t" />}
        </>
      )}
    </Panel>
  )
}
