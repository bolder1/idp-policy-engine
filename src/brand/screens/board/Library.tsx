import { useMemo } from 'react'
import { ChevronRight, Plus } from 'lucide-react'

import { blankRule, fallbackRule, reach, reidRule, scenarios, type Policy, type Rule } from '../../data'
import { useBrand } from '../../store'
import { DECISION_SHORT, TONE } from './model'
import { Section } from './Section'
import { WhatEditor } from './WhatEditor'

/* -----------------------------------------------------------------------------
   The library — what the inspector shows when nothing on the board is chosen.

   n8n's right panel is a catalogue until you pick a node; this is the same
   idea for rules. Every entry is a rule one of the shipped scenarios already
   writes, built by the scenario's own composer, so adding "Block anonymised
   traffic" here produces exactly the rule the template would. They land at the
   end of the chain — under first-match-wins, the end is the one position that
   changes nothing above it — and get selected, so the next thing you see is
   the rule you just added, ready to move.
   -------------------------------------------------------------------------- */

export function Library({ policy, onInsert, onPatchFallback }: { policy: Policy; onInsert: (rule: Rule, at: number) => void; onPatchFallback: (p: Partial<Rule>) => void }) {
  const store = useBrand()
  const governed = reach(policy.audience, store.groups, store.users)
  const on = policy.rules.filter((r) => r.enabled).length

  /* Distinct by name across every scenario, in catalogue order. */
  const types = useMemo(() => {
    const seen = new Set<string>()
    const out: { name: string; ifText: string; build: () => Rule; decision: Rule['decision'] }[] = []
    for (const s of scenarios)
      for (const r of s.rules) {
        if (seen.has(r.name)) continue
        seen.add(r.name)
        out.push(r)
      }
    return out
  }, [])

  return (
    <>
      <div className="bb__insphead">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2>{policy.name}</h2>
          <p>Nothing selected — choose a card on the board, or add a rule below.</p>
        </div>
      </div>

      <Section title="At a glance">
        <div className="bb__facts">
          <div className="bb__fact">
            <b>{policy.rules.length}</b>
            {/* Three cases, not two. The equality also holds at zero, so an
                empty policy used to report that all of its rules were on. */}
            <em>
              {policy.rules.length === 0
                ? 'rules'
                : on === policy.rules.length
                  ? `rule${policy.rules.length === 1 ? '' : 's'}, all on`
                  : `rule${policy.rules.length === 1 ? '' : 's'} · ${on} on`}
            </em>
          </div>
          <div className="bb__fact">
            <b>{governed.toLocaleString()}</b>
            <em>people governed</em>
          </div>
        </div>
      </Section>

      <Section title="Add a rule" count={types.length} note="Each one is a rule a shipped template writes. It lands at the end of the chain, selected, ready to move.">
        <div className="bb__lib">
          <button type="button" className="bb__libitem is-blank" onClick={() => onInsert(blankRule(), policy.rules.length)}>
            <span className="bb__idx" aria-hidden>
              <Plus size={14} strokeWidth={2.2} />
            </span>
            <span>
              <b>Blank rule</b>
              <em>Start from nothing — pick conditions and a decision yourself.</em>
            </span>
            <ChevronRight size={14} strokeWidth={2} aria-hidden />
          </button>
          {types.map((t) => (
            <button key={t.name} type="button" className={`bb__libitem is-${TONE[t.decision]}`} onClick={() => onInsert(reidRule(t.build()), policy.rules.length)}>
              <span className={`bb__idx is-${TONE[t.decision]}`} aria-hidden>
                {DECISION_SHORT[t.decision].slice(0, 1)}
              </span>
              <span>
                <b>{t.name}</b>
                <em>
                  If {t.ifText} → {DECISION_SHORT[t.decision]}
                </em>
              </span>
              <ChevronRight size={14} strokeWidth={2} aria-hidden />
            </button>
          ))}
        </div>
      </Section>

      {/* Not gated on `policy.fallback`. It is optional on the model and only a
          brand-new policy carries one, so gating hid this section on every
          policy that already existed — the one place in the board where the
          default's outcome can be set. */}
      <Section title="When nothing matches" open={false} note="The pinned default at the bottom of the chain. It is a rule whose condition is “everything above missed”.">
        <WhatEditor rule={policy.fallback ?? fallbackRule()} onPatch={onPatchFallback} terminal />
      </Section>
    </>
  )
}
