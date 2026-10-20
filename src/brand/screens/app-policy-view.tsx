import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Eye,
  ListPlus,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Radar,
  Replace,
  Trash2,
  Unlink,
  type LucideIcon,
} from 'lucide-react'

import { appsOf, enforces, memberGroupIds, ruleExpired, type App, type Policy } from '../data'
import { DecisionBadge } from '../decision-badge'
import { Face, FaceStack, type FaceItem } from '../faces'
import { Badge, Button, Chip, MenuButton, Note, StatusPill, type MenuItem } from '../kit'
import { linkedTo } from '../post-sign-in'
import { normaliseWho } from '../rule-who'
import { useBrand, useNameLookup, type AppTab } from '../store'
import { AppActivity, AppBreakIn, GlanceActivity } from './app-activity'
import { rulesLabel } from './app-policies'
import {
  GLANCE_ROWS,
  appCheckForm,
  canvasTarget,
  cardOutcome,
  chainKeyOf,
  chainRows,
  coverageOf,
  glanceRows,
  revealTop,
  statusMenu,
  tabNotice,
  trafficByRow,
  whenSaid,
  type ChainKey,
  type ChainRow,
  type RowTraffic,
  type RuleFilter,
  type StatusMenuId,
  type TabNotice,
} from './app-policy-model'
import type { StandRow } from './app-standing'
import { AppsPeek } from './apps-peek'
import { STATUS_WORD, storedVersions } from './board/read-as-text'
import { useDraftDiff } from './board/use-lines'
import { checkAccessFrom } from './guarded-moves'
import { SAMPLE_DAY, monitorRows, monitorSamples, planLine, planOf } from './monitor-sample'
import { policySentences } from './predicate-prose'
import { containWhileScrolling } from './scroll-contain'
import { useSimEnv } from './sim-env'
import { fallbackOf } from './simulate'
import type { ActivityRow } from './sign-in-tests/activity'
import { ReadOnlyCanvas, RuleBody } from './sign-in-tests/InspectPanel'
import { FATE_WORDS, isPeek, type InspectTarget } from './sign-in-tests/inspect-model'
import { ACCESS_CHECK } from './sign-in-tests/names'
import { nowIn } from './sign-in-tests/sign-in-card'
import { GRANT_ENDED } from './sign-in-tests/temp-access'
import { useTestingSession } from './testing/session-state'
import { todayIn } from './testing/sign-in-form'
import { formatCount } from './testing/test-dock'

/* -----------------------------------------------------------------------------
   An application's Policies tab (docs/specs/APP-POLICY-TAB.md, 15 Oct 2026):
   its one sign-in policy, read in the page on the full width (owner: "I don't
   need cards, I need the preview here in the page itself"). It replaces the
   morning's bento.

     A  the policy's name, its status pill as the menu of what can be switched,
        what it covers, the applications it is shared with, the last change —
        and two buttons: Replace policy, and Edit (the one orange button)
     B  the one thing that changes how the rules read, only when there is one
     C  the decision chain top to bottom, as the engine reads it: the rules,
        "Nothing else matched", then — outside the policy — the Global Default.
        Each row says who it is for, what it does, and how many of the week's
        sign-ins it decided; it opens in place, one at a time
     D  the application's own sign-ins, each tied back to its row in C
     E  the policy's changes, its post sign-in pointer, break-in (hidden)

   With no policy, the same shape (`AppNoPolicyView`): what the application
   gets now, which is the Global Default's own rules, read only.

   Hairlines and headings, no tiles. Selection is greyscale. Every number is
   said once: a row's sign-ins in C, the covered people in A, everyone else in
   C's last row. Rows open with Motion, height and opacity only, and not at
   all under reduced motion.

   At a glance (`APP_POLICY_GLANCE`, 20 Oct 2026), C and D are two panels of
   one fixed height side by side: the canvas with each card's outcome and the
   Global Default as its foot, and the sign-ins paged, a picked one ringing the
   card that decided it. See "The tab at a glance" below.
   -------------------------------------------------------------------------- */

/* Break-in attempts on the application page: hidden for now (owner, 14 Oct 2026). Kept, not deleted. */
const BREAK_IN_ON_APP = false

/* Edit rule's way back: the row it opened on, reopened when the board's Back returns with this policy (`flash`). Module
   state, as board-return.ts keeps its notes, because the page is unmounted while the board is open; spent by the next
   arrival at a policy view whichever way it came. */
const RULE_SENT: { note: { policyId: string; key: ChainKey } | null } = { note: null }

const STATUS_ICON: Record<StatusMenuId, LucideIcon> = { active: Power, monitor: Radar, inactive: PowerOff, 'view-monitoring': Eye, remove: Unlink, delete: Trash2 }

/* What a rule's Uses opens: that object's library page (policy-details-drawer.tsx keeps the same map). */
const LIBRARY_SCREEN = { zone: { name: 'zones' }, device: { name: 'fingerprint' }, risk: { name: 'risk-signals' }, hook: { name: 'hooks' }, app: { name: 'applications' } } as const

const people = (n: number) => `${formatCount(n)} ${n === 1 ? 'person' : 'people'}`

/** One motion for every open and close on the tab: about a fifth of a second, none under reduced motion. */
const ease = (reduced: boolean) => ({ duration: reduced ? 0 : 0.18, ease: [0.2, 0, 0, 1] as const })

/* --- A1 · The status pill, as the menu of what can be switched ---------------------- */

export function StatusMenu({ policy, items, onSelect }: { policy: Policy; items: MenuItem[]; onSelect: (id: StatusMenuId) => void }) {
  if (items.length === 0) return <StatusPill status={policy.status} />
  return (
    <span className="apol__status">
      <MenuButton
        label={`Status: ${STATUS_WORD[policy.status]}. Change status`}
        face={<StatusPill status={policy.status} />}
        items={items.map((i) => ({ ...i, icon: STATUS_ICON[i.id as StatusMenuId] }))}
        onSelect={(id) => onSelect(id as StatusMenuId)}
        variant="ghost"
        size="sm"
        align="start"
      />
    </span>
  )
}

/* --- A2 · What it covers, where else it is, when it last changed --------------------

   Read only: who a policy covers is changed in the builder. A group's name opens
   the Users tab on that group, and the count on the people this policy decides
   for — the count only while it decides for somebody, since an off policy
   decides for nobody and B already says so. */
export function CoversLine({
  app,
  policy,
  covered,
  onTab,
}: {
  app: App
  policy: Policy
  covered: number
  onTab: (tab: AppTab, extra?: { group?: string; policy?: string }) => void
}) {
  const { groups, users, apps } = useBrand()
  const everyone = policy.audience.everyone
  const named = [
    ...policy.audience.groupIds.map((id) => ({ kind: 'group' as const, id, name: groups.find((g) => g.id === id)?.name ?? 'A deleted group' })),
    ...policy.audience.userIds.map((id) => ({ kind: 'user' as const, id, name: users.find((u) => u.id === id)?.name ?? 'A deleted person' })),
  ]
  const shared = policy.appIds.length > 1 ? appsOf(policy, [...apps]).filter((a) => a.id !== app.id) : []
  const count =
    covered > 0 ? (
      <button type="button" className="apol__link apol__covercount" onClick={() => onTab('users', { policy: policy.id })}>
        {people(covered)}
      </button>
    ) : enforces(policy) ? (
      <span className="apol__covercount">{people(0)}</span>
    ) : null
  return (
    <dl className="apol__facts">
      <div className="apol__fact">
        {/* Labels are nouns (house rule). */}
        <dt>Who it covers</dt>
        <dd>
          {everyone || named.length === 0 ? (
            everyone ? 'Everyone' : 'Nobody'
          ) : (
            /* Each group or person as one chip, its face beside its name (owner, 20 Oct 2026: "fix the visuals" — the
               stacked initials and a run of blue links read as noise). A group's chip opens the Users tab on it. */
            <span className="apol__names apol__whochips">
              {named.map((n) => {
                const opens = n.kind === 'group' && groups.some((g) => g.id === n.id)
                return (
                  <Chip key={`${n.kind}:${n.id}`} onClick={opens ? () => onTab('users', { group: n.id }) : undefined}>
                    <Face kind={n.kind} name={n.name} size="sm" decorative />
                    {n.name}
                  </Chip>
                )
              })}
            </span>
          )}
          {count}
        </dd>
      </div>
      {shared.length > 0 && (
        <div className="apol__fact">
          <dt>Other applications</dt>
          <dd>
            {/* No Edit in the peek: a policy's applications change in the builder. */}
            <AppsPeek apps={shared} policyName={policy.name} />
          </dd>
        </div>
      )}
      {/* No "Changed" here: the Changes list beside the activity says when and by whom, and a
          number is said once (owner's rule; 15 Oct 2026). */}
    </dl>
  )
}

/* --- B · The state line ----------------------------------------------------------- */

function StateLine({
  notice,
  app,
  others,
  reduced,
  onEditOther,
  onRemoveOther,
  onReview,
  onTurnOn,
  onViewMonitoring,
}: {
  notice: TabNotice
  app: App
  others: readonly StandRow[]
  reduced: boolean
  onEditOther: (policyId: string) => void
  onRemoveOther: (row: StandRow) => void
  onReview: () => void
  onTurnOn: () => void
  onViewMonitoring: () => void
}) {
  /* The kit's `Note` (owner, 16 Oct 2026: every note is the one note): the state is its heading, what it means
     the body, the ways on as links under it. It was a callout whose tone told a draft or an off policy (grey)
     from news (blue); the heading says which now. */
  let title: string
  let body: ReactNode
  let more: ReactNode
  let moreLabel: string | undefined
  if (notice.kind === 'also') {
    title = `Also on ${app.name}`
    body = (
      <ul className="apol__notelist">
        {notice.others.map((p) => {
          const row = others.find((r) => r.policy.id === p.id)
          return (
            <li key={p.id}>
              <span>
                {p.name} · {STATUS_WORD[p.status]}
              </span>
              <span className="apol__notelinks">
                <button type="button" className="apol__link" onClick={() => onEditOther(p.id)}>
                  Edit
                </button>
                {row && (
                  <button type="button" className="apol__link" onClick={() => onRemoveOther(row)}>
                    Remove from {app.name}
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    )
  } else if (notice.kind === 'pending') {
    title = 'Draft changes not published'
    const lines = [...notice.removed.map((t) => ({ word: 'Removed' as const, t })), ...notice.added.map((t) => ({ word: 'Added' as const, t }))]
    const diff = (ls: typeof lines) => (
      <ul className="insp__diff apol__diff">
        {ls.map((l) => (
          <li key={`${l.word}:${l.t}`} className={l.word === 'Added' ? 'is-added' : 'is-removed'}>
            <span className="insp__diffword">{l.word}</span>
            <span className="insp__difftext">{l.t}</span>
          </li>
        ))}
      </ul>
    )
    /* Past three lines the rest is the Note's own fold, not a second Show all of the state line's own. */
    if (lines.length > 3) {
      more = diff(lines.slice(3))
      moreLabel = 'Show all'
    }
    body = (
      <>
        {diff(lines.slice(0, 3))}
        <span className="apol__notelinks">
          <button type="button" className="apol__link" onClick={onReview}>
            Review in builder
            <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
          </button>
        </span>
      </>
    )
  } else {
    /* The status pill's own word for the state. */
    title = STATUS_WORD[notice.kind]
    body = (
      <>
        <span className="apol__notetext">{afterTitle(notice.said, title)}</span>
        {notice.plan && <span className="apol__notetext">{notice.plan}</span>}
        {notice.kind === 'inactive' && (
          <span className="apol__notelinks">
            <button type="button" className="apol__link" onClick={onTurnOn}>
              Turn on
            </button>
          </span>
        )}
        {notice.kind === 'monitor' && (
          <span className="apol__notelinks">
            <button type="button" className="apol__link" onClick={onViewMonitoring}>
              View monitoring
            </button>
          </span>
        )}
      </>
    )
  }
  return (
    <motion.div className="apol__state" key={notice.kind} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={ease(reduced)}>
      <Note title={title} more={more} moreLabel={moreLabel}>
        {body}
      </Note>
    </motion.div>
  )
}

/* "Draft. It decides no sign-ins." under the heading Draft reads "It decides no sign-ins.": the heading has said
   the state, so the body does not say it twice. */
const afterTitle = (said: string, title: string) => (said.startsWith(`${title}. `) ? said.slice(title.length + 2) : said)

/* --- C · The chain ----------------------------------------------------------------- */

type Tab = (tab: AppTab, extra?: { group?: string; policy?: string }) => void

const domKey = (k: ChainKey) => `apol-row-${k.replace(/[^A-Za-z0-9_-]/g, '-')}`

/* The policy's own rules drawn as the builder's read-only canvas (19 Oct 2026); off = the rules table. */
export const RULES_CANVAS = true

/* The app tab as one fixed stage: rules and Sign-in activity at one height, paged (20 Oct 2026); off = the 19 Oct
   layout. */
export const APP_POLICY_GLANCE = true
/* The glance is the canvas's frame, so with the canvas off the tab is the 15 Oct table layout as a whole. */
const GLANCE = APP_POLICY_GLANCE && RULES_CANVAS

export function PolicyChain({
  app,
  policy,
  globalDefault,
  everyoneElse,
  open,
  onToggle,
  itemRef,
  editable,
  everyoneElseCount,
}: {
  app: App
  /** The application's policy; null when the Global Default is the whole chain. */
  policy: Policy | null
  globalDefault: Policy | null
  everyoneElse: Policy | null
  open: ChainKey | null
  onToggle: (key: ChainKey) => void
  itemRef: (key: ChainKey, el: HTMLLIElement | null) => void
  /** Edit rule under each open rule: the application's own policy. The Global Default is not edited from here. */
  editable: boolean
  /** The people outside the policy, said once, on the Global Default's row. */
  everyoneElseCount: number
}) {
  const store = useBrand()
  const { policies, apps, groups, users } = store
  const resolve = useNameLookup()
  const env = useSimEnv()
  const reduced = useReducedMotion() ?? false
  const rows = useMemo(() => chainRows(policy, globalDefault, everyoneElse, { resolve, groups, users, appName: app.name }), [policy, globalDefault, everyoneElse, resolve, groups, users, app.name])
  /* Modelled sign-ins, and an application added this session has none: no figures, and no Sample badge. */
  const figures = !app.addedAt
  const traffic = useMemo(() => (figures ? trafficByRow(app.id, policy, globalDefault, policies, env, SAMPLE_DAY, apps) : new Map<ChainKey, RowTraffic>()), [figures, app.id, policy, globalDefault, policies, env, apps])
  const today = todayIn()
  /* The chain's own policy: the one whose rules the rows are. */
  const own = policy ?? globalDefault
  const check = useAppCheck(app)

  const peek = (t: InspectTarget) => {
    if (isPeek(t) && t.kind !== 'person') store.go(LIBRARY_SCREEN[t.kind])
  }
  const editRule = (key: ChainKey) => {
    if (!policy) return
    store.requestLeave(() => {
      RULE_SENT.note = { policyId: policy.id, key }
      store.go({ name: 'board', policyId: policy.id, rule: key === 'last' ? 'fallback' : key, from: { appId: app.id } })
    })
  }
  const openDefault = () => globalDefault && store.go({ name: 'board', policyId: globalDefault.id, from: { appId: app.id } })

  if (!own) return null

  const bodyOf = (row: ChainRow): ReactNode => {
    if (row.kind === 'default' && globalDefault) return <GdLines globalDefault={globalDefault} traced={null} onOpen={openDefault} />
    const rule = row.kind === 'rule' ? own.rules.find((r) => r.id === row.key) : undefined
    const w = rule ? normaliseWho(rule.who) : undefined
    /* The faces of who it names: each group's directory members, then the people named, less any exception. */
    const members: FaceItem[] = []
    if (w) {
      const out = new Set([...(w.exceptUserIds ?? [])])
      const outGroups = new Set(w.exceptGroupIds ?? [])
      const seen = new Set<string>()
      for (const u of users) {
        const ids = memberGroupIds(u)
        const named = w.userIds.includes(u.id) || ids.some((g) => w.groupIds.includes(g))
        if (!named || out.has(u.id) || ids.some((g) => outGroups.has(g)) || seen.has(u.id)) continue
        seen.add(u.id)
        members.push({ kind: 'user', key: u.id, name: u.name })
      }
    }
    return (
      <>
        {row.kind === 'rule' && (
          <div className="insp__part">
            <h4>Who</h4>
            <p className="apol__whofull">{row.whoSaid}</p>
            {members.length > 0 && <FaceStack faces={members} max={5} />}
          </div>
        )}
        <RuleBody policy={own} ruleId={row.kind === 'last' ? null : row.key} plan={null} shown={null} list={[]} onEdit={peek} />
        {editable && (
          <span className="apol__bodyfoot">
            <button type="button" className="apol__link" onClick={() => editRule(row.key)}>
              Edit rule
              <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
            </button>
          </span>
        )}
      </>
    )
  }

  return (
    <section className="apol__sec apol__chainsec" aria-labelledby="apol-rules">
      <div className="apol__sechead">
        <h3 id="apol-rules">Rules</h3>
        <span className="apol__aside">In order</span>
        {figures && <Badge tone="neutral">Sample</Badge>}
        <span className="apol__push">
          <Button variant="ghost" size="sm" iconRight={ArrowUpRight} onClick={check}>
            {ACCESS_CHECK}
          </Button>
        </span>
      </div>
      {RULES_CANVAS && policy && <ReadOnlyCanvas policy={policy} traced={[]} />}
      {/* The column labels, for the eye: each row's button says its own cells. */}
      {(!RULES_CANVAS || !policy) && <div className="apol__cols" aria-hidden>
        <span>#</span>
        <span>Rule</span>
        <span>Who</span>
        <span>Outcome</span>
        <span>{figures ? 'Sign-ins · last 7 days' : ''}</span>
        <span />
      </div>}
      <ol className="apol__chain">
        {rows.filter((row) => !RULES_CANVAS || !policy || row.kind === 'default').map((row) => {
          const isOpen = open === row.key
          /* The Global Default's row opens only where it decides for somebody: covering everyone, the policy leaves it nobody. */
          const openable = row.kind !== 'default' || row.reached
          const rule = row.kind === 'rule' ? own.rules.find((r) => r.id === row.key) : undefined
          const tag = row.kind !== 'rule' ? null : rule && rule.tempAccess && ruleExpired(rule, today) ? GRANT_ENDED : !row.enabled ? FATE_WORDS.off : null
          const sub = row.kind !== 'rule' ? '' : row.blockedBy !== null ? `Never reached · rule ${row.blockedBy} matches first` : row.ifSaid
          const t = row.kind === 'default' && !row.reached ? undefined : traffic.get(row.key)
          const id = domKey(row.key)
          const cells = (
            <>
              <span className="apol__n" aria-hidden>
                {row.kind === 'rule' ? row.n : row.kind === 'last' ? '*' : <CornerDownRight size={14} strokeWidth={2} />}
              </span>
              <span className="apol__rule">
                {/* The number is for the eye (`apol__n`); a Rule link in Sign-in activity lands on a row that says it. */}
                {row.kind === 'rule' && <span className="u-sr-only">Rule {row.n}: </span>}
                <span className="apol__name">
                  <span className="apol__nametext">{row.name}</span>
                  {row.kind === 'default' && <Badge tone="system">System</Badge>}
                  {tag && <Badge tone="neutral">{tag}</Badge>}
                </span>
                {sub && <span className="apol__sub">{sub}</span>}
              </span>
              <span className="apol__who">
                {row.kind === 'rule' && row.whoFaces.length > 0 && <FaceStack faces={row.whoFaces} max={3} tips={false} />}
                <span className="apol__whotext">{row.kind === 'default' && row.reached ? `${row.whoSaid} · ${people(everyoneElseCount)}` : row.whoSaid}</span>
              </span>
              <span className="apol__out">
                {row.kind === 'default' ? (
                  row.reached && row.decision ? (
                    <span className="apol__outline">
                      {/* The Global Default's rule count: said here and nowhere else on the tab. */}
                      {row.rulesBefore && globalDefault ? <span>{rulesLabel(globalDefault)}, then</span> : null}
                      <DecisionBadge decision={row.decision} />
                    </span>
                  ) : (
                    <span className="apol__muted">Not reached</span>
                  )
                ) : row.decision ? (
                  <>
                    <DecisionBadge decision={row.decision} />
                    {row.factorSaid && <span className="apol__factor">{row.factorSaid}</span>}
                  </>
                ) : (
                  <span className="apol__muted">Outcome not chosen yet</span>
                )}
              </span>
              <span className="apol__fig">
                {t && t.weight > 0 && (
                  <>
                    <span className="apol__count">
                      {formatCount(t.weight)}
                      {/* The noun on the row itself where the column labels go (a narrow chain); read once, below. */}
                      <span className="apol__unit" aria-hidden>
                        {' '}
                        sign-ins
                      </span>
                      <span className="u-sr-only"> sign-ins in the last 7 days</span>
                    </span>
                    {t.last && <span className="apol__last">Last {whenSaid(t.last.date, '')}</span>}
                  </>
                )}
              </span>
              <span className="apol__chev" aria-hidden>
                {openable && (
                  <motion.span className="apol__chevturn" animate={{ rotate: isOpen ? 180 : 0 }} transition={ease(reduced)}>
                    <ChevronDown size={14} strokeWidth={2} />
                  </motion.span>
                )}
              </span>
            </>
          )
          const cls = `apol__row is-${row.kind}${row.reached ? '' : ' is-dim'}${isOpen ? ' is-open' : ''}`
          return (
            <li key={row.key} className={`apol__item is-${row.kind}`} ref={(el) => itemRef(row.key, el)}>
              {row.kind === 'default' && (
                <p className="apol__tier">
                  <span>Outside {policy?.name ?? ''}</span>
                </p>
              )}
              {openable ? (
                <button type="button" className={cls} aria-expanded={isOpen} aria-controls={id} onClick={() => onToggle(row.key)}>
                  {cells}
                </button>
              ) : (
                <div className={`${cls} is-still`}>{cells}</div>
              )}
              {openable && (
                <div id={id} className="apol__bodywrap">
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="body"
                        className="apol__body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={ease(reduced)}
                      >
                        <div className="apol__bodyin">{bodyOf(row)}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/* The Global Default's own lines, numbered, each with its outcome, then the way to it: the chain's Global Default row
   opened, and the glance's sheet over the rules panel's foot. `traced` is the line a picked sign-in landed on (its
   rule id, or 'fallback'), marked in the picked row's colour; the chain passes none. */
function GdLines({ globalDefault, traced, onOpen }: { globalDefault: Policy; traced: string | null; onOpen: () => void }) {
  const { apps } = useBrand()
  const resolve = useNameLookup()
  const appName = (id: string) => apps.find((a) => a.id === id)?.name ?? 'a deleted application'
  const lines = policySentences(globalDefault, resolve, appName).filter((l) => l.ruleId !== null)
  return (
    <>
      <ol className="apol__gdlines">
        {lines.map((l) => {
          const decision = l.ruleId === 'fallback' ? fallbackOf(globalDefault) : globalDefault.rules.find((r) => r.id === l.ruleId)?.decision
          return (
            <li key={l.key} className={traced !== null && l.ruleId === traced ? 'is-traced' : undefined}>
              <span className="apol__gdn" aria-hidden>
                {l.n ?? '*'}
              </span>
              <span className="apol__gdtext">{l.text}</span>
              {decision && <DecisionBadge decision={decision} />}
            </li>
          )
        })}
      </ol>
      <span className="apol__bodyfoot">
        <button type="button" className="apol__link" onClick={onOpen}>
          Open Global Default
          <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
        </button>
      </span>
    </>
  )
}

/* Check access from the Rules head: fills in the application and runs nothing until Run (only Run runs, 2 Oct
   2026), so Access checks opens on its form holding it, whatever ran there before. The chain and the glance both
   call it, so the move is written once. */
function useAppCheck(app: App) {
  const store = useBrand()
  const { policies } = store
  const session = useTestingSession()
  return () => checkAccessFrom(store, () => session.prefill(appCheckForm(app.id, session, policies, todayIn(), nowIn())))
}

/* --- One open row, opened from anywhere on the tab -----------------------------------

   A press on a row toggles it, one open at a time (the board's accordion
   ruling, 23 Sep 2026). A Rule link in Sign-in activity or Changes opens its
   row and brings it into view — smoothly, or at once under reduced motion. */
function useChainOpen(initial: ChainKey | null) {
  const reduced = useReducedMotion() ?? false
  const [open, setOpen] = useState<ChainKey | null>(initial)
  const items = useRef(new Map<ChainKey, HTMLLIElement>())
  const [reveal, setReveal] = useState<{ key: ChainKey; n: number } | null>(initial ? { key: initial, n: 0 } : null)
  useEffect(() => {
    if (!reveal) return
    const item = items.current.get(reveal.key)
    item?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
    /* A link pressed (not the board's way back, whose policy the page focuses): the focus follows to the row it opened,
       so the keyboard and a screen reader are where the eye is. */
    if (reveal.n > 0) item?.querySelector<HTMLElement>('.apol__row')?.focus({ preventScroll: true })
  }, [reveal, reduced])
  return {
    open,
    toggle: (key: ChainKey) => setOpen((cur) => (cur === key ? null : key)),
    show: (key: ChainKey) => {
      setOpen(key)
      setReveal((r) => ({ key, n: (r?.n ?? 0) + 1 }))
    },
    itemRef: (key: ChainKey, el: HTMLLIElement | null) => {
      if (el) items.current.set(key, el)
      else items.current.delete(key)
    },
    reduced,
  }
}

/* --- E2 · Post sign-in: a pointer to the sibling tab, no more ------------------------ */
function PostSignInLinks({ app, onTab }: { app: App; onTab: Tab }) {
  const { policies } = useBrand()
  const linked = linkedTo(app.id, policies)
  if (linked.length === 0) return null
  return (
    <section className="apol__sec" aria-labelledby="apol-post">
      <div className="apol__sechead">
        <h3 id="apol-post">Post sign-in</h3>
      </div>
      <ul className="apol__postlist">
        {linked.map(({ policy }) => (
          <li key={policy.id}>
            <button type="button" className="apol__link" onClick={() => onTab('post-sign-in')}>
              {policy.name}
              <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* --- The tab at a glance (`APP_POLICY_GLANCE`, 20 Oct 2026) ----------------------------------------------------

   The owner, on AWS Console's tab (19 Oct 2026): "one page for the policy and the whole thing … add a fixed height
   for all the sections, add pagination … the user is here to check the whole policy at a glance; if they need more
   info they can go inside the policy builder". So the rules and Sign-in activity are two panels of one height, side
   by side (`.apol__pair.is-glance`), and nothing inside either can change it:

     Rules              the canvas scrolls in its panel, every card carrying its outcome; the Global Default is the
                        panel's foot, a strip that opens a sheet over the canvas rather than a row under it
     Sign-in activity   a bar, `GLANCE_ROWS` rows a page and a pager, a picked row instead of one opened in place

   The two are tied: a picked sign-in rings, opens and brings into view the card that decided it (the Global Default's
   line, when it did), and the Rule filter rings the card it narrows the rows to. The page never scrolls by itself. */

/** How long the board's fold takes to open a card (board.css `.bb__fold`). */
const FOLD_MS = 260

/* What the two panels share: the picked sign-in, the Rule filter, the one unfolded card, the Global Default's sheet,
   and the card the canvas should bring into view next. */
function useGlance(policy: Policy | null, globalDefault: Policy | null) {
  const reduced = useReducedMotion() ?? false
  const [picked, setPicked] = useState<ActivityRow | null>(null)
  const [rule, setRuleState] = useState<RuleFilter>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [gdOpen, setGdOpen] = useState(false)
  /* A new object on every ask, so the same card can be brought in twice; `wait` while its fold is still opening. */
  const [reveal, setReveal] = useState<{ id: string; wait: boolean } | null>(null)
  const rulesBody = useRef<HTMLDivElement>(null)
  useEffect(() => (reveal && rulesBody.current ? revealCard(rulesBody.current, reveal.id, reveal.wait && !reduced, reduced) : undefined), [reveal, reduced])

  const focusKey = picked ? chainKeyOf(picked, policy, globalDefault) : rule === 'all' ? null : rule
  const pick = (r: ActivityRow | null) => {
    setPicked(r)
    if (!r) return
    const key = chainKeyOf(r, policy, globalDefault)
    const t = canvasTarget(key)
    if (t) {
      setReveal({ id: t, wait: openId !== t })
      setOpenId(t)
      setGdOpen(false)
    } else if (key === 'default') setGdOpen(true)
    else {
      /* Can't tell: nothing decided it, so the last pick's answer — an open card, the sheet — goes rather than stand
         beside a row it does not answer. */
      setOpenId(null)
      setGdOpen(false)
    }
  }
  /* The filter rings and brings in its card but does not open it: opening is reading, and the rows are what changed.
     A card the filter names is never left under the Global Default's sheet. */
  const setRule = (v: RuleFilter) => {
    setRuleState(v)
    setPicked(null)
    const t = canvasTarget(v === 'all' ? null : v)
    if (t) {
      setGdOpen(false)
      setReveal({ id: t, wait: false })
    }
  }
  /* A card opened by hand is read in the open, so the sheet goes down too. */
  const openCard = (id: string | null) => {
    setOpenId(id)
    if (id) setGdOpen(false)
  }
  return {
    reduced,
    picked,
    pick,
    rule,
    setRule,
    openId,
    openCard,
    gdOpen,
    setGdOpen,
    rulesBody,
    /** The card the canvas rings: a rule's id or 'fallback'; null for the Global Default, Can't tell, or nothing. */
    target: canvasTarget(focusKey),
    /** The Global Default decided the picked sign-in, or the Rule filter names it: its strip is marked. */
    gdTraced: focusKey === 'default',
    /** The Global Default's own line the picked sign-in landed on. */
    gdLine: picked && focusKey === 'default' ? picked.ruleKey : null,
  }
}
type Glance = ReturnType<typeof useGlance>

/* Where the two panels stop sitting side by side (applications.css, `.apol__pair` at 1120 and below). */
const STACKED = '(max-width: 1120px)'

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    const sync = () => setOn(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [query])
  return on
}

/* The page size both frames are drawn from (`--apol-rows`), from the window: as many rows as let the frames end above
   the fold with the page at its top, between GLANCE_MIN_ROWS and GLANCE_ROWS (`glanceRows`). Measured from where the
   activity's frame starts and what it holds besides its rows, read off the frame as drawn, so either look's tokens and
   a state line above the stage are counted as they are. Stacked, the second panel is under the first whatever the
   window, so the page keeps its GLANCE_ROWS. Static markup (no window) draws GLANCE_ROWS. */
function useGlanceRows(stacked: boolean) {
  const [rows, setRows] = useState(GLANCE_ROWS)
  const [pair, setPair] = useState<HTMLDivElement | null>(null)
  const measure = useCallback(() => {
    if (!pair) return
    const frame = pair.querySelector<HTMLElement>('.apol__activity > .apol__frame')
    if (stacked || !frame) {
      setRows(GLANCE_ROWS)
      return
    }
    const main = pair.closest<HTMLElement>('.bshell__main')
    const bottom = main ? main.getBoundingClientRect().bottom : window.innerHeight
    const cs = getComputedStyle(pair)
    const rowH = parseFloat(cs.getPropertyValue('--table-row-h'))
    const drawn = parseFloat(cs.getPropertyValue('--apol-rows')) || GLANCE_ROWS
    const gap = parseFloat(cs.getPropertyValue('--space-4')) || 0
    const f = frame.getBoundingClientRect()
    const top = f.top + (main?.scrollTop ?? 0)
    const besides = f.height - drawn * rowH
    setRows(glanceRows(bottom - gap - top - besides, rowH))
  }, [pair, stacked])
  useLayoutEffect(() => {
    measure()
  })
  useEffect(() => {
    if (!pair) return
    const main = pair.closest('.bshell__main')
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure())
    if (ro && main) ro.observe(main)
    if (ro && pair.parentElement) ro.observe(pair.parentElement)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [pair, measure])
  return { rows, ref: setPair }
}

/* Stacked, the rules sit above Sign-in activity and out of sight from its rows: a row's Show rule picks it, brings the
   rules frame into the page's view (the page's own scroller, as little as it takes) and puts the keyboard on the card
   that decided it — or the Global Default's strip. Side by side the canvas is in sight already, so there is none. */
function showRuleOf(glance: Glance, policy: Policy | null, globalDefault: Policy | null) {
  return (r: ActivityRow) => {
    glance.pick(r)
    const body = glance.rulesBody.current
    const frame = body?.closest<HTMLElement>('.apol__frame')
    /* The panel with its head, so "Rules" is read above the card it rings. */
    const panel = frame?.closest<HTMLElement>('.apol__panel')
    const main = frame?.closest<HTMLElement>('.bshell__main')
    if (!body || !frame || !panel || !main) return
    const pad = parseFloat(getComputedStyle(main).getPropertyValue('--space-5')) || 0
    const top = panel.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop
    const y = revealTop({ top, height: panel.offsetHeight }, { scrollTop: main.scrollTop, height: main.clientHeight }, pad)
    if (y !== null) main.scrollTo({ top: y, behavior: glance.reduced ? 'auto' : 'smooth' })
    const t = canvasTarget(chainKeyOf(r, policy, globalDefault))
    /* The card's title is its one keyboard stop (RuleCard `foldOnPress`). */
    const to = t ? body.querySelector<HTMLElement>(t === 'fallback' ? '#bb-terminal-title' : `#bb-rule-${CSS.escape(t)}-title`) : frame.querySelector<HTMLElement>('.apol__gdstrip')
    to?.focus({ preventScroll: true })
  }
}

/* Brings a card wholly into the rules panel, scrolling the framed canvas (the panel's scroller) and never the page
   (`revealTop`; `scrollIntoView` would scroll the console's main column too). A card that is opening is measured once
   its fold has: on the fold's own transitionend, or a beat after it should have ended — no animation frame, so a
   hidden pane cannot hold it. */
function revealCard(body: HTMLElement, id: string, wait: boolean, reduced: boolean): (() => void) | undefined {
  const box = body.querySelector<HTMLElement>('.insp__canvas') ?? body
  const title = box.querySelector(id === 'fallback' ? '#bb-terminal-title' : `#bb-rule-${CSS.escape(id)}-title`)
  const card = title?.closest<HTMLElement>('.bb__card')
  if (!card) return undefined
  const bring = () => {
    const pad = parseFloat(getComputedStyle(box).scrollPaddingTop) || 0
    const top = card.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    const y = revealTop({ top, height: card.offsetHeight }, { scrollTop: box.scrollTop, height: box.clientHeight }, pad)
    if (y !== null) box.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' })
  }
  const fold = card.querySelector<HTMLElement>('.bb__fold--body')
  if (!wait || !fold) {
    bring()
    return undefined
  }
  let done = false
  const stop = () => {
    done = true
    fold.removeEventListener('transitionend', onEnd)
    window.clearTimeout(timer)
  }
  const finish = () => {
    if (done) return
    stop()
    bring()
  }
  const onEnd = (e: TransitionEvent) => {
    if (e.target === fold && e.propertyName === 'grid-template-rows') finish()
  }
  fold.addEventListener('transitionend', onEnd)
  const timer = window.setTimeout(finish, FOLD_MS + 60)
  return stop
}

/* Each card's outcome where its state pill was (`cardOutcome`): none where a card keeps its own word (Off, Not set up). */
const outcomeOf =
  (own: Policy) =>
  (id: string): ReactNode => {
    const d = cardOutcome(own, id)
    return d ? <DecisionBadge decision={d} /> : undefined
  }

/* The rules panel's foot: who the policy leaves to the Global Default, and what that decides — two lines, the second
   the old row's (spec C). It opens the Global Default's lines in a sheet over the canvas; the canvas stays under it,
   scrolled where it was. Not reached (the policy covers everyone), it is a still line that says so. */
function GdStrip({
  policy,
  globalDefault,
  reached,
  count,
  open,
  traced,
  reduced,
  onToggle,
  buttonRef,
}: {
  policy: Policy
  globalDefault: Policy
  reached: boolean
  /** The people outside the policy, said once, here. */
  count: number
  open: boolean
  traced: boolean
  reduced: boolean
  onToggle: () => void
  buttonRef: Ref<HTMLButtonElement>
}) {
  const tier = (
    <span className="apol__gdtier">
      Outside {policy.name}
      {reached && count > 0 ? ` · ${people(count)}` : ''}
      <span className="u-sr-only">, </span>
    </span>
  )
  const mark = <CornerDownRight className="apol__gdmark" size={14} strokeWidth={2} aria-hidden />
  if (!reached) {
    return (
      <div className="apol__gdstrip is-still">
        {mark}
        {tier}
        <span className="apol__gdname">{globalDefault.name}</span>
        <span className="apol__gdout">Not reached</span>
      </div>
    )
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`apol__gdstrip${traced ? ' is-traced' : ''}`}
      aria-expanded={open}
      aria-controls="apol-gdsheet"
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault()
          onToggle()
        }
      }}
    >
      {mark}
      {tier}
      <span className="apol__gdname">{globalDefault.name}</span>
      <span className="apol__gdout">
        {/* The Global Default's rule count: said here and nowhere else on the tab. */}
        {globalDefault.rules.length > 0 && <span className="apol__gdrules">{rulesLabel(globalDefault)}, then</span>}
        <DecisionBadge decision={fallbackOf(globalDefault)} />
      </span>
      <motion.span className="apol__gdchev" aria-hidden animate={{ rotate: open ? 180 : 0 }} transition={ease(reduced)}>
        <ChevronUp size={14} strokeWidth={2} />
      </motion.span>
    </button>
  )
}

/* The rules panel: its head, then the frame — the canvas scrolling in its body and, behind a policy of the
   application's own, the Global Default's strip as its foot. With no policy the Global Default's own rules are the
   canvas, and nothing is outside it, so there is no foot. */
function RulesPanel({
  app,
  policy,
  globalDefault,
  everyoneElse,
  everyoneElseCount,
  glance,
}: {
  app: App
  policy: Policy | null
  globalDefault: Policy | null
  everyoneElse: Policy | null
  everyoneElseCount: number
  glance: Glance
}) {
  const store = useBrand()
  const { groups, users } = store
  const resolve = useNameLookup()
  const check = useAppCheck(app)
  const own = policy ?? globalDefault
  const strip = policy && globalDefault && !policy.isSystem ? globalDefault : null
  /* Whether the Global Default decides for anybody here: the chain's own answer, so the two layouts cannot disagree. */
  const reached = useMemo(
    () => (strip ? (chainRows(policy, strip, everyoneElse, { resolve, groups, users, appName: app.name }).find((r) => r.kind === 'default')?.reached ?? false) : false),
    [strip, policy, everyoneElse, resolve, groups, users, app.name],
  )
  const cardHead = useMemo(() => (own ? outcomeOf(own) : undefined), [own])
  const stripButton = useRef<HTMLButtonElement>(null)
  const { gdOpen, setGdOpen } = glance
  const sheetUp = gdOpen && reached
  const openDefault = () => globalDefault && store.go({ name: 'board', policyId: globalDefault.id, from: { appId: app.id } })
  /* Escape inside the sheet closes it and puts the keyboard back on the strip that opened it. */
  const closeSheet = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !gdOpen) return
    e.preventDefault()
    setGdOpen(false)
    stripButton.current?.focus({ preventScroll: true })
  }
  /* The sheet covers the canvas's foot, so a press or the keyboard reaching a card puts it down: nothing focused or
     pressed is ever under it (review, 20 Oct 2026: Shift+Tab from the strip reached three titles it hid). */
  const intoCanvas = () => {
    if (sheetUp) setGdOpen(false)
  }
  /* The sheet keeps the wheel only while its lines overflow it (scroll-contain.ts), as the canvas and the table do. */
  const pane = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = pane.current
    if (!sheetUp || !el) return
    return containWhileScrolling(el, el.firstElementChild ? [el.firstElementChild] : [])
  }, [sheetUp])

  return (
    <section className="apol__panel apol__rules" aria-labelledby="apol-rules">
      <div className="apol__sechead apol__panelhead">
        <h3 id="apol-rules">Rules</h3>
        <span className="apol__aside">In order</span>
        <span className="apol__push">
          <Button variant="ghost" size="sm" iconRight={ArrowUpRight} onClick={check}>
            {ACCESS_CHECK}
          </Button>
        </span>
      </div>
      <div className={`btable-wrap apol__frame${strip && policy ? ' has-foot' : ''}`}>
        <div className="apol__body apol__rulesbody" ref={glance.rulesBody} onFocus={intoCanvas} onPointerDown={intoCanvas}>
          {own && <ReadOnlyCanvas policy={own} traced={glance.target ? [glance.target] : []} framed open={glance.openId} onOpen={glance.openCard} cardHead={cardHead} />}
        </div>
        {strip && policy && (
          <>
            <div className="apol__foot apol__rulesfoot">
              <GdStrip
                policy={policy}
                globalDefault={strip}
                reached={reached}
                count={everyoneElseCount}
                open={sheetUp}
                traced={glance.gdTraced}
                reduced={glance.reduced}
                onToggle={() => setGdOpen(!gdOpen)}
                buttonRef={stripButton}
              />
            </div>
            <div id="apol-gdsheet" className="apol__gdsheet" onKeyDown={closeSheet}>
              <AnimatePresence initial={false}>
                {sheetUp && (
                  <motion.div
                    key="sheet"
                    ref={pane}
                    className="apol__gdpane"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={ease(glance.reduced)}
                  >
                    <div className="apol__gdpanein">
                      <GdLines globalDefault={strip} traced={glance.gdLine} onOpen={openDefault} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/* --- The tab, with a policy ------------------------------------------------------------ */

export function AppPolicyView({
  app,
  row,
  others,
  globalDefault,
  everyoneElse,
  saving,
  flash,
  deletable,
  onReplace,
  onMenu,
  onRemoveOther,
  onTab,
}: {
  app: App
  /** The policy shown: the one that decides here, else the first on the application. */
  row: StandRow
  /** Any other policy on the application: the data allows it, the ruling does not, so B says so. */
  others: readonly StandRow[]
  globalDefault: Policy | null
  everyoneElse: Policy | null
  /** The page's own save bar is up and holds the view's one orange button. */
  saving: boolean
  /** The policy the board's Back returned with. */
  flash?: string
  deletable: boolean
  onReplace: () => void
  /** The status pill's menu, and B's Turn on and View monitoring. */
  onMenu: (id: StatusMenuId) => void
  onRemoveOther: (row: StandRow) => void
  onTab: Tab
}) {
  const store = useBrand()
  const { policies, apps, users, groups, features } = store
  const env = useSimEnv()
  const policy = row.policy
  const chain = useChainOpen(flash && RULE_SENT.note?.policyId === flash ? RULE_SENT.note.key : null)
  /* Both are called whichever layout draws (the rules of hooks); the glance starts empty on the board's way back. */
  const glance = useGlance(policy, globalDefault)
  const stacked = useMedia(STACKED)
  const stage = useGlanceRows(stacked)
  const hasRail = BREAK_IN_ON_APP || linkedTo(app.id, store.policies).length > 0
  /* Edit rule's note is spent by any arrival here. */
  useEffect(() => {
    RULE_SENT.note = null
  }, [])

  const versions = useMemo(() => storedVersions(policy), [policy])
  const diff = useDraftDiff(versions)
  const plan = useMemo(() => (policy.status === 'monitor' ? planLine(planOf(monitorRows(policy, policies, env, monitorSamples(policy, env, SAMPLE_DAY)))) : null), [policy, policies, env])
  const notice = tabNotice(row, others, diff, plan)
  const coverage = useMemo(() => coverageOf(app.id, policy, policies, users, groups), [app.id, policy, policies, users, groups])
  const menu = statusMenu(policy, app, apps, { monitor: features.monitorMode, deletable })

  const toBoard = (policyId: string) => store.go({ name: 'board', policyId, from: { appId: app.id } })

  return (
    <div className={GLANCE ? 'apol is-glance' : 'apol'} style={GLANCE ? ({ '--apol-rows': stage.rows } as CSSProperties) : undefined}>
      <header className="apol__head">
        <div className="apol__title">
          <div className="apol__nameline">
            {/* Focused when the board's Back or an attach lands on it (ApplicationPage.tsx `focusRow`). */}
            <h2 tabIndex={-1} data-policy-id={policy.id} data-tab-head>
              {policy.name}
            </h2>
            <StatusMenu policy={policy} items={menu} onSelect={onMenu} />
          </div>
          <CoversLine app={app} policy={policy} covered={coverage.covered} onTab={onTab} />
        </div>
        <div className="apol__acts">
          <Button variant="secondary" icon={Replace} onClick={onReplace}>
            Replace policy
          </Button>
          <Button variant={saving ? 'secondary' : 'brand'} icon={Pencil} onClick={() => toBoard(policy.id)}>
            Edit
          </Button>
        </div>
      </header>

      {notice && (
        <StateLine
          notice={notice}
          app={app}
          others={others}
          reduced={chain.reduced}
          onEditOther={toBoard}
          onRemoveOther={onRemoveOther}
          onReview={() => toBoard(policy.id)}
          onTurnOn={() => onMenu('active')}
          onViewMonitoring={() => onMenu('view-monitoring')}
        />
      )}

      {GLANCE ? (
        /* One stage, two panels of one height (20 Oct 2026): the rules, Global Default as their foot, and the sign-ins
           paged beside them. `--apol-rows` on the tab is the page size the frame height is drawn from. */
        <div className="apol__pair is-glance" ref={stage.ref}>
          <RulesPanel app={app} policy={policy} globalDefault={globalDefault} everyoneElse={everyoneElse} everyoneElseCount={coverage.everyoneElse} glance={glance} />
          <GlanceActivity
            app={app}
            policy={policy}
            globalDefault={globalDefault}
            rule={glance.rule}
            onRule={glance.setRule}
            picked={glance.picked}
            onPick={glance.pick}
            size={stage.rows}
            onShowRule={stacked ? showRuleOf(glance, policy, globalDefault) : undefined}
            reduced={glance.reduced}
          />
        </div>
      ) : (
        /* The rules canvas and Sign-in activity share one row (19 Oct 2026); Changes is gone from the tab. */
        <div className="apol__pair">
          <PolicyChain
            app={app}
            policy={policy}
            globalDefault={globalDefault}
            everyoneElse={everyoneElse}
            open={chain.open}
            onToggle={chain.toggle}
            itemRef={chain.itemRef}
            editable
            everyoneElseCount={coverage.everyoneElse}
          />
          <AppActivity app={app} policy={policy} globalDefault={globalDefault} onRule={chain.show} reduced={chain.reduced} />
        </div>
      )}

      {hasRail && (
        <div className="apol__band is-solo">
          <div className="apol__rail">
            <PostSignInLinks app={app} onTab={onTab} />
            {BREAK_IN_ON_APP && <AppBreakIn appId={app.id} appName={app.name} />}
          </div>
        </div>
      )}
    </div>
  )
}

/* --- The tab, with no policy: the Global Default is what the application gets ----------

   The page keeps its shape. The head says there is no policy and offers the two
   ways to give it one; the chain is the Global Default's own rules, read only —
   the way to change this application's outcome is a policy of its own. */
export function AppNoPolicyView({
  app,
  globalDefault,
  saving,
  onNew,
  onAdd,
  onTab,
}: {
  app: App
  globalDefault: Policy | null
  saving: boolean
  onNew: () => void
  /** Add existing policy; absent when there is nothing to attach. */
  onAdd?: () => void
  onTab: Tab
}) {
  const store = useBrand()
  const chain = useChainOpen(null)
  const glance = useGlance(null, globalDefault)
  const stacked = useMedia(STACKED)
  const stage = useGlanceRows(stacked)
  const hasRail = linkedTo(app.id, store.policies).length > 0
  return (
    <div className={GLANCE ? 'apol is-glance' : 'apol'} style={GLANCE ? ({ '--apol-rows': stage.rows } as CSSProperties) : undefined}>
      <header className="apol__head">
        <div className="apol__title">
          <div className="apol__nameline">
            {/* Focused when a Remove or a Delete draft takes the policy, and its menu, away (ApplicationPage.tsx `focusHead`). */}
            <h2 tabIndex={-1} data-tab-head>
              No policy on {app.name}
            </h2>
          </div>
          {globalDefault && (
            <p className="apol__gdhead">
              <span>{globalDefault.name}</span>
              <Badge tone="system">System</Badge>
              <button type="button" className="apol__link" onClick={() => store.go({ name: 'board', policyId: globalDefault.id, from: { appId: app.id } })}>
                Open Global Default
                <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
              </button>
            </p>
          )}
        </div>
        <div className="apol__acts">
          {onAdd && (
            <Button variant="secondary" icon={ListPlus} onClick={onAdd}>
              Add existing policy
            </Button>
          )}
          <Button variant={saving ? 'secondary' : 'brand'} icon={Plus} onClick={onNew}>
            Create new policy
          </Button>
        </div>
      </header>

      {GLANCE ? (
        /* The same stage as with a policy (20 Oct 2026): the Global Default's own rules as the canvas, with no foot —
           nothing is outside it — and the sign-ins beside them. Post sign-in leaves the band it shared with the
           activity for the band under the stage, so the tab has one grammar. */
        <>
          <div className="apol__pair is-glance" ref={stage.ref}>
            <RulesPanel app={app} policy={null} globalDefault={globalDefault} everyoneElse={null} everyoneElseCount={0} glance={glance} />
            <GlanceActivity
              app={app}
              policy={null}
              globalDefault={globalDefault}
              rule={glance.rule}
              onRule={glance.setRule}
              picked={glance.picked}
              onPick={glance.pick}
              size={stage.rows}
              onShowRule={stacked ? showRuleOf(glance, null, globalDefault) : undefined}
              reduced={glance.reduced}
            />
          </div>
          {hasRail && (
            <div className="apol__band is-solo">
              <div className="apol__rail">
                <PostSignInLinks app={app} onTab={onTab} />
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <PolicyChain
            app={app}
            policy={null}
            globalDefault={globalDefault}
            everyoneElse={null}
            open={chain.open}
            onToggle={chain.toggle}
            itemRef={chain.itemRef}
            editable={false}
            everyoneElseCount={0}
          />

          <div className={`apol__band${hasRail ? '' : ' is-solo'}`}>
            <AppActivity app={app} policy={null} globalDefault={globalDefault} onRule={chain.show} reduced={chain.reduced} />
            {hasRail && (
              <div className="apol__rail">
                <PostSignInLinks app={app} onTab={onTab} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
