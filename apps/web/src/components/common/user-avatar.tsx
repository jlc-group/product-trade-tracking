import type { User } from '@flowtrade/shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { displayName, initials } from '@/lib/format'
import { cn } from '@/lib/utils'

type AvatarUser = Pick<User, 'name' | 'avatarColor'> & { nickname?: string | null; isActive?: boolean }

const SIZES = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
}

export function UserAvatar({ user, size = 'sm', className, tooltip = true }: { user: AvatarUser; size?: keyof typeof SIZES; className?: string; tooltip?: boolean }) {
  const avatar = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-card select-none',
        SIZES[size],
        user.isActive === false && 'opacity-50 grayscale',
        className,
      )}
      style={{ backgroundColor: user.avatarColor }}
      aria-label={user.name}
    >
      {initials(user.nickname || user.name)}
    </span>
  )
  if (!tooltip) return avatar
  return (
    <Tooltip>
      <TooltipTrigger asChild>{avatar}</TooltipTrigger>
      <TooltipContent>{displayName(user)}</TooltipContent>
    </Tooltip>
  )
}

export function AvatarStack({ users, max = 3, size = 'sm', className }: { users: AvatarUser[]; max?: number; size?: keyof typeof SIZES; className?: string }) {
  const shown = users.slice(0, max)
  const rest = users.length - shown.length
  return (
    <span className={cn('inline-flex items-center -space-x-1.5', className)}>
      {shown.map((u, i) => (
        <UserAvatar key={`${u.name}-${i}`} user={u} size={size} />
      ))}
      {rest > 0 && (
        <span className={cn('inline-flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-card', SIZES[size])}>+{rest}</span>
      )}
    </span>
  )
}
