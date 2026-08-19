import { classifyIp, isValidAsn } from './zone-validation'

/* Paste-many, parsed.

   Twenty CIDRs added one at a time is a chore, and the separator people
   actually paste with is a newline or a comma, not a click. One field takes
   both kinds of thing because an admin pasting a block of network identifiers
   does not sort them into addresses and ASNs first — asking them to is asking
   them to do the parsing this function can do itself.

   Its own module rather than a helper inside the screen: a component file that
   also exports a function breaks React Fast Refresh, and this needs to be
   importable by the tests. Getting 'AS15169' filed as an address, or a typo
   silently swallowed, are both invisible failures in the UI — the entry still
   renders, still saves, and simply never matches anything. */
export function parseEntries(
  text: string,
  existingIp: string[],
  existingAsn: string[],
): { ip: string[]; asn: string[]; bad: string[] } {
  const ip = [...existingIp]
  const asn = [...existingAsn]
  const bad: string[] = []

  for (const v of text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (isValidAsn(v)) {
      const up = v.toUpperCase()
      if (!asn.includes(up)) asn.push(up)
    } else if (classifyIp(v) !== 'invalid') {
      if (!ip.includes(v)) ip.push(v)
    } else {
      bad.push(v)
    }
  }
  return { ip, asn, bad }
}
