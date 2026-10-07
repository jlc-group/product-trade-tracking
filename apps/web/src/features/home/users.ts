import type { User } from '@flowtrade/shared'
import { useMemo } from 'react'
import { useUserLookup } from '@/api/hooks'

export type UsersById = ReadonlyMap<string, Pick<User, 'name' | 'nickname'>>

/** Active users by id (GET /users/lookup, cached). */
export function useUsersById(): UsersById {
  const { data } = useUserLookup()
  return useMemo(() => new Map((data ?? []).map((u) => [u.id, u])), [data])
}

/** Nickname, else first name ("จอย"). */
export function shortName(users: UsersById, id: string) {
  const u = users.get(id)
  return u ? u.nickname || u.name.split(/\s+/)[0] : 'ไม่ทราบชื่อ'
}
