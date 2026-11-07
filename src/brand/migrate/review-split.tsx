import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Clock, FileClock, Globe, History, Lock, MapPin, MonitorSmartphone, Users } from 'lucide-react'
import { Button, DecisionChip } from '../kit'
import type { Policy } from '../data'
import { useBrand } from '../store'
import { ReadOnlyCanvas } from '../screens/sign-in-tests/InspectPanel'
import { groupName } from './plan'
import { DEFAULT_GROUP, DEFAULT_METHOD, type LegacyAdaptive, type LegacyPolicy } from './legacy'
import { AppTile } from './parts'
import '../create/create.css'
import './review-v2.css'
import './review-split.css'

/* -----------------------------------------------------------------------------
   Review, V1 (owner, 5 Nov 2026: "the left side will be the new policy and the right
   side the old policy list, with good interaction").

   Left: the moved policy on the dotted canvas, its Approve in the footer. Right: the old
   console rows it came from, a card each, in their old order. Each card says what it
   became ("Rule 2", "Everyone else", "Left out") and what its Adaptive checks split
   into (a zone, a device profile). Hover a card and the rules it made light up on the
   left; press it to pin that, press again to let go. One footer under both: where you
   are on the left, Skip and Approve on the right; Approve all (then Go to Policies) top right; arrow keys step too.
   The page fits the screen; each side scrolls on its own.
   -------------------------------------------------------------------------- */

const PREFIX = 'rvs-'

export function ReviewSplit({ onFinish }: { onFinish: () => void }) {
  const store = useBrand()
  const reduce = useReducedMotion()
  const { moved, moveJob } = store
  const all = [...new Set([...(moveJob?.ids ?? []), ...Object.keys(moved)])]
    .map((id) => store.staged.find((p) => p.id === id) ?? store.policies.find((p) => p.id === id))
    .filter((p): p is Policy => !!p && !!moved[p.id])
  const [at, setAt] = useState(0)
  const i = Math.min(at, Math.max(0, all.length - 1))
  const open = all[i]
  const last = i === all.length - 1
  const approvedN = all.filter((p) => moved[p.id]?.approved).length
  const waiting = all.filter((p) => !moved[p.id]?.approved)

  const go = (d: number) => {
    if (d > 0 && last) return onFinish()
    setAt(Math.max(0, Math.min(all.length - 1, i + d)))
  }
  const approve = () => {
    if (!open) return
    store.approveMoved(open.id, true)
    store.showToast(`${open.name} approved`)
    go(1)
  }
  const approveAll = () => {
    const ids = waiting.map((p) => p.id)
    ids.forEach((id) => store.approveMoved(id, true))
    store.showToast(ids.length === 1 ? '1 policy approved' : `${ids.length} policies approved`, { label: 'Undo', run: () => ids.forEach((id) => store.approveMoved(id, false)) })
  }
  const goRef = useRef(go)
  goRef.current = go
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (e.key === 'ArrowRight') goRef.current(1)
      if (e.key === 'ArrowLeft') goRef.current(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return <div className="bmv__empty">Nothing to review yet</div>

  const approved = !!moved[open.id]?.approved
  return (
    <div className="brs">
      {/* Top right, where the head's actions sit (owner, 5 Nov 2026): Approve all while any wait; once none do, the way out to Policies. */}
      <span className="brs__top">
        {waiting.length > 0 ? (
          <Button variant="secondary" icon={Check} onClick={approveAll}>
            Approve all
          </Button>
        ) : (
          <Button variant="brand" iconRight={ArrowRight} onClick={() => store.go({ name: 'policies' })}>
            Go to Policies
          </Button>
        )}
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div className="brs__stage" key={open.id} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
          <Split policy={open} />
        </motion.div>
      </AnimatePresence>

      {/* One footer for the page (owner, 5 Nov 2026: "the button positions are a little confusing"): where you are on
          the left, what to do with this policy on the right. */}
      <footer className="brs__foot">
        <span className="brv__nav">
          <button type="button" className="brv__arrow" aria-label="Previous policy" disabled={i === 0} onClick={() => go(-1)}>
            <ChevronLeft size={16} strokeWidth={2.2} />
          </button>
          <span className="brv__count">
            {i + 1} / {all.length}
          </span>
          <button type="button" className="brv__arrow" aria-label="Next policy" disabled={last} onClick={() => go(1)}>
            <ChevronRight size={16} strokeWidth={2.2} />
          </button>
        </span>
        <span className="brv__dots" aria-hidden>
          <motion.i initial={false} animate={{ width: `${(approvedN / all.length) * 100}%` }} transition={{ duration: 0.4 }} />
        </span>
        <span className="brv__approvedn">{approvedN} approved</span>
        <span className="bmv__spacer" />
        {approved ? (
          <>
            <Button variant="ghost" onClick={() => store.approveMoved(open.id, false)}>
              Undo approve
            </Button>
            <Button variant="secondary" iconRight={ArrowRight} onClick={() => go(1)}>
              {last ? 'Finish' : 'Next'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => go(1)}>
              {last ? 'Finish' : 'Skip'}
            </Button>
            <Button variant="brand" icon={Check} onClick={approve}>
              Approve
            </Button>
          </>
        )}
      </footer>
    </div>
  )
}

function Split({ policy }: { policy: Policy }) {
  const store = useBrand()
  const info = store.moved[policy.id]
  const approved = !!info?.approved
  const sources = (info?.sourceIds ?? []).map((id) => store.legacy.policies.find((lp) => lp.id === id)).filter((lp): lp is LegacyPolicy => !!lp)
  const own = policy.pendingDraft?.rules ?? policy.rules
  const held = !approved && info?.pending ? info.pending.filter((r) => !own.some((x) => x.id === r.id)) : []
  const view: Policy = { ...policy, rules: [...own, ...held], fallback: policy.pendingDraft?.fallback ?? policy.fallback }
  const ids = [...view.rules.map((r) => r.id), 'fallback']
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set(ids))
  /* A rule pressed on the canvas: its old rows light on the left (owner, 6 Nov 2026: two-way). */
  const [fromRule, setFromRule] = useState<string | null>(null)
  const toggle = (id: string | null) => {
    if (id === null) return
    setFromRule((cur) => (cur === id ? null : id))
    setOpenIds((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const head = (id: string) => {
    const d = id === 'fallback' ? view.fallback?.decision : view.rules.find((r) => r.id === id)?.decision
    return d ? <DecisionChip decision={d} size="sm" /> : undefined
  }
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const on = hover ?? pinned
  const madeBy = (lpId: string) => ids.filter((id) => info?.ruleSource[id]?.source === lpId)
  const traced = on ? madeBy(on) : fromRule ? [fromRule] : []
  const label = (id: string) => (id === 'fallback' ? 'Everyone else' : `Rule ${view.rules.findIndex((r) => r.id === id) + 1}`)
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (!fromRule) return
    const el = listRef.current?.querySelector('.brs__card.is-linked')
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [fromRule])

  return (
    <div className="brs__split is-canvas-right">
      {/* Left, docked like Guided setup: the old policies this one came from, a readable card each. */}
      <aside className="brs__old" aria-label="Old policies it came from" onMouseLeave={() => setHover(null)}>
        <header className="brs__oldhead">
          <span className="brs__oldtitle">
            <History size={15} strokeWidth={2} aria-hidden />
            <b>Old policies</b>
          </span>
          <span className="brs__oldsub">{sources.length === 1 ? 'This policy came from 1 old policy.' : `This policy came from ${sources.length} old policies.`}</span>
        </header>
        <ol ref={listRef}>
          {sources.map((lp, i) => {
            const left = info?.leftOut.find((l) => l.id === `${lp.id}-dup` || l.id === `${lp.id}-last`)
            const made = madeBy(lp.id)
            const zone = (info?.moves ?? []).find((m) => m.id === `${lp.id}-zone`)
            const device = (info?.moves ?? []).find((m) => m.id === `${lp.id}-device`)
            return (
              <OldCard
                index={i + 1}
                key={lp.id}
                lp={lp}
                became={left ? 'Left out' : made.length ? [...new Set(made.map(label))].join(', ') : 'Merged with a matching row'}
                why={left?.after}
                zone={zone?.after.replace(/^New zone /, '').replace(/^Uses your (.*) zone$/, '$1')}
                device={device?.after.replace(/^New device profile /, '')}
                on={on === lp.id}
                linked={!!fromRule && made.includes(fromRule)}
                pinned={pinned === lp.id}
                onHover={() => setHover(lp.id)}
                onPin={() => setPinned((p) => (p === lp.id ? null : lp.id))}
              />
            )
          })}
        </ol>
      </aside>

      {/* Right: the moved policy on the builder's own canvas. */}
      <section className="bdetail brv2 brs__new" aria-label={`${policy.name}, in the Policy builder`}>
        <header className="brv2__head">
          <span className="brv2__logo">
            <AppTile appId={policy.appIds[0]} size={26} />
          </span>
          <span className="brv2__words">
            <span className="brv2__titlerow">
              <h2>{policy.name}</h2>
              <span className={`brv__pill is-${approved ? 'done' : 'todo'}`}>{approved ? 'Approved' : info?.joined ? 'Adds rules' : 'Draft'}</span>
            </span>
            <span className="brs__hint">Select a rule to see the old policy it came from.</span>
          </span>
        </header>
        <div className="bdetail__canvas brv2__canvas brs__canvas">
          <span className="bdetail__chip">
            <FileClock size={14} strokeWidth={2} aria-hidden />
            {approved ? 'Approved draft' : 'Moved draft'}
          </span>
          <ReadOnlyCanvas policy={view} traced={traced} still idPrefix={PREFIX} cardHead={head} open={openIds} onOpen={toggle} />
        </div>
        <p className="brs__note">The old policy decides sign-ins until this one is active.</p>
      </section>
    </div>
  )
}

const initials = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

/* One old policy, read like Guided setup reads a rule: sentences with tokens, then its Adaptive checks with what each
   became, then where the row went. */
export function OldCard({
  lp,
  became,
  why,
  zone,
  device,
  on,
  linked,
  pinned,
  onHover,
  onPin,
  index,
}: {
  lp: LegacyPolicy
  became: string
  why?: string
  zone?: string
  device?: string
  on: boolean
  linked: boolean
  pinned: boolean
  onHover: () => void
  onPin: () => void
  /** 1, 2, 3…: which of the old policies this is, in the list it sits in. */
  index?: number
}) {
  const store = useBrand()
  const ad: LegacyAdaptive | undefined = lp.adaptive ? store.legacy.adaptive.find((a) => a.id === lp.adaptive?.policyId) : undefined
  const everyone = lp.groupId === DEFAULT_GROUP
  const who = everyone ? 'Everyone else' : groupName(lp.groupId, { groups: store.groups })
  const app = store.moveApps.find((a) => a.id === lp.appId)?.name ?? lp.appId
  const second = lp.mfa ? (lp.mfa.method === DEFAULT_METHOD ? 'the default MFA method' : lp.mfa.method) : null
  const left = became === 'Left out'
  const checks = ad && lp.adaptive ? lp.adaptive.checks : []
  return (
    <li>
      <button type="button" className={`brs__card${on ? ' is-on' : ''}${linked ? ' is-linked' : ''}${pinned ? ' is-pinned' : ''}${left ? ' is-left' : ''}`} aria-pressed={pinned} onMouseEnter={onHover} onFocus={onHover} onClick={onPin}>
        <span className="brs__head">
          <span className="brs__no">{index ? `Old policy ${index}` : 'Old policy'}</span>
          <span className="brs__kind">
            <Lock size={11} strokeWidth={2.2} aria-hidden /> App Login
          </span>
        </span>
        <b className="brs__name">{lp.name}</b>

        <span className="brs__rows">
          <span className="brs__row">
            <i>Who</i>
            <span className="brs__tok">
              <span className="bx-face is-group is-sm" aria-hidden>
                {everyone ? <Users size={11} strokeWidth={2.2} /> : initials(who)}
              </span>
              <b>{who}</b>
            </span>
          </span>
          <span className="brs__row">
            <i>App</i>
            <span className="brs__tok">
              <AppTile appId={lp.appId} size={16} />
              <b>{app}</b>
            </span>
          </span>
          <span className="brs__row">
            <i>Sign in</i>
            <span className="brs__flow">
              <span className="brs__chip">{lp.firstFactor}</span>
              {second ? (
                <>
                  <ArrowRight size={12} strokeWidth={2.2} className="brs__arrow" aria-hidden />
                  <span className="brs__chip is-mfa">{second}</span>
                </>
              ) : (
                <span className="brs__muted">no second factor</span>
              )}
            </span>
          </span>
          {(lp.mfa?.rememberDays || lp.forceMfa) && (
            <span className="brs__row">
              <i>Also</i>
              <span className="brs__muted">
                {[lp.mfa?.rememberDays ? `Remembered ${lp.mfa.rememberDays} days` : '', lp.forceMfa ? 'Always asked' : ''].filter(Boolean).join(' · ')}
              </span>
            </span>
          )}
        </span>

        {ad && (
          <span className="brs__adaptive">
            <span className="brs__kind is-adaptive">
              <Globe size={11} strokeWidth={2.2} aria-hidden /> Adaptive Access · {ad.name}
            </span>
            <span className="brs__checks">
              {checks.map((c) => {
                const text = c === 'ip' ? `IP ${ad.ip?.join(', ')}` : c === 'location' ? `From ${ad.location?.countries.join(', ')}` : c === 'time' ? `${ad.time?.from}–${ad.time?.to}` : `At most ${ad.device?.max} devices`
                const Icon = c === 'ip' ? Globe : c === 'location' ? MapPin : c === 'time' ? Clock : MonitorSmartphone
                const to = c === 'ip' || c === 'location' ? (zone ? `Zone · ${zone}` : 'Zone') : c === 'device' ? (device ? `Device profile · ${device}` : 'Device profile') : 'Condition on the rule'
                return (
                  <span key={c} className="brs__check">
                    <span className="brs__checkfrom">
                      <Icon size={12} strokeWidth={2.2} aria-hidden />
                      {text}
                    </span>
                    <ArrowRight size={12} strokeWidth={2.2} className="brs__arrow" aria-hidden />
                    <span className={`brs__chip${c === 'time' ? '' : ' is-made'}`}>{to}</span>
                  </span>
                )
              })}
            </span>
            <span className="brs__onfail">If not met: {ad.onFail === 'deny' ? 'deny' : 'ask for a second factor'}</span>
          </span>
        )}

        {became && (
          <span className="brs__foot">
            <span className="brs__footk">Became</span>
            <span className={`brs__became${left ? ' is-left' : ''}`}>{became}</span>
          </span>
        )}
        {why && <span className="brs__why">{why}</span>}
      </button>
    </li>
  )
}
