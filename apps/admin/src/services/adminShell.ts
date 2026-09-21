import type { AdminSpace } from '../types/admin'

export const LAST_SPACE_KEY = 'yuke.admin.last-space'

export function rememberSpace(spaceId: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LAST_SPACE_KEY, spaceId)
}

export function resolveRememberedSpace(spaces: AdminSpace[]): AdminSpace | null {
  if (spaces.length === 0) return null
  const remembered = typeof window === 'undefined'
    ? ''
    : window.localStorage.getItem(LAST_SPACE_KEY) || ''
  return (
    spaces.find((space) => space.id === remembered) ??
    spaces.find((space) => space.status === 'active') ??
    spaces[0] ??
    null
  )
}

export function spacePath(spaceId: string, section = 'overview') {
  return '/spaces/' + encodeURIComponent(spaceId) + '/' + section
}
