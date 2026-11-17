import { MonitorCheck } from 'lucide-react'
import { AGENT_REACH } from './device-profile-phase'
import { Fingerprint, Globe, type LucideIcon, Microchip, Smartphone } from 'lucide-react'

import {
  MODES,
  REACHES,
  isRuleValue,
  isVersionText,
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
  authenticator: Smartphone,
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
    tip: m.blurb,
  }))

export const reachChoices = (v1 = false): Choice<ProfileReach>[] =>
  REACHES.filter((r) => (v1 || r.id !== 'authenticator') && (AGENT_REACH || r.id !== 'agent')).map((r) => ({
    id: r.id,
    label: r.label,
    icon: REACH_ICON[r.id],
    summary: r.summary,
    tip: r.note ? `${r.blurb} ${r.note}` : r.blurb,
    tag: r.tag,
  }))

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

/* What the two columns of a profile's list are, said once over it (owner, 22 Sep
   2026: "add a heading — attributes on the left, priorities on the right … in all
   the places, adding or viewing, both trusted devices and device health"). A
   trusted device weighs attributes; a health profile sets a requirement for each
   one. Hidden from assistive tech: every control already names its row. */
export const LIST_COLUMNS: Record<'os' | 'device', { left: string; right: string }> = {
  device: { left: 'Attribute', right: 'Priority' },
  /* "Attribute" on both, as signals have it (owner, 22 Sep 2026: "Check looks
     weird — call it something else, like signals"). */
  os: { left: 'Attribute', right: 'Requirement' },
}

/* --- Device health, filed by the device it runs on (V1) ------------------------------------------
   The rail on the Checks step names device types, not families (owner, 10 Nov 2026): Windows, macOS, Linux, iOS,
   Android, and "Any device" for what no device type owns. A check can sit under several — Chrome runs on four of
   them — so this is a map, not a field on the attribute, and the families (Platform, Browser, Security, Client) stay
   as the rows' own marks and the search. */
export type DeviceGroup = 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'any'

export const DEVICE_GROUPS: { id: DeviceGroup; label: string }[] = [
  { id: 'windows', label: 'Windows' },
  { id: 'macos', label: 'macOS' },
  { id: 'linux', label: 'Linux' },
  { id: 'ios', label: 'iOS' },
  { id: 'android', label: 'Android' },
  { id: 'any', label: 'Any device' },
]

const GROUPS_OF: Record<string, DeviceGroup[]> = {
  'device-type': ['any'],
  'os-windows': ['windows'],
  'os-macos': ['macos'],
  'os-ios': ['ios'],
  'os-android': ['android'],
  'browser-chrome': ['windows', 'macos', 'linux', 'android'],
  'browser-edge': ['windows', 'macos'],
  'browser-firefox': ['windows', 'macos', 'linux', 'android'],
  'browser-safari': ['macos', 'ios'],
  integrity: ['ios', 'android'],
  'screen-lock': ['windows', 'macos', 'linux', 'ios', 'android'],
  'disk-encryption': ['windows', 'macos', 'linux', 'android'],
  firewall: ['windows', 'macos', 'linux'],
  'security-software': ['windows', 'macos', 'linux'],
  'secure-boot': ['windows'],
  'security-patch': ['android'],
  'mo-authenticator': ['ios', 'android'],
  'mo-agent': ['windows', 'macos', 'linux'],
}

/** Is this check one of the device type's? An id the map does not know sits under Any device. */
export const inDeviceGroup = (id: string, group: DeviceGroup): boolean => (GROUPS_OF[id] ?? ['any']).includes(group)

/** The device types that have at least one of these checks. */
export const deviceGroupsOf = (ids: string[]): DeviceGroup[] =>
  DEVICE_GROUPS.map((g) => g.id).filter((g) => ids.some((id) => inDeviceGroup(id, g)))
