import { MonitorCheck } from 'lucide-react'
import { Fingerprint, Globe, type LucideIcon, Microchip } from 'lucide-react'

import {
  MODES,
  REACHES,
  attributesFor,
  countLabel,
  isRuleValue,
  isVersionText,
  type AttrCategory,
  type Attribute,
  type AttrConfigValue,
  type ProfileMode,
  type ProfileReach,
} from '../fingerprint'

/* -----------------------------------------------------------------------------
   Device profiles · the pieces that are not components.

   Moved out of DeviceFingerprintV2.tsx on 15 Sep 2026, when the create flow
   became three versions in three files (a full-page wizard, a name-first
   dialog, and the profile page they both end on). All three ask "which kind"
   and "what can it read" with the same tiles, and the wizard sets values with
   the page's own controls, so these are shared.

   A `.ts` rather than exports from the `.tsx`: oxlint's
   `only-export-components` warns on any non-component export from a component
   file (it keeps hot reload honest), and the lint baseline is held.
   -------------------------------------------------------------------------- */

/* The labels and blurbs live in `fingerprint.ts`, and only the marks are
   here — an icon is a rendering decision and a name is not.

   They were declared in the screen as `MODES`, with strings that did not match
   `modeLabel`'s: a profile was called "Attribute based" while being created and
   "Attribute match" everywhere afterwards, for the same profile, on the same
   day. Two lists is how that happens, so there is one.

   `MonitorCog` rather than `Sliders`: a screen with a setting on it, which is
   what an OS-and-version profile names. `Sliders` said "settings" generically
   and said nothing about an OS — and it is the mark this console uses for Edit
   buttons two rows further down the same page.

   `Fingerprint` rather than `Gauge`: this is the kind that actually
   fingerprints. `Gauge` was right for "Risk score" and reads as SPEED under the
   new name — and `Fingerprint` is already the mark the policy builder draws
   these options with, so the two surfaces stop disagreeing. */
export const MODE_ICON: Record<ProfileMode, LucideIcon> = {
  os: MonitorCheck,
  device: Fingerprint,
}

export const REACH_ICON: Record<ProfileReach, LucideIcon> = {
  agentless: Globe,
  agent: Microchip,
}

/** One answer on a `ChoiceTiles` group. See the component for the shape. */
export interface Choice<T extends string> {
  id: T
  label: string
  icon: LucideIcon
  summary: string
  tip: string
  tag?: string
  /** A quiet figure at the end of the name line, e.g. "13 checks". */
  meta?: string
}

export const kindChoices = (): Choice<ProfileMode>[] =>
  MODES.map((m) => ({
    id: m.id,
    label: m.label,
    icon: MODE_ICON[m.id],
    summary: m.summary,
    /* How much there is to choose from on the step this answer leads to. A
       figure, not part of the description — so it sits on the name line as
       metadata rather than trailing the sentence it has nothing to do with. */
    meta: countLabel(m.id, attributesFor(m.id).length),
    tip: m.blurb,
  }))

export const reachChoices = (): Choice<ProfileReach>[] =>
  REACHES.map((r) => ({
    id: r.id,
    label: r.label,
    icon: REACH_ICON[r.id],
    summary: r.summary,
    tip: r.note ? `${r.blurb} ${r.note}` : r.blurb,
    tag: r.tag,
  }))

/** The category filter's value: a category, every category (''), or "Selected only". */
export type CategoryValue = AttrCategory | '' | '@selected'

/* A typed version that is blank or not a version, said under its row. */
export function versionError(attr: Attribute, values: Record<string, AttrConfigValue>): string | null {
  const c = attr.config
  if (c?.kind !== 'version') return null
  const raw = values[attr.id]
  const v = isRuleValue(raw) ? raw : c.value
  return isVersionText(v.value) ? null : `Enter a version, like ${c.value.value}.`
}

/* A version check is named by its PLATFORM alone — "Android", "iOS", beside
   the release (owner, 16 Sep 2026). It read "Android, at least", and down a
   list of four version checks that was ", at least" four times over a column of
   values that already say which release. Only for `gte` — the one comparison
   every seeded profile uses — so a stored ≤ or ≠ keeps its attribute name and
   its operator, rather than being relabelled into a claim it does not make. */
export function checkName(attr: Attribute, values: Record<string, AttrConfigValue>): string {
  const c = attr.config
  if (c?.kind !== 'version') return attr.name
  const raw = values[attr.id]
  const op = isRuleValue(raw) ? raw.op : c.value.op
  return op === 'gte' ? c.platform : attr.name
}
