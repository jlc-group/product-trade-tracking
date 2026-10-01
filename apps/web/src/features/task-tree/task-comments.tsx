import { MessageSquareIcon, SendHorizontalIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useAddComment, useComments } from '@/api/hooks'
import { UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime, fromNow } from '@/lib/format'
import { useTreeEnv } from './tree-context'

/** Comment thread of one task with a composer (any viewer of the proposal may comment). */
export function TaskComments({ taskId, autoFocus }: { taskId: string; autoFocus?: boolean }) {
  const { me, proposal } = useTreeEnv()
  const { data: comments, isLoading } = useComments(taskId)
  const addComment = useAddComment(proposal.id)
  const [body, setBody] = useState('')
  const sectionRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const headingId = useId()
  const inputId = useId()

  useEffect(() => {
    if (!autoFocus) return
    const t = window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      inputRef.current?.focus({ preventScroll: true })
    }, 150)
    return () => window.clearTimeout(t)
  }, [autoFocus])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const text = body.trim()
    if (!text || addComment.isPending) return
    addComment.mutate({ taskId, body: text }, { onSuccess: () => setBody('') })
  }

  return (
    <section ref={sectionRef} aria-labelledby={headingId} className="scroll-mt-4 space-y-3">
      <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquareIcon className="size-4 text-muted-foreground" />
        ความคิดเห็น
        {!!comments?.length && <span className="tabular text-xs font-normal text-muted-foreground">{comments.length}</span>}
      </h3>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-2.5">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-14 flex-1 rounded-lg" />
            </div>
          ))}
        </div>
      ) : !comments?.length ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          ยังไม่มีความคิดเห็น — ใช้คุยเรื่องงานนี้กับทีม เช่น อัปเดตความคืบหน้า หรือแปะลิงก์เอกสารที่ส่งห้าง
        </p>
      ) : (
        <ol className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <UserAvatar user={c.author} size="md" />
              <div className="min-w-0 flex-1 rounded-lg bg-muted/60 px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-medium">{c.author.nickname || c.author.name}</span>
                  <time dateTime={c.createdAt} title={formatDateTime(c.createdAt)} className="text-xs text-muted-foreground">
                    {fromNow(c.createdAt)}
                  </time>
                </div>
                <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{c.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={submit} className="flex items-start gap-2.5">
        <UserAvatar user={me} size="md" tooltip={false} className="mt-1" />
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor={inputId} className="sr-only">
            เขียนความคิดเห็น
          </Label>
          <Textarea
            id={inputId}
            ref={inputRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
            }}
            placeholder="เขียนความคิดเห็น…"
            maxLength={2000}
            className="min-h-16 bg-background"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="hidden text-[11px] text-muted-foreground sm:inline">Ctrl + Enter เพื่อส่ง</span>
            <Button type="submit" size="sm" className="ml-auto" disabled={!body.trim() || addComment.isPending}>
              <SendHorizontalIcon />
              {addComment.isPending ? 'กำลังส่ง…' : 'ส่งความคิดเห็น'}
            </Button>
          </div>
        </div>
      </form>
    </section>
  )
}
