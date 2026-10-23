import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react'

import { BUILDER_CANVAS_CHECK, ONE_POLICY_CARD, OPEN_AT_ONCE, RUN_MOTION, VERSION_SWITCH } from './phase'

/* -----------------------------------------------------------------------------
   WHICH VERSION OF CHECK ACCESS (owner, 20 Oct 2026: "give me the classic
   version of Check access, where we used to have the old version, the
   multiple-policy one, and the current v2 as a modern one based on the current
   product state" — then "so Classic the old version, v2 the one-card edition,
   v3 the same as the edit builder" — then, of v2 half built, "Remove v2, no
   need, it's bad").

     classic   the run as it was before 20 Oct: the sign-in pill, the Policies
               card ("Policy 1 of 2 applies"), the Rule card and the Outcome
               card on their connectors; past and blocked sign-ins fill the form
               and wait for Run; the story told once a session; the matched
               rule's ring; every card folded at landing; the engine at its full
               pace
     v3        the run on the builder's own canvas (phase.ts
               BUILDER_CANVAS_CHECK): the sign-in, the policy's head, the
               policy's own rule cards read one by one, the outcome at the
               chain's end — with the run's motion (RUN_MOTION), one policy
               (ONE_POLICY_CARD), past and blocked sign-ins opening at once
               (OPEN_AT_ONCE)

   v2 (one card for the whole run) is gone, on the owner's word: no option, no
   card. A browser that stored 'v2' — or 'modern', the spec's first word for it
   — reads v3.

   phase.ts says what is AVAILABLE; the version says what this viewer sees, so
   Classic turns the flags off at runtime and v3 takes them as phase.ts has
   them. Every component that read one of them reads `useRunFlags()` instead, by
   a local of the flag's own name, so each line that read the flag reads it
   unchanged.

   Kept on this browser, under its own key: the page's switch writes it, the
   builder's Check access follows it live (and another tab through `storage`).
   A static render reads the default, v3, unless a test pins one
   (`CheckVersionOverride`). Storage can throw (a private window, blocked site
   data), so every read and write is guarded.
   -------------------------------------------------------------------------- */

export type CheckVersion = 'classic' | 'v3'

/** The versions, in the switch's order. */
export const CHECK_VERSIONS: readonly CheckVersion[] = ['classic', 'v3']

/** What the switch says for each (the owner's own words, 20 Oct 2026). */
export const CHECK_VERSION_WORD: Record<CheckVersion, string> = { classic: 'Classic', v3: 'v3' }

export const CHECK_VERSION_KEY = 'idp.check-version'

/** What a viewer who never chose sees, and what a static render draws. */
export const DEFAULT_CHECK_VERSION: CheckVersion = 'v3'

/* Words an earlier build stored: the spec named v2 "modern" until the owner's labels, and v2 itself is withdrawn
   (owner, 20 Oct 2026: "Remove v2, no need, it's bad"). Both read as v3, the version that replaced it. */
const OLD_WORDS: Readonly<Record<string, CheckVersion>> = { modern: 'v3', v2: 'v3' }

/** A stored value read as a version: anything it does not know is the default. */
export function parseCheckVersion(raw: string | null | undefined): CheckVersion {
  if (raw === null || raw === undefined) return DEFAULT_CHECK_VERSION
  if ((CHECK_VERSIONS as readonly string[]).includes(raw)) return raw as CheckVersion
  return OLD_WORDS[raw] ?? DEFAULT_CHECK_VERSION
}

/** The version this browser keeps; v3 with the switch off, with nothing stored, or with storage refused. */
export function readCheckVersion(): CheckVersion {
  if (!VERSION_SWITCH) return DEFAULT_CHECK_VERSION
  try {
    if (typeof window === 'undefined') return DEFAULT_CHECK_VERSION
    return parseCheckVersion(window.localStorage.getItem(CHECK_VERSION_KEY))
  } catch {
    return DEFAULT_CHECK_VERSION
  }
}

const listeners = new Set<() => void>()
/* Where a press is held when storage refuses it, so the switch still answers in a private window. */
let memory: CheckVersion | null = null

/** Keep a version, and tell every view on this page that reads it (another tab hears it through `storage`). */
export function writeCheckVersion(v: CheckVersion): void {
  try {
    window.localStorage.setItem(CHECK_VERSION_KEY, v)
    memory = null
  } catch {
    /* Blocked site data: nothing is kept, and the views still follow the press for as long as the page stands. */
    memory = v
  }
  for (const fn of [...listeners]) fn()
}

function snapshot(): CheckVersion {
  return memory ?? readCheckVersion()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CHECK_VERSION_KEY) fn()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

const serverSnapshot = (): CheckVersion => DEFAULT_CHECK_VERSION

/** What a version turns on, of what phase.ts makes available. */
export interface RunFlags {
  version: CheckVersion
  /** phase.ts ONE_POLICY_CARD: one policy, its rules with it. */
  onePolicy: boolean
  /** phase.ts OPEN_AT_ONCE: past and blocked sign-ins open straight into their run. */
  openAtOnce: boolean
  /** phase.ts RUN_MOTION: every run told, the lock, the outcome kept open, Escape lands, the brisk engine. */
  motion: boolean
  /** phase.ts BUILDER_CANVAS_CHECK (needs the one-policy flag): the run drawn on the builder's own canvas. */
  canvas: boolean
}

export function runFlags(v: CheckVersion): RunFlags {
  switch (v) {
    case 'classic':
      return { version: v, onePolicy: false, openAtOnce: false, motion: false, canvas: false }
    case 'v3':
      return { version: v, onePolicy: ONE_POLICY_CARD, openAtOnce: OPEN_AT_ONCE, motion: RUN_MOTION, canvas: BUILDER_CANVAS_CHECK && ONE_POLICY_CARD }
  }
}

/** Tests and static renders only: a version pinned without storage. */
export const CheckVersionOverride = createContext<CheckVersion | null>(null)

/** The version this viewer sees, and the press that changes it. */
export function useCheckVersion(): [CheckVersion, (v: CheckVersion) => void] {
  const pinned = useContext(CheckVersionOverride)
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const set = useCallback((v: CheckVersion) => writeCheckVersion(v), [])
  return [pinned ?? stored, set]
}

/** The flags as this viewer's version has them. */
export function useRunFlags(): RunFlags {
  const [version] = useCheckVersion()
  return useMemo(() => runFlags(version), [version])
}
