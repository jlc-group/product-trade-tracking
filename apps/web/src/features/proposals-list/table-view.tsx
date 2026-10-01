import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import type { MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import type { ProposalListItem } from '@/api/types'
import { ShelfTypeBadge, StatusBadge, StoreChip } from '@/components/common/badges'
import { ProgressBar } from '@/components/common/misc'
import { UserAvatar } from '@/components/common/user-avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { OverduePill, ProductChips, TargetDate, proposalHref } from './bits'
import type { ListParamsApi, SortKey } from './params'
import { ProposalCard } from './proposal-card'

function SortHead({ k, label, list, className }: { k: SortKey; label: string; list: ListParamsApi; className?: string }) {
  const { params, update } = list
  const active = params.sort === k
  const Icon = !active ? ArrowUpDownIcon : params.dir === 'asc' ? ArrowUpIcon : ArrowDownIcon
  return (
    <TableHead aria-sort={active ? (params.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={className}>
      <button
        type="button"
        onClick={() => update(active ? { dir: params.dir === 'asc' ? 'desc' : 'asc' } : { sort: k, dir: 'asc' })}
        className={cn(
          '-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        <Icon className={cn('size-3.5', !active && 'opacity-50')} aria-hidden />
        <span className="sr-only">{active ? (params.dir === 'asc' ? '(เรียงจากน้อยไปมาก)' : '(เรียงจากมากไปน้อย)') : '(คลิกเพื่อเรียง)'}</span>
      </button>
    </TableHead>
  )
}

export function TableView({ items, list }: { items: ProposalListItem[]; list: ListParamsApi }) {
  const navigate = useNavigate()

  const onRowClick = (e: MouseEvent<HTMLTableRowElement>, p: ProposalListItem) => {
    // Let links, buttons and text selection behave normally.
    if ((e.target as HTMLElement).closest('a, button')) return
    if (window.getSelection()?.toString()) return
    if (e.metaKey || e.ctrlKey) window.open(proposalHref(p), '_blank', 'noopener')
    else navigate(proposalHref(p))
  }

  return (
    <>
      {/* Phones & tablets: card list */}
      <ul className="grid gap-3 md:grid-cols-2 lg:hidden">
        {items.map((p) => (
          <li key={p.id} className="min-w-0">
            <ProposalCard p={p} className="h-full" />
          </li>
        ))}
      </ul>

      {/* Desktop: table. On narrower desktops some columns fold into their neighbours so it fits beside the sidebar. */}
      <div className="hidden overflow-hidden rounded-xl border bg-card lg:block">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <SortHead k="code" label="รหัส" list={list} className="hidden w-px pl-4 xl:table-cell" />
              <TableHead className="pl-4 text-muted-foreground xl:pl-2">การเสนอสินค้า</TableHead>
              <TableHead className="text-muted-foreground">ห้าง / แพลตฟอร์ม</TableHead>
              <TableHead className="hidden text-muted-foreground 2xl:table-cell">ประเภท Shelf</TableHead>
              <SortHead k="target" label="วันวางขาย" list={list} />
              <TableHead className="hidden text-muted-foreground min-[1360px]:table-cell">สถานะ</TableHead>
              <SortHead k="progress" label="ความคืบหน้า" list={list} className="w-36" />
              <TableHead className="hidden w-px text-center text-muted-foreground xl:table-cell">เลยกำหนด</TableHead>
              <TableHead className="w-px pr-4 text-center text-muted-foreground">เจ้าของ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p) => (
              <TableRow key={p.id} onClick={(e) => onRowClick(e, p)} className={cn('cursor-pointer', p.status === 'CANCELLED' && 'text-muted-foreground')}>
                <TableCell className="hidden pl-4 align-top xl:table-cell">
                  <span className="tabular text-xs leading-5 font-medium text-muted-foreground">{p.code}</span>
                </TableCell>
                <TableCell className="max-w-[22rem] min-w-[11rem] pl-4 align-top whitespace-normal xl:pl-2">
                  <span className="tabular mb-0.5 block text-[11px] font-medium text-muted-foreground xl:hidden">{p.code}</span>
                  <Link
                    to={proposalHref(p)}
                    className="line-clamp-2 rounded-sm leading-snug font-medium outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {p.title}
                  </Link>
                  <ProductChips products={p.products} className="mt-1.5" chipClassName="max-w-[9rem]" />
                </TableCell>
                <TableCell className="max-w-[11rem] align-top xl:max-w-[13rem]">
                  <div className="flex min-w-0 flex-col items-start gap-1.5">
                    <StoreChip store={p.store} className="max-w-full" />
                    <ShelfTypeBadge shelfType={p.shelfType} className="max-w-full overflow-hidden 2xl:hidden" />
                  </div>
                </TableCell>
                <TableCell className="hidden align-top 2xl:table-cell">
                  <ShelfTypeBadge shelfType={p.shelfType} />
                </TableCell>
                <TableCell className="align-top">
                  <TargetDate p={p} />
                  <StatusBadge status={p.status} className="mt-1.5 min-[1360px]:hidden" />
                </TableCell>
                <TableCell className="hidden align-top min-[1360px]:table-cell">
                  <StatusBadge status={p.status} />
                </TableCell>
                <TableCell className="align-top">
                  <div className="space-y-1.5 pt-0.5" title={`เสร็จ ${p.progress.done} จาก ${p.progress.total} งาน`}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className={cn('tabular font-semibold', p.progress.percent === 100 ? 'text-success' : 'text-foreground')}>{p.progress.percent}%</span>
                      <span className="tabular text-muted-foreground">
                        {p.progress.done}/{p.progress.total}
                      </span>
                    </div>
                    <ProgressBar progress={p.progress} className="[&>span]:hidden" />
                  </div>
                  {p.overdueCount > 0 && <OverduePill count={p.overdueCount} className="mt-2 xl:hidden" />}
                </TableCell>
                <TableCell className="hidden text-center align-top xl:table-cell">
                  <OverduePill count={p.overdueCount} />
                </TableCell>
                <TableCell className="pr-4 text-center align-top">
                  <UserAvatar user={p.owner} size="md" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
