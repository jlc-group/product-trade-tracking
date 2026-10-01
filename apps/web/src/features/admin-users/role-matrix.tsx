import { PERMISSION_LABEL, PERMISSIONS, ROLE_PERMISSIONS, ROLE_SHORT } from '@flowtrade/shared'
import { CheckIcon, InfoIcon, MinusIcon, ShieldCheckIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ROLE_ORDER, ROLE_TONE } from './roles'

const RESOURCE_RULES = [
  'เจ้าของและทีมงานของโปรเจกต์ แก้ไขและจัดการ Task ในโปรเจกต์ของตัวเองได้ ไม่ว่าจะมีบทบาทใด',
  'ผู้รับผิดชอบ Task ติ๊กเสร็จงานของตัวเองได้ แม้ไม่ได้อยู่ในทีมงานของโปรเจกต์',
  'เจ้าของโปรเจกต์ลบได้เฉพาะงานร่างของตัวเอง — งานที่เริ่มแล้วให้เปลี่ยนสถานะเป็น "ยกเลิก" แทน',
  'บัญชีที่ปิดการใช้งานจะเข้าสู่ระบบไม่ได้ทันที แต่งานและประวัติทั้งหมดยังอยู่ครบ',
]

/** Permission × role matrix, read straight from ROLE_PERMISSIONS so it never drifts from the real rules. */
export function RoleMatrix() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheckIcon className="size-4 text-primary" aria-hidden />
          สิทธิ์ของแต่ละบทบาท
        </CardTitle>
        <CardDescription>สิทธิ์ตามบทบาทใช้กับทุกโปรเจกต์ในระบบ ส่วนสิทธิ์รายโปรเจกต์ดูได้ที่หมายเหตุด้านล่าง</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[30rem] text-sm">
            <caption className="sr-only">ตารางสิทธิ์ของแต่ละบทบาท</caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className="py-2 pr-3 text-left text-xs font-medium text-muted-foreground">
                  สิทธิ์
                </th>
                {ROLE_ORDER.map((r) => (
                  <th key={r} scope="col" className="w-24 px-2 py-2 text-center">
                    <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold', ROLE_TONE[r])}>{ROLE_SHORT[r]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p} className="border-b last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    {PERMISSION_LABEL[p]}
                  </th>
                  {ROLE_ORDER.map((r) => {
                    const has = ROLE_PERMISSIONS[r].includes(p)
                    return (
                      <td key={r} className="px-2 py-2 text-center">
                        {has ? (
                          <span className="inline-flex size-6 items-center justify-center rounded-full bg-success-soft text-success">
                            <CheckIcon className="size-3.5" aria-hidden />
                            <span className="sr-only">มีสิทธิ์</span>
                          </span>
                        ) : (
                          <span className="inline-flex size-6 items-center justify-center text-muted-foreground/50">
                            <MinusIcon className="size-3.5" aria-hidden />
                            <span className="sr-only">ไม่มีสิทธิ์</span>
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg bg-info-soft/60 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-info">
            <InfoIcon className="size-4" aria-hidden />
            สิทธิ์รายโปรเจกต์ (ใช้กับทุกบทบาท)
          </p>
          <ul className="mt-2 grid gap-1.5 text-sm text-foreground/80 md:grid-cols-2 md:gap-x-6">
            {RESOURCE_RULES.map((rule) => (
              <li key={rule} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-info" aria-hidden />
                {rule}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
