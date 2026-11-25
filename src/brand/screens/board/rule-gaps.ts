import { createContext, useContext } from 'react'

import { conditionType, type Condition, type Policy, type Rule } from '../../data'
import { whoCoversNobody } from '../../rule-who'
import { shows } from '../../rollout'
import { scheduleGap } from '../../schedule'
import type { Part } from './model'
import './rule-gaps.css'

/* -----------------------------------------------------------------------------
   RULE GAPS: what a rule still leaves empty (owner, 23 Nov 2026: "rules that can't be saved because things cannot be
   empty … if I just add a rule and press Save, you let me save the rule. I didn't choose any Allow or anything").
   Every line (rollout.ts `ruleGaps`), in Today and Fix alike.

   A gap is a question on the rule nobody has answered. Save policy (and ⌘↵) and Save rule refuse while one is
   left: the rule is chosen and opened, and each reason stands under the field it is about, worded after that field,
   until it is answered (the 26 Sep ruling: reasons in the form, never in a footer, and never a disabled button). Save
   draft is never refused: a draft is allowed to be unfinished (unfinished-means-draft).

   Only what the rule itself leaves empty. A value that names something deleted from a library (a zone, a device
   profile) is the diagnostics' business (diagnostics.ts PE103), not a gap.

   PURE but for the context at the foot, which carries the gaps being shown to the panel and the cards.
   -------------------------------------------------------------------------- */

export const RULE_GAPS: boolean = shows('ruleGaps')

export type GapField = 'outcome' | 'first-factor' | 'methods' | 'chain' | 'condition' | 'group' | 'name' | 'who' | 'alerts' | 'alert-email'

export interface RuleGap {
  /** The rule's id, or 'fallback' for "Nothing else matched". */
  at: string
  field: GapField
  /** The condition or group it is about, for 'condition' and 'group'. */
  part?: string
  /** One line, worded after the question it is under. */
  text: string
}

export const GAP_TEXT: Record<GapField, string> = {
  outcome: 'Choose Allow or Deny.',
  'first-factor': 'Choose a first factor.',
  methods: 'Choose at least one method.',
  chain: 'Add at least one step.',
  condition: 'Choose a value.',
  group: 'Add a condition to this group, or remove it.',
  name: 'Name this rule.',
  who: 'This rule applies to nobody.',
  alerts: 'Choose at least one event.',
  'alert-email': 'Enter a valid email address.',
}

/** An address the alert can be sent to: the same test the field's own help line uses (WhatEditor). */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* What a condition with a value can still leave unanswered, worded after its own field (23 Nov 2026 audit): a time
   window needs both ends; a number compared above or below must be a number; a risk score is 0 to 100. */
function conditionGapText(c: Condition): string | null {
  const vals = c.values.map((v) => v.trim())
  /* A window with an end left out: the engine fills it with midnight, so 'before 17:00' would run as 17:00 to 23:59. */
  if (conditionType(c.typeId).valueKind === 'time' && (!vals[0] || !vals[1])) return 'Choose both times.'
  /* Sign-in time: a day, both ends of each day's hours, and an end that is not the start (schedule.ts). */
  if (conditionType(c.typeId).valueKind === 'schedule') return scheduleGap(vals.filter(Boolean))
  if (vals.every((v) => !v)) return GAP_TEXT.condition
  if ((c.typeId === 'user-attr' || c.typeId === 'custom-attr') && (c.operator === 'above' || c.operator === 'below') && !Number.isFinite(Number(vals[0])))
    return 'Enter a number.'
  if (c.typeId === 'device-risk') {
    const n = Number(vals[0])
    if (!Number.isFinite(n) || n < 0 || n > 100) return 'Enter a score from 0 to 100.'
  }
  return null
}

const gap = (at: string, field: GapField, part?: string, text: string = GAP_TEXT[field]): RuleGap => ({ at, field, ...(part ? { part } : null), text })

/** What one rule leaves empty, in the order the panel asks: name, conditions, then the outcome and its factors. */
/* `post`: a post sign-in rule (post-board.ts). Its Then is its action, which has a refusal of its own, so only the name,
   the who and the conditions are asked here. */
export function gapsOf(rule: Rule, at: string = rule.id, terminal = false, post = false): RuleGap[] {
  const out: RuleGap[] = []
  if (!terminal && !rule.name.trim()) out.push(gap(at, 'name'))
  /* Every included group or person is also an exception: the rule decides nobody's sign-in. */
  if (!terminal && whoCoversNobody(rule.who)) out.push(gap(at, 'who'))
  if (!terminal) {
    for (const card of rule.when.cards) {
      if (card.conditions.length === 0) out.push(gap(at, 'group', card.id))
      for (const c of card.conditions) {
        const text = conditionGapText(c)
        if (text) out.push(gap(at, 'condition', c.id, text))
      }
    }
  }
  if (post) return out
  /* A Deny's email alerts: switched on with nothing that sends them, or to an address that is not one. */
  if (rule.decision === 'deny' && !rule.outcomeOpen) {
    if ((rule.denyAlertAdmins || rule.denyAlertUsers) && !(rule.denyAlertOn?.length)) out.push(gap(at, 'alerts'))
    const email = rule.denyAlertEmail?.trim()
    if (rule.denyAlertAdmins && email && !EMAIL_SHAPE.test(email)) out.push(gap(at, 'alert-email'))
  }
  /* Nobody pressed Allow or Deny on a new rule: the Allow it holds is the blank's default, not an answer. */
  if (rule.outcomeOpen && !terminal) {
    out.push(gap(at, 'outcome'))
    return out
  }
  if (rule.decision !== 'deny' && rule.firstFactor === 'Specific' && !rule.firstFactorMethod) out.push(gap(at, 'first-factor'))
  if (rule.decision === '2fa' && rule.secondFactor === 'specific' && (rule.secondFactorMethods?.length ?? 0) === 0) out.push(gap(at, 'methods'))
  if (rule.decision === '2fa' && rule.secondFactor === 'chain' && (rule.methodChain?.length ?? 0) === 0) out.push(gap(at, 'chain'))
  return out
}

/** Every gap in a policy: its rules top to bottom, then "Nothing else matched". */
export function policyGaps(p: Pick<Policy, 'rules' | 'fallback'>, post = false): RuleGap[] {
  return [...p.rules.flatMap((r) => gapsOf(r, r.id, false, post)), ...(p.fallback ? gapsOf(p.fallback, 'fallback', true, post) : [])]
}

/** The panel part a gap opens on. The panel draws Then below If whichever is chosen, and focus goes to the reason. */
export const gapPart = (g: RuleGap): Part => (g.field === 'name' || g.field === 'who' ? 'who' : 'when')

/* The gaps being shown: empty until a save was refused, then every gap left, until none is. */
export const RuleGapsContext = createContext<readonly RuleGap[]>([])
export const useRuleGaps = (): readonly RuleGap[] => useContext(RuleGapsContext)

/** The reason under one field, or null: `at` is the rule's id or 'fallback'. */
export function gapText(shown: readonly RuleGap[], at: string, field: GapField, part?: string): string | null {
  return shown.find((g) => g.at === at && g.field === field && (part === undefined || g.part === part))?.text ?? null
}
