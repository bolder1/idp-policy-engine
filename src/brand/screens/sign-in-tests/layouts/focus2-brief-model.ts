import type { EngineRun } from '../engine-run'
import type { Target } from './assistant/intents'
import type { BriefModel, CiteId } from './brief-model'

/* -----------------------------------------------------------------------------
   Focus's brief (focus2-brief.tsx), the parts with no React in them: which
   views are on the canvas and how that is remembered, and which card each
   cited phrase of the sentence stands for.
   -------------------------------------------------------------------------- */

/** What the canvas shows: the cards (Focus as it was), the brief alone, or the brief over the cards. */
export type FocusViews = 'cards' | 'brief' | 'both'

const VIEWS_KEY = 'idp.focus-views'
const VIEWS: readonly FocusViews[] = ['cards', 'brief', 'both']

/** The viewer's last pick on this browser; the cards when there is none, or storage refuses. */
export function readViews(): FocusViews {
  try {
    if (typeof window === 'undefined') return 'cards'
    const v = window.localStorage.getItem(VIEWS_KEY)
    return VIEWS.includes(v as FocusViews) ? (v as FocusViews) : 'cards'
  } catch {
    return 'cards'
  }
}

export function writeViews(v: FocusViews): void {
  try {
    window.localStorage.setItem(VIEWS_KEY, v)
  } catch {
    /* Storage refused: the pick holds for as long as the view does. */
  }
}

/** The two toggles as one pick. Both off cannot be pressed (the row keeps the last one on), so it reads as the cards. */
export function viewsOf(cards: boolean, brief: boolean): FocusViews {
  if (cards && brief) return 'both'
  return brief ? 'brief' : 'cards'
}

/* The card each cited phrase is about, named as the answers panel names it (assistant/intents.ts `Target`), so a
   phrase hovered or pressed goes down Focus's own `onCite` / pin path and lights and brings the card it stands for.

     who      the person: the sign-in card
     policy   the deciding policy: the policy list
     rule     the rule the phrase names — the rule that matched, or on a Depends the first that can't tell
              (brief-model.ts `decisiveOf` picks that one too)
     check    the deciding check, a row of that rule's card
     outcome  the answer

   A part with nothing to point at (a run with no policy) has no entry, and its phrase lights nothing. */
export function citeTargets(plan: Pick<EngineRun, 'decider' | 'rules' | 'landing' | 'outcome'>, model: Pick<BriefModel, 'decisive'>): Partial<Record<CiteId, Target>> {
  const out: Partial<Record<CiteId, Target>> = { who: 'person', outcome: 'outcome' }
  if (plan.decider) out.policy = `policy:${plan.decider.id}`
  const d = model.decisive
  const ruleAt = plan.outcome.status === 'depends' && d ? d.rule : plan.landing
  const rule = ruleAt !== null ? plan.rules[ruleAt] : undefined
  if (rule) out.rule = `rule:${rule.id}`
  const dRule = d ? plan.rules[d.rule] : undefined
  const check = d && dRule ? dRule.checks[d.check] : undefined
  if (dRule && check) out.check = `check:${dRule.id}:${check.category}`
  return out
}

/** What the sentence says, as plain words. */
export const saidOf = (model: Pick<BriefModel, 'parts' | 'after'>): string => [...model.parts, ...model.after].map((p) => p.text).join('')

/* Numbers once per view: the panel's footer ("Checked 1 policy · 3 rules · 6 checks") less any count the brief's
   sentence already says — "none of its 3 rules match" is the one it can say, on a run where no rule matched. The
   first clause carries "Checked" and is never the one said, so it stays. */
export function footerBeside(summary: string, said: string): string {
  return summary
    .split(' · ')
    .filter((part, i) => {
      const count = /\d+ [a-z]+$/.exec(part)?.[0]
      return i === 0 || !count || !said.includes(count)
    })
    .join(' · ')
}

/** The phrase a target lights in the sentence, if it is one the sentence cites: the answer's thumbnail lights the answer. */
export function citeOfLit(lit: string | null, targets: Partial<Record<CiteId, Target>>): CiteId | null {
  if (!lit) return null
  const t = lit === 'screens' ? 'outcome' : lit
  for (const [c, v] of Object.entries(targets) as [CiteId, Target][]) if (v === t) return c
  return null
}
