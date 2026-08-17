import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'

import { AppLogo } from '../logos/AppLogo'
import { Badge, Button, DecisionChip, Modal } from '../kit'
import { blankPolicy, scenarios, type Scenario } from '../data'
import { useBrand } from '../store'

/* -----------------------------------------------------------------------------
   New policy — scenario picker, then name & app.

   Same two-step flow the console has today. One thing is fixed rather than
   restyled: picking a scenario now actually builds the rules it previewed. In
   the current prototype you can preview "Adaptive device trust (90-day)",
   click through, and land in a builder holding entirely unrelated rules.
   -------------------------------------------------------------------------- */

const CATEGORIES = ['Quick Protection', 'Device-based', 'Risk-based', 'Compliance'] as const

export function NewPolicyFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useBrand()
  const [step, setStep] = useState<'scenario' | 'name'>('scenario')
  const [picked, setPicked] = useState<Scenario | null>(null)
  const [scratch, setScratch] = useState(false)
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [appIds, setAppIds] = useState<string[]>([])

  function reset() {
    setStep('scenario')
    setPicked(null)
    setScratch(false)
    setQuery('')
    setName('')
    setAppIds([])
  }

  function close() {
    onClose()
    window.setTimeout(reset, 200)
  }

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CATEGORIES.map((c) => ({
      category: c,
      items: scenarios.filter(
        (s) => s.category === c && (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
      ),
    })).filter((g) => g.items.length > 0)
  }, [query])

  function proceed(s: Scenario | null) {
    setPicked(s)
    setScratch(s === null)
    setName(s ? s.name : '')
    setStep('name')
  }

  function create() {
    const policy = blankPolicy(name.trim() || picked?.name || 'Untitled policy', appIds)
    // The scenario's rules are built here — this is the step the current
    // prototype skips, which is why its scenario preview does not match what
    // you get.
    if (picked) policy.rules = picked.rules.map((r) => r.build())
    store.addPolicy(policy)
    store.showToast(`${policy.name} created${picked ? ` with ${policy.rules.length} rule${policy.rules.length === 1 ? '' : 's'}` : ''}`)
    close()
    store.go({ name: 'builder', policyId: policy.id })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={step === 'scenario' ? 'New policy' : 'Name and attach'}
      width={step === 'scenario' ? 940 : 620}
      padded={step !== 'scenario'}
      footer={
        step === 'scenario' ? (
          <>
            <span className="bnew__foothint">Pick a scenario or start from scratch — you name it and choose apps next.</span>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep('scenario')}>
              Back
            </Button>
            <Button variant="brand" onClick={create} disabled={!name.trim()}>
              Create policy
            </Button>
          </>
        )
      }
    >
      <AnimatePresence mode="wait">
        {step === 'scenario' ? (
          <motion.div
            key="scenario"
            className="bnew"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
          >
            <div className="bnew__list">
              <div className="bnew__search">
                <input
                  type="search"
                  placeholder="Search scenarios…"
                  aria-label="Search scenarios"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="bnew__scroll">
                {grouped.map((g) => (
                  <div key={g.category} className="bnew__group">
                    <p className="u-label">{g.category}</p>
                    {g.items.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`bnew__item ${picked?.id === s.id ? 'is-on' : ''}`}
                        onClick={() => setPicked(s)}
                      >
                        <span className="bnew__item-head">
                          <strong>{s.name}</strong>
                          {s.tag && <Badge tone="neutral">{s.tag}</Badge>}
                        </span>
                        <span className="bnew__item-desc">{s.description}</span>
                        {s.badge && <span className="bnew__item-badge">{s.badge}</span>}
                      </button>
                    ))}
                  </div>
                ))}
                {grouped.length === 0 && <p className="bnew__none">No scenario matches “{query}”.</p>}
              </div>
            </div>

            <div className="bnew__preview">
              {picked ? (
                <>
                  <h3>{picked.name}</h3>
                  <div className="bnew__preview-tags">
                    <Badge tone="info">{picked.category}</Badge>
                    {picked.badge && <Badge tone="brand">{picked.badge}</Badge>}
                  </div>
                  <p className="bnew__preview-desc">{picked.description}</p>

                  <p className="u-label bnew__preview-label">
                    Creates {picked.rules.length} rule{picked.rules.length === 1 ? '' : 's'}
                  </p>
                  <ol className="bnew__rules">
                    {picked.rules.map((r, i) => (
                      <li key={r.name}>
                        <span className="bnew__rule-n">{i + 1}</span>
                        <span className="bnew__rule-body">
                          <strong>{r.name}</strong>
                          <span>IF {r.ifText}</span>
                        </span>
                        <DecisionChip decision={r.decision} size="sm" />
                      </li>
                    ))}
                  </ol>
                  <p className="bnew__preview-note">You can change every rule after it is created.</p>
                  <Button variant="brand" block onClick={() => proceed(picked)}>
                    Use this scenario
                  </Button>
                </>
              ) : (
                <div className="bnew__placeholder">
                  <p>Select a scenario to preview the rules it creates.</p>
                </div>
              )}
            </div>

            <div className="bnew__other">
              <p className="u-label">Other options</p>
              <button type="button" className="bnew__opt" onClick={() => proceed(null)}>
                <strong>Build from scratch</strong>
                <span>Start with a blank policy and configure every rule yourself.</span>
              </button>
              <button type="button" className="bnew__opt" onClick={() => store.showToast('Bulk import accepts CSV or JSON, up to 10,000 entries')}>
                <strong>Import from file</strong>
                <span>Upload CSV or JSON to bulk-import IP ranges, user lists, or conditions.</span>
              </button>
              <button type="button" className="bnew__opt" onClick={() => store.showToast('External conditions call your endpoint during evaluation')}>
                <strong>
                  Use external conditions <Badge tone="neutral">Developers</Badge>
                </strong>
                <span>Invoke an external API or sync attributes to evaluate custom conditions.</span>
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="name"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.16 }}
            className="bname"
          >
            {picked && (
              <div className="bname__from">
                Starting from <strong>{picked.name}</strong> — {picked.rules.length} rule
                {picked.rules.length === 1 ? '' : 's'} will be created.
              </div>
            )}
            {scratch && <div className="bname__from">Starting from a blank policy — no rules yet.</div>}

            <label className="bname__field" htmlFor="np-name">
              <span className="u-label">What should this policy be called?</span>
              <input
                id="np-name"
                type="text"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Finance Team – High Security"
              />
              <span className="bname__hint">Name it after the app and user group it protects.</span>
            </label>

            <div className="bname__field">
              <span className="u-label">Which apps does this policy protect?</span>
              <div className="bname__apps">
                {store.apps.map((a) => {
                  const on = appIds.includes(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`bname__app ${on ? 'is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => setAppIds((ids) => (on ? ids.filter((x) => x !== a.id) : [...ids, a.id]))}
                    >
                      <AppLogo appId={a.id} name={a.name} size={24} />
                      <span className="bname__app-name">{a.name}</span>
                      <span className="bname__app-proto">{a.protocol}</span>
                    </button>
                  )
                })}
              </div>
              <span className="bname__hint">
                {appIds.length === 0
                  ? 'You can skip this and attach apps from the builder — the policy will not evaluate until at least one app is attached.'
                  : `${appIds.length} app${appIds.length === 1 ? '' : 's'} selected.`}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}
