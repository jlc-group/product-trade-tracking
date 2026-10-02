// PDF export of one proposal: an A4 print preview with options; the browser's "Save as PDF" makes the file.
// Rendered outside the app shell (see App.tsx) so only the report is printed.
import { ArrowLeftIcon, RotateCwIcon, SearchXIcon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { Link, useParams, useSearchParams } from 'react-router'
import { ApiError } from '@/api'
import { errorMessage, useProposal, useProposalReport, useTasks } from '@/api/hooks'
import { useCurrentUser } from '@/auth/auth'
import { FullPageSpinner } from '@/components/common/full-page-spinner'
import { EmptyState } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { PrintToolbar } from '@/features/proposal-print/print-toolbar'
import { ProposalReportView } from '@/features/proposal-print/proposal-report'
import { buildReportModel, cssString, reportFileName, storeVersionLabel, type ReportOptions } from '@/features/proposal-print/report-model'
import { today } from '@/lib/format'

const MARGIN_FONT = "font-family: 'IBM Plex Sans Thai', sans-serif; font-size: 8pt; color: #6b7280;"

/**
 * A4 pages with the document name bottom-left and "หน้า x / y" bottom-right. The empty top boxes stop
 * Chrome from adding its own date/title header when "Headers and footers" is ticked in the print dialog.
 */
function pageCss(footer: string) {
  return `@page {
  size: A4;
  margin: 14mm 12mm 16mm;
  @top-left { content: ""; }
  @top-right { content: ""; }
  @bottom-left { content: ${cssString(footer)}; ${MARGIN_FONT} }
  @bottom-right { content: "หน้า " counter(page) " / " counter(pages); ${MARGIN_FONT} }
}`
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** Options in the URL (?empty=0&comments=0&store=1) so a reload keeps them; defaults are left out. */
function readOptions(params: URLSearchParams): ReportOptions {
  return { showEmpty: params.get('empty') !== '0', showComments: params.get('comments') !== '0', storeVersion: params.get('store') === '1' }
}

function optionsQuery(o: ReportOptions) {
  const params = new URLSearchParams()
  if (!o.showEmpty) params.set('empty', '0')
  if (!o.showComments) params.set('comments', '0')
  if (o.storeVersion) params.set('store', '1')
  return params.toString()
}

/** Width of an A4 sheet in CSS px (210 mm). */
const SHEET_PX = (210 * 96) / 25.4

/** Scale for the on-screen preview so a whole A4 sheet fits narrow screens, like a PDF viewer (printing ignores it). */
function useSheetZoom(ready: boolean) {
  const ref = useRef<HTMLElement>(null)
  const [zoom, setZoom] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!ready || !el) return
    const fit = () => {
      const padding = parseFloat(getComputedStyle(el).paddingLeft) + parseFloat(getComputedStyle(el).paddingRight)
      setZoom(Math.min(1, (el.clientWidth - padding) / SHEET_PX))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ready])
  return [ref, zoom] as const
}

export default function ProposalPrintPage() {
  const { id = '' } = useParams()
  const user = useCurrentUser()
  const proposal = useProposal(id)
  const tasks = useTasks(id)
  const report = useProposalReport(id)
  const [params, setParams] = useSearchParams()
  const [printing, setPrinting] = useState(false)
  const [exportedAt, setExportedAt] = useState(() => new Date().toISOString())

  // State is the source of truth: router URL updates run as transitions, so two quick toggles
  // that each patched the URL could read the same stale params and drop one change.
  const [options, setOptionsState] = useState(() => readOptions(params))
  const setOptions = (patch: Partial<ReportOptions>) => setOptionsState((current) => ({ ...current, ...patch }))
  const query = optionsQuery(options)
  useEffect(() => {
    if (params.toString() !== query) setParams(new URLSearchParams(query), { replace: true })
  }, [params, query, setParams])

  const p = proposal.data
  const model = useMemo(() => (p && tasks.data && report.data ? buildReportModel(p, tasks.data, report.data, today()) : null), [p, tasks.data, report.data])
  const [mainRef, zoom] = useSheetZoom(!!model)

  // Chrome suggests document.title as the PDF file name.
  const fileName = p ? reportFileName(p, options.storeVersion) : null
  useEffect(() => {
    if (!fileName) return
    const previous = document.title
    document.title = fileName
    return () => {
      document.title = previous
    }
  }, [fileName])

  // The "exported at" stamp is the moment of printing, including Ctrl+P.
  useEffect(() => {
    const stamp = () => flushSync(() => setExportedAt(new Date().toISOString()))
    window.addEventListener('beforeprint', stamp)
    return () => window.removeEventListener('beforeprint', stamp)
  }, [])

  async function print() {
    setPrinting(true)
    try {
      // Print with IBM Plex Sans Thai, not a fallback font that hasn't been swapped yet.
      await document.fonts.ready
      window.print()
    } finally {
      setPrinting(false)
    }
  }

  const error = proposal.error ?? tasks.error ?? report.error
  if (error) {
    const notFound = error instanceof ApiError && (error.status === 404 || error.status === 403)
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-4">
        {notFound ? (
          <EmptyState
            icon={<SearchXIcon className="size-5" />}
            title="ไม่พบการเสนอสินค้านี้ หรือคุณไม่มีสิทธิ์เข้าถึง"
            description="ลิงก์อาจไม่ถูกต้อง รายการถูกลบไปแล้ว หรือคุณยังไม่ได้อยู่ในทีมงาน"
            action={
              <Button asChild variant="outline">
                <Link to="/proposals">
                  <ArrowLeftIcon /> กลับไปหน้ารายการการเสนอสินค้า
                </Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<TriangleAlertIcon className="size-5" />}
            title="เตรียมเอกสารไม่สำเร็จ"
            description={errorMessage(error)}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  void proposal.refetch()
                  void tasks.refetch()
                  void report.refetch()
                }}
              >
                <RotateCwIcon /> ลองอีกครั้ง
              </Button>
            }
          />
        )}
      </div>
    )
  }

  if (!p || !model) {
    return (
      <div className="flex min-h-svh bg-background">
        <FullPageSpinner label="กำลังเตรียมเอกสาร…" />
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-muted/60 print:bg-white">
      <style>{pageCss(`${p.code} · ${clip(p.title, 70)}`)}</style>
      <PrintToolbar
        backTo={`/proposals/${p.id}`}
        title={p.code}
        options={options}
        storeLabel={storeVersionLabel(p.channel)}
        printing={printing}
        onChange={setOptions}
        onPrint={() => void print()}
      />
      <main ref={mainRef} className="px-4 py-8 print:p-0">
        <div className="mx-auto w-[210mm] [zoom:var(--sheet-zoom)] print:w-auto print:[zoom:1]" style={{ '--sheet-zoom': zoom } as CSSProperties}>
          <ProposalReportView proposal={p} model={model} options={options} exportedAt={exportedAt} exportedBy={user} />
        </div>
      </main>
    </div>
  )
}
