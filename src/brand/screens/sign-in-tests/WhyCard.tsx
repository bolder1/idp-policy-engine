import { useId, type RefObject } from 'react'
import { ArrowUpRight, ChevronRight, CircleHelp, Info, Layers, ListOrdered, PowerOff, TriangleAlert, UserMinus, Users, X, type LucideIcon } from 'lucide-react'

import type { Policy } from '../../data'
import { CantTell, DecisionBadge } from '../../decision-badge'
import { Face } from '../../faces'
import { TipDot } from '../../kit'
import { REVIEW_ATTEMPTS, attemptsOnSaid, type AppBreakInSummary } from '../break-in-app'
import { BREAK_IN_TIP } from '../break-in-model'
import type { NameLookup } from '../predicate-prose'
import type { FormField } from '../testing/sign-in-form'
import { AttemptCells } from './BreakInPanel'
import type { EngineRun } from './engine-run'
import type { GroupRowView, WhyAction, WhyIcon, WhyItem, WhyTone } from './journey'
import { ConflictRuleCard } from './RunChain'

/* -----------------------------------------------------------------------------
   Why — the troubleshooting view under the answer (owner, 1 Oct: "one person
   is in both groups … how can the user troubleshoot it? … if we have a
   conflict how do we show it? … how can they understand things faster").

   A section under the hero, not the policy's card unfolded: the question is
   asked where the answer is read ("Why?" on its one line), so the why opens
   right there, under it, and reads top to bottom — the answer, then why —
   while the policy's card above stays what the engine did. And much of what
   it says is not about the policy that decided at all: another policy that
   covers the person, one switched off, a draft, no policy for their group.
   The answer folds to its one line as the why opens, so the decision stays
   in view and What they see gives the why its room.

     ┌ ⚠ Maya Iyer is in Engineering and Finance — Engineering's rule applies first   × ┐
     │ As each group                                                                     │
     │   [EN] As Engineering    [Allow on 1 factor]   Rule 1 · In the office …        ›   │
     │   [FI] As Finance        [Allow with 2FA]      Rule 3 · Finance, on a …        ›   │
     │   [MI] As Maya (both)    [Allow on 1 factor]   Engineering's rule comes first      │
     │ ┌ 3  Finance, on a compliant device                    [Also applies] ┐          │
     │ │    who  [FI] via Finance ✓ · if … ✓ · then Password → Google Auth…   │          │
     │ │  ⚠ Also applies to Maya Iyer · via Finance                Open rule │          │
     │ │    Not used: Rule 1 matched first via Engineering, and the first …  │          │
     │ │    Move it above rule 1 to ask Finance for 2FA                       │          │
     │ └────────────────────────────────────────────────────────────────────┘          │
     │ ⏻ Code review for Finance · Draft · via Finance                  Open policy ↗    │
     │   Draft — on, it would change nothing: Developer tools … comes first              │
     └──────────────────────────────────────────────────────────────────────────────────┘

   Its title is the answer's line, carried down as the answer folds. Then
   "As each group" (a person in two groups or more): each group alone and the
   person, each answer a decision, where it comes from, and on the person's own
   row — the answer on screen — why it is theirs; a group's row pressed runs
   the sign-in again as "Anyone in <group>". Then every finding, ranked as the
   model ranks them (conflicts.ts `findings`), in its words: a rule that also
   applies as its card, whole, its notice in its foot saying WHY it was not
   used (the model's `why` — "Naming Thomas Byrne does not move a rule up …"),
   then the fix; everything else ONE line with its mark, its tone and at most
   one action. Another policy that covers the person is named first, as a
   quiet link that opens it; its one action is the fix, where the fix is made
   — the rule of the policy that decides (`fixAt`). No policy covering them:
   their groups once, then each policy by name and who it covers. Yellow is a
   conflict and what can't be told; the rest is quiet. Tokens only; nothing
   here moves but the drawer it opens in (EngineJourney.tsx, motion's height).

   Break-in attempts on the application, last, in a section of their own
   (owner, 1 Oct 2026: "can we implement it in the check part? as a
   suggestion inside conflicts or somewhere else"): never mixed into the
   findings, which are about this person — the attempts are about the
   application, the fifteen scripted sign-ins played on it across the tenant
   (break-in-app.ts).

     ─────────────────────────────────────────────────────────────────
     Break-in attempts on AWS Console ⓘ
     [ 3 Got through ] [ 0 Weaker factor ] [ 2 Locked out ] [ 0 Extra prompts ]
                                                         Review attempts ›

   The four counts, each once, a hole that is not 0 in the conflict tone and
   a 0 quiet; Review attempts opens them in the panel (BreakInPanel.tsx), with
   a way back here. A why with no finding but the attempts is titled by them,
   and the section does not say its label again. The builder's Check access
   never passes them.
   -------------------------------------------------------------------------- */

const MARK: Record<WhyIcon, LucideIcon> = {
  rule: ListOrdered,
  exception: UserMinus,
  policy: Layers,
  off: PowerOff,
  depends: CircleHelp,
  cover: Users,
}

const HEAD_MARK: Record<WhyTone, LucideIcon> = { conflict: TriangleAlert, depends: CircleHelp, info: Info }

export interface WhyCardProps {
  plan: EngineRun
  items: readonly WhyItem[]
  groups: readonly GroupRowView[] | null
  /** The why's title (journey.ts `whyTitle`): the answer's line, or — only the quiet to say — the top finding's. */
  headline: { text: string; tone: WhyTone }
  /** The policies the run was resolved against: a rule that also applies is drawn from these. */
  policies: readonly Policy[]
  resolve: NameLookup
  /** The person, by name, as the notices say it. */
  person: string
  /** The section's id: the answer's Why? and the policy's count control it. */
  id: string
  titleRef?: RefObject<HTMLHeadingElement | null>
  /** Presses act (the run is done, the card not open over it). */
  interactive: boolean
  onClose: () => void
  onOpenRule: (policyId: string, ruleId: string) => void
  onOpenPolicy: (policyId: string) => void
  onAdd: (field: FormField) => void
  /** A group's row pressed: the sign-in runs again as "Anyone in <group>". Absent, the rows are only read. */
  onAsGroup?: (groupId: string) => void
  /* Break-in attempts on the application (break-in-app.ts): their counts,
     and Review attempts, which opens them. Absent — the builder's Check
     access — the why says nothing of them. */
  breakIn?: { summary: AppBreakInSummary; onReview: () => void } | null
}

export function WhyCard({ plan, items, groups, headline, policies, resolve, person, id, titleRef, interactive, onClose, onOpenRule, onOpenPolicy, onAdd, onAsGroup, breakIn = null }: WhyCardProps) {
  const titleId = useId()
  const groupsId = useId()
  const attemptsId = useId()
  /* The attempts' label, unless there is no finding: then the why's title says it, once. */
  const labelled = items.length > 0
  const HeadMark = HEAD_MARK[headline.tone]
  const stored = plan.decider ? (policies.find((p) => p.id === plan.decider!.id) ?? null) : null
  const act = (a: WhyAction) => {
    if (a.kind === 'rule' && a.ruleId) onOpenRule(a.policyId, a.ruleId)
    else if (a.kind === 'fact' && a.field) onAdd(a.field)
    else onOpenPolicy(a.policyId)
  }
  const tab = interactive ? undefined : -1

  return (
    <section id={id} className="tj-why" data-node="why" aria-labelledby={titleId}>
      <header className="tj-why__top">
        <span className={`tj-why__mark is-${headline.tone}`} aria-hidden>
          <HeadMark size={14} strokeWidth={2.2} />
        </span>
        <h3 ref={titleRef} id={titleId} className="tj-why__title" tabIndex={-1}>
          <span className="u-sr-only">Why: </span>
          {headline.text}
        </h3>
        <button type="button" className="bb__act tj-why__close" aria-label="Close why" title="Close" tabIndex={tab} onClick={onClose}>
          <X size={14} strokeWidth={2.2} />
        </button>
      </header>

      <div className="tj-why__body">
        {groups && (
          <section className="tj-why__sec" aria-labelledby={groupsId}>
            <p id={groupsId} className="tj-why__label">
              As each group
            </p>
            <ul className="tj-why__groups">
              {groups.map((g) => {
                const inner = (
                  <>
                    <span className="tj-why__face" aria-hidden>
                      <Face kind={g.groupId ? 'group' : 'user'} name={g.groupId ? g.label.replace(/^As /, '') : person} size="sm" decorative />
                    </span>
                    <span className="tj-why__glabel">{g.label}</span>
                    <span className="tj-why__gresult">
                      {g.status === 'decided' && g.decision ? <DecisionBadge decision={g.decision} /> : g.status === 'depends' ? <CantTell outcomes={g.possible} /> : <span className="tj-why__none">{g.words}</span>}
                    </span>
                    <span className="tj-why__gsource" title={g.source}>
                      {g.source}
                    </span>
                    <span className="tj-why__gend" aria-hidden>
                      {!g.current && onAsGroup && <ChevronRight size={14} strokeWidth={2} />}
                    </span>
                  </>
                )
                return (
                  <li key={g.key}>
                    {g.current || !g.groupId || !onAsGroup ? (
                      <div className={`tj-why__grow${g.current ? ' is-current' : ''}`} {...(g.current ? { 'aria-current': 'true' as const } : null)}>
                        {inner}
                        {g.current && <span className="u-sr-only"> — this sign-in</span>}
                      </div>
                    ) : (
                      <button type="button" className="tj-why__grow" tabIndex={tab} title={`Run as anyone in ${g.label.replace(/^As /, '')}`} onClick={() => onAsGroup(g.groupId!)}>
                        {inner}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {items.length > 0 && (
          <ul className="tj-why__list" aria-label="Findings">
            {items.map((it) => {
              const r = it.rule ? plan.rules.find((x) => x.id === it.rule!.ruleId) : undefined
              const rule = r && stored ? stored.rules.find((x) => x.id === r.id) : undefined
              if (it.rule && r && rule) {
                return (
                  <li key={it.key} className="tj-why__rule" data-kind={it.kind}>
                    <ConflictRuleCard r={r} rule={rule} c={it.rule} why={it.detail} resolve={resolve} person={person} onOpen={interactive && it.action?.ruleId ? () => act(it.action!) : undefined} />
                  </li>
                )
              }
              const Mark = MARK[it.icon]
              return (
                <li key={it.key} className={`tj-why__item is-${it.tone}`} data-kind={it.kind}>
                  <span className="tj-why__icon" aria-hidden>
                    <Mark size={14} strokeWidth={2.1} />
                  </span>
                  <div className="tj-why__text">
                    <p className="tj-why__line">
                      <span className="tj-why__head">
                        {it.link && (
                          <>
                            {interactive ? (
                              <button type="button" className="tj-why__name" title={`Open ${it.link.label}`} onClick={() => onOpenPolicy(it.link!.policyId)}>
                                {it.link.label}
                              </button>
                            ) : (
                              it.link.label
                            )}{' '}
                          </>
                        )}
                        {it.head}
                      </span>
                      {it.would &&
                        (it.would.decision ? (
                          <DecisionBadge decision={it.would.decision} className="tj-why__would" />
                        ) : it.would.possible.length > 0 ? (
                          <CantTell outcomes={it.would.possible} className="tj-why__would" />
                        ) : null)}
                    </p>
                    {it.detail && <p className="tj-why__detail">{it.detail}</p>}
                    {it.covers.length > 0 && (
                      <ul className="tj-why__covers" aria-label="Who each policy covers">
                        {it.covers.map((m) => (
                          <li key={m.policyId}>
                            {interactive ? (
                              <button type="button" className="tj-why__name" title={`Open ${m.name}`} onClick={() => onOpenPolicy(m.policyId)}>
                                {m.name}
                              </button>
                            ) : (
                              <span className="tj-why__cname">{m.name}</span>
                            )}
                            <span className="tj-why__caud">{m.audience}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {it.outcomes.length > 0 && (
                      <p className="tj-why__ifs">
                        {it.outcomes.map((o, i) => (
                          <span key={`${o.where}:${o.decision}:${i}`} className="tj-why__if">
                            <span>{o.where}</span>
                            <DecisionBadge decision={o.decision} />
                          </span>
                        ))}
                      </p>
                    )}
                    {it.fix && <p className="tj-why__fix">{it.fix}</p>}
                    {it.caution && <p className="tj-why__caution">{it.caution}</p>}
                  </div>
                  {it.action && interactive && (
                    <button type="button" className="tj-conflict__open tj-why__act" onClick={() => act(it.action!)}>
                      {it.action.label}
                      {it.action.kind !== 'fact' && <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {breakIn && (
          <section className="tj-why__sec tj-why__att" aria-labelledby={labelled ? attemptsId : titleId}>
            {labelled && (
              <p id={attemptsId} className="tj-why__label tj-why__attlabel">
                <span>{attemptsOnSaid(breakIn.summary.appName)}</span>
                <TipDot text={BREAK_IN_TIP} label="About break-in attempts" />
              </p>
            )}
            <AttemptCells counts={breakIn.summary.counts} />
            {(!labelled || interactive) && (
              <div className="tj-why__attfoot">
                {!labelled && <TipDot text={BREAK_IN_TIP} label="About break-in attempts" />}
                {interactive && (
                  <button type="button" className="tj-conflict__open tj-why__attgo" onClick={breakIn.onReview}>
                    {REVIEW_ATTEMPTS}
                    <ChevronRight size={12} strokeWidth={2.2} aria-hidden />
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </section>
  )
}
