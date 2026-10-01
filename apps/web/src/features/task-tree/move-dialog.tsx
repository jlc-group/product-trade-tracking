import { checkMove, flattenTree, LEVEL_LABEL, type Task, type TaskNode } from '@flowtrade/shared'
import { ArrowUpToLineIcon, CornerDownRightIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { LEVEL_DOT } from './tree-utils'

const TOP = '__top__'

interface MoveDialogProps {
  /** Task being moved; null = closed. */
  node: TaskNode | null
  roots: TaskNode[]
  tasks: Task[]
  pending: boolean
  onClose: () => void
  onMove: (node: TaskNode, parentId: string | null) => void
}

export function MoveDialog({ node, roots, tasks, pending, onClose, onMove }: MoveDialogProps) {
  // Keep showing the last task while the dialog animates closed.
  const [last, setLast] = useState(node)
  if (node && node !== last) setLast(node)
  const shown = node ?? last
  return (
    <Dialog open={!!node} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-3 sm:max-w-lg">
        {shown && <MoveDialogBody key={shown.id} node={shown} roots={roots} tasks={tasks} pending={pending} onClose={onClose} onMove={onMove} />}
      </DialogContent>
    </Dialog>
  )
}

function MoveDialogBody({ node, roots, tasks, pending, onClose, onMove }: MoveDialogProps & { node: TaskNode }) {
  const [selected, setSelected] = useState<string | null>(null)

  const options = useMemo(() => {
    const descendants = new Set(flattenTree(node.children).map((n) => n.id))
    return flattenTree(roots)
      // Mini tasks can never hold children; the task itself and its own subtree are never targets.
      .filter((n) => n.level < 3 && n.id !== node.id && !descendants.has(n.id))
      .map((n) => ({ node: n, check: checkMove(tasks, node.id, n.id), isCurrent: n.id === node.parentId }))
  }, [node, roots, tasks])

  const topCheck = useMemo(() => checkMove(tasks, node.id, null), [tasks, node.id])
  const selectedParentId = selected === TOP ? null : selected
  const selectedCheck = selected === null ? null : selected === TOP ? topCheck : options.find((o) => o.node.id === selected)?.check
  const subCount = flattenTree(node.children).length

  return (
    <>
      <DialogHeader>
        <DialogTitle>ย้าย “{node.title}” ไปไว้ใต้…</DialogTitle>
        <DialogDescription>
          เลือกงานที่จะเป็นงานแม่ใหม่ {subCount > 0 && `งานย่อย ${subCount} รายการจะย้ายตามไปด้วย `}งานที่ย้ายไม่ได้เพราะจะเกิน 3 ระดับจะเป็นสีจาง
        </DialogDescription>
      </DialogHeader>
      <Command className="rounded-lg border">
        <CommandInput placeholder="ค้นหาชื่องาน…" />
        <CommandList className="max-h-[min(20rem,50vh)]">
          <CommandEmpty>ไม่พบงานที่ตรงกับคำค้น</CommandEmpty>
          <CommandGroup>
            <CommandItem
              value="ระดับบนสุด top level"
              disabled={!topCheck.ok || node.parentId === null}
              onSelect={() => setSelected(TOP)}
              data-checked={selected === TOP}
              className="gap-2"
            >
              <ArrowUpToLineIcon className="text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">ระดับบนสุด</span>
                <span className="block text-xs text-muted-foreground">
                  {node.parentId === null ? 'อยู่ที่นี่แล้ว' : topCheck.ok ? 'จะกลายเป็นงานหลัก (Task)' : topCheck.reason}
                </span>
              </span>
            </CommandItem>
            {options.map(({ node: n, check, isCurrent }) => (
              <CommandItem
                key={n.id}
                value={`${n.title} ${n.id}`}
                disabled={!check.ok || isCurrent}
                onSelect={() => setSelected(n.id)}
                data-checked={selected === n.id}
                className="gap-2"
                style={{ paddingLeft: 8 + (n.level - 1) * 18 }}
              >
                {n.level > 1 ? <CornerDownRightIcon className="text-muted-foreground/60" /> : <span className={cn('mx-1.5 size-1.5 shrink-0 rounded-full', LEVEL_DOT[n.level])} aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate', n.level === 1 && 'font-medium')}>{n.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {LEVEL_LABEL[n.level]}
                    {isCurrent ? ' · อยู่ใต้งานนี้แล้ว' : check.ok ? ` · จะกลายเป็น ${LEVEL_LABEL[check.newLevel!]}` : ` · ${check.reason}`}
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button type="button" disabled={!selectedCheck?.ok || pending} onClick={() => onMove(node, selectedParentId)}>
          {pending ? 'กำลังย้าย…' : 'ย้ายงาน'}
        </Button>
      </DialogFooter>
    </>
  )
}
