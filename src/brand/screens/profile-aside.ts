import {
  chosenAttributes,
  isRuleValue,
  platformsNamed,
  tierOf,
  valueLabel,
  type Attribute,
  type AttrConfigValue,
  type FingerprintProfile,
} from '../fingerprint'

/* -----------------------------------------------------------------------------
   The device profile page's side column, as data.

   One question: what does this profile do as it stands. Read off the DRAFT, so
   the column follows every edit before it is saved. (A second panel, what else
   could go in, was removed on 15 Sep 2026; the list's Edit link opens that
   catalogue.)

   Pure, so the sentences can be tested without rendering the page.
   -------------------------------------------------------------------------- */

/** What the profile holds, in the order the page's list draws it: always-on first. */
export const chosenChecks = (p: FingerprintProfile): Attribute[] => chosenAttributes(p)

/* "Laptops only." A device type is one of three words, and a plural reads as the
   restriction it is. */
const FORM_FACTOR: Record<string, string> = {
  Mobile: 'Mobile devices',
  Tablet: 'Tablets',
  Laptop: 'Laptops',
}

/* A capital that starts a word, not an acronym: "PIN" keeps its case. */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)

/** One check as a short line. Exported for the test. */
export function checkLine(a: Attribute, v: AttrConfigValue | undefined): string {
  const c = a.config
  if (!c) return `${a.name}.`

  if (c.kind === 'version') {
    const r = isRuleValue(v) ? v : c.value
    const value = r.value.trim()
    if (!value) return `${a.name} is not set.`
    const named = c.versions?.find((x) => x.value === value)?.label ?? `${c.platform} ${value}`
    switch (r.op) {
      case 'gte':
        return `${named} or later.`
      case 'gt':
        return `Later than ${named}.`
      case 'lte':
        return `${named} or earlier.`
      case 'lt':
        return `Earlier than ${named}.`
      case 'eq':
        return `Exactly ${named}.`
      case 'ne':
        return `Not ${named}.`
      default:
        return `${a.name} ${valueLabel(a, r)}.`
    }
  }

  if (c.kind === 'choice') {
    const value = typeof v === 'string' ? v : c.value
    if (a.id === 'device-type') return `${FORM_FACTOR[value] ?? value} only.`
    /* "A screen lock is set" already names its check; "Not rooted or
       jailbroken" does not. */
    if (value.toLowerCase().includes(a.name.toLowerCase())) return `${value}.`
    return `${a.name}: ${lowerFirst(value)}.`
  }

  return `${a.name}: ${valueLabel(a, v)}.`
}

/* Up to three names, then how many more. A side panel restating a twenty-row
   list is the list again. Commas only: several names already hold an "and"
   ("Browser and version"), so a joining "and" would split one of them. */
function names(list: Attribute[]): string {
  const shown = list.slice(0, 3).map((a) => a.name).join(', ')
  const rest = list.length - 3
  return rest > 0 ? `${shown} and ${rest} more` : shown
}

/* No counts: the list's own heading already says how many.

   No warning either. "No platform is named" was a notice box while a health
   profile could only check a form factor and an OS, when naming no OS meant
   every device passed. Integrity, screen lock and browser floors check
   something without one, so it is a plain line now, said beside the rest.

   Nothing at all for an empty profile: the list's empty state already says so,
   and the side column hides this panel rather than saying it a second time. */
export function summarise(p: FingerprintProfile): string[] {
  const chosen = chosenChecks(p)
  if (chosen.length === 0) return []

  if (p.mode === 'os') {
    const lines = chosen.map((a) => checkLine(a, p.config[a.id]))
    lines.push(platformsNamed(p).length > 0 ? 'Other platforms are not checked.' : 'Any OS version passes.')
    if (chosen.some((a) => a.category === 'Browser' && a.config?.kind === 'version')) {
      lines.push('Other browsers are not checked.')
    }
    return lines
  }

  const tier = (a: Attribute) => tierOf(p.weights[a.id] ?? a.weight)
  const high = chosen.filter((a) => tier(a) === 'High')
  const low = chosen.filter((a) => tier(a) === 'Low')
  const soon = chosen.filter((a) => a.phase === 2)
  const lines = [high.length > 0 ? `High weight: ${names(high)}.` : 'No signal has a high weight.']
  if (low.length > 0) lines.push(`Low weight: ${names(low)}.`)
  if (soon.length > 0) lines.push(`Not collected yet: ${names(soon)}.`)
  lines.push('Each changed signal adds its weight to the score.')
  return lines
}
