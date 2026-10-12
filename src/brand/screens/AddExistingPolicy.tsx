import { useEffect, useMemo, useState } from 'react'

import { Callout, Drawer, StatusPill, TipDot } from '../kit'
import { Picker } from '../picker'
import { ChangeState } from '../leave-guard'
import { useBrand } from '../store'
import { appsOf, type App, type Policy } from '../data'
import { DECISION_WORDS } from '../decision-words'
import { listNames } from '../rule-who'
import { AlsoNote } from './AppProtection'
import { policyOption } from './policy-option'
import { attachKind, attachTo, listPhrase, rulesLabel, type AttachKind } from './app-policies'
import { appStanding, deciderChanges, rowTip, takenFrom, whoLabel } from './app-standing'
import { SliderActions } from './select-rows'
import { fallbackOf } from './simulate'

/* -----------------------------------------------------------------------------
   Add existing policy, from an application's Policies tab.

   A form and nothing else: the list it adds to is the page behind it, so the
   drawer does not draw it again. Pick a policy and the drawer says what it is
   — who it is for, its rules, what its last row does, where else it is — and
   where it would land on this application, read from the engine with the
   attach applied: its position, whom it takes over from, or that it would
   never decide.

   The picker files every policy by where it is now: unassigned first, then
   the ones on other applications, then the ones already here, greyed with the
   reason, as a policy that is not an app access policy is. The tenant default
   is never offered.

   The add itself is the page's (`onAdd`), so attaching from here and any other
   way the page grows go through the one write.
   -------------------------------------------------------------------------- */

const KIND_ORDER: Record<AttachKind, number> = { fresh: 0, also: 1, 'already-here': 2, system: 3 }

/* Whether `name` appears in `text` as a whole word, any case: "Box" in "Box
   for engineering" but not in "Dropbox". */
function hasWord(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(text)
}

/* Another of the policy's applications, named in its name or a deny message:
   attached here, "Deny access to Box" would say Box on this application too. */
function namedApp(p: Policy, others: App[]): App | null {
  const texts = [p.name, ...p.rules.map((r) => r.denyMessage ?? ''), p.fallback?.denyMessage ?? ''].filter(Boolean)
  return others.find((a) => texts.some((t) => hasWord(t, a.name))) ?? null
}

export function AddExistingPolicy({
  open,
  app,
  checking = false,
  onClose,
  onAdd,
  onCopy,
}: {
  open: boolean
  app: App
  /** Before saving: applications is running on the pick (board/apps-guard.ts): the add waits for it. */
  checking?: boolean
  onClose: () => void
  /** Puts the policy on this application: the page's one attach. False when it no longer exists; 'checking' when the checks run first, and the page closes this drawer once they let the add through. */
  onAdd: (policyId: string) => boolean | 'checking'
  /** A draft copy with this application alone, opened in the builder. False when the policy no longer exists. */
  onCopy: (policyId: string) => boolean
}) {
  const store = useBrand()
  const { policies, apps, groups, users } = store
  const [pickId, setPickId] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [gone, setGone] = useState(false)

  /* A fresh form each time it opens: one picked last time is not still picked. */
  useEffect(() => {
    if (!open) return
    setPickId(null)
    setTried(false)
    setGone(false)
  }, [open])

  const options = useMemo(
    () =>
      policies
        .filter((p) => !p.isSystem)
        .map((p) => ({ p, kind: attachKind(p, app.id) }))
        /* Stable, so each group keeps the list's own order. */
        .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
        .map(({ p }) => policyOption(p, app, { apps, groups, users })),
    [policies, app, apps, groups, users],
  )

  const picked = pickId ? (policies.find((p) => p.id === pickId) ?? null) : null
  /* Deleted since it was picked, or found gone when Add re-read it. */
  const lost = gone || (pickId !== null && !picked)
  const kind = picked ? attachKind(picked, app.id) : null

  /* Where it would stand here: the list with the attach applied, asked of the engine. */
  const placement = useMemo(() => {
    if (!picked) return null
    const after = policies.map((p) => (p.id === picked.id ? attachTo(p, app.id, apps) : p))
    const row = appStanding(app.id, after, users).rows.find((r) => r.policy.id === picked.id)
    if (!row) return null
    if (row.state === 'decides') {
      /* Every policy somebody leaves for it, people in two groups included:
         "AWS billing for Finance" on Box takes Maya Iyer off "Box for
         engineering" as well as Finance off the Global Default. */
      const froms = takenFrom(deciderChanges(app.id, policies, after, users, groups), picked.id).map((p) => p.name)
      return { text: `Position ${row.n}${froms.length > 0 ? ` · takes over from ${listNames(froms, 2)}` : ''}`, tip: null }
    }
    if (row.state === 'never') return { text: 'Never decides', tip: rowTip(row, groups, users) }
    if (row.state === 'monitor') return { text: 'Watches sign-ins, decides none', tip: null }
    return { text: 'Decides nothing until turned on', tip: null }
  }, [picked, policies, app.id, apps, users, groups])

  const others = picked ? appsOf(picked, apps).filter((a) => a.id !== app.id) : []
  const named = picked ? namedApp(picked, others) : null
  const denyMessage = picked && fallbackOf(picked) === 'deny' ? picked.fallback?.denyMessage : undefined

  const add = () => {
    setTried(true)
    if (!pickId || checking) return
    const added = onAdd(pickId)
    /* A policy that decides sign-ins is checked first: the drawer stays, and
       the page closes it once the add is made. */
    if (added === 'checking') return
    if (!added) {
      setGone(true)
      setPickId(null)
      return
    }
    onClose()
  }

  const copy = () => {
    if (!pickId) return
    if (!onCopy(pickId)) {
      setGone(true)
      setPickId(null)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add existing policy"
      caption={app.name}
      width={560}
      actions={
        <SliderActions
          onCancel={onClose}
          another={kind === 'also' ? { label: 'Add a copy', run: copy } : null}
          primary={{ label: checking ? 'Checking…' : `Add to ${app.name}`, run: add, disabled: !picked || checking }}
        />
      }
    >
      <div className="bapp__add">
        {/* Title only: what happened is the whole of it. */}
        {lost && (
          <Callout tone="notice" title="That policy no longer exists.">
            {null}
          </Callout>
        )}

        <div className="bmc__field">
          <div className="bmc__label">
            <span className="bdt__label">Policy</span>
          </div>
          <Picker
            label="Policy"
            width="fill"
            size="md"
            searchable
            noun="policies"
            placeholder="Choose a policy"
            invalid={tried && !picked}
            value={picked ? picked.id : null}
            options={options}
            onChange={(v) => {
              setPickId(v)
              setGone(false)
            }}
          />
        </div>

        {picked && (
          <>
            {/* Label over value, as the console's detail fields read. */}
            <dl className="bapp__preview">
              <div>
                <dt>Who</dt>
                <dd>{whoLabel(picked, groups, users)}</dd>
              </div>
              <div>
                <dt>Rules</dt>
                <dd>{rulesLabel(picked)}</dd>
              </div>
              <div>
                <dt>Nothing else matched</dt>
                <dd>
                  {DECISION_WORDS[fallbackOf(picked)]}
                  {denyMessage && <TipDot text={denyMessage} label="Deny message" />}
                </dd>
              </div>
              {kind === 'also' && (
                <div>
                  <dt>Also on</dt>
                  <dd>{listPhrase(others.map((a) => a.name))}</dd>
                </div>
              )}
              <div>
                <dt>Status</dt>
                <dd>
                  <StatusPill status={picked.status} />
                  {picked.pendingDraft && <ChangeState unsaved={false} draft />}
                </dd>
              </div>
              {placement && (
                <div>
                  <dt>On {app.name}</dt>
                  <dd>
                    {placement.text}
                    {placement.tip && <TipDot text={placement.tip} label={`About ${picked.name}`} />}
                  </dd>
                </div>
              )}
            </dl>

            {kind === 'also' && <AlsoNote picked={picked} />}
            {named && (
              <Callout tone="notice" title="Names another application">
                {named.name} appears in its name or a deny message.
              </Callout>
            )}
          </>
        )}
      </div>
    </Drawer>
  )
}
