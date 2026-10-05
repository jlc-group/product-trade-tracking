// The printable proposal report: A4 "sheets" on screen, plain pages when printed (Save as PDF).
// Built from plain elements rather than the app's badges/avatars so it prints the same everywhere.
import { CHANNEL_SHORT, PRIORITY_LABEL, prepStartOf, STATUS_LABEL, type ISODateTime, type User } from '@flowtrade/shared'
import type { ReactNode } from 'react'
import type { ProposalDetail } from '@/api'
import { launchWord, storeWord } from '@/features/proposal-detail/utils'
import { APP_MARK, APP_NAME } from '@/lib/brand'
import { displayName, formatDate, formatDateTime, relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatSpan, REPORT_STATE_LABEL, shortName, storeVersionLabel, type ReportModel, type ReportOptions, type ReportTask, type ReportTaskState } from './report-model'

const STATE_CLASS: Record<ReportTaskState, string> = {
  done: 'bg-success-soft text-success',
  overdue: 'bg-danger-soft text-danger',
  open: 'bg-muted text-muted-foreground',
}

function Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'mx-auto w-full max-w-[210mm] bg-white px-[12mm] py-[14mm] shadow-sm ring-1 ring-black/5',
        'print:max-w-none print:p-0 print:shadow-none print:ring-0',
        className,
      )}
    >
      {children}
    </section>
  )
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[11px] font-medium whitespace-nowrap', className)}>{children}</span>
}

function StateChip({ state }: { state: ReportTaskState }) {
  return <Chip className={cn('border-transparent', STATE_CLASS[state])}>{REPORT_STATE_LABEL[state]}</Chip>
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  )
}

function names(users: User[]) {
  return users.length ? users.map(shortName).join(', ') : '—'
}

function ReportHeader({ proposal, options, exportedAt, exportedBy }: { proposal: ProposalDetail; options: ReportOptions; exportedAt: ISODateTime; exportedBy: User }) {
  return (
    <header className="flex items-start justify-between gap-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">{APP_MARK}</span>
        <div className="leading-tight">
          <p className="font-semibold">{APP_NAME}</p>
          <p className="text-[11px] text-muted-foreground">{options.storeVersion ? `ข้อมูลสินค้า · ${storeVersionLabel(proposal.channel)}` : 'รายงานข้อมูลสินค้า'}</p>
        </div>
      </div>
      <div className="text-right text-[11px] leading-relaxed text-muted-foreground">
        <p className="tabular font-medium text-foreground">{proposal.code}</p>
        <p>
          ส่งออก {formatDateTime(exportedAt)} · {shortName(exportedBy)}
        </p>
      </div>
    </header>
  )
}

function SummarySheet({ proposal, model, options, exportedAt, exportedBy }: { proposal: ProposalDetail; model: ReportModel; options: ReportOptions; exportedAt: ISODateTime; exportedBy: User }) {
  const internal = !options.storeVersion
  const fieldsPercent = model.fieldsTotal ? Math.round((model.fieldsFilled / model.fieldsTotal) * 100) : 0
  const until = relativeDay(proposal.targetDate)
  return (
    <Sheet>
      <ReportHeader proposal={proposal} options={options} exportedAt={exportedAt} exportedBy={exportedBy} />
      <hr className="my-4 border-foreground/15" />

      <h1 className="text-[22px] leading-snug font-semibold break-words">{proposal.title}</h1>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Chip>{CHANNEL_SHORT[proposal.channel]}</Chip>
        <Chip>{proposal.shelfType.name}</Chip>
        {internal && <Chip className="border-brand/30 bg-brand-soft text-brand">{STATUS_LABEL[proposal.status]}</Chip>}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-x-6 gap-y-3.5">
        <Fact label={launchWord(proposal.channel)}>
          <span className="font-medium">{formatDate(proposal.targetDate, { long: true })}</span>
          {internal && until && <span className="text-muted-foreground"> · {until}</span>}
        </Fact>
        <Fact label="เริ่มเตรียม">{formatDate(prepStartOf(proposal.targetDate), { long: true })}</Fact>
        <Fact label={proposal.stores.length > 1 ? `${storeWord(proposal.channel)} (${proposal.stores.length})` : storeWord(proposal.channel)}>
          {proposal.stores.map((s) => s.name).join(', ')}
        </Fact>
        <Fact label={`สินค้า (${proposal.products.length})`}>
          {proposal.products.length === 0 ? (
            '—'
          ) : (
            <ul className="space-y-0.5">
              {proposal.products.map((p) => (
                <li key={p.id}>
                  <span className="tabular">{p.sku}</span>
                  {p.name !== p.sku && ` ${p.name}`}
                  <span className="text-muted-foreground"> · {p.brand}</span>
                </li>
              ))}
            </ul>
          )}
        </Fact>
        {internal && <Fact label="เจ้าของ">{displayName(proposal.owner)}</Fact>}
        {internal && <Fact label="ทีมงาน">{proposal.members.length ? names(proposal.members) : <span className="text-muted-foreground">ยังไม่มีทีมงาน</span>}</Fact>}
      </dl>

      {internal && (
        <div className="mt-5 grid grid-cols-2 gap-6 rounded-lg bg-muted/60 px-4 py-3">
          <Progress label="งานเสร็จ" done={proposal.progress.done} total={proposal.progress.total} percent={proposal.progress.percent} />
          <Progress label="ข้อมูลในตารางกรอกแล้ว" done={model.fieldsFilled} total={model.fieldsTotal} percent={fieldsPercent} unit="หัวข้อ" />
        </div>
      )}

      {internal && proposal.note?.trim() && (
        <div className="mt-4 break-inside-avoid">
          <p className="text-[11px] text-muted-foreground">หมายเหตุ</p>
          <p className="mt-0.5 whitespace-pre-wrap">{proposal.note.trim()}</p>
        </div>
      )}

      <h2 className="mt-7 mb-1.5 text-[14px] font-semibold break-after-avoid">
        สรุปงาน <span className="font-normal text-muted-foreground">({model.flat.length} งาน)</span>
      </h2>
      {model.flat.length === 0 ? (
        <p className="text-muted-foreground">ยังไม่มีงานในการเสนอนี้</p>
      ) : (
        <SummaryTable model={model} internal={internal} />
      )}
    </Sheet>
  )
}

function Progress({ label, done, total, percent, unit = 'งาน' }: { label: string; done: number; total: number; percent: number; unit?: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="tabular mt-0.5">
        <span className="font-semibold">
          {done}/{total}
        </span>{' '}
        {unit} <span className="text-muted-foreground">({percent}%)</span>
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10">
        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

const th = 'py-1.5 pr-2 text-left text-[11px] font-medium text-muted-foreground'
const td = 'py-1.5 pr-2 align-top'

function SummaryTable({ model, internal }: { model: ReportModel; internal: boolean }) {
  return (
    <table className="w-full table-fixed border-collapse text-[12px]">
      <colgroup>
        <col className="w-11" />
        <col />
        <col className="w-[76px]" />
        {internal && <col className="w-[84px]" />}
        <col className="w-[136px]" />
        {internal && <col className="w-[78px]" />}
        <col className="w-[52px]" />
      </colgroup>
      <thead>
        <tr className="border-b border-foreground/30">
          <th className={th}>#</th>
          <th className={th}>งาน</th>
          <th className={th}>แผนก</th>
          {internal && <th className={th}>ผู้รับผิดชอบ</th>}
          <th className={th}>ระยะเวลา</th>
          {internal && <th className={th}>สถานะ</th>}
          <th className={cn(th, 'pr-0 text-right')}>ข้อมูล</th>
        </tr>
      </thead>
      <tbody>
        {model.flat.map((item) => (
          <tr key={item.task.id} className="break-inside-avoid border-b border-border">
            <td className={cn(td, 'tabular text-muted-foreground')}>{item.number}</td>
            <td className={cn(td, 'break-words', item.depth === 0 && 'font-medium')} style={{ paddingLeft: item.depth * 14 }}>
              {item.task.title}
            </td>
            <td className={cn(td, 'break-words')}>{item.department ?? '—'}</td>
            {internal && <td className={cn(td, 'break-words')}>{names(item.assignees)}</td>}
            <td className={cn(td, 'tabular text-[11px]')}>{formatSpan(item.task.startDate, item.task.dueDate)}</td>
            {internal && (
              <td className={td}>
                <StateChip state={item.state} />
              </td>
            )}
            <td className={cn(td, 'tabular pr-0 text-right', !item.fields ? 'text-muted-foreground' : item.fields.filled === item.fields.total ? 'text-success' : item.fields.filled > 0 ? 'text-brand' : 'text-muted-foreground')}>
              {item.fields ? `${item.fields.filled}/${item.fields.total}` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TaskBlock({ item, options }: { item: ReportTask; options: ReportOptions }) {
  const t = item.task
  const internal = !options.storeVersion
  const rows = t.descriptionFormat === 'FIELDS' ? t.detailFields : null
  const shown = rows ? (options.showEmpty ? rows : rows.filter((r) => r.value.trim())) : []
  const hidden = rows ? rows.length - shown.length : 0
  const meta = [
    item.department && `แผนก ${item.department}`,
    internal && item.assignees.length > 0 && `ผู้รับผิดชอบ ${names(item.assignees)}`,
    formatSpan(t.startDate, t.dueDate),
    internal && `ความสำคัญ ${PRIORITY_LABEL[t.priority]}`,
    item.fields && `กรอกแล้ว ${item.fields.filled}/${item.fields.total}`,
  ].filter((m): m is string => !!m)
  const history = [
    item.state === 'done' && t.completedAt && `เสร็จเมื่อ ${formatDateTime(t.completedAt)}${item.completedBy ? ` โดย ${shortName(item.completedBy)}` : ''}`,
    `${item.lastChange.kind === 'created' ? 'สร้างเมื่อ' : 'อัปเดตล่าสุด'} ${formatDateTime(item.lastChange.at)}${item.lastChange.by ? ` โดย ${shortName(item.lastChange.by)}` : ''}`,
  ].filter((m): m is string => !!m)

  return (
    <article className="break-inside-avoid">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={cn('min-w-0 font-semibold break-words', item.depth === 0 ? 'text-[15px]' : 'text-[13px]')}>
          <span className="tabular">{item.number}.</span> {t.title}
        </h3>
        {internal && <StateChip state={item.state} />}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{meta.join(' · ')}</p>

      {rows ? (
        rows.length === 0 ? (
          <p className="mt-2 text-muted-foreground">ยังไม่มีหัวข้อในตาราง</p>
        ) : (
          shown.length > 0 && (
            <table className="mt-2 w-full table-fixed border-collapse text-[12px]">
              <colgroup>
                <col className="w-[38%]" />
                <col />
              </colgroup>
              <thead>
                <tr className="border-b border-foreground/30">
                  <th className={th}>หัวข้อ</th>
                  <th className={cn(th, 'pl-2')}>ข้อมูล</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const filled = r.value.trim() !== ''
                  return (
                    <tr key={r.id} className="break-inside-avoid border-b border-border">
                      <td className={cn(td, 'break-words text-foreground/80')}>{r.label}</td>
                      <td className={cn(td, 'px-2 break-words whitespace-pre-wrap', !filled && 'bg-warning-soft text-warning-foreground')}>{filled ? r.value.trim() : 'ยังไม่กรอก'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        )
      ) : t.description?.trim() ? (
        <p className="mt-2 whitespace-pre-wrap">{t.description.trim()}</p>
      ) : (
        <p className="mt-2 text-muted-foreground">ไม่มีรายละเอียด</p>
      )}
      {hidden > 0 && <p className="mt-1 text-[11px] text-warning-foreground">ซ่อน {hidden} หัวข้อที่ยังไม่กรอก</p>}

      {internal && <p className="mt-1.5 text-[11px] text-muted-foreground">{history.join(' · ')}</p>}

      {internal && options.showComments && item.comments.length > 0 && (
        <div className="mt-2 rounded-md bg-muted/60 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">ความคิดเห็น ({item.comments.length})</p>
          <ul className="mt-1 space-y-1.5">
            {item.comments.map((c) => (
              <li key={c.id} className="break-inside-avoid">
                <span className="font-medium">{shortName(c.author)}</span> <span className="text-[11px] text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                <p className="whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

function TaskSection({ item, options }: { item: ReportTask; options: ReportOptions }) {
  return (
    <div>
      <TaskBlock item={item} options={options} />
      {item.children.length > 0 && (
        <div className="mt-3 ml-1 space-y-4 border-l-2 border-muted pl-4">
          {item.children.map((child) => (
            <TaskSection key={child.task.id} item={child} options={options} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ProposalReportView({
  proposal,
  model,
  options,
  exportedAt,
  exportedBy,
}: {
  proposal: ProposalDetail
  model: ReportModel
  options: ReportOptions
  exportedAt: ISODateTime
  exportedBy: User
}) {
  return (
    <div className="space-y-6 text-[13px] leading-relaxed text-foreground print-exact print:space-y-0">
      <SummarySheet proposal={proposal} model={model} options={options} exportedAt={exportedAt} exportedBy={exportedBy} />
      {model.tasks.length > 0 && (
        <Sheet className="print:break-before-page">
          <h2 className="mb-4 text-[16px] font-semibold">รายละเอียดงาน</h2>
          <div className="space-y-6">
            {model.tasks.map((item) => (
              <TaskSection key={item.task.id} item={item} options={options} />
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}
