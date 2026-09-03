import { useMemo, useState, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Check, X } from 'lucide-react'

import { Button } from '../../kit'
import type { AccessDecision, Policy } from '../../data'
import type { Diagnostic } from '../diagnostics'
import { LANES, SITUATIONS, badges, compare, sweep, type Lane, type Situation } from '../impact-arena'
import { SIM_USERS, PLACES, walk, type SimContext, type SimEnv } from '../simulate'
import { CLOCKS, DECISION_SHORT, TONE, shortAuth, shortDevice, shortPlace, type Selection, type Tab } from './model'
import { Section, Seg } from './Section'

/* -----------------------------------------------------------------------------
   What changes — the before/after, made granular.

   Exact over a stated space: every combination of person, origin, device,
   auth state and risk signal the simulator can model — 1,440 situations — run
   through the real evaluator twice. Drawn four ways, each answering a
   different question:

     the lanes     how much moved, and which way
     the field     WHICH situations — hover one, click it, read why
     the cohorts   who, in the words an administrator uses
     the wins      which rule is deciding what, and which never decides

   And the guarantees — assertions about the field that can be lost.
   -------------------------------------------------------------------------- */

const ctxOf = (s: Situation, nowMinutes: number): SimContext => ({
  user: SIM_USERS.find((u) => u.id === s.userId)!,
  place: s.place,
  device: s.device,
  authState: s.authState,
  risk: s.risk,
  nowMinutes,
})

export function ImpactTab({
  draft,
  saved,
  dirty,
  env,
  diagnostics,
  onSelect,
  onTab,
}: {
  draft: Policy
  saved: Policy
  dirty: boolean
  env: SimEnv
  diagnostics: Diagnostic[]
  onSelect: (s: Selection) => void
  onTab: (t: Tab) => void
}) {
  const [clock, setClock] = useState(570)
  const [who, setWho] = useState<string | null>(null)
  const [where, setWhere] = useState<string | null>(null)
  const [picked, setPicked] = useState<number | null>(null)

  const after = useMemo(() => sweep(draft, env, clock), [draft, env, clock])
  const before = useMemo(() => (dirty ? sweep(saved, env, clock) : null), [dirty, saved, env, clock])
  const movement = useMemo(() => (before ? compare(before, after) : null), [before, after])
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length
  const marks = useMemo(() => badges(draft, after, movement, errorCount), [draft, after, movement, errorCount])

  const total = after.total
  const pct = (n: number) => `${Math.round((n / total) * 1000) / 10}%`
  const visible = (s: Situation) => (!who || s.userId === who) && (!where || s.place === where)

  const jump = (i: number) => {
    onSelect({ kind: 'rule', id: draft.rules[i].id })
    onTab('rule')
  }

  const pickedS = picked === null ? null : SITUATIONS[picked]
  const pickedWalk = useMemo(() => (pickedS ? walk(draft, ctxOf(pickedS, clock), env) : null), [pickedS, draft, clock, env])

  return (
    <>
      <div className="bb__secbody" style={{ paddingTop: 16 }}>
        <div className="bb__impacthead">
          {movement ? (
            <>
              <b>
                {movement.changed.toLocaleString()}
                <small>of {total.toLocaleString()} situations change</small>
              </b>
              <em>Compared with what is published, at {CLOCKS.find((c) => c.minutes === clock)?.label}.</em>
            </>
          ) : (
            <>
              <b>
                {total.toLocaleString()}
                <small>situations, as published</small>
              </b>
              <em>Nothing unsaved to compare. This is the policy as it stands.</em>
            </>
          )}
        </div>
        {movement && (
          <div className="bb__moves">
            <span className="bb__move is-stricter">{movement.stricter.toLocaleString()} stricter</span>
            <span className="bb__move is-looser">{movement.looser.toLocaleString()} looser</span>
            <span className="bb__move is-same">{movement.same.toLocaleString()} unchanged</span>
          </div>
        )}
        <Seg label="Time of day" block value={String(clock)} options={CLOCKS.map((c) => ({ value: String(c.minutes), label: `${c.label} · ${c.caption}` }))} onChange={(v) => setClock(Number(v))} />
      </div>

      <Section title={movement ? 'Before → after' : 'Where sign-ins land'}>
        <div className="bb__lanes">
          {LANES.map((l) => {
            const a = after.counts[l.id]
            const b = before?.counts[l.id] ?? null
            return (
              <div key={l.id} className={`bb__lane is-${TONE[l.id]}`}>
                <div className="bb__lanehead">
                  <span>
                    <b>{DECISION_SHORT[l.id]}</b> · {l.caption}
                  </span>
                  <em>
                    {b !== null && b !== a ? (
                      <>
                        {b.toLocaleString()} → <b>{a.toLocaleString()}</b>
                      </>
                    ) : (
                      <b>{a.toLocaleString()}</b>
                    )}
                  </em>
                </div>
                <div className="bb__lanebars">
                  {b !== null && (
                    <div className="bb__lanebar is-before" aria-hidden>
                      <motion.i initial={false} animate={{ width: pct(b) }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} />
                    </div>
                  )}
                  <div className="bb__lanebar is-after" aria-label={`${a} of ${total}`}>
                    <motion.i initial={false} animate={{ width: pct(a) }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} />
                  </div>
                </div>
              </div>
            )
          })}
          {before && (
            <div className="bb__lanelegend">
              <span>
                <i /> Published
              </span>
              <span>
                <i className="is-after" /> This draft
              </span>
            </div>
          )}
        </div>
        {movement && movement.flows.length > 0 && (
          <div className="bb__flows" aria-label="Where the movement went">
            {movement.flows.map((f) => (
              <div key={`${f.from}${f.to}`} className="bb__flow">
                <span className={`bb__decision is-${TONE[f.from]}`}>{DECISION_SHORT[f.from]}</span>
                <ArrowRight size={12} strokeWidth={2} aria-hidden />
                <span className={`bb__decision is-${TONE[f.to]}`}>{DECISION_SHORT[f.to]}</span>
                <span />
                <b>{f.n.toLocaleString()}</b>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Every situation" note="One dot per situation, always in the same order — so the same dot is the same person in the same place, before and after. Hover to read it; click to see why it landed where it did.">
        <div className="bb__fieldwrap">
          <div className="bb__fieldfilters" role="group" aria-label="Focus on">
            {SIM_USERS.map((u) => (
              <button key={u.id} type="button" className={`bb__chip ${who === u.id ? 'is-on' : ''}`} aria-pressed={who === u.id} onClick={() => setWho((v) => (v === u.id ? null : u.id))}>
                {u.name.split(' ')[0]}
              </button>
            ))}
            <span style={{ width: 6 }} />
            {PLACES.map((p) => (
              <button key={p} type="button" className={`bb__chip ${where === p ? 'is-on' : ''}`} aria-pressed={where === p} onClick={() => setWhere((v) => (v === p ? null : p))}>
                {shortPlace(p)}
              </button>
            ))}
          </div>

          <div className="bb__field" style={{ '--cols': 36 } as CSSProperties} role="group" aria-label={`${total} modelled situations`}>
            {SITUATIONS.map((s) => {
              const d = after.decisions[s.index]
              const b = before?.decisions[s.index]
              const changed = !!movement && movement.moves[s.index] !== 'same'
              const u = SIM_USERS.find((x) => x.id === s.userId)!
              const title = `${u.name.split(' ')[0]} · ${shortPlace(s.place)} · ${shortDevice(s.device)} · ${shortAuth(s.authState)} · ${s.risk} → ${DECISION_SHORT[d]}${b && b !== d ? ` (was ${DECISION_SHORT[b]})` : ''}`
              return (
                <button
                  key={s.index}
                  type="button"
                  className={`bb__dot is-${TONE[d]} ${changed ? 'is-changed' : ''} ${visible(s) ? '' : 'is-dim'} ${picked === s.index ? 'is-picked' : ''}`}
                  title={title}
                  aria-label={title}
                  onClick={() => setPicked((v) => (v === s.index ? null : s.index))}
                />
              )
            })}
          </div>

          <div className="bb__fieldkey">
            <span>
              <i style={{ '--dot': 'var(--fb-positive-dot, #128f43)' } as CSSProperties} /> Let in
            </span>
            <span>
              <i style={{ '--dot': 'var(--fb-notice-dot, #b07a00)' } as CSSProperties} /> Verify
            </span>
            <span>
              <i style={{ '--dot': 'var(--fb-negative-dot, #d01243)' } as CSSProperties} /> Deny
            </span>
            {movement && (
              <span>
                <i className="is-changed" /> Changed
              </span>
            )}
          </div>

          {pickedS && pickedWalk && (
            <motion.div className="bb__situation" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} key={picked}>
              <b>{SIM_USERS.find((x) => x.id === pickedS.userId)!.name}</b> · {pickedS.groupName}
              <div className="bb__sitfacts">
                <span>{shortPlace(pickedS.place)}</span>
                <span>{shortDevice(pickedS.device)}</span>
                <span>{shortAuth(pickedS.authState)}</span>
                <span>{pickedS.risk} risk</span>
              </div>
              <div className="bb__wantgot">
                {before && before.decisions[picked!] !== after.decisions[picked!] && (
                  <>
                    <span className={`bb__decision is-${TONE[before.decisions[picked!]]}`}>{DECISION_SHORT[before.decisions[picked!]]}</span>
                    <ArrowRight size={12} strokeWidth={2} aria-hidden />
                  </>
                )}
                <span className={`bb__decision is-${TONE[after.decisions[picked!]]}`}>{DECISION_SHORT[after.decisions[picked!]]}</span>
              </div>
              {pickedWalk.outOfAudience ? (
                <p style={{ margin: 0 }}>This policy does not govern {pickedS.groupName}, so the default decided.</p>
              ) : pickedWalk.hitIndex === null ? (
                <p style={{ margin: 0 }}>No rule matched — the default at the bottom decided.</p>
              ) : (
                <p style={{ margin: 0 }}>
                  Rule {pickedWalk.hitIndex + 1}, <b>{draft.rules[pickedWalk.hitIndex].name}</b> — {pickedWalk.steps[pickedWalk.hitIndex].reason.toLowerCase()}.
                </p>
              )}
              {before && before.winners[picked!] !== after.winners[picked!] && (
                <p style={{ margin: '4px 0 0' }}>
                  Published, {before.winners[picked!] === null ? 'the default decided it' : <>rule {before.winners[picked!]! + 1}, <b>{saved.rules[before.winners[picked!]!]?.name}</b>, decided it</>}.
                </p>
              )}
              {pickedWalk.hitIndex !== null && (
                <Button size="sm" variant="neutral" onClick={() => jump(pickedWalk.hitIndex!)}>
                  Open rule {pickedWalk.hitIndex + 1}
                </Button>
              )}
            </motion.div>
          )}
        </div>
      </Section>

      {movement && movement.cohorts.length > 0 && (
        <Section title="Who moved" note="By group and origin — the two axes an administrator thinks in.">
          <div className="bb__cohorts">
            {movement.cohorts.map((c) => (
              <div key={c.label} className="bb__cohort">
                <span>{c.label}</span>
                <span className={`bb__move is-${c.move}`}>{c.move}</span>
                <b>{c.n}</b>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Which rule decides what" note="How many of the modelled situations each rule wins. A rule that wins none is doing nothing.">
        <div className="bb__wins">
          {draft.rules.map((r, i) => {
            const n = after.reach[i]
            const dead = r.enabled && n === 0
            return (
              <button key={r.id} type="button" className={`bb__win ${dead ? 'is-dead' : ''}`} onClick={() => jump(i)}>
                <span className={`bb__idx is-${TONE[r.decision]}`} style={{ background: toneBg(r.decision), color: toneFg(r.decision) }} aria-hidden>
                  {i + 1}
                </span>
                <span className="bb__winmid">
                  <b>{r.name}</b>
                  <span className="bb__reachbar" aria-hidden>
                    <motion.i initial={false} animate={{ width: pct(n) }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} style={{ background: toneDot(r.decision) }} />
                  </span>
                </span>
                <em>{!r.enabled ? 'off' : dead ? 'never wins' : n.toLocaleString()}</em>
              </button>
            )
          })}
          <div className="bb__win" style={{ cursor: 'default' }}>
            <span className="bb__idx" aria-hidden style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>
              ⌂
            </span>
            <span className="bb__winmid">
              <b>Nothing else matched</b>
              <span className="bb__reachbar" aria-hidden>
                <motion.i initial={false} animate={{ width: pct(after.fellThrough) }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} style={{ background: 'var(--border-strong)' }} />
              </span>
            </span>
            <em>{after.fellThrough.toLocaleString()}</em>
          </div>
        </div>
      </Section>

      <Section title="Guarantees" count={`${marks.filter((m) => m.earned).length}/${marks.length}`} note="Each one is a claim about the field above that can be checked by reading it — and lost. A lost one names what broke it.">
        <div className="bb__badges">
          {marks.map((m) => (
            <div key={m.id} className={`bb__badge ${m.earned ? '' : 'is-lost'}`}>
              <span aria-hidden>{m.earned ? <Check size={12} strokeWidth={2.6} /> : <X size={12} strokeWidth={2.6} />}</span>
              <span>
                <b>{m.label}</b>
                <em>{m.earned ? m.claim : m.detail}</em>
              </span>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

const toneBg = (d: AccessDecision) => (d === 'deny' ? 'var(--fb-negative-bg)' : d === '2fa' ? 'var(--fb-notice-bg)' : 'var(--fb-positive-bg)')
const toneFg = (d: AccessDecision) => (d === 'deny' ? 'var(--fb-negative-fg)' : d === '2fa' ? 'var(--fb-notice-fg)' : 'var(--fb-positive-fg)')
const toneDot = (d: Lane) => (d === 'deny' ? 'var(--fb-negative-dot, #d01243)' : d === '2fa' ? 'var(--fb-notice-dot, #b07a00)' : 'var(--fb-positive-dot, #128f43)')
