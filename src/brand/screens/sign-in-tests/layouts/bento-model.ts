import type { EngineRun } from '../engine-run'

/* -----------------------------------------------------------------------------
   Bento's model (BentoLayout.tsx), pure: the run as a board of tiles, each
   one idea, sized by importance —

     ┌──────── hero ────────┬── who ──┬─ policy ─┐
     │ Allow on 1 factor     ├─ checks ┤          │
     ├──────── rule ────────┼── see ──┼ conflict ┤
     │ 1 ✕ · 2 ✓ who/if/then │         ├ change  ┤

   — which tiles this run has, what each is at step `s` (waiting, the one the
   engine works on, settled), and the grid that packs the ones present, or
   one of them expanded with the rest around it. Everything from the plan.
   -------------------------------------------------------------------------- */

export type TileId = 'hero' | 'who' | 'policy' | 'rule' | 'checks' | 'see' | 'conflict' | 'change'
export type TilePhase = 'waiting' | 'working' | 'settled'
export type Tone = 'positive' | 'negative' | 'notice' | 'neutral'

/** The engine's order: what arrows and the dock's stepper walk. */
export const TILE_ORDER: readonly TileId[] = ['who', 'policy', 'rule', 'checks', 'hero', 'see', 'conflict', 'change']

export const TILE_LABEL: Record<TileId, string> = {
  hero: 'Outcome',
  who: 'Who',
  policy: 'Policy',
  rule: 'Rule',
  checks: 'Checks',
  see: 'What they see',
  conflict: 'Conflict',
  change: 'What would change it',
}

/** An allow is green whatever its factors (an extra factor is no warning); a deny red; can't tell amber. */
export function toneOf(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
}

/** One row of the checks tile: a rule's check, by index. */
export interface CheckRef {
  rule: number
  check: number
}

/* The checks that decided it: every check of the rule that matched; in a
   run that could not be told, the first unknown rule's; where nothing
   matched, each visited rule's failing check, one a rule. */
export function checkRefs(plan: Pick<EngineRun, 'rules' | 'landing'>): { refs: CheckRef[]; kind: 'match' | 'unknown' | 'misses' | 'none' } {
  if (plan.landing === null) return { refs: [], kind: 'none' }
  const land = plan.rules[plan.landing]
  if (!land) return { refs: [], kind: 'none' }
  const unk = plan.rules.findIndex((r) => r.index !== null && r.state === 'unknown')
  if (unk >= 0) {
    const r = plan.rules[unk]
    return { refs: r.checks.slice(0, Math.max(1, r.checked)).map((_, k) => ({ rule: unk, check: k })), kind: 'unknown' }
  }
  if (land.index !== null && land.state === 'match') return { refs: land.checks.map((_, k) => ({ rule: plan.landing!, check: k })), kind: 'match' }
  const refs: CheckRef[] = []
  plan.rules.forEach((r, i) => {
    if (r.index !== null && r.visited && r.failing !== null && r.checks[r.failing]) refs.push({ rule: i, check: r.failing })
  })
  return { refs, kind: refs.length ? 'misses' : 'none' }
}

/* The checks the tile draws: where a rule matched, its who check is the who
   tile's ("via Engineering") and is not said twice — unless it is the only one. */
export function shownChecks(plan: Pick<EngineRun, 'rules'>, refs: readonly CheckRef[], kind: ReturnType<typeof checkRefs>['kind']): CheckRef[] {
  if (kind !== 'match') return [...refs]
  const rest = refs.filter((c) => plan.rules[c.rule]?.checks[c.check]?.category !== 'who')
  return rest.length ? rest : [...refs]
}

const last = (plan: Pick<EngineRun, 'steps'>) => Math.max(0, plan.steps.length - 1)
export const atOutcome = (plan: Pick<EngineRun, 'steps' | 'at'>) => (plan.at.outcome >= 0 ? plan.at.outcome : last(plan))
export const isLanded = (plan: Pick<EngineRun, 'steps' | 'at'>, s: number) => s >= last(plan) || s >= atOutcome(plan)

/** The first conflict finding: what the conflict tile is about. */
export const conflictOf = (plan: Pick<EngineRun, 'conflicts'>) => plan.conflicts?.findings.find((f) => f.tone === 'conflict') ?? null

/** The tile the engine works on at `s`: blue there, and only there. */
export function workingTile(plan: EngineRun, s: number, checks: readonly CheckRef[], hasConflict: boolean): TileId | null {
  const step = plan.steps[s]
  if (!step || s >= last(plan)) return null
  switch (step.kind) {
    case 'find':
    case 'scan':
    case 'found':
    case 'decides':
      return 'policy'
    case 'expand':
    case 'rule':
    case 'rule-end':
    case 'compact':
      return 'rule'
    case 'check':
    case 'checked': {
      if (checks.some((c) => c.rule === step.rule && c.check === step.check)) return 'checks'
      /* The deciding rule's who check, said by the who tile. */
      const r = step.rule != null ? plan.rules[step.rule] : undefined
      const c = r && step.check != null ? r.checks[step.check] : undefined
      return plan.landing === step.rule && r?.state === 'match' && c?.category === 'who' ? 'who' : 'rule'
    }
    case 'deciding':
      return step.notice && hasConflict ? 'conflict' : 'hero'
    default:
      return null
  }
}

/** The step a tile's content starts to arrive at. */
export function tileAt(plan: EngineRun, id: TileId, checks: readonly CheckRef[]): number {
  const out = atOutcome(plan)
  const decider = plan.policies.find((p) => p.decides)
  switch (id) {
    case 'who':
      return 0
    case 'policy':
      return Math.max(0, plan.at.which)
    case 'rule':
      return decider?.expandAt ?? out
    case 'checks': {
      const first = checks[0]
      const r = first ? plan.rules[first.rule] : undefined
      return Math.min(out, r?.checkAt[first!.check] ?? out)
    }
    case 'conflict': {
      const notice = plan.steps.findIndex((st) => st.kind === 'deciding' && st.notice)
      return notice >= 0 ? notice : out
    }
    default:
      return out
  }
}

export function tilePhase(plan: EngineRun, id: TileId, s: number, working: TileId | null, checks: readonly CheckRef[]): TilePhase {
  if (working === id) return 'working'
  if (isLanded(plan, s)) return 'settled'
  return s >= tileAt(plan, id, checks) ? 'settled' : 'waiting'
}

// --- The grid ------------------------------------------------------------------------------

/* The board is four columns by four rows. The hero and the rule take two by
   two; the policy and what they see take a column of two; who, the checks,
   the conflict and the change one cell each. A tile the run does not have is
   not drawn: its neighbour takes its cells. */
export function boardAreas(present: ReadonlySet<TileId>): string[][] {
  const has = (t: TileId) => present.has(t)
  const g: string[][] = [
    ['hero', 'hero', 'who', 'policy'],
    ['hero', 'hero', 'checks', 'policy'],
    ['rule', 'rule', 'see', 'conflict'],
    ['rule', 'rule', 'see', 'change'],
  ]
  if (!has('checks')) g[1][2] = 'who'
  /* A short canvas says who in the hero: the checks take the column's height. */
  if (!has('who')) g[0][2] = g[1][2] = has('checks') ? 'checks' : has('policy') ? 'policy' : 'hero'
  if (!has('policy')) {
    g[0][3] = g[0][2]
    g[1][3] = g[1][2]
  }
  const ends = (['conflict', 'change'] as const).filter(has)
  if (ends.length === 1) g[2][3] = g[3][3] = ends[0]
  if (ends.length === 0) g[2][3] = g[3][3] = has('see') ? 'see' : 'rule'
  if (!has('see')) {
    const by = ends.length ? g[2][3] : 'rule'
    g[2][2] = g[3][2] = by
  }
  if (!has('rule')) {
    const by = has('see') ? 'see' : 'hero'
    for (const r of [2, 3]) for (const c of [0, 1]) g[r][c] = by
  }
  return g
}

/* One tile expanded: three columns, the whole height, for it; the rest in
   the column beside it, each one line, the hero first. */
export function expandedAreas(present: readonly TileId[], open: TileId): string[][] {
  const rest = (['hero', ...TILE_ORDER.filter((t) => t !== 'hero')] as TileId[]).filter((t) => t !== open && present.includes(t))
  const g: string[][] = rest.map((t) => [open, open, open, t])
  g.push([open, open, open, '.'])
  return g
}

export const areasCss = (g: string[][]): string => g.map((r) => `"${r.join(' ')}"`).join(' ')

/** Where each tile sits: its first cell, for the arrows. */
export function cellsOf(g: string[][]): Map<string, { r: number; c: number; r2: number; c2: number }> {
  const m = new Map<string, { r: number; c: number; r2: number; c2: number }>()
  g.forEach((row, r) =>
    row.forEach((t, c) => {
      const x = m.get(t)
      if (!x) m.set(t, { r, c, r2: r, c2: c })
      else {
        x.r2 = Math.max(x.r2, r)
        x.c2 = Math.max(x.c2, c)
      }
    }),
  )
  return m
}

/** The tile an arrow moves to: the nearest one that way, by the cells' centres. */
export function neighbour(g: string[][], from: TileId, dir: 'left' | 'right' | 'up' | 'down'): TileId | null {
  const cells = cellsOf(g)
  const a = cells.get(from)
  if (!a) return null
  const ax = (a.c + a.c2) / 2
  const ay = (a.r + a.r2) / 2
  let best: { t: string; d: number } | null = null
  for (const [t, b] of cells) {
    if (t === from || t === '.') continue
    const bx = (b.c + b.c2) / 2
    const by = (b.r + b.r2) / 2
    const ok = dir === 'left' ? b.c2 < a.c : dir === 'right' ? b.c > a.c2 : dir === 'up' ? b.r2 < a.r : b.r > a.r2
    if (!ok) continue
    const along = dir === 'left' || dir === 'right' ? Math.abs(bx - ax) : Math.abs(by - ay)
    const across = dir === 'left' || dir === 'right' ? Math.abs(by - ay) : Math.abs(bx - ax)
    const d = along + across * 2
    if (!best || d < best.d) best = { t, d }
  }
  return (best?.t as TileId) ?? null
}
