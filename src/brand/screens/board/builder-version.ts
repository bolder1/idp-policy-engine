import { useSyncExternalStore } from 'react'

/* -----------------------------------------------------------------------------
   BUILDER VERSIONS (owner, 23 Oct 2026: "create a V0 version … the main goal is
   to let the user build a policy, that's it", then "a switch from V0 to Vn with
   the current build, so I can give the developer a good walkthrough of what to
   build when", then "create a few more versions and add things based on need").

   Five builds of the same screen, each one the one before plus a named piece.
   The developer builds them in this order.

     V0    Build a policy. The name and status, Save draft and Save policy, the
           start node, rules and the places to insert one, folding a card and
           Expand all, and the panel's Who, If and Then with Duplicate and Delete
           in its menu. A deny has its message and nothing else.
     V1    Arrange it. Reorder rules (the grip on the number, Move up and Move
           down), undo and redo, fit and zoom, Copy who from another rule, and
           who the policy is narrowed to in the start node's sentence.
     V2    Finish a deny, and throw work away. A deny's Next step and Contact,
           and Discard in the bar.
     V3    Test it. Check access and Past sign-ins in the bar.
     Full  Everything as it stands: Guide me on the canvas.

   Each feature below names the first version that shows it. Every piece is hidden
   where its door is, so a higher version brings it back as it was and nothing is
   removed from the code. The choice is kept in localStorage; it starts on V0.
   -------------------------------------------------------------------------- */

export type BuilderVersion = 'v0' | 'v1' | 'v2' | 'v3' | 'full'

const ORDER: BuilderVersion[] = ['v0', 'v1', 'v2', 'v3', 'full']

/** The first version that shows each piece. */
const SINCE = {
  arrange: 'v1', // the grip, Move up and Move down
  history: 'v1', // undo and redo
  zoom: 'v1', // fit, zoom out, zoom in
  copyWho: 'v1', // Copy who from another rule
  startWho: 'v1', // "from Sales or 2 more" in the start node's sentence
  denyExtras: 'v2', // a deny's Next step and Contact
  discard: 'v2', // Discard in the bar
  testing: 'v3', // Check access and Past sign-ins
  guideMe: 'full', // Guide me, on the canvas
} as const satisfies Record<string, BuilderVersion>

export type BuilderFeature = keyof typeof SINCE

export const BUILDER_VERSIONS: { value: BuilderVersion; label: string }[] = [
  { value: 'v0', label: 'V0' },
  { value: 'v1', label: 'V1' },
  { value: 'v2', label: 'V2' },
  { value: 'v3', label: 'V3' },
  { value: 'full', label: 'Full' },
]

const KEY = 'idp.builder.version'
const LOCK_KEY = 'idp.builder.unlocked'
const listeners = new Set<() => void>()

function read(): BuilderVersion {
  try {
    const v = localStorage.getItem(KEY)
    return ORDER.includes(v as BuilderVersion) ? (v as BuilderVersion) : 'v0'
  } catch {
    return 'v0'
  }
}

function readUnlocked(): boolean {
  try {
    return localStorage.getItem(LOCK_KEY) === '1'
  } catch {
    return false
  }
}

let current: BuilderVersion = read()
let unlocked = readUnlocked()

const emit = () => listeners.forEach((l) => l())

export function setBuilderVersion(v: BuilderVersion) {
  current = v
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* Private window or blocked storage: the switch still works for this load. */
  }
  emit()
}

/* -----------------------------------------------------------------------------
   THE LOCK (owner, 23 Oct 2026: lock every version but the first, behind a
   password, and "don't let the developer know what the current version is" —
   they get the clean build first, and things are unlocked as each is done).

   Locked, the builder is the first build whatever was stored, and nothing on
   screen says there are versions: the switch is not drawn. The owner presses
   Ctrl+P for the password prompt; once in, a dropdown of the versions appears and the
   choice sticks across reloads. The same keys lock it again.

   Only the SHA-256 of the password is kept here, because the repository is
   public. This is a door for a walkthrough, not security: it lives in the
   browser, and anyone with the dev tools open can get past it.
   -------------------------------------------------------------------------- */
const PASSWORD_SHA256 = '3f67bb26d01c4ca621cbf19f25ed2099c21dfb96c4e9c1ee90ea61e6956061d1'

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** True, and unlocked, when the password is right; false, and still locked, when not. */
export async function unlockBuilder(password: string): Promise<boolean> {
  let ok = false
  try {
    ok = (await sha256Hex(password)) === PASSWORD_SHA256
  } catch {
    ok = false
  }
  if (!ok) return false
  unlocked = true
  try {
    localStorage.setItem(LOCK_KEY, '1')
  } catch {
    /* Stays unlocked for this load. */
  }
  emit()
  return true
}

export const isBuilderUnlocked = (): boolean => unlocked

export function lockBuilder() {
  unlocked = false
  try {
    localStorage.removeItem(LOCK_KEY)
  } catch {
    /* Locked for this load. */
  }
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/* Locked, the first build whatever was stored. The server render (the tests,
   which draw static markup) is the whole builder. */
const snapshot = (): BuilderVersion => (unlocked ? current : 'v0')
export const useBuilderVersion = (): BuilderVersion => useSyncExternalStore(subscribe, snapshot, () => 'full')

export const useBuilderUnlocked = (): boolean => useSyncExternalStore(subscribe, () => unlocked, () => true)

/** Whether the version on screen shows this piece. */
export const useShows = (feature: BuilderFeature): boolean =>
  ORDER.indexOf(useBuilderVersion()) >= ORDER.indexOf(SINCE[feature])
