import { SHOWCASE } from '../showcase'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Download, Eye, EyeOff, Plus, X } from 'lucide-react'

import {
  AUTHN_CONTEXTS,
  APP_NAME_MAX,
  BINDINGS,
  DESCRIPTION_MAX,
  NAME_ID_FORMATS,
  OIDC_SIGNATURE_ALGORITHMS,
  PROFILE_ATTRS,
  RELAY_STATES,
  SAML_SIGNATURE_ALGORITHMS,
  authnContextLabel,
  idpValues,
  isUrl,
  nameIdFormatLabel,
  randomHex,
  type AppSetup,
  type AttrRow,
  type Binding,
  type OidcSetup,
  type ProfileAttr,
  type RelayStateKind,
  type SamlSetup,
} from '../app-setup'
import { Button, IconButton, NumberStepper, TipDot, Toggle } from '../kit'
import { Picker } from '../picker'
import { useBrand, type AppTab } from '../store'
import { CLIENT_NOTE, type AppDraft, type BasicIssues } from './app-page-model'
import { SidePanel } from './device-profile-parts'
import type { ProfileNote } from './profile-notes'
import { CopyText } from './sign-in-tests/CopyText'

/* -----------------------------------------------------------------------------
   An application's setup, as the forms its tabs hold: Basic, Advanced,
   Sign-in options and Attributes, and the Metadata or Endpoints view
   (spec docs/specs/APP-CREATE-AND-ACCESS.md §3.2). One set of forms for the
   application not stored yet and the stored one, because create and edit are
   one form — the recorded complaint about the live console is that what can
   be set when an application is created cannot all be edited afterwards.

   The fields, their words and their order are the live console's (app-setup.ts
   holds them as data). The controls are this console's: a switch for on and
   off, a picker for a choice, the stepper for a number — product parity copies
   the fields, never the control types. Labels sit over fields, the method
   forms' grammar (`.bmc__field`); a switch sits beside its label.

   The live description lines are gone from under the fields. Where a wrong
   answer is likely — the SAML identifiers, the relay state, the validity
   period, shared identity, force authentication — the line is a TipDot,
   reworded to sign-in. Nowhere else: a field nobody gets wrong needs no help.

   Nothing here stores anything. Every change goes up through `onPatch` (the
   setup) or the draft's own setters, and the page decides what saving means.
   -------------------------------------------------------------------------- */

/** A change to the setup. The page merges it into the draft it holds. */
export type SetupPatch = (patch: Partial<SamlSetup> | Partial<OidcSetup>) => void

/* --- One field ---------------------------------------------------------------------

   Label over control, the problem under it. A control that names itself — a
   picker, a switch, a list — gets its label as text rather than a `<label>`
   pointing at nothing. */
function Row({
  label,
  htmlFor,
  required,
  tip,
  error,
  errorId,
  toggle,
  children,
}: {
  label: string
  /** The input the label names. */
  htmlFor?: string
  required?: boolean
  /** The live description, where a wrong answer is likely. */
  tip?: string
  error?: string
  errorId?: string
  /** A switch: the label and the control on one line. */
  toggle?: boolean
  children: ReactNode
}) {
  const name = (
    <>
      {label}
      {required && <b aria-hidden>*</b>}
    </>
  )
  return (
    <div className={`bmc__field${toggle ? ' is-toggle' : ''}`}>
      <div className="bmc__label">
        {htmlFor ? <label htmlFor={htmlFor}>{name}</label> : <span className="bapp__label">{name}</span>}
        {tip && <TipDot label={`About ${label}`} text={tip} />}
      </div>
      <div className="bmc__control">{children}</div>
      {error && (
        <p id={errorId} className="bmc__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  required,
  tip,
  error,
  placeholder,
  maxLength,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  tip?: string
  error?: string
  placeholder?: string
  maxLength?: number
}) {
  const id = useId()
  return (
    <Row label={label} htmlFor={id} required={required} tip={tip} error={error} errorId={`${id}-err`}>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        spellCheck={false}
        aria-required={required || undefined}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </Row>
  )
}

/* The form size, not `sm`: a small switch beside 40px fields reads as another
   class of control (device-profile-parts.tsx, the enrolment switches). */
function Switch({ label, tip, on, onChange }: { label: string; tip?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label} tip={tip} toggle>
      <Toggle checked={on} onChange={onChange} label={label} />
    </Row>
  )
}

function Choice<T extends string>({
  label,
  tip,
  value,
  options,
  onChange,
}: {
  label: string
  tip?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <Row label={label} tip={tip}>
      <Picker label={label} size="md" width="fill" value={value} options={options} onChange={(v) => onChange(v as T)} />
    </Row>
  )
}

/* The live fields' bounds were not read; these are assumed, and wide enough
   for any value an admin would set. The stepper clamps on commit, never per
   keystroke (kit NumberStepper). Its dense shape — minus, value, plus — as
   the method forms draw it inside `.bmc__control`, whose input rule sizes the
   value to its digits. */
function NumberField({
  label,
  tip,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  tip?: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
}) {
  const id = useId()
  return (
    <Row label={label} htmlFor={id} tip={tip}>
      <NumberStepper id={id} label={label} value={value} min={min} max={max} onChange={onChange} />
    </Row>
  )
}

const choices = <T extends string>(xs: readonly T[], label: (x: T) => string = (x) => x) => xs.map((x) => ({ value: x, label: label(x) }))

/* --- A list of URLs --------------------------------------------------------------------

   Redirect URLs and Allowed logout URIs: one box per URL, "Add …" under them,
   and a remove control on every row after the first. The first row is always
   there, even over an empty list, so the field never opens as a lone button;
   a blank row is stored as nothing (`cleanSetup`). The remove slot is kept on
   the first row too, empty, so the boxes' right edges line up. */
function UrlList({
  label,
  noun,
  values,
  onChange,
  required,
  error,
}: {
  label: string
  /** What one row is, for Add and Remove: "redirect URL". */
  noun: string
  values: readonly string[]
  onChange: (next: string[]) => void
  required?: boolean
  error?: string
}) {
  const id = useId()
  const rows = values.length > 0 ? [...values] : ['']
  /* Where focus goes after an add or a remove: the new row, or the one above the row removed. */
  const focusRow = useRef<number | null>(null)
  useEffect(() => {
    if (focusRow.current === null) return
    document.getElementById(`${id}-${focusRow.current}`)?.focus()
    focusRow.current = null
  }, [rows.length, id])

  /* The problem is the list's; the rows it is about carry it. */
  const wrong = (v: string, i: number) => !!error && (v.trim() ? !isUrl(v) : i === 0)

  return (
    <Row label={label} htmlFor={`${id}-0`} required={required} error={error} errorId={`${id}-err`}>
      <div className="bapp__list">
        {rows.map((v, i) => (
          <div key={i} className="bapp__listrow">
            <input
              id={`${id}-${i}`}
              type="text"
              value={v}
              placeholder="https://"
              autoComplete="off"
              spellCheck={false}
              aria-label={i === 0 ? undefined : `${label} ${i + 1}`}
              aria-required={(required && i === 0) || undefined}
              aria-invalid={wrong(v, i)}
              aria-describedby={error ? `${id}-err` : undefined}
              onChange={(e) => onChange(rows.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {i > 0 && (
              <IconButton
                icon={X}
                tone="ghost"
                label={`Remove ${noun}`}
                onClick={() => {
                  focusRow.current = i - 1
                  onChange(rows.filter((_, j) => j !== i))
                }}
              />
            )}
          </div>
        ))}
        <span className="bapp__listadd">
          <Button
            variant="link"
            icon={Plus}
            onClick={() => {
              focusRow.current = rows.length
              onChange([...rows, ''])
            }}
          >
            {`Add ${noun}`}
          </Button>
        </span>
      </div>
    </Row>
  )
}

/* --- Attribute mapping -------------------------------------------------------------------

   The name the application receives, and the profile value sent under it. A
   row with no name is stored as nothing (`cleanSetup`), so Add attribute and
   leaving it is not a change. */
function AttributeMap({ rows, onChange }: { rows: readonly AttrRow[]; onChange: (next: AttrRow[]) => void }) {
  const id = useId()
  const focusRow = useRef<number | null>(null)
  useEffect(() => {
    if (focusRow.current === null) return
    document.getElementById(`${id}-${focusRow.current}`)?.focus()
    focusRow.current = null
  }, [rows.length, id])

  const set = (i: number, patch: Partial<AttrRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <Row label="Attribute mapping">
      <div className="bapp__list" role="group" aria-label="Attribute mapping">
        {rows.map((r, i) => (
          <div key={r.id} className="bapp__listrow bapp__attr">
            <input
              id={`${id}-${i}`}
              type="text"
              value={r.name}
              placeholder="Attribute name"
              aria-label="Attribute name"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => set(i, { name: e.target.value })}
            />
            <Picker
              label={r.name.trim() ? `Value of ${r.name.trim()}` : 'Attribute value'}
              size="md"
              width="fill"
              value={r.value}
              options={PROFILE_ATTRS}
              onChange={(v) => set(i, { value: v as ProfileAttr })}
            />
            <IconButton
              icon={X}
              tone="ghost"
              label="Remove attribute"
              onClick={() => {
                focusRow.current = i > 0 ? i - 1 : null
                onChange(rows.filter((_, j) => j !== i))
              }}
            />
          </div>
        ))}
        <span className="bapp__listadd">
          <Button
            variant="link"
            icon={Plus}
            onClick={() => {
              focusRow.current = rows.length
              onChange([...rows, { id: `attr-${randomHex(8)}`, name: '', value: 'email' }])
            }}
          >
            Add attribute
          </Button>
        </span>
      </div>
    </Row>
  )
}

/* --- A value the admin copies ------------------------------------------------------------

   Read only, with Copy beside it: the client ID, the client secret (masked,
   with the eye), and every value the service provider is given. */
function CopyRow({
  id,
  value,
  copyLabel,
  masked,
  revealLabel,
  extra,
}: {
  id: string
  value: string
  copyLabel: string
  /** Masked until the eye is pressed: the client secret. */
  masked?: boolean
  /** The eye's name, with what it shows: "client secret". */
  revealLabel?: string
  extra?: ReactNode
}) {
  const [reveal, setReveal] = useState(false)
  const input = (
    <input
      id={id}
      type={masked && !reveal ? 'password' : 'text'}
      value={value}
      readOnly
      autoComplete="off"
      spellCheck={false}
    />
  )
  return (
    <div className="bapp__copyrow">
      {masked ? (
        <span className="bmc__secret">
          {input}
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? `Hide ${revealLabel}` : `Show ${revealLabel}`}
          >
            {reveal ? <EyeOff size={14} strokeWidth={1.9} /> : <Eye size={14} strokeWidth={1.9} />}
          </button>
        </span>
      ) : (
        input
      )}
      <CopyText text={value} label={copyLabel} className="bx-btn bx-btn--ghost bx-btn--sm" />
      {extra}
    </div>
  )
}

/* --- Basic ---------------------------------------------------------------------------------

   SAML: SP entity ID or issuer, ACS URL, Audience URI, Single logout URL.
   OAuth: Redirect URL, Client ID, Client secret, Subject, Description. The
   unsaved application asks its Display name first; a stored one is renamed in
   its head, so its Basic has no name.

   The client ID and secret are made here, not typed: read only, with Copy and
   Regenerate, which writes a fresh value into the draft — the save is the
   confirm, and the review says the secret changes without printing it. */
export function BasicForm({
  setup,
  onPatch,
  name,
  onName,
  description,
  onDescription,
  secret,
  onSecret,
  issues,
}: {
  setup: AppSetup
  onPatch: SetupPatch
  /** The unsaved application's Display name. Absent on a stored one. */
  name?: string
  onName?: (v: string) => void
  description: string
  onDescription: (v: string) => void
  secret: string
  onSecret: (v: string) => void
  /** The problems to say, each under its field (`shownIssues`). */
  issues: BasicIssues
}) {
  const uid = useId()
  return (
    <div className="bmc__fields">
      {name !== undefined && onName && (
        <TextField label="Display name" required value={name} maxLength={APP_NAME_MAX} error={issues.name} onChange={onName} />
      )}
      {setup.kind === 'saml' ? (
        <>
          <TextField
            label="SP entity ID or issuer"
            required
            tip="The service provider's unique identifier, usually a URL or URI."
            value={setup.entityId}
            error={issues.entityId}
            onChange={(entityId) => onPatch({ entityId })}
          />
          <TextField
            label="ACS URL"
            required
            tip="Where the SAML response is sent after sign-in."
            placeholder="https://"
            value={setup.acsUrl}
            error={issues.acsUrl}
            onChange={(acsUrl) => onPatch({ acsUrl })}
          />
          <TextField
            label="Audience URI"
            tip="Usually the same as the SP entity ID."
            value={setup.audienceUri}
            error={issues.audienceUri}
            onChange={(audienceUri) => onPatch({ audienceUri })}
          />
          <TextField
            label="Single logout URL"
            placeholder="https://"
            value={setup.sloUrl}
            error={issues.sloUrl}
            onChange={(sloUrl) => onPatch({ sloUrl })}
          />
        </>
      ) : (
        <>
          <UrlList
            label="Redirect URL"
            noun="redirect URL"
            required
            values={setup.redirectUrls}
            error={issues.redirectUrls}
            onChange={(redirectUrls) => onPatch({ redirectUrls })}
          />
          <Row label="Client ID" htmlFor={`${uid}-client`} required error={issues.clientId} errorId={`${uid}-client-err`}>
            <CopyRow
              id={`${uid}-client`}
              value={setup.clientId}
              copyLabel="Copy client ID"
              extra={
                <Button variant="link" onClick={() => onPatch({ clientId: randomHex(32) })}>
                  Regenerate
                </Button>
              }
            />
          </Row>
          <Row label="Client secret" htmlFor={`${uid}-secret`} required error={issues.secret} errorId={`${uid}-secret-err`}>
            <CopyRow
              id={`${uid}-secret`}
              value={secret}
              masked
              revealLabel="client secret"
              copyLabel="Copy client secret"
              extra={
                <Button variant="link" onClick={() => onSecret(randomHex(32))}>
                  Regenerate
                </Button>
              }
            />
          </Row>
          <Choice label="Subject" value={setup.subject} options={PROFILE_ATTRS} onChange={(subject) => onPatch({ subject })} />
          <DescriptionField value={description} onChange={onDescription} />
        </>
      )}
    </div>
  )
}

/* The count appears once the description is close to its cap, not from the first character. */
const DESCRIPTION_COUNT_FROM = 200

function DescriptionField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId()
  const n = value.length
  return (
    <div className="bmc__field">
      <div className="bmc__label bdt__labelrow">
        <label htmlFor={id}>Description</label>
        {n > DESCRIPTION_COUNT_FROM && <span className="bdt__count">{DESCRIPTION_MAX - n} left</span>}
      </div>
      <div className="bmc__control">
        <textarea id={id} rows={4} maxLength={DESCRIPTION_MAX} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  )
}

/* --- Advanced --------------------------------------------------------------------------- */

const RELAY_TIP = 'Where people land in the application after a sign-in from the dashboard.'
const SHARED_TIP = 'Whether people signed in on a shared account can use this application.'

export function AdvancedForm({ setup, onPatch }: { setup: AppSetup; onPatch: SetupPatch }) {
  if (setup.kind === 'oidc') {
    const set = (p: Partial<OidcSetup>) => onPatch(p)
    return (
      <div className="bmc__fields">
        <NumberField
          label="Access token expiry (in hours)"
          value={setup.accessTokenHours}
          min={1}
          max={720}
          onChange={(accessTokenHours) => set({ accessTokenHours })}
        />
        <NumberField label="ID token expiry (in hours)" value={setup.idTokenHours} min={1} max={720} onChange={(idTokenHours) => set({ idTokenHours })} />
        <NumberField
          label="Refresh token expiry (in days)"
          value={setup.refreshTokenDays}
          min={1}
          max={365}
          onChange={(refreshTokenDays) => set({ refreshTokenDays })}
        />
        <Choice
          label="Signature algorithm"
          value={setup.signatureAlgorithm}
          options={choices(OIDC_SIGNATURE_ALGORITHMS)}
          onChange={(signatureAlgorithm) => set({ signatureAlgorithm })}
        />
        <Switch label="Client credential grant" on={setup.clientCredentialGrant} onChange={(clientCredentialGrant) => set({ clientCredentialGrant })} />
        <Switch label="Enable shared identity" tip={SHARED_TIP} on={setup.sharedIdentity} onChange={(sharedIdentity) => set({ sharedIdentity })} />
      </div>
    )
  }
  const set = (p: Partial<SamlSetup>) => onPatch(p)
  return (
    <div className="bmc__fields">
      <Switch label="Signed request" on={setup.signedRequest} onChange={(signedRequest) => set({ signedRequest })} />
      <Switch label="Sign response" on={setup.signResponse} onChange={(signResponse) => set({ signResponse })} />
      <Switch label="Sign assertion" on={setup.signAssertion} onChange={(signAssertion) => set({ signAssertion })} />
      <Choice
        label="Signature algorithm"
        value={setup.signatureAlgorithm}
        options={choices(SAML_SIGNATURE_ALGORITHMS)}
        onChange={(signatureAlgorithm) => set({ signatureAlgorithm })}
      />
      <Switch label="Encrypt assertion" on={setup.encryptAssertion} onChange={(encryptAssertion) => set({ encryptAssertion })} />
      <Choice<RelayStateKind>
        label="Relay state"
        tip={RELAY_TIP}
        value={setup.relayState}
        options={RELAY_STATES}
        onChange={(relayState) => set({ relayState })}
      />
      {/* Only once a kind is chosen: with None there is nothing to fill in. */}
      {setup.relayState !== 'none' && (
        <TextField label="Relay state value" value={setup.relayStateValue} onChange={(relayStateValue) => set({ relayStateValue })} />
      )}
      <Switch
        label="Override relay state"
        tip="Sends this relay state even when the application asks for another."
        on={setup.overrideRelayState}
        onChange={(overrideRelayState) => set({ overrideRelayState })}
      />
      <Choice<Binding>
        label="Logout response binding"
        value={setup.logoutResponseBinding}
        options={choices(BINDINGS)}
        onChange={(logoutResponseBinding) => set({ logoutResponseBinding })}
      />
      <Choice<Binding>
        label="IdP-initiated logout request binding"
        value={setup.idpLogoutRequestBinding}
        options={choices(BINDINGS)}
        onChange={(idpLogoutRequestBinding) => set({ idpLogoutRequestBinding })}
      />
      <NumberField
        label="SAML authentication validity period"
        tip="How long a SAML sign-in stays valid."
        value={setup.validityPeriod}
        min={1}
        max={86400}
        onChange={(validityPeriod) => set({ validityPeriod })}
      />
      <Switch label="Enable shared identity" tip={SHARED_TIP} on={setup.sharedIdentity} onChange={(sharedIdentity) => set({ sharedIdentity })} />
      <Choice
        label="AuthnContext class"
        value={setup.authnContext}
        options={choices(AUTHN_CONTEXTS, authnContextLabel)}
        onChange={(authnContext) => set({ authnContext })}
      />
    </div>
  )
}

/* --- Sign-in options ---------------------------------------------------------------------

   The live Login Options, less the two questions with one answer in this
   tenant (Primary identity provider, SSO flows). */

const FORCE_TIP = 'Asks for credentials at every sign-in, even while a session is open.'

export function SignInForm({ setup, onPatch }: { setup: AppSetup; onPatch: SetupPatch }) {
  if (setup.kind === 'oidc') {
    const set = (p: Partial<OidcSetup>) => onPatch(p)
    return (
      <div className="bmc__fields">
        <Switch label="Show on end user dashboard" on={setup.showOnDashboard} onChange={(showOnDashboard) => set({ showOnDashboard })} />
        <Switch label="Force authentication" tip={FORCE_TIP} on={setup.forceAuthentication} onChange={(forceAuthentication) => set({ forceAuthentication })} />
        <UrlList label="Allowed logout URIs" noun="logout URI" values={setup.logoutUris} onChange={(logoutUris) => set({ logoutUris })} />
        <Switch label="Single logout enabled" on={setup.singleLogout} onChange={(singleLogout) => set({ singleLogout })} />
      </div>
    )
  }
  const set = (p: Partial<SamlSetup>) => onPatch(p)
  return (
    <div className="bmc__fields">
      <Switch label="Force authentication" tip={FORCE_TIP} on={setup.forceAuthentication} onChange={(forceAuthentication) => set({ forceAuthentication })} />
      <Switch label="Show on end user dashboard" on={setup.showOnDashboard} onChange={(showOnDashboard) => set({ showOnDashboard })} />
    </div>
  )
}

/* --- Attributes ------------------------------------------------------------------------ */

export function AttributesForm({ setup, onPatch }: { setup: AppSetup; onPatch: SetupPatch }) {
  const multi = (
    <Switch label="Enable multi-valued attributes" on={setup.multiValued} onChange={(multiValued) => onPatch({ multiValued })} />
  )
  const mapping = <AttributeMap rows={setup.attributes} onChange={(attributes) => onPatch({ attributes })} />
  if (setup.kind === 'oidc') {
    return (
      <div className="bmc__fields">
        {multi}
        {mapping}
      </div>
    )
  }
  const set = (p: Partial<SamlSetup>) => onPatch(p)
  return (
    <div className="bmc__fields">
      <Choice label="Name ID" value={setup.nameId} options={PROFILE_ATTRS} onChange={(nameId) => set({ nameId })} />
      <Choice
        label="Name ID format"
        value={setup.nameIdFormat}
        options={choices(NAME_ID_FORMATS, nameIdFormatLabel)}
        onChange={(nameIdFormat) => set({ nameIdFormat })}
      />
      <Switch label="Add name format" on={setup.addNameFormat} onChange={(addNameFormat) => set({ addNameFormat })} />
      {multi}
      {mapping}
    </div>
  )
}

/* --- Metadata / Endpoints ------------------------------------------------------------------

   What the admin pastes into the service provider. The live console hides it
   until the application is saved; here it is readable from the first moment,
   which is the gap the spec set out to close. The values are the tenant's and
   the application id's, so the unsaved application shows them for the id it
   will be stored under. Static: nothing to edit, so nothing for the save
   footer. */
export function ServiceProviderValues({ kind, appId, clientId }: { kind: AppSetup['kind']; appId: string; clientId?: string }) {
  const store = useBrand()
  const uid = useId()
  return (
    <div className="bmc__fields">
      {idpValues(kind, appId, clientId).map((v, i) => (
        <Row key={v.label} label={v.label} htmlFor={`${uid}-${i}`}>
          <CopyRow id={`${uid}-${i}`} value={v.value} copyLabel={`Copy ${v.label}`} />
        </Row>
      ))}
      {kind === 'saml' && (
        <Row label="Certificate">
          <span className="bapp__listadd">
            <Button variant="secondary" icon={Download} onClick={() => store.showToast(SHOWCASE ? 'Downloading certificates is coming soon.' : 'Downloading certificates is not built in this prototype.')}>
              Download certificate
            </Button>
          </span>
        </Row>
      )}
    </div>
  )
}

/* --- A tab's body ----------------------------------------------------------------------------

   The page's two halves: the form, and beside it a static note where the tab
   has something to say — only an OAuth application's Basic, about the client
   ID and secret. A tab with nothing to say keeps the form in the left half,
   so a field is the same width on every tab, and the right half stays empty
   rather than filled to be filled. */
export function SetupTabBody({
  tab,
  draft,
  onPatch,
  onDraft,
  name,
  onName,
  issues,
  appId,
}: {
  tab: AppTab
  draft: AppDraft
  onPatch: SetupPatch
  /** The draft's own fields, beside the setup: the description and the client secret. */
  onDraft: (patch: Partial<Pick<AppDraft, 'description' | 'secret'>>) => void
  name?: string
  onName?: (v: string) => void
  issues: BasicIssues
  /** The application's id, or the one it will be stored under: the Metadata URL names it. */
  appId: string
}) {
  const { setup } = draft
  let body: ReactNode = null
  let note: ProfileNote | undefined
  if (tab === 'basic') {
    body = (
      <BasicForm
        setup={setup}
        onPatch={onPatch}
        name={name}
        onName={onName}
        description={draft.description}
        onDescription={(description) => onDraft({ description })}
        secret={draft.secret}
        onSecret={(secret) => onDraft({ secret })}
        issues={issues}
      />
    )
    if (setup.kind === 'oidc') note = CLIENT_NOTE
  } else if (tab === 'advanced') body = <AdvancedForm setup={setup} onPatch={onPatch} />
  else if (tab === 'sign-in') body = <SignInForm setup={setup} onPatch={onPatch} />
  else if (tab === 'attributes') body = <AttributesForm setup={setup} onPatch={onPatch} />
  else if (tab === 'metadata' || tab === 'endpoints')
    body = <ServiceProviderValues kind={setup.kind} appId={appId} clientId={setup.kind === 'oidc' ? setup.clientId : undefined} />
  if (!body) return null
  return (
    <div className="bz7__cols">
      <div className="bz7__work">{body}</div>
      {note && <SidePanel note={note} />}
    </div>
  )
}
