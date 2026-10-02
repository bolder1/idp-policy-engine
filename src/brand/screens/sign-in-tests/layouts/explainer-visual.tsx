import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { ArrowRight, Pencil, Users } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { useBrand } from '../../../store'
import type { TokenValue } from '../../testing/sign-in-sentence'
import type { Via } from '../conflicts'
import type { GroupRowView } from '../journey'
import { ValueMark } from '../SignInCard'
import { groupNamesOf } from '../sign-in-card'
import type { Moment } from './explainer-model'
import { OutcomeView } from './explainer-outcome'
import { OnPlate, Plate } from './explainer-parts'
import { EASE_OUT } from './explainer-motion'
import { PoliciesView } from './explainer-policies'
import { RulesView } from './explainer-rules'
import type { RunLayoutProps } from './types'

/* The PINNED VISUAL of the Explainer (ExplainerLayout.tsx): one picture
   that morphs from moment to moment — the person card, the policy stack with
   the one that applies lifting out, the policy opening into its rules, each
   rule's checks landing ✓ or ✕, the answer with What they see. The person
   shrinks into the chip on top as the run moves on; the policy's card
   becomes the bar over its rules; the rule that decided settles into the
   answer's "Decided by" (shared plates, explainer-parts.tsx). */

export interface VisualCtx {
  props: RunLayoutProps
  /** The step the visual is drawn at: the clock, or the end of the moment pressed. */
  s: number
  /** The run itself has landed (the page's clock), whatever moment is drawn. */
  final: boolean
  first: string
  via: Via | null
  animate: boolean
  morph: boolean
  onPick: (key: string) => void
}

interface VisualProps extends VisualCtx {
  moments: Moment[]
  focus: number
  width: number
  height: number
  personName: string
  facts: TokenValue[]
  groups: GroupRowView[] | null
}

type ViewKind = 'sign' | 'policies' | 'rules' | 'outcome' | 'groups'
const viewOf = (m: Moment | undefined): ViewKind => (!m ? 'sign' : m.kind === 'applies' ? 'policies' : m.kind === 'rule' ? 'rules' : m.kind)

export function Visual(p: VisualProps) {
  const { props, moments, focus, width, height, animate } = p
  const m = moments[focus]
  const view = viewOf(m)
  return (
    <section className="rl-explainer__visual" style={{ width, height }} aria-label="The run, pictured">
      <LayoutGroup id={`rx-${props.runKey}`}>
        {view !== 'sign' && <WhoChip p={p} />}
        <AnimatePresence initial={false}>
          <motion.div
            key={view}
            className={`rl-explainer__view is-${view}`}
            initial={animate ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            /* The old state leaves at once: its plates glide on into the new one (shared ids), and two pictures are never seen layered. */
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={{ duration: animate ? 0.2 : 0, ease: EASE_OUT }}
          >
            {view === 'sign' && <SignView p={p} />}
            {view === 'policies' && <PoliciesView c={p} phase={m?.kind === 'applies' ? 'applies' : 'read'} />}
            {view === 'rules' && <RulesView c={p} rule={m?.rule ?? 0} />}
            {view === 'outcome' && <OutcomeView c={p} />}
            {view === 'groups' && <GroupsView p={p} />}
          </motion.div>
        </AnimatePresence>
      </LayoutGroup>
    </section>
  )
}

const SHORT: Record<string, string> = { from: 'From', device: 'Device', when: 'When', risk: 'Risk', place: 'Place' }

/** The sign-in, small, on top of every later state: who signed in to what. A press opens the panel. */
function WhoChip({ p }: { p: VisualProps }) {
  const { props, personName, facts, morph, animate } = p
  const { users, apps } = useBrand()
  const person = users.find((u) => u.id === props.form.personId) ?? null
  const app = apps.find((a) => a.id === props.form.appId) ?? null
  const shown = facts.filter((f) => f.token !== 'person' && f.token !== 'app')
  return (
    <button type="button" className="rl-explainer__who" data-card data-node="sign-in" onClick={props.onPressPerson} title="Change the sign-in">
      <Plate id="x-person" morph={morph} />
      <OnPlate className="rl-explainer__whoin" animate={animate}>
        {person && <Face kind="user" name={person.name} size="sm" decorative />}
        <strong>{personName}</strong>
        <ArrowRight size={13} strokeWidth={2.2} aria-hidden className="rl-explainer__arrow" />
        {app && <AppLogo appId={app.id} name={app.name} size={16} />}
        <strong>{app?.name ?? props.plan.appName}</strong>
        {shown.map((f) => (
          <span key={f.token} className={`rl-explainer__whofact${f.unset ? ' is-unset' : ''}`}>
            {f.unset ? `${f.label}: not stated` : f.token === 'risk' ? `Risk ${f.text}` : f.text}
          </span>
        ))}
        <Pencil size={12} strokeWidth={2.2} aria-hidden className="rl-explainer__whoedit" />
      </OnPlate>
    </button>
  )
}

/** The first state: the person, large — their groups, the application, the facts of the sign-in. */
function SignView({ p }: { p: VisualProps }) {
  const { props, personName, facts, morph, animate } = p
  const { users, groups, apps } = useBrand()
  const person = users.find((u) => u.id === props.form.personId) ?? null
  const app = apps.find((a) => a.id === props.form.appId) ?? null
  const groupNames = props.asGroup ? [props.asGroup] : person ? groupNamesOf(person, groups) : []
  const shown = facts.filter((f) => f.token !== 'person' && f.token !== 'app')
  return (
    <div className="rl-explainer__center">
      <div className="rl-explainer__card is-sign" data-card data-node="sign-in">
        <Plate id="x-person" morph={morph} />
        <OnPlate animate={animate}>
          <div className="rl-explainer__signhead">
            {person ? <Face kind="user" name={person.name} size="md" decorative /> : <span className="rl-explainer__tile"><Users size={18} strokeWidth={2} aria-hidden /></span>}
            <div className="rl-explainer__signname">
              <span className="rl-explainer__kick">Signs in</span>
              <h3>{personName}</h3>
            </div>
            <button type="button" className="rl-explainer__iconbtn" aria-label="Change the sign-in" title="Change the sign-in" onClick={props.onPressPerson}>
              <Pencil size={14} strokeWidth={2} aria-hidden />
            </button>
          </div>
          {groupNames.length > 0 && (
            <ul className="rl-explainer__groups" aria-label="Groups">
              {groupNames.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
          <p className="rl-explainer__to">
            <ArrowRight size={15} strokeWidth={2} aria-hidden className="rl-explainer__arrow" />
            {app && <AppLogo appId={app.id} name={app.name} size={20} />}
            <span>{app?.name ?? props.plan.appName ?? 'Choose an application'}</span>
          </p>
          {shown.length > 0 && (
            <dl className="rl-explainer__facts">
              {shown.map((v, i) => (
                <motion.div key={v.token} className={`rl-explainer__fact${v.unset ? ' is-unset' : ''}`} initial={animate ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, delay: animate ? 0.2 + i * 0.07 : 0, ease: EASE_OUT }}>
                  <dt>{SHORT[v.token] ?? v.label}</dt>
                  <dd>
                    <ValueMark v={v} size={14} />
                    <span>{v.unset ? 'Not stated' : v.text}</span>
                  </dd>
                </motion.div>
              ))}
            </dl>
          )}
        </OnPlate>
      </div>
    </div>
  )
}

/** After the answer: the person's groups, each alone, and the person — with a way to run each. */
function GroupsView({ p }: { p: VisualProps }) {
  const { props, groups, first, animate } = p
  const rows = groups ?? []
  return (
    <div className="rl-explainer__center">
      <div className="rl-explainer__card is-groups" data-card>
        <Plate morph={false} />
        <OnPlate animate={animate} delay={0}>
          <span className="rl-explainer__kick">Each group alone</span>
          <h3 className="rl-explainer__title">What {first} would get</h3>
          <ul className="rl-explainer__glist">
            {rows.map((r, i) => {
              const t = r.status === 'decided' && r.decision ? (r.decision === 'deny' ? 'negative' : 'positive') : 'notice'
              return (
                <motion.li key={r.key} className={`rl-explainer__grow${r.current ? ' is-current' : ''}`} initial={animate ? { opacity: 0, x: 12 } : false} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.28, delay: animate ? i * 0.08 : 0, ease: EASE_OUT }}>
                  <span className="rl-explainer__glabel">{r.label}</span>
                  <span className={`rl-explainer__gword is-${t}`}>{r.decision && r.status === 'decided' ? DECISION_WORDS[r.decision] : r.words}</span>
                  <span className="rl-explainer__gsource">{r.source}</span>
                  {!r.current && r.groupId && props.onAsGroup && (
                    <button type="button" className="rl-explainer__act" onClick={() => props.onAsGroup!(r.groupId!)}>
                      Run {r.label.replace(/^As /, 'as ')} only
                    </button>
                  )}
                </motion.li>
              )
            })}
          </ul>
        </OnPlate>
      </div>
    </div>
  )
}
