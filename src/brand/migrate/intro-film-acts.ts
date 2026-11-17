/* The film's words and pace, shared by the film (IntroFilm.tsx) and its chapters (IntroChapters.tsx). */
export const END = 88

/* The words: one line at a time, grouped by act; the act's earlier lines stay, dimmed. */
export const ACTS: { title: string; at: number; lines: [number, string][] }[] = [
  { title: 'Today', at: 0, lines: [[0.6, 'Every application gets its own policies.'], [5, 'One for who signs in, and how.'], [8, 'Another for where, when, and on what device.'], [12, 'Then do it again for the next application.'], [16, 'And the next.']] },
  { title: 'The cost', at: 18, lines: [[18.3, 'The same checks, copied everywhere.'], [22.3, 'Change one IP range…'], [25, '…and you change it in four places.']] },
  { title: 'Taken apart', at: 28, lines: [[28.3, 'The new Policy builder starts by pulling the checks out.'], [33, 'Places and networks become one zone.'], [36.5, 'Device limits become one device profile.'], [39.5, 'Made once. Kept in your library.']] },
  { title: 'The builder', at: 42, lines: [[42.3, 'This is the Policy builder.'], [46, 'A rule says who…'], [50, '…if what is true…'], [54, '…then how they sign in.'], [57, 'One rule holds what used to take two pages.']] },
  { title: 'Many rules', at: 60, lines: [[60.3, 'Add another rule. And another.'], [65, 'One policy can cover many applications.'], [69, 'Eight policies become one.']] },
  { title: 'Check access', at: 72, lines: [[72.3, 'Know the answer before it goes live.'], [75.5, 'Priya gets in.'], [79.5, 'Arun doesn’t.']] },
  { title: 'Your move', at: 82, lines: [[82.3, 'Your old policies move over as drafts.'], [84.5, 'Approve them, then publish.']] },
]

/* The 2D film says the estate as it is (owner, 6 Nov 2026): many old policies per application, 146 in all. */
const LINES_2D: Record<number, string> = {
  5: 'App Login policies for who signs in, and how.',
  8: 'Adaptive Access policies for where, when, and on what device.',
  12: 'Then more for the next application.',
  16: 'Until there are 146 of them.',
  25: '…and only that copy changes.',
  69: 'Five Salesforce policies become one.',
}
/* Lines only the 2D film has: the copies, edited by hand (owner, 6 Nov 2026). */
const EXTRA_2D: Record<string, [number, string][]> = { 'The cost': [[26, 'Every other copy, you find and edit by hand. One at a time.']] }
/* Three chapters for what was one (owner, 10 Nov 2026): Taken apart, then New zones, then New device profiles. The builder
   and Many rules are one chapter, run quicker; Check access shows a list of people with their outcomes. */
const TAKEN_2D: [number, string][] = [[28.3, 'The new Policy builder starts by pulling the checks out.']]
const ZONES_2D: [number, string][] = [
  [30, 'Places and networks become one zone.'],
  [31.8, 'A zone holds IP networks, ASNs, countries and cities.'],
  [33.2, 'Made once, used in any rule.'],
]
const DEVICES_2D: [number, string][] = [
  [34.7, 'Device limits become one device profile.'],
  [36.2, 'A profile holds how a device is recognised, and how many.'],
  [39.6, 'Made once. Kept in your library.'],
]
const ACCESS_2D: [number, string][] = [
  [72.3, 'Know the answer before it goes live.'],
  [73.4, 'Some people pass on rule 1.'],
  [76, 'Others on rule 2.'],
  [78.4, 'The rest fall to the default: Deny.'],
]
const ACTS_2D_ALL = ACTS.map((a) => ({ ...a, lines: [...a.lines.map(([at, line]) => [at, LINES_2D[at] ?? line] as [number, string]), ...(EXTRA_2D[a.title] ?? [])] }))
const BUILDER_ALL = ACTS_2D_ALL.filter((a) => a.title === 'The builder' || a.title === 'Many rules').flatMap((a) => a.lines)
/* v0 is the film as it was before 10 Nov 2026; v1 is the updated one (owner: "v0 keeps the old version and v1 holds the updated"). */
export type FilmVersion = 'v0' | 'v1'
const TAKEN_2D_V0: [number, string][] = [
  [28.3, 'The new Policy builder starts by pulling the checks out.'],
  [30, 'Places and networks become one zone.'],
  [31.8, 'A zone can hold IP networks, ASNs, countries and cities.'],
  [34.7, 'Device limits become one device profile.'],
  [36.2, 'A device profile sets how a device is recognised, and how many.'],
  [39.6, 'Made once. Kept in your library.'],
]
export const ACTS_2D_V0: typeof ACTS = ACTS_2D_ALL.map((a) => (a.title === 'Taken apart' ? { ...a, lines: TAKEN_2D_V0 } : a))
export const ACTS_2D: typeof ACTS = [
  ...ACTS_2D_ALL.filter((a) => ['Today', 'The cost'].includes(a.title)),
  { title: 'Taken apart', at: 28, lines: TAKEN_2D },
  { title: 'New zones', at: 30, lines: ZONES_2D },
  { title: 'New device profiles', at: 34.5, lines: DEVICES_2D },
  { title: 'The builder', at: 42, lines: BUILDER_ALL },
  { title: 'Check access', at: 72, lines: ACCESS_2D },
  ...ACTS_2D_ALL.filter((a) => a.title === 'Your move'),
]

export const actsFor = (v: FilmVersion) => (v === 'v0' ? ACTS_2D_V0 : ACTS_2D)
export const speed2D = (t: number, v: FilmVersion = 'v1') => (t < 2.5 ? 1.4 : t < 5 ? 3 : t < 12.4 ? 2 : t < 17.8 ? 2.5 : t >= 28 && t < 42 ? 0.47 : v === 'v1' && t >= 42 && t < 72 ? 1.6 : 1)
