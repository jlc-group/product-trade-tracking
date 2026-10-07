// Building blocks shared by the production dialogs. Dismiss buttons read "ปิด": "ยกเลิก" already means cancelling
// production, un-confirming and the project status on this screen (K11).
import { Loader2Icon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/** "ปิด" + submit footer; the submit shows a spinner while pending. */
export function ProdDialogActions({ label, pending, disabled, destructive }: { label: ReactNode; pending: boolean; disabled?: boolean; destructive?: boolean }) {
  return (
    <DialogFooter>
      <DialogClose asChild>
        <Button type="button" variant="outline">
          ปิด
        </Button>
      </DialogClose>
      <Button
        type="submit"
        disabled={disabled || pending}
        className={cn(destructive && 'bg-destructive text-white hover:bg-destructive/90 focus-visible:border-destructive/40 focus-visible:ring-destructive/30')}
      >
        {pending && <Loader2Icon className="animate-spin" />}
        {label}
      </Button>
    </DialogFooter>
  )
}

/** Shown instead of a form when its SKU moved on before the dialog opened. */
export function GoneContent() {
  return (
    <>
      <DialogHeader>
        <DialogTitle>ข้อมูลเปลี่ยนไปแล้ว</DialogTitle>
        <DialogDescription>สถานะของ SKU นี้เปลี่ยนไปแล้ว — ปิดหน้าต่างนี้แล้วเลือกใหม่จากตาราง</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            ปิด
          </Button>
        </DialogClose>
      </DialogFooter>
    </>
  )
}
