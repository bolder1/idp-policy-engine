import { motion } from 'motion/react'
import { ArrowRight, Info, Plus, RotateCw, Ticket, TriangleAlert } from 'lucide-react'

import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import type { FormField } from '../../testing/sign-in-form'
import { Spinner } from '../PolicyStack'
import type { FieldKey, PassCtx } from './pass-ctx'
import { ConditionsField, FactorsField, PolicyField, RuleField } from './pass-fields'
import { Barcode, Stamp } from './pass-parts'

/* -----------------------------------------------------------------------------
   The pass's front (PassLayout.tsx): a boarding pass, landscape.
     ┌ Access pass ───────────────────────────── Issued ┐┊ Status    ┐
     │ From  Maya Iyer          ─────────▶   To  AWS     │┊ ALLOW     │
     │       Engineering · Finance                       │┊ On 1 factor
     │ Policy │ Rule │ Factors │ Conditions              │┊ ▌▌▌▌▌▌▌▌  │
     └ (the one line worth reading)                      ┘┊ code      ┘
   The route between FROM and TO fills as the engine gets further — policy,
   rule, answer — and a Deny VOIDS it, a Depends marks it provisional.
   -------------------------------------------------------------------------- */

const EASE = [0.4, 0, 0.2, 1] as const

/** How far the sign-in has got, 0–1: read, policy found, rule landed, answered. */
function progressOf(c: PassCtx): number {
  const { plan, s } = c
  if (c.landed) return c.tone === 'positive' ? 1 : 0.72
  const d = c.decider
  if (d && d.expandAt !== null && s >= d.expandAt) {
    const real = Math.max(1, plan.rules.length)
    const at = plan.rules.findIndex((r) => r.startAt >= 0 && s < r.endAt)
    return 0.42 + 0.3 * (at < 0 ? 1 : at / real)
  }
  if (d && s >= d.settleAt) return 0.4
  const scanned = plan.policies.filter((p) => p.scanAt !== null && s >= p.scanAt).length
  return 0.08 + 0.3 * (scanned / Math.max(1, plan.policies.length))
}

export interface FrontProps {
  c: PassCtx
  open: FieldKey | null
  onField: (k: FieldKey) => void
  onFlip: () => void
  onPressPerson: () => void
  onAdd: (f: FormField) => void
  onFinding: () => void
}

export function PassFront({ c, open, onField, onFlip, onPressPerson, onAdd, onFinding }: FrontProps) {
  const p = progressOf(c)
  const lineTone = c.landed ? c.tone : c.live ? 'work' : 'neutral'
  const missing = [...new Map(c.facts.filter((f) => f.missing).map((f) => [f.missing!, f])).values()]
  const head = c.landed ? (c.tone === 'negative' ? 'Void' : c.tone === 'notice' ? 'Provisional' : c.tone === 'neutral' ? 'Not issued' : 'Issued') : c.live ? 'Issuing' : ''
  return (
    <div className="rl-pass__face is-front">
      <div
        className="rl-pass__main"
        onClick={(e) => {
          if (!(e.target as Element).closest('button')) onFlip()
        }}
      >
        <header className="rl-pass__head">
          <span className="rl-pass__brand">
            <Ticket size={14} strokeWidth={2.2} aria-hidden />
            Access pass
          </span>
          <span className={`rl-pass__issued is-${c.landed ? c.tone : c.live ? 'work' : 'neutral'}`}>
            {!c.landed && c.live && <Spinner small />}
            {head}
          </span>
        </header>

        <div className="rl-pass__route">
          <button type="button" className="rl-pass__end is-from" data-node="sign-in" onClick={onPressPerson} title="Change the sign-in">
            <span className="rl-pass__lbl">From</span>
            <span className="rl-pass__endname">
              <Face kind="user" name={c.personName} size="md" decorative />
              <strong title={c.personName}>{c.personName}</strong>
            </span>
            <span className="rl-pass__groups">
              {c.asGroup && !c.groups.some((g) => g.name === c.asGroup) && <span className="rl-pass__group">{c.asGroup}</span>}
              {c.groups.map((g) => {
                const lit = g.via && c.decider && (c.landed || c.s >= c.decider.settleAt) && !(c.landed && c.tone === 'negative')
                return (
                  <span key={g.id} className={`rl-pass__group${lit ? ' is-via' : ''}${g.conflict && c.landed ? ' is-also' : ''}`} title={g.also ? `Also covered by ${g.also}` : undefined}>
                    {g.name}
                  </span>
                )
              })}
            </span>
          </button>

          <div className={`rl-pass__line is-${lineTone}`} aria-hidden>
            <span className="rl-pass__track" />
            <motion.span
              className="rl-pass__fill"
              initial={false}
              animate={{ width: `${Math.round(p * 100)}%` }}
              transition={{ duration: c.animate ? Math.max(0.25, c.durOf(c.s) / 1000) : 0, ease: EASE }}
            />
            <ArrowRight className="rl-pass__arrow" size={16} strokeWidth={2.4} />
            {c.landed && c.tone === 'negative' && <Stamp text="Void" tone="negative" big pop={c.animate} ms={c.durOf(c.s)} tilt={-9} className="rl-pass__bigstamp" />}
            {c.landed && c.tone === 'notice' && <Stamp text="Provisional" tone="notice" big pop={c.animate} ms={c.durOf(c.s)} tilt={-6} className="rl-pass__bigstamp" />}
          </div>

          <div className="rl-pass__end is-to">
            <span className="rl-pass__lbl">To</span>
            <span className="rl-pass__endname">
              {c.appId && <AppLogo appId={c.appId} name={c.appName} size={28} />}
              <strong title={c.appName}>{c.appName}</strong>
            </span>
            <span className="rl-pass__endsub">Application</span>
          </div>
        </div>

        <div className="rl-pass__fields">
          <PolicyField c={c} open={open} onPress={onField} />
          <RuleField c={c} open={open} onPress={onField} />
          <FactorsField c={c} open={open} onPress={onField} />
          <ConditionsField c={c} open={open} onPress={onField} />
        </div>

        <div className="rl-pass__foot">
          {/* The line's room is kept while issuing, so the pass does not grow as it lands. */}
          {c.finding ? (
            <button
              type="button"
              className={`rl-pass__finding is-${c.finding.tone}${c.landed ? '' : ' is-hidden'}`}
              onClick={onFinding}
              tabIndex={c.landed ? undefined : -1}
              aria-hidden={c.landed ? undefined : true}
            >
              {c.finding.tone === 'notice' ? <TriangleAlert size={13} strokeWidth={2.4} aria-hidden /> : <Info size={13} strokeWidth={2.4} aria-hidden />}
              <span>{c.finding.text}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="rl-pass__perf" aria-hidden>
        <span className="rl-pass__notch is-top" />
        <span className="rl-pass__notch is-bottom" />
      </div>

      <div className={`rl-pass__stub is-${c.landed ? c.tone : 'waiting'}`} data-node="outcome">
        <div className="rl-pass__stubhead">
          <span className="rl-pass__lbl">Status</span>
        </div>
        <div className="rl-pass__stubmid">
          <div className="rl-pass__status">
            {c.landed ? (
              <motion.div
                key="status"
                className="rl-pass__statusbox"
                initial={c.animate ? { scale: 1.7, opacity: 0, rotate: -10 } : false}
                animate={{ scale: 1, opacity: 1, rotate: -3 }}
                transition={c.animate ? { duration: Math.max(0.3, Math.min(0.6, c.durOf(c.s) / 1000)), ease: [0.3, 1.45, 0.5, 1] } : { duration: 0 }}
              >
                <span className="rl-pass__statusword">{c.status.word}</span>
                {c.status.sub && <span className="rl-pass__statussub">{c.status.sub}</span>}
              </motion.div>
            ) : (
              <span className={`rl-pass__statuswait${c.live ? ' is-work' : ''}`}>{c.live ? 'Issuing…' : '—'}</span>
            )}
          </div>
          {c.landed && c.deny && <p className="rl-pass__denymsg">“{c.deny}”</p>}
          {c.landed && c.tone === 'notice' && missing.length > 0 && (
            <div className="rl-pass__adds">
              {missing.map((f) => (
                <button key={f.token} type="button" className="rl-pass__add" onClick={() => onAdd(f.missing!)}>
                  <Plus size={13} strokeWidth={2.4} aria-hidden />
                  Add {f.label.toLowerCase()}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rl-pass__stubfoot">
          <Barcode code={c.code} on={c.landed} />
          <span className="rl-pass__code">{c.landed ? c.code : ' '}</span>
          <div className="rl-pass__stubacts">
            {c.landed && c.screens.length > 0 && c.appId && (
              <button type="button" className={`rl-pass__link${open === 'see' ? ' is-on' : ''}`} aria-expanded={open === 'see'} onClick={() => onField('see')}>
                What they see
              </button>
            )}
            <button type="button" className="rl-pass__flipbtn" onClick={onFlip} aria-label="Flip the pass: its checks">
              <RotateCw size={13} strokeWidth={2.4} aria-hidden />
              Checks
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
