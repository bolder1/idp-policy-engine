import type { UserDashState } from './state'

/* What the Apps home's sections list, apart from the page so the page file exports only a component. PURE. */

export interface AppLike {
  id: string
  name: string
}

/** Each section after hidden apps and the search: Favourites, Recently used (not repeating a favourite), All apps. */
export function homeSections<A extends AppLike>(apps: readonly A[], s: Pick<UserDashState, 'favourites' | 'recent' | 'hidden'>, q: string, showHidden: boolean) {
  const needle = q.trim().toLowerCase()
  const shown = apps.filter((a) => (showHidden || !s.hidden.includes(a.id)) && (!needle || a.name.toLowerCase().includes(needle)))
  const byId = new Map(shown.map((a) => [a.id, a]))
  const pick = (ids: readonly string[]) => ids.map((id) => byId.get(id)).filter((a): a is A => !!a)
  return { favourites: pick(s.favourites), recent: pick(s.recent.filter((id) => !s.favourites.includes(id))), all: shown }
}

/** Why the home has no cards, if it has none: no apps at all, every app hidden, or nothing matches the search. */
export function homeEmpty(mine: number, shown: number, q: string): 'none' | 'hidden' | 'search' | null {
  if (mine === 0) return 'none'
  if (shown > 0) return null
  return q.trim() ? 'search' : 'hidden'
}
