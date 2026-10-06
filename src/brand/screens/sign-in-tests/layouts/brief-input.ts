import { useMemo } from 'react'

import type { App, User } from '../../../data'
import { useBrand } from '../../../store'
import { useSimEnv } from '../../sim-env'
import { sentenceTokens, tokenValue, type SentenceContext } from '../../testing/sign-in-sentence'
import { audienceViaOf, type Via } from '../conflicts'
import { briefOf, type BriefInput, type BriefModel } from './brief-model'
import type { RunLayoutProps } from './types'

/* -----------------------------------------------------------------------------
   What the brief's sentence is said from, for a run: who signed in to what,
   how the deciding policy covers them, the second factor, the facts the row
   on top states — and the sentence itself (brief-model.ts `briefOf`).

   Lifted out of BriefLayout.tsx unchanged (5 Oct 2026) when Focus took the
   brief in as a view of its own (focus2-brief.tsx): both read it from here,
   so the Brief view and Focus's brief can never say different things.
   -------------------------------------------------------------------------- */

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name

/** The brief's width for a canvas: it reads at full size, at most 920 wide. */
export const briefWidth = (canvas: number): number => Math.round(Math.min(920, Math.max(520, canvas - 96)) / 8) * 8

/** Under this the canvas is narrow, and the sentence is at its floor size (brief.css `.is-narrow`). */
export const BRIEF_NARROW = 900

export interface BriefRun {
  person: User | null
  app: App | null
  /** The application's name, as the plan says it. */
  appName: string
  /** The group signed in as, by name; null for a person. */
  groupName: string | null
  /** "Maya Iyer", or "A member of Finance". */
  personName: string
  /** "Maya", or "them". */
  first: string
  /** The person's groups, by name. */
  memberGroups: string[]
  /** How the deciding policy covers them (its audience), asked as the resolver does. */
  via: Via | null
  /** The sign-in's stated facts, as the row on top says them. */
  facts: ReturnType<typeof tokenValue>[]
  briefIn: BriefInput
  model: BriefModel
}

/** The brief of a run: its input and its sentence, from the props a layout is handed. */
export function useBriefRun(run: Pick<RunLayoutProps, 'plan' | 'form' | 'asGroup' | 'rows' | 'screens' | 'policies'>): BriefRun {
  const { plan, form, asGroup, rows, screens } = run
  const brand = useBrand()
  const { users, groups, apps, zones } = brand
  const env = useSimEnv()

  /* Who signed in to what. */
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const appName = plan.appName || app?.name || 'the application'
  const groupName = asGroup ? (groups.find((g) => g.id === asGroup || g.name === asGroup)?.name ?? asGroup) : null
  const personName = groupName ? `A member of ${groupName}` : (person?.name ?? plan.conflicts?.personName ?? 'Someone')
  const first = groupName ? 'them' : person ? firstName(person.name) : 'them'
  const memberGroups = useMemo(() => {
    if (!person) return []
    const ids = [person.groupId, ...(person.alsoGroupIds ?? [])].filter((x, i, a) => x && a.indexOf(x) === i)
    return ids.map((id) => groups.find((g) => g.id === id)?.name ?? id)
  }, [person, groups])

  /* How the deciding policy covers them: its audience, asked as the resolver does. */
  const deciderPolicy = useMemo(() => {
    const list = run.policies ?? brand.policies
    return plan.decider ? (list.find((p) => p.id === plan.decider!.id) ?? null) : null
  }, [plan.decider, run.policies, brand.policies])
  const via = useMemo(() => {
    try {
      return deciderPolicy && person ? audienceViaOf(deciderPolicy, person, env) : null
    } catch {
      return null
    }
  }, [deciderPolicy, person, env])
  const second = useMemo(() => {
    const st = screens.find((x) => x.decision === '2fa')?.steps.find((x) => x.kind === 'second')
    return st && st.kind === 'second' ? st.name : ''
  }, [screens])

  /* The sentence: the picked things with their marks. */
  const facts = useMemo(() => {
    const ctx: SentenceContext = { people: users, apps, zones, rows }
    return sentenceTokens(rows)
      .filter((t) => t !== 'person' && t !== 'app')
      .map((t) => tokenValue(t, form, ctx))
  }, [rows, form, users, apps, zones])
  const groupNames = useMemo(() => (groupName ? [groupName] : memberGroups), [groupName, memberGroups])
  const briefIn = useMemo(
    (): BriefInput => ({ person: personName, first, app: appName, via, second, name: groupName ? '' : (person?.name ?? ''), groups: groupNames, appId: app?.id ?? form.appId, facts }),
    [personName, first, appName, via, second, groupName, person, groupNames, app, form.appId, facts],
  )
  const model = useMemo(() => briefOf(plan, briefIn), [plan, briefIn])

  return { person, app, appName, groupName, personName, first, memberGroups, via, facts, briefIn, model }
}
