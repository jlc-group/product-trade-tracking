import { ArrowLeftIcon, CompassIcon, HomeIcon } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import { PageHeader } from '@/components/common/misc'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <div className="relative">
        <span className="tabular block text-7xl font-bold tracking-tighter text-muted-foreground/25 select-none sm:text-8xl" aria-hidden>
          404
        </span>
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
            <CompassIcon className="size-6" />
          </span>
        </span>
      </div>
      <PageHeader
        className="justify-center [&_p]:mx-auto"
        title="ไม่พบหน้าที่คุณต้องการ"
        description="ลิงก์อาจพิมพ์ผิด หรือหน้านี้ถูกย้าย / ลบไปแล้ว ลองกลับไปที่หน้าหลักแล้วเริ่มใหม่อีกครั้ง"
      />
      <code className="max-w-full truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{pathname}</code>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild className="gap-1.5">
          <Link to="/">
            <HomeIcon />
            กลับหน้าหลัก
          </Link>
        </Button>
        {canGoBack && (
          <Button variant="outline" className="gap-1.5" onClick={() => navigate(-1)}>
            <ArrowLeftIcon />
            ย้อนกลับ
          </Button>
        )}
      </div>
    </div>
  )
}
