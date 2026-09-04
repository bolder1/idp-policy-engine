import { useMemo, useState } from 'react'
import { Info, Search } from 'lucide-react'

import { PageHead } from '../Shell'
import { Button, Chip, Toggle } from '../kit'
import { TierPick } from '../tier-pick'
import { useBrand } from '../store'
import {
  EMPTY_RISK_PROFILE,
  PLATFORMS,
  RISK_SIGNALS,
  SIGNAL_CATEGORIES,
  countOn,
  isOn,
  tierFor,
  tierKey,
  type RiskSignal,
  type SignalCategory,
} from '../risk-signals'

import './risk-signals.css'

/* -----------------------------------------------------------------------------
   The risk signal profile.

   One page, one weighting, for the whole tenant. Every signal a mobile sign-in
   can carry, whether this tenant listens to it, and how hard it pushes when it
   fires — on Android and on iOS separately, because the two platforms do not
   report the same things with the same confidence.

   The thing that makes this a settings page rather than a decoration is at the
   top of it: the scale. `device-risk` — "Device Risk Score above 60" — is the
   one condition in the product that compares a rule's threshold against a
   number, and that number now comes from here. So the strip is not a summary of
   the page, it is the page's output, and it moves while you edit.
   -------------------------------------------------------------------------- */

const ALL = 'All'

export function RiskSignals() {
  const store = useBrand()
  const { riskProfile: profile, setRiskProfile, riskScale } = store
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>(ALL)

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return RISK_SIGNALS.filter((s) => {
      if (cat !== ALL && s.category !== cat) return false
      if (!n) return true
      /* Searching leaves the category behind, the same way the condition
         catalogue's does: a query that matches nothing in the selected
         category would otherwise show an empty pane with the answer one click
         away. */
      return `${s.name} ${s.purpose} ${s.category}`.toLowerCase().includes(n)
    })
  }, [q, cat])

  const searching = q.trim().length > 0
  const groups = useMemo(
    () => SIGNAL_CATEGORIES.map((c) => ({ category: c, items: shown.filter((s) => s.category === c) })).filter((g) => g.items.length > 0),
    [shown],
  )

  const toggle = (s: RiskSignal, on: boolean) =>
    setRiskProfile({ ...profile, off: on ? profile.off.filter((id) => id !== s.id) : [...profile.off, s.id] })

  const setTier = (s: RiskSignal, p: 'android' | 'ios', t: (typeof RISK_SIGNALS)[number]['tier']) =>
    setRiskProfile({ ...profile, tiers: { ...profile.tiers, [tierKey(s.id, p)]: t } })

  const touched = profile.off.length > 0 || Object.keys(profile.tiers).length > 0
  const onCount = countOn(profile)

  return (
    <div className="bpage">
      <PageHead
        title="Risk signal profile"
        caption="What a suspicious sign-in is worth. Switch a signal off to stop listening to it, or change how hard it pushes when it fires."
        actions={
          /* Absent until there is something to restore. A button that resets a
             page nobody has changed is a button whose only possible outcome is
             nothing happening. */
          touched ? (
            <Button
              variant="secondary"
              onClick={() => {
                setRiskProfile(EMPTY_RISK_PROFILE)
                store.showToast('Risk signals back to their shipped weights')
              }}
            >
              Restore defaults
            </Button>
          ) : undefined
        }
      />

      {/* The output, not a summary.

          Three numbers a rule can be written against, recalculated as the page
          is edited. Somebody who switches off half the catalogue should watch
          "High" fall while they do it — that is the consequence of the choice,
          and it is the only place in the product where it is visible. */}
      <div className="brs__scale" aria-live="polite">
        <div className="brs__scale__what">
          <b>What a risk verdict scores</b>
          <em>
            Rules compare against these with <strong>Device Risk Score</strong>. {onCount} of {RISK_SIGNALS.length} signals on.
          </em>
        </div>
        <dl className="brs__bands">
          {(['Low', 'Medium', 'High'] as const).map((b) => (
            <div key={b} className={`brs__band is-${b.toLowerCase()}`}>
              <dt>{b}</dt>
              <dd>{riskScale[b]}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Said once, plainly, rather than implied by a column of dashes.

          The reference this was modelled on carries a Web column full of them.
          A dash reads as "not yet", and there is no web collection coming — so
          the gap is a sentence, where somebody can read it and decide whether
          it matters to them. */}
      <p className="brs__gap">
        <Info size={13} strokeWidth={2} aria-hidden />
        <span>
          These signals come from the mobile SDKs. A sign-in from a browser carries none of them, so its risk verdict is
          whatever the rest of the policy decides — this page does not change it.
        </span>
      </p>

      <div className="btoolbar">
        <label className="brs__search">
          <Search size={14} strokeWidth={2} aria-hidden />
          <input
            type="search"
            value={q}
            placeholder="Search signals…"
            aria-label="Search risk signals"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="btoolbar__filters">
          {[ALL, ...SIGNAL_CATEGORIES].map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="brs__none">No signal matches “{q.trim()}”.</p>
      ) : (
        groups.map((g) => <CategoryBlock key={g.category} category={g.category} items={g.items} searching={searching} onToggle={toggle} onTier={setTier} />)
      )}
    </div>
  )
}

/* One category, with its own weight in the heading.

   A count of how many are on says how much of the category you kept; the
   proportion of weight says how much it can still contribute. They differ —
   switching off one High signal and keeping four Low ones keeps most of the
   category and almost none of its force — and it is the second that decides
   what a sign-in scores. */
function CategoryBlock({
  category,
  items,
  searching,
  onToggle,
  onTier,
}: {
  category: SignalCategory
  items: RiskSignal[]
  searching: boolean
  onToggle: (s: RiskSignal, on: boolean) => void
  onTier: (s: RiskSignal, p: 'android' | 'ios', t: RiskSignal['tier']) => void
}) {
  const store = useBrand()
  const profile = store.riskProfile
  const on = items.filter((s) => isOn(profile, s.id)).length

  return (
    <section className="brs__cat">
      <h2 className="brs__cat__head">
        {category}
        <em>
          {on} of {items.length} on
        </em>
      </h2>

      <div className="brs__table" role="table" aria-label={category}>
        <div className="brs__row brs__row--head" role="row">
          <span role="columnheader">Signal</span>
          <span role="columnheader" className="brs__col">
            Android
          </span>
          <span role="columnheader" className="brs__col">
            iOS
          </span>
          <span role="columnheader" className="brs__col brs__col--on">
            On
          </span>
        </div>

        {items.map((s) => {
          const live = isOn(profile, s.id)
          return (
            <div className={`brs__row ${live ? '' : 'is-off'}`} role="row" key={s.id}>
              <span className="brs__sig" role="cell">
                <b>{s.name}</b>
                <em>{s.purpose}</em>
                {searching && <i className="brs__where">{s.category}</i>}
              </span>

              {PLATFORMS.map((p) => (
                <span className="brs__col" role="cell" key={p.id}>
                  {s.on.includes(p.id) ? (
                    <TierPick
                      value={tierFor(profile, s, p.id)}
                      label={`${s.name} weight on ${p.label}`}
                      onChange={(t) => onTier(s, p.id, t)}
                    />
                  ) : (
                    /* Words, not a dash. A dash is ambiguous between "off",
                       "zero" and "not collected", and only the third is true. */
                    <span className="bx-tiers--none">Not collected</span>
                  )}
                </span>
              ))}

              <span className="brs__col brs__col--on" role="cell">
                <Toggle checked={live} onChange={(v) => onToggle(s, v)} label={`${s.name} is ${live ? 'on' : 'off'}`} size="sm" />
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
