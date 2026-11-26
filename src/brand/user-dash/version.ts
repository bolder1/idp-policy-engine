import { useSyncExternalStore } from 'react'

import type { AccountPage, BrandScreen } from '../store'

/* -----------------------------------------------------------------------------
   Today or Proposed: which User Dashboard is drawn. Today is the live site's two places, untouched. The pick is the
   one thing kept in the browser (localStorage `idp.userDash`), so a demo reopens where it was; every read and write is
   guarded, and anything unreadable is Today.
   -------------------------------------------------------------------------- */

export type UserDashVersion = 'today' | 'proposed'

const KEY = 'idp.userDash'
const listeners = new Set<() => void>()

export function readVersion(): UserDashVersion {
  try {
    return localStorage.getItem(KEY) === 'proposed' ? 'proposed' : 'today'
  } catch {
    return 'today'
  }
}

export function writeVersion(v: UserDashVersion): void {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* Storage blocked: the pick lasts until the page reloads. */
  }
  memory = v
  listeners.forEach((l) => l())
}

/* What the page reads: the last pick made in this load, else what storage holds. */
let memory: UserDashVersion | null = null
const current = (): UserDashVersion => memory ?? readVersion()

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useUserDashVersion(): [UserDashVersion, (v: UserDashVersion) => void] {
  const v = useSyncExternalStore(subscribe, current, () => 'today' as const)
  return [v, writeVersion]
}

export interface NavItem {
  label: string
  screen: BrandScreen
  /** The screen names that light this item. */
  on: readonly BrandScreen['name'][]
}

const ACCOUNT: { name: 'account'; page: AccountPage } = { name: 'account', page: 'overview' }

/** The top bar's places for a version. */
export function navFor(v: UserDashVersion): NavItem[] {
  return v === 'proposed'
    ? [
        { label: 'Apps', screen: { name: 'apps' }, on: ['apps'] },
        { label: 'My account', screen: ACCOUNT, on: ['account', 'methods'] },
      ]
    : [
        { label: 'Dashboard', screen: { name: 'apps' }, on: ['apps'] },
        { label: 'Setup 2FA', screen: { name: 'methods' }, on: ['methods'] },
      ]
}
