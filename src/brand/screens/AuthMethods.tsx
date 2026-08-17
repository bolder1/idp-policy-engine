import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useState } from 'react'
import { AlertTriangle, ChevronDown, KeyRound, Settings2, ShieldCheck } from 'lucide-react'

import { PageHead } from '../Shell'
import { Button, Callout, Modal, Toggle } from '../kit'
import {
  AUTH_METHODS,
  DEFAULT_METHOD_ID,
  METHOD_TIERS,
  methodBlocker,
  methodById,
  type AuthMethod,
} from '../methods'
import { useBrand } from '../store'
import { configFor } from '../method-config'
import { ConfigureMethodDialog } from './method-forms'
import { MethodSetsTab } from './method-sets'

/* -----------------------------------------------------------------------------
   Authentication methods — one page for what the console spreads over five.

   The console has: Setup 2FA for Admin (per-method config, grouped by delivery
   channel), 2FA Options For EndUsers (a flat list of 21 checkboxes, plus the
   default, plus a shared "Advanced Options" tab), Alternate 2FA Login Methods
   (recovery), Assign Hardware Token (inventory) and Static Code Generation.
   Two more settings are not in the 2FA section at all — Advanced Options points
   you at Product Settings → Users → User Onboarding.

   Three things changed in consolidating them:

   · A method's four states sit on the method. Configured, active, allowed and
     default were spread across two pages, so "why can't this user pick Google
     Authenticator?" needed both of them and a guess. They are now one row, in
     the order you have to fix them.
   · Method-specific settings live on the method. Grid Pattern's size and
     pattern length, miniOrange's number matching — these were in a shared
     Advanced tab, filed under nothing in particular.
   · Methods group by assurance rather than delivery channel. Whether a factor
     is phishable is the decision being made; SMS-versus-email is not.
   -------------------------------------------------------------------------- */

type Tab = 'catalogue' | 'sets' | 'enrolment' | 'recovery' | 'tokens'

export function AuthMethods({ initialTab = 'catalogue' }: { initialTab?: Tab } = {}) {
  const store = useBrand()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [methods, setMethods] = useState<AuthMethod[]>(AUTH_METHODS)
  const [defaultId, setDefaultId] = useState(DEFAULT_METHOD_ID)
  const [open, setOpen] = useState<string | null>(null)
  const [configuring, setConfiguring] = useState<AuthMethod | null>(null)

  const usable = methods.filter((m) => !methodBlocker(m))
  const resistant = usable.filter((m) => m.tier === 'Phishing-resistant').length

  function patch(id: string, p: Partial<AuthMethod>) {
    setMethods((all) => all.map((m) => (m.id === id ? { ...m, ...p } : m)))
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'catalogue', label: 'Methods', count: usable.length },
    { id: 'sets', label: 'Method sets', count: store.methodSets.length },
    { id: 'enrolment', label: 'Enrolment' },
    { id: 'recovery', label: 'Recovery' },
    { id: 'tokens', label: 'Hardware tokens' },
  ]

  return (
    <div className="bpage">
      <PageHead
        title="Authentication methods"
        caption="Everything about how users prove who they are — what exists, what they may choose, and the sets your policies reference."
        actions={<Button variant="brand">Save changes</Button>}
      />

      {/* The three facts that decide whether the tenant is in good shape. */}
      <div className="bmset__facts bam__facts">
        <div className="bmset__fact">
          <span>Available to users</span>
          <strong>
            {usable.length} <em>of {methods.length}</em>
          </strong>
        </div>
        <div className="bmset__fact">
          <span>Phishing-resistant</span>
          <strong className={resistant > 0 ? 'is-good' : 'is-bad'}>{resistant}</strong>
        </div>
        <div className="bmset__fact">
          <span>Default for new users</span>
          <strong>{methodById(defaultId)?.name ?? '—'}</strong>
        </div>
      </div>

      <div className="bviewswitch bam__tabs" role="tablist" aria-label="Authentication sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'is-on' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count !== undefined && <em className="bcp__count">{t.count}</em>}
          </button>
        ))}
      </div>

      {tab === 'catalogue' && (
        <>
          {resistant === 0 && (
            <Callout tone="notice" title="No phishing-resistant method is available">
              Every method a user can currently pick can be phished, replayed, or intercepted. Configuring
              FIDO2 / Passkey gives them one that cannot.
            </Callout>
          )}

          {METHOD_TIERS.map((tier) => {
            const rows = methods.filter((m) => m.tier === tier.name)
            const on = rows.filter((m) => !methodBlocker(m)).length
            return (
              <section key={tier.name} className="bam__tier">
                <header className="bam__tierhead">
                  <div>
                    <h2>
                      {tier.name === 'Phishing-resistant' && <ShieldCheck size={15} strokeWidth={1.9} aria-hidden />}
                      {tier.name}
                    </h2>
                    <p>{tier.blurb}</p>
                  </div>
                  <span className="bmset__count">{on} of {rows.length} available</span>
                </header>

                {rows.map((m) => (
                  <MethodRow
                    key={m.id}
                    m={m}
                    isDefault={defaultId === m.id}
                    expanded={open === m.id}
                    onExpand={() => setOpen(open === m.id ? null : m.id)}
                    onPatch={(p) => patch(m.id, p)}
                    onMakeDefault={() => setDefaultId(m.id)}
                    onConfigure={() => setConfiguring(m)}
                  />
                ))}
              </section>
            )
          })}
        </>
      )}

      {tab === 'sets' && <MethodSetsTab />}
      {tab === 'enrolment' && <EnrolmentTab methods={methods} />}
      {tab === 'recovery' && <RecoveryTab methods={methods} />}
      {tab === 'tokens' && <TokensTab />}

      <ConfigureMethodDialog
        open={configuring !== null}
        method={configuring}
        onClose={() => setConfiguring(null)}
        onSave={(id, configured) => {
          /* A draft save leaves `configured` false, so the catalogue keeps
             reporting "Not configured yet" rather than claiming a half-filled
             integration is ready. */
          patch(id, { configured })
          setConfiguring(null)
          store.showToast(
            configured
              ? `${methods.find((m) => m.id === id)?.name} is configured`
              : 'Draft saved — still missing required settings',
          )
        }}
      />
    </div>
  )
}

/* --- One method, with all four of its states ------------------------------- */

function MethodRow({
  m,
  isDefault,
  expanded,
  onExpand,
  onPatch,
  onMakeDefault,
  onConfigure,
}: {
  m: AuthMethod
  isDefault: boolean
  expanded: boolean
  onExpand: () => void
  onPatch: (p: Partial<AuthMethod>) => void
  onMakeDefault: () => void
  onConfigure: () => void
}) {
  const blocker = methodBlocker(m)
  const hasDetail = !!m.settings || !!m.balance
  const configurable = configFor(m.id) !== null

  return (
    <div className={`bam__row ${blocker ? 'is-blocked' : ''}`}>
      <div className="bam__main">
        <div className="bam__body">
          <p className="bam__name">
            {m.name}
            <span className="bam__chan">{m.channel}</span>
            {isDefault && <span className="bmset__tag is-good">Default</span>}
            {m.alsoRecovery && <span className="bmset__tag">Also used in Recovery</span>}
          </p>
          <p className="bmset__desc">{m.description}</p>

          <p className="bam__meta">
            {/* The states in the order they have to be fixed — activating an
                unconfigured method silently does nothing. */}
            <span className={`bam__state ${m.configured ? 'is-yes' : 'is-no'}`}>
              {m.configured ? 'Configured' : 'Not configured'}
            </span>
            <span className={`bam__state ${m.active ? 'is-yes' : 'is-no'}`}>
              {m.active ? 'Active' : 'Inactive'}
            </span>
            <span className={`bam__state ${m.allowed ? 'is-yes' : 'is-no'}`}>
              {m.allowed ? 'Offered to users' : 'Not offered'}
            </span>
            {m.enrolled !== undefined && <span className="bam__enrol">{m.enrolled.toLocaleString()} enrolled</span>}
          </p>

          {blocker && (
            <p className="bam__blocker">
              {blocker}
              {/* "Not configured yet" was the one blocker with nowhere to go.
                  Activating an unconfigured method silently does nothing, so
                  the fix belongs on the line that reports it. */}
              {!m.configured && configurable && (
                <button type="button" className="bam__fix" onClick={onConfigure}>
                  Configure {m.name} →
                </button>
              )}
            </p>
          )}
        </div>

        <div className="bam__acts">
          {configurable && (
            <button type="button" className="bam__cog" onClick={onConfigure} aria-label={`Configure ${m.name}`} title="Configure">
              <Settings2 size={15} strokeWidth={1.9} />
            </button>
          )}
          <Toggle
            checked={m.active}
            disabled={!m.configured}
            label={`Activate ${m.name}`}
            /* Deactivating does NOT clear `allowed`. The two are separate
               pages in the console and they drift apart there; normalising it
               here would hide the very state this page exists to surface, and
               would silently discard the admin's end-user choice on a toggle
               they may flip back in a minute. The blocker line says which of
               the two is actually standing in the way. */
            onChange={(v) => onPatch({ active: v })}
          />
          {hasDetail && (
            <button
              type="button"
              className="bam__more"
              onClick={onExpand}
              aria-expanded={expanded}
              aria-label={`Settings for ${m.name}`}
            >
              <ChevronDown size={15} strokeWidth={1.9} className={expanded ? 'is-open' : ''} />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="bam__detail">
              {m.balance && (
                <p className={`bam__balance ${m.balance.remaining === 0 ? 'is-empty' : ''}`}>
                  {m.balance.remaining === 0 ? (
                    <>
                      <AlertTriangle size={13} strokeWidth={1.9} aria-hidden />
                      No {m.balance.label.toLowerCase()} left — this method will fail at sign-in until
                      more are purchased.
                    </>
                  ) : (
                    `${m.balance.remaining.toLocaleString()} ${m.balance.label.toLowerCase()} remaining`
                  )}
                </p>
              )}

              {/* Settings that the console files under a shared "Advanced
                  Options" tab, put back on the method they configure. */}
              {m.settings?.map((s) => (
                <div key={s.id} className="bam__setting">
                  <div>
                    <p>{s.label}</p>
                    {s.help && <span>{s.help}</span>}
                  </div>
                  {s.kind === 'toggle' ? (
                    <Toggle
                      checked={s.value}
                      label={s.label}
                      onChange={(v) =>
                        onPatch({
                          settings: m.settings!.map((x) =>
                            x.id === s.id && x.kind === 'toggle' ? { ...x, value: v } : x,
                          ),
                        })
                      }
                    />
                  ) : (
                    <select
                      aria-label={s.label}
                      value={s.value}
                      onChange={(e) =>
                        onPatch({
                          settings: m.settings!.map((x) =>
                            x.id === s.id && x.kind === 'select' ? { ...x, value: e.target.value } : x,
                          ),
                        })
                      }
                    >
                      {s.options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}

              <div className="bam__detailfoot">
                <label className="bam__check">
                  <input
                    type="checkbox"
                    checked={m.allowed}
                    disabled={!m.active}
                    onChange={(e) => onPatch({ allowed: e.target.checked })}
                  />
                  Let users pick this during enrolment
                </label>
                {m.canBeDefault && !isDefault && (
                  <button type="button" className="bam__link" onClick={onMakeDefault}>
                    Make this the default
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* --- Enrolment, recovery, tokens ------------------------------------------- */

function EnrolmentTab({ methods }: { methods: AuthMethod[] }) {
  const offered = methods.filter((m) => !methodBlocker(m))
  /* Real state, not decoration. These were four toggles with `onChange={() => {}}`
     — controls that move and change nothing, which is worse than no control at
     all because it teaches that the page does not work. */
  const [enforce, setEnforce] = useState(true)
  const [grace, setGrace] = useState('7')
  const [userChoice, setUserChoice] = useState(false)
  const [instructions, setInstructions] = useState(true)

  return (
    <div className="bam__pane">
      <Callout tone="info" title="These two settings live under Users → Onboarding in the console">
        Enrolment enforcement and the grace period are 2FA decisions, so they are here. Nothing about them
        belongs in a different section of the product.
      </Callout>

      <div className="bam__setting">
        <div>
          <p>Enforce 2FA setup on first login</p>
          <span>Users who have not enrolled must do so before they can reach any app.</span>
        </div>
        <Toggle checked={enforce} label="Enforce 2FA setup on first login" onChange={setEnforce} />
      </div>

      {enforce && (
        <div className="bam__setting is-sub">
          <div>
            <p>Grace period</p>
            <span>Days before enforcement applies. Prevents a lockout on the day you roll this out.</span>
          </div>
          <span className="bmc__number">
            <select aria-label="Grace period" value={grace} onChange={(e) => setGrace(e.target.value)}>
              {['0', '3', '7', '14', '30'].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <em>days</em>
          </span>
        </div>
      )}

      {enforce && grace === '0' && (
        <p className="bam__warn">
          <AlertTriangle size={13} strokeWidth={2} aria-hidden />
          With no grace period, everyone who has not already enrolled is locked out the moment this saves.
        </p>
      )}

      <div className="bam__setting">
        <div>
          <p>Let users choose their method at sign-in</p>
          <span>Off means they always use their default until they change it in self-service.</span>
        </div>
        <Toggle checked={userChoice} label="Let users choose their method at sign-in" onChange={setUserChoice} />
      </div>
      <div className="bam__setting">
        <div>
          <p>Send setup instructions</p>
          <span>
            miniOrange Authenticator gets a setup link by SMS or email; other apps get a QR code by email.
          </span>
        </div>
        <Toggle checked={instructions} label="Send setup instructions" onChange={setInstructions} />
      </div>

      <p className="u-label bam__sub">Available at enrolment</p>
      <p className="bam__note">
        Derived from the catalogue — a method appears here when it is configured, active, and offered to
        users. There is no second list to keep in step.
      </p>
      {offered.length === 0 ? (
        <p className="bam__warn">
          <AlertTriangle size={13} strokeWidth={2} aria-hidden />
          Nothing is available, so enrolment cannot complete for anyone. Enforcing it would lock out the
          whole tenant.
        </p>
      ) : (
        <div className="bam__chips">
          {offered.map((m) => (
            <span key={m.id} className="bpick__chip">
              {m.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function RecoveryTab({ methods }: { methods: AuthMethod[] }) {
  const kba = methods.find((m) => m.id === 'kba')!
  const alt = methods.find((m) => m.id === 'otp-alt-email')!
  const [forgotPhone, setForgotPhone] = useState(true)
  const [choice, setChoice] = useState('kba')
  const [backupCodes, setBackupCodes] = useState(true)
  const [codeCount, setCodeCount] = useState('10')

  const options = [
    { id: 'kba', label: 'Security Questions (KBA)', dep: kba },
    { id: 'alt', label: 'OTP over Alternate Email', dep: alt },
    { id: 'both', label: 'Both — highest assurance', dep: null },
  ]
  const chosen = options.find((o) => o.id === choice)
  const chosenBlocked = chosen?.dep ? methodBlocker(chosen.dep) : null

  return (
    <div className="bam__pane">
      <div className="bam__setting">
        <div>
          <p>Enable Forgot Phone</p>
          <span>Lets users recover access when their enrolled device is unavailable.</span>
        </div>
        <Toggle checked={forgotPhone} label="Enable Forgot Phone" onChange={setForgotPhone} />
      </div>

      {forgotPhone && (
        <>
          <p className="u-label bam__sub">Recovery method</p>
          {options.map((o) => {
            const blocked = o.dep ? methodBlocker(o.dep) : null
            return (
              <label
                key={o.id}
                className={`bam__radio ${blocked ? 'is-blocked' : ''} ${choice === o.id ? 'is-on' : ''}`}
              >
                <input
                  type="radio"
                  name="recovery"
                  checked={choice === o.id}
                  disabled={!!blocked}
                  onChange={() => setChoice(o.id)}
                />
                <span>
                  {o.label}
                  {/* The dependency the console states in prose. Drawn from the
                      same catalogue, so it cannot fall out of step with it. */}
                  {blocked && (
                    <em>
                      Needs {o.dep!.name} — {blocked.toLowerCase()}
                    </em>
                  )}
                </span>
              </label>
            )
          })}

          {/* Recovery is the path around every other factor, so a broken one is
              not a degraded feature — it is a locked-out user with no route
              back to their account. */}
          {chosenBlocked && (
            <p className="bam__warn">
              <AlertTriangle size={13} strokeWidth={2} aria-hidden />
              The selected recovery method cannot run, so Forgot Phone leads nowhere. Either configure it, or
              turn Forgot Phone off rather than leaving a route that fails at the end.
            </p>
          )}
        </>
      )}

      <div className="bam__setting">
        <div>
          <p>Static backup codes</p>
          <span>Single-use codes a user can fall back on. 1,240 generated · 890 unused · 350 used.</span>
        </div>
        <Toggle checked={backupCodes} label="Static backup codes" onChange={setBackupCodes} />
      </div>

      {backupCodes && (
        <div className="bam__setting is-sub">
          <div>
            <p>Codes issued per user</p>
            <span>
              Each is single-use. Too few and a user runs out mid-incident; too many and a printed list
              becomes a standing risk of its own.
            </span>
          </div>
          <span className="bmc__number">
            <select aria-label="Codes issued per user" value={codeCount} onChange={(e) => setCodeCount(e.target.value)}>
              {['5', '10', '16', '20'].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <em>codes</em>
          </span>
        </div>
      )}
    </div>
  )
}

/* --- Hardware tokens -------------------------------------------------------- */

interface TokenRow {
  id: string
  user: string
  serial: string
  type: string
}

function TokensTab() {
  const store = useBrand()
  const [rows, setRows] = useState<TokenRow[]>([
    { id: 't1', user: 'priya.anand@acme.com', serial: 'YK-5C-0A91F', type: 'Yubikey OTP' },
    { id: 't2', user: 'sam.rivera@acme.com', serial: 'YK-5C-0A93B', type: 'Yubikey OTP' },
  ])
  const [assigning, setAssigning] = useState(false)

  return (
    <div className="bam__pane">
      <Callout tone="info" title="Inventory for the hardware methods in the catalogue">
        Yubikey and Display Token are assigned by serial number. A user without an assignment cannot use them
        however the policy is written.
      </Callout>

      <div className="btoolbar">
        <div className="btoolbar__right">
          <Button onClick={() => store.showToast('CSV import is not part of this prototype')}>Upload CSV</Button>
          <Button variant="brand" onClick={() => setAssigning(true)}>
            Assign token
          </Button>
        </div>
      </div>

      <div className="btable-wrap">
        <table className="btable">
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Serial number</th>
              <th scope="col">Type</th>
              <th scope="col" className="btable__right">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.user}</td>
                <td>
                  <code>{r.serial}</code>
                </td>
                <td>
                  <span className="bam__chan">
                    <KeyRound size={12} strokeWidth={1.9} aria-hidden /> {r.type}
                  </span>
                </td>
                <td className="btable__right">
                  <button
                    type="button"
                    className="bam__link"
                    onClick={() => {
                      setRows((all) => all.filter((x) => x.id !== r.id))
                      store.showToast(`${r.serial} unassigned from ${r.user}`)
                    }}
                  >
                    Unassign
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="bam__note bam__empty">
            No tokens are assigned. Every rule requiring a hardware method currently fails for everyone.
          </p>
        )}
      </div>

      <AssignTokenDialog
        open={assigning}
        taken={rows.map((r) => r.serial)}
        onClose={() => setAssigning(false)}
        onAssign={(row) => {
          setRows((all) => [...all, row])
          setAssigning(false)
          store.showToast(`${row.serial} assigned to ${row.user}`)
        }}
      />
    </div>
  )
}

function AssignTokenDialog({
  open,
  taken,
  onClose,
  onAssign,
}: {
  open: boolean
  taken: string[]
  onClose: () => void
  onAssign: (row: TokenRow) => void
}) {
  const uid = useId()
  const [user, setUser] = useState('')
  const [serial, setSerial] = useState('')
  const [type, setType] = useState('Yubikey OTP')

  useEffect(() => {
    if (!open) return
    setUser('')
    setSerial('')
    setType('Yubikey OTP')
  }, [open])

  const emailish = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user.trim())
  const userError = user.trim() === '' || emailish ? null : 'That does not look like an email address.'
  /* A serial assigned twice is a token two people believe they hold, and the
     second sign-in fails with nothing on screen explaining why. */
  const serialError = taken.includes(serial.trim().toUpperCase())
    ? 'That serial is already assigned to somebody.'
    : null
  const ready = emailish && serial.trim() !== '' && !serialError

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign a hardware token"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="brand"
            disabled={!ready}
            onClick={() =>
              onAssign({ id: `t${Date.now()}`, user: user.trim(), serial: serial.trim().toUpperCase(), type })
            }
          >
            Assign token
          </Button>
        </>
      }
    >
      <div className="bms__create">
        <div className="bms__field">
          <label htmlFor={`${uid}-u`}>
            User <b aria-hidden>*</b>
          </label>
          <input
            id={`${uid}-u`}
            autoFocus
            type="email"
            value={user}
            aria-invalid={!!userError}
            placeholder="name@acme.com"
            onChange={(e) => setUser(e.target.value)}
          />
          {userError && <p className="bms__err">{userError}</p>}
        </div>

        <div className="bms__field">
          <label htmlFor={`${uid}-s`}>
            Serial number <b aria-hidden>*</b>
          </label>
          <input
            id={`${uid}-s`}
            value={serial}
            aria-invalid={!!serialError}
            placeholder="YK-5C-0A91F"
            onChange={(e) => setSerial(e.target.value)}
          />
          {serialError ? (
            <p className="bms__err">{serialError}</p>
          ) : (
            <p className="bms__hint">
              Printed on the token. Stored uppercase, so the same key cannot be assigned twice under a
              different casing.
            </p>
          )}
        </div>

        <div className="bms__field">
          <label htmlFor={`${uid}-t`}>Token type</label>
          <select id={`${uid}-t`} value={type} onChange={(e) => setType(e.target.value)}>
            {['Yubikey OTP', 'Display Token', 'Vasco DIGIPASS'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  )
}
