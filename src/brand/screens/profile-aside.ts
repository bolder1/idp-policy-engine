import { isRuleValue, valueLabel, type Attribute, type AttrConfigValue } from '../fingerprint'

/* -----------------------------------------------------------------------------
   One check, as a short line — "Windows 11 · 23H2 or later.", "Laptops only."

   This was the device profile page's whole side column: `summarise` turned the
   draft into a line per check and the panel drew them. The panels are fixed
   copy now (`profile-notes.ts`, owner 18 Sep 2026), so `summarise`, `names`
   and `chosenChecks` went with them and this is what survives — the wizard's
   review reads a check's value through it.

   Pure, so the sentences can be tested without rendering the page.
   -------------------------------------------------------------------------- */

/* "Laptops only." A device type is one of three words, and a plural reads as the
   restriction it is. */
const FORM_FACTOR: Record<string, string> = {
  Mobile: 'Mobile devices',
  Tablet: 'Tablets',
  Laptop: 'Laptops',
}

/* A capital that starts a word, not an acronym: "PIN" keeps its case. */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)

/** One check as a short line. */
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
