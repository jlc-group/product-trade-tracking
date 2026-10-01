import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'

interface AutosaveTextProps {
  id?: string
  serverValue: string
  onSave: (value: string) => void
  /** Return false to reject (the text goes back to the saved value). */
  validate?: (value: string) => boolean
  /** Enter saves instead of adding a new line; Esc reverts. */
  singleLine?: boolean
  placeholder?: string
  className?: string
  'aria-label'?: string
}

/** Textarea that saves on blur — and on unmount, so closing the drawer never loses an edit. */
export function AutosaveText({ id, serverValue, onSave, validate, singleLine, placeholder, className, 'aria-label': ariaLabel }: AutosaveTextProps) {
  const [draft, setDraft] = useState(serverValue)
  const [base, setBase] = useState(serverValue)
  if (base !== serverValue) {
    // someone (maybe us) saved a new value — follow it
    setBase(serverValue)
    setDraft(serverValue)
  }

  const saved = useRef(serverValue)
  const latest = useRef({ draft, onSave, validate })
  useLayoutEffect(() => {
    latest.current = { draft, onSave, validate }
  })
  useEffect(() => {
    saved.current = serverValue
  }, [serverValue])

  const commit = useCallback(() => {
    const { draft: current, onSave: save, validate: check } = latest.current
    const next = current.trim()
    if (next === saved.current.trim()) return
    if (check && !check(next)) {
      setDraft(saved.current)
      return
    }
    saved.current = next
    save(next)
  }, [])

  useEffect(() => () => commit(), [commit])

  return (
    <Textarea
      id={id}
      value={draft}
      onChange={(e) => setDraft(singleLine ? e.target.value.replace(/\n/g, ' ') : e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (!singleLine) return
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          latest.current = { ...latest.current, draft: saved.current }
          setDraft(saved.current)
          e.currentTarget.blur()
        }
      }}
      data-local-escape={singleLine ? '' : undefined}
      placeholder={placeholder}
      aria-label={ariaLabel}
      maxLength={singleLine ? 200 : 4000}
      rows={singleLine ? 1 : 3}
      className={className}
    />
  )
}
