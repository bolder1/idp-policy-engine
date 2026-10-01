import {
  DEFAULT_MAX_DEVICES,
  ITEM_NOUN,
  REGISTRATION_LABEL,
  asksReach,
  attrOf,
  chosenAttributes,
  countLabel,
  invalidVersion,
  modeLabel,
  nameIssue,
  offeredAttributes,
  profileIssue,
  pruneValues,
  reachLabel,
  rosterNeedsMac,
  stepsFor,
  tierOf,
  valueLabel,
  withAlwaysOn,
  type AttrCategory,
  type AttrConfigValue,
  type Attribute,
  type FingerprintProfile,
  type ProfileMode,
  type ProfileReach,
  type Registration,
  type Roster,
} from '../fingerprint'
import { checkLine } from './profile-aside'

/* -----------------------------------------------------------------------------
   The full-page create wizard, as data.

   Versions 1 and 3 of "Create new profile" (owner, 15 Sep 2026) are one wizard
   with one difference: whether the checks are chosen and set on one step
   (`inline`), or chosen on one step and set on the next (`split`). Everything
   that decides which steps exist, what stops each one, what a finished answer
   looks like and what the review says is here, so both shapes answer it the
   same way and the tests can hold it without rendering a page.

   The state is permissive and the write is strict, as the drawer this replaced
   was: ticks survive a trip back to "Device restriction type" and a switch to
   agentless (the agent-only rows are hidden, not dropped), values survive
   unticking a row, and `draftOf` is what prunes both away. Nothing incoherent
   can be created, and nothing is silently deleted on the way past.
   -------------------------------------------------------------------------- */

/** Where the checks are set: on the row that chooses them, or on a step of their own. */
export type Step3Shape = 'inline' | 'split'

export type WizardStepId = 'profile' | 'devices' | 'items' | 'choose' | 'values' | 'review'

export interface WizardStep {
  id: WizardStepId
  label: string
}

/* Built on `stepsFor`, the model's own answer to "which steps does this kind
   take", so the Devices step is still the trusted device's alone and the last
   step is still named by the kind's own noun. The wizard only adds what a full
   page has room for: a values step when they are split out, and a review. */
export function wizardSteps(mode: ProfileMode, step3: Step3Shape): WizardStep[] {
  const base = stepsFor(mode)
  const steps: WizardStep[] = base
    .slice(0, -1)
    .map((label): WizardStep => ({ id: label === 'Devices' ? 'devices' : 'profile', label }))
  if (step3 === 'inline') {
    steps.push({ id: 'items', label: base[base.length - 1] })
  } else {
    steps.push({ id: 'choose', label: `Choose ${ITEM_NOUN[mode].many}` }, { id: 'values', label: 'Set values' })
  }
  steps.push({ id: 'review', label: 'Review' })
  return steps
}

export interface WizardState {
  name: string
  mode: ProfileMode
  /* Null, not `'agentless'`. A default here would let the question be skipped,
     and it is a step because it is an answer somebody gives. */
  reach: ProfileReach | null
  /** Ticked rows. Never filtered by reach while the wizard is open; see the header. */
  picked: string[]
  /** Values set on a row, kept when the row is unticked so ticking it again restores them. */
  config: Record<string, AttrConfigValue>
  weights: Record<string, number>
  registration: Registration
  autoRegister: boolean
  restrictMobile: boolean
  maxDevices: number | null
  roster: Roster | null
}

/* Device health first, as the drawer did: it is the kind with nothing to set
   up before its checks, and it keeps Next one field away. The name-first
   dialog starts on the same answer. */
export const initialWizard = (): WizardState => ({
  name: '',
  mode: 'os',
  reach: null,
  picked: [],
  config: {},
  weights: {},
  registration: 'self',
  autoRegister: false,
  restrictMobile: false,
  maxDevices: DEFAULT_MAX_DEVICES,
  roster: null,
})

/** Anything answered at all. Leaving after this asks first. */
export const wizardStarted = (s: WizardState): boolean => JSON.stringify(s) !== JSON.stringify(initialWizard())

/* The two kinds do not share a catalogue, so a ticked row cannot survive the
   switch, and neither can a value set against it. A health profile has no
   agent, so it has no roster either — and it is never asked the registration
   questions, so the two switches go back to off rather than being stored
   unseen. */
export function withMode(s: WizardState, mode: ProfileMode): WizardState {
  if (mode === s.mode) return s
  return {
    ...s,
    mode,
    picked: [],
    config: {},
    weights: {},
    reach: null,
    ...(mode === 'os'
      ? {
          registration: 'self' as const,
          roster: null,
          maxDevices: s.maxDevices ?? DEFAULT_MAX_DEVICES,
          autoRegister: false,
          restrictMobile: false,
        }
      : {}),
  }
}

/* A roster is matched on MAC, which only an agent reads, so going agentless
   takes the roster option away and the answer already given with it. */
export function withWizardReach(s: WizardState, reach: ProfileReach): WizardState {
  if (reach === s.reach) return s
  return reach === 'agentless'
    ? { ...s, reach, registration: 'self', roster: null, maxDevices: s.maxDevices ?? DEFAULT_MAX_DEVICES }
    : { ...s, reach }
}

/* Picking the value a check already has writes nothing: the profile page's
   rule, so a value picked again does not count as work to lose. */
export function withConfig(s: WizardState, id: string, v: AttrConfigValue): WizardState {
  const c = attrOf(s.mode, id)?.config
  const current = s.config[id] ?? (c && 'value' in c ? c.value : undefined)
  return JSON.stringify(current) === JSON.stringify(v) ? s : { ...s, config: { ...s.config, [id]: v } }
}

/* Weights are chosen as tiers, so the tier a signal is already in leaves its
   number alone. */
export function withWeight(s: WizardState, id: string, w: number): WizardState {
  const current = s.weights[id] ?? attrOf(s.mode, id)?.weight
  return current !== undefined && tierOf(current) === tierOf(w) ? s : { ...s, weights: { ...s.weights, [id]: w } }
}

/* The profile the answers make, and the only thing `onCreate` is ever given.

   Only what is offered at this reach is enabled, plus the always-on signals
   nobody ticks because nobody can untick them. Values for anything not enabled
   are pruned. `restrictionSet` is true where the Devices step asked the
   enrolment questions, and false on a health profile, which was never asked.
   The id is the caller's to give. */
export function draftOf(s: WizardState): FingerprintProfile {
  const offered = offeredAttributes(s.mode, s.reach)
  const picked = s.picked.filter((id) => offered.some((a) => a.id === id))
  return pruneValues({
    id: '',
    name: s.name.trim(),
    mode: s.mode,
    enabled: withAlwaysOn(s.mode, picked),
    config: s.config,
    weights: s.weights,
    reach: s.reach ?? 'agentless',
    registration: s.registration,
    maxDevices: s.maxDevices,
    roster: s.registration === 'pre-approved' ? s.roster : null,
    autoRegister: s.autoRegister,
    restrictMobile: s.restrictMobile,
    restrictionSet: asksReach(s.mode),
    usedIn: 0,
  })
}

/* What stops a step, in the words `profileIssue` uses, so a step and the
   final Create never disagree about the same problem. Each step owns only its
   own questions; Review owns all of them. */
export function stepIssue(step: WizardStepId, s: WizardState, names: Iterable<string>): string | null {
  const d = draftOf(s)
  const empty = s.mode === 'os' ? 'Add at least one check.' : 'Add at least one signal.'
  const mac = rosterNeedsMac(d) ? 'Add MAC address to match the roster.' : null
  const version = () => {
    const bad = invalidVersion(d)
    return bad?.config?.kind === 'version' ? `Enter a version for ${bad.config.platform}.` : null
  }
  switch (step) {
    case 'profile':
      return nameIssue(s.name, names)
    case 'devices':
      if (s.reach === null) return 'Choose what the collector can read.'
      return s.registration === 'pre-approved' && !s.roster ? 'Upload a device roster.' : null
    case 'choose':
      return chosenAttributes(d).length === 0 ? empty : mac
    case 'items':
    case 'values':
      return chosenAttributes(d).length === 0 ? empty : (version() ?? mac)
    case 'review':
      return profileIssue(d, names)
  }
}

/* Moving from step `from` to step `to`. A roster is matched on MAC address,
   so a pre-approved profile that moves past Devices arrives at its signals with
   MAC already ticked — by Next, or by a step it jumps to. */
export function arrive(s: WizardState, steps: WizardStep[], from: number, to: number): WizardState {
  const devices = steps.findIndex((x) => x.id === 'devices')
  const crosses = devices >= 0 && from <= devices && to > devices
  if (!crosses || s.registration !== 'pre-approved' || s.picked.includes('mac')) return s
  return { ...s, picked: [...s.picked, 'mac'] }
}

/* Which steps the stepper lets you open. Any step already done, and any step
   visited before whose way there is still clear — so Edit on the review and a
   press on "Review" in the stepper is a round trip, not four presses of Next. */
export function canOpenStep(
  steps: WizardStep[],
  at: number,
  reached: number,
  target: number,
  issueOf: (id: WizardStepId) => string | null,
): boolean {
  if (target === at || target < 0 || target >= steps.length) return false
  if (target < at) return true
  if (target > reached) return false
  return steps.slice(at, target).every((x) => issueOf(x.id) === null)
}

/* Which steps wear a tick. One behind you, or one ahead that you have been
   past before — and in both cases only while nothing on it is wrong, so going
   back and clearing the name takes the tick off Profile rather than leaving a
   ladder that says a step is finished when Next would refuse it. The step you
   are on is never ticked, and neither is the furthest one reached: arriving
   somewhere is not the same as finishing it. */
export function stepDone(
  steps: WizardStep[],
  at: number,
  reached: number,
  index: number,
  issueOf: (id: WizardStepId) => string | null,
): boolean {
  if (index === at || index < 0 || index >= steps.length) return false
  if (index > at && index >= reached) return false
  return issueOf(steps[index].id) === null
}

/* --- The inline list --------------------------------------------------------- */

/* The narrowing both check lists do — the catalogue drawer and this one: a
   search over name, purpose and category, and a category filter beside it.

   The category dropdown went on 16 Sep 2026 and came back on 18 Sep, for the
   list it was needed on: a trusted device offers 38 signals across five
   families, and "show me the network ones" is not a search anybody can spell.
   Empty `cats` is every category, so the filter starts saying nothing.

   Always-on first, because a locked row between two tickable ones reads as one
   you failed to untick. */
export function filterAttributes(list: Attribute[], q: string, cats: AttrCategory[] = []): Attribute[] {
  const needle = q.trim().toLowerCase()
  const shown = list.filter(
    (a) =>
      (cats.length === 0 || (a.category !== undefined && cats.includes(a.category))) &&
      (!needle ||
        a.name.toLowerCase().includes(needle) ||
        a.purpose.toLowerCase().includes(needle) ||
        (a.category ?? '').toLowerCase().includes(needle)),
  )
  return [...shown.filter((a) => a.always), ...shown.filter((a) => !a.always)]
}

/* How many rows a list needs before its category filter is worth drawing.

   A trusted device offers 38 signals across five families and "show me the
   network ones" is not a search anybody can spell; device health offers 13,
   whose names carry their family ("Chrome version", "Windows OS version"), and
   a filter over thirteen rows is a control to read past (owner, 18 Sep 2026:
   "for Device Health we might not need categories, but for this case we do").*/
export const CATEGORY_FILTER_MIN = 16

/* The categories a catalogue actually holds, in the order the catalogue names
   them — never the whole enum, which would offer families this list has none
   of. */
export function categoriesOf(list: Attribute[]): AttrCategory[] {
  const seen: AttrCategory[] = []
  for (const a of list) if (a.category && !seen.includes(a.category)) seen.push(a.category)
  return seen
}

/* How much of what is on screen is ticked, for the bar's Select all. Only the
   rows somebody can choose count: `empty` when there are none, so the control
   has nothing to do. */
export type ShownSelection = 'empty' | 'none' | 'some' | 'all'

export function shownSelection(picked: string[], shown: Attribute[]): ShownSelection {
  const free = shown.filter((a) => !a.always)
  if (free.length === 0) return 'empty'
  const on = free.filter((a) => picked.includes(a.id)).length
  return on === 0 ? 'none' : on === free.length ? 'all' : 'some'
}

/* Select all and Clear all, as one press over the rows on screen: all of them
   ticked clears them, anything less ticks them all. Rows a search hides keep
   their state, and always-on rows are never written. */
export function toggleAllShown(picked: string[], shown: Attribute[]): string[] {
  const free = shown.filter((a) => !a.always).map((a) => a.id)
  if (shownSelection(picked, shown) === 'all') return picked.filter((id) => !free.includes(id))
  return [...new Set([...picked, ...free])]
}

/* One press, or a shift-press over a run. The run takes the state the pressed
   row is moving to, so dragging a selection back over itself clears it, and the
   always-on rows are left out of the run rather than stopping it. */
export function toggleRun(
  picked: string[],
  shown: Attribute[],
  anchor: string | null,
  id: string,
  span: boolean,
): string[] {
  const want = !picked.includes(id)
  const from = span && anchor ? shown.findIndex((a) => a.id === anchor) : -1
  const to = shown.findIndex((a) => a.id === id)
  if (from < 0 || to < 0 || from === to) return want ? [...picked, id] : picked.filter((x) => x !== id)
  const run = shown
    .slice(Math.min(from, to), Math.max(from, to) + 1)
    .filter((a) => !a.always)
    .map((a) => a.id)
  return want ? [...new Set([...picked, ...run])] : picked.filter((x) => !run.includes(x))
}

/** "MAC address, TPM and 3 more need an agent." Named, because the names say whether you wanted them. */
export function agentNote(list: Attribute[]): string {
  const names = list.slice(0, 3).map((a) => a.name).join(', ')
  const more = list.length > 3 ? ` and ${list.length - 3} more` : ''
  return `${names}${more} ${list.length === 1 ? 'needs' : 'need'} an agent.`
}

/* --- The review ----------------------------------------------------------------- */

export interface ReviewFact {
  label: string
  value: string
  /** The attribute behind a check row, for its mark. */
  attr?: Attribute
  /** Draw the value as a pill. Set on the facts whose value is one of a known
      few — a type, a reach, on/off, a weight. NOT on a name or a file, where a
      pill would put a box round a proper noun and cap it at the pill's measure. */
  pill?: true
}

export interface ReviewSection {
  /** The step its Edit opens. */
  step: WizardStepId
  title: string
  /** The section in a few words — the type, the reach, the count. The wizard's
      Review no longer shows it (its rows say the same); the unwired live
      builder reads it. */
  summary: string
  facts: ReviewFact[]
}

/* What a health check is set to, as words a reader does not have to decode:
   "Windows 10 or later" rather than "≥ 10". */
export function checkValue(a: Attribute, v: AttrConfigValue | undefined): string {
  const c = a.config
  if (!c) return 'On'
  if (c.kind === 'version') return checkLine(a, v).replace(/\.$/, '')
  if (c.kind === 'choice') return typeof v === 'string' ? v : c.value
  return valueLabel(a, v)
}

/* Everything the profile will be, in the order the steps asked it. Read off
   `draftOf`, so an unticked row's kept value is not reported as part of it. */
export function reviewSections(s: WizardState, step3: Step3Shape): ReviewSection[] {
  const d = draftOf(s)
  const sections: ReviewSection[] = [
    {
      step: 'profile',
      title: 'Profile',
      summary: modeLabel(d),
      facts: [
        { label: 'Name', value: d.name },
        { label: 'Type', value: modeLabel(d), pill: true },
      ],
    },
  ]
  if (asksReach(d.mode)) {
    sections.push({
      step: 'devices',
      title: 'Devices',
      summary: reachLabel(d.reach),
      facts: [
        { label: 'Device restriction type', value: reachLabel(d.reach), pill: true },
        /* Asked only with the agent — agentless has one method, so the step
           never showed the question and Review does not report an answer to it. */
        ...(d.reach === 'agent'
          ? [{ label: 'Device registration method', value: REGISTRATION_LABEL[d.registration], pill: true as const }]
          : []),
        d.registration === 'pre-approved'
          ? {
              label: 'Approved device roster',
              value: d.roster
                ? `${d.roster.fileName}, ${d.roster.rows} ${d.roster.rows === 1 ? 'device' : 'devices'}`
                : 'None',
            }
          : { label: 'Allowed device registrations', value: String(d.maxDevices ?? DEFAULT_MAX_DEVICES), pill: true },
        { label: 'Mobile device restriction', value: d.restrictMobile ? 'On' : 'Off', pill: true },
        { label: 'Device auto-registration', value: d.autoRegister ? 'On' : 'Off', pill: true },
      ],
    })
  }
  const noun = ITEM_NOUN[d.mode].many
  const chosen = chosenAttributes(d)
  sections.push({
    step: step3 === 'inline' ? 'items' : 'values',
    title: noun.charAt(0).toUpperCase() + noun.slice(1),
    summary: countLabel(d.mode, chosen.length),
    facts: chosen.map((a) => ({
      label: a.name,
      /* The tier alone: "Signals" heads the list, so "priority" on every row
         was noise (owner, 21 Sep 2026). */
      value: d.mode === 'device' ? tierOf(d.weights[a.id] ?? a.weight) : checkValue(a, d.config[a.id]),
      attr: a,
      pill: true as const,
    })),
  })
  return sections
}

/* --- The live builder ------------------------------------------------------------

   The same sections Review shows, drawn beside every step while the profile is
   being answered (`device-profile-live.tsx`). Two things Review never needed:
   which steps a section belongs to, so it can say done / here / not yet, and a
   placeholder for a section nothing has been answered on — a default shown as
   if it were chosen would be a preview that lies. */

export type LiveStatus = 'done' | 'current' | 'upcoming'

export interface LiveSection extends ReviewSection {
  /** The steps it covers. The checks section spans Choose and Set values on the split shape. */
  steps: WizardStepId[]
  /** Said in place of the facts while nothing on the section is answered. */
  pending: string | null
}

export function liveSections(s: WizardState, step3: Step3Shape): LiveSection[] {
  return reviewSections(s, step3).map((sec) => {
    const steps: WizardStepId[] = sec.step === 'values' ? ['choose', 'values'] : [sec.step]
    let pending: string | null = null
    if (sec.step === 'devices' && s.reach === null) pending = 'Not chosen yet'
    if (steps.includes('items') || steps.includes('values')) {
      if (sec.facts.length === 0) pending = `No ${ITEM_NOUN[s.mode].many} yet`
    }
    return { ...sec, steps, pending }
  })
}

/* Here while any of its steps is the one open; done once every one of them is
   ticked on the ladder (`stepDone`, so the preview and the ladder agree);
   otherwise not yet. */
export function sectionStatus(
  sec: LiveSection,
  steps: WizardStep[],
  at: number,
  reached: number,
  issueOf: (id: WizardStepId) => string | null,
): LiveStatus {
  const idx = sec.steps.map((id) => steps.findIndex((x) => x.id === id)).filter((i) => i >= 0)
  if (idx.includes(at)) return 'current'
  if (idx.length > 0 && idx.every((i) => stepDone(steps, at, reached, i, issueOf))) return 'done'
  return 'upcoming'
}
