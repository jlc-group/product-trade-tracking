import type { Department } from '@flowtrade/shared'
import { ChevronDownIcon, EyeIcon, EyeOffIcon, GripVerticalIcon, PencilIcon, ShieldCheckIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'

function Rule({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-3" aria-hidden>
        {icon}
      </span>
      <span>{children}</span>
    </li>
  )
}

/** How changes here affect users — shown beside the list on desktop, below it on mobile. */
export function DepartmentRules() {
  return (
    <section className="rounded-xl border bg-card p-4" aria-labelledby="department-rules-title">
      <h2 id="department-rules-title" className="text-sm font-semibold">
        ผลต่อผู้ใช้
      </h2>
      <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
        <Rule icon={<PencilIcon />}>
          <span className="font-medium text-foreground">เปลี่ยนชื่อ</span> — ผู้ใช้ทุกคนในแผนกนั้นเปลี่ยนเป็นชื่อใหม่อัตโนมัติ
        </Rule>
        <Rule icon={<GripVerticalIcon />}>
          <span className="font-medium text-foreground">จัดลำดับ</span> — ใช้เป็นลำดับในตัวเลือกแผนก
        </Rule>
        <Rule icon={<EyeOffIcon />}>
          <span className="font-medium text-foreground">ปิดใช้งาน</span> — ซ่อนจากตัวเลือก ผู้ใช้ที่อยู่ในแผนกนั้นอยู่เหมือนเดิม
        </Rule>
        <Rule icon={<Trash2Icon />}>
          <span className="font-medium text-foreground">ลบ</span> — ได้เฉพาะแผนกที่ยังไม่มีผู้ใช้
        </Rule>
      </ul>
      <p className="mt-4 flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground">
        <ShieldCheckIcon className="mt-px size-3.5 shrink-0 text-brand" />
        เฉพาะผู้ดูแลระบบ (ADMIN) เท่านั้นที่เพิ่มหรือแก้ไขรายชื่อแผนกได้
      </p>
    </section>
  )
}

/** Mirrors the department dropdown in the user form: active departments, in order. */
export function DepartmentPickerPreview({ departments }: { departments: readonly Department[] }) {
  const active = departments.filter((d) => d.isActive)
  const hidden = departments.length - active.length
  return (
    <section className="hidden space-y-3 lg:block" aria-label="ตัวอย่างตัวเลือกแผนก">
      <div className="flex items-center gap-2 text-sm font-medium">
        <EyeIcon className="size-4 text-muted-foreground" /> ผู้ใช้จะเห็นแบบนี้
      </div>
      <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
        <div className="text-xs text-muted-foreground">ช่อง “แผนก” ในข้อมูลผู้ใช้</div>
        <div className="flex h-8 items-center justify-between rounded-lg border bg-background px-2.5 text-sm text-muted-foreground" aria-hidden>
          เลือกแผนก
          <ChevronDownIcon className="size-4 opacity-60" />
        </div>
        {active.length === 0 ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-warning-soft p-2.5 text-xs text-warning-foreground">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0 text-warning" />
            ยังไม่มีแผนกที่เปิดใช้งาน — ผู้ใช้จะเลือกแผนกไม่ได้จนกว่าจะเปิดอย่างน้อย 1 แผนก
          </p>
        ) : (
          <ul className="max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 text-sm shadow-sm scrollbar-thin">
            {active.map((d) => (
              <li key={d.id} className="truncate rounded-md px-2 py-1.5">
                {d.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      {hidden > 0 && <p className="text-xs text-muted-foreground">แผนกที่ปิดใช้งาน {hidden} แผนกจะไม่แสดงให้เลือก</p>}
    </section>
  )
}
