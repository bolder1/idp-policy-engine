import { useId, useState } from 'react'

import { Drawer, SaveBar, Toggle } from '../kit'
import { useLeaveGuard } from '../leave-guard'
import { Picker } from '../picker'
import { useBrand } from '../store'
import {
  DEVICE_PROFILE_EXPIRY,
  EXPIRY_DAYS,
  MOBILE_ISSUER,
  MORE_GENERAL_SETTINGS,
  TYPED_GENERAL,
  USERS_2FA_ROW,
  typedGeneral,
  typedIssues,
  type AuthGeneral,
  type TypedGeneral,
} from './auth-general'

/* -----------------------------------------------------------------------------
   GENERAL SETTINGS of Authentication methods (owner, 21 Oct 2026: "a general settings for authentication methods, so the
   admin can enable or disable two-factor for himself, for users, or for additional admins; think what else we can add").

   Who must use two-step verification, and the rules that go with it for the whole tenant: not any one method's.

   EVERY CHANGE SAVES AT ONCE (owner, 21 Oct 2026, of the slide-over: "we have only two options, so we can consider a
   different approach within this large slide"). Nine rows, seven of them a switch, held as a draft behind Cancel and
   Save: a footer asking you to confirm a switch you have already flicked, and a 560-wide container to hold it. A picked
   value saves as it is picked here, as it does everywhere else in the console (draft-and-savebar-pattern), so the switch
   is the answer and there is nothing left for a footer to do.

   One body, two placements, so his two choices read the same and say the same words: `GeneralSettings` on the page's own
   General settings tab, and the same rows in the slide-over behind VERIFICATION_RULES_DRAWER (auth-general.ts).

   What it draws today is TWO SWITCHES — Users and Additional admins — with the rest behind MORE_GENERAL_SETTINGS
   (owner, 22 Oct 2026). The heading stays: "Users" and "Additional admins" are not settings on their own, and
   "Two-step verification is required for" is the verb that makes the two switches mean something.

   EXCEPT WHAT IS TYPED (owner, 25 Nov 2026: "to store this two value we need a footer with save and cancel button").
   Mobile issuer name and Device profile expiry are typed, not picked, and a value saved on every keystroke is a half
   name in somebody's authenticator app. On the page's tab (`GeneralSettingsTab`, behind GENERAL_SAVE) those two wait
   in a draft for the kit's footer: Cancel and Save. The switches still save as they are flicked, so the footer is
   only ever about the two fields above it.
   -------------------------------------------------------------------------- */

const REMEMBER = [
  { value: '0', label: 'Never' },
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
]
const GRACE = [
  { value: '0', label: 'None' },
  { value: '3', label: '3 days' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
]
const LOCK = [
  { value: '3', label: '3 attempts' },
  { value: '5', label: '5 attempts' },
  { value: '10', label: '10 attempts' },
]

/* A typed value that cannot be saved says why under its question, not in the footer (23 Oct 2026 ruling: reasons
   belong under the field). */
function Row({ title, hint, error, errorId, children }: { title: string; hint: string; error?: string; errorId?: string; children: React.ReactNode }) {
  return (
    <div className="bm8__grow">
      <div className="bm8__gtext">
        <b>{title}</b>
        <span>{hint}</span>
        {error && (
          <p className="bm8__gerr" id={errorId} role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="bm8__gctl">{children}</div>
    </div>
  )
}

/** The rows themselves, in their sections. Both placements render this, so neither can drift from the other. */
export function GeneralSettings({
  value,
  onChange,
  issues = {},
}: {
  value: AuthGeneral
  onChange: (v: AuthGeneral) => void
  /** Why a typed value cannot be saved yet, shown under its row. */
  issues?: Partial<Record<keyof TypedGeneral, string>>
}) {
  /* The section headings name their own lists. Generated, because the page's tab and the slide-over can be mounted at
     the same time while the owner compares them, and a hand-written id would then be in the document twice. */
  const id = useId()
  const set = <K extends keyof AuthGeneral>(k: K, v: AuthGeneral[K]) => onChange({ ...value, [k]: v })
  return (
    <div className="bm8__gen">
      <section aria-labelledby={`${id}-who`}>
        <h3 id={`${id}-who`}>Two-step verification is required for</h3>
        {MORE_GENERAL_SETTINGS && (
          <Row title="Me" hint="Your own admin account.">
            <Toggle checked={value.forMe} onChange={(v) => set('forMe', v)} label="Require two-step verification for me" />
          </Row>
        )}
        {USERS_2FA_ROW && (
          <Row title="Users" hint="Everyone who signs in to an application.">
            <Toggle checked={value.forUsers} onChange={(v) => set('forUsers', v)} label="Require two-step verification for users" />
          </Row>
        )}
        <Row title="Additional admins" hint="Every other administrator of this tenant.">
          <Toggle checked={value.forAdmins} onChange={(v) => set('forAdmins', v)} label="Require two-step verification for additional admins" />
        </Row>
        {/* Owner, 19 Nov 2026: "add mobile issuer name after additional admin". */}
        {MOBILE_ISSUER && (
          <Row title="Mobile issuer name" hint="Shown above the code in authenticator apps." error={issues.mobileIssuer} errorId={`${id}-issuer-err`}>
            <input
              className="bm8__gtext-input"
              type="text"
              value={value.mobileIssuer}
              onChange={(e) => set('mobileIssuer', e.target.value)}
              aria-label="Mobile issuer name"
              aria-invalid={issues.mobileIssuer ? true : undefined}
              aria-describedby={issues.mobileIssuer ? `${id}-issuer-err` : undefined}
              spellCheck={false}
            />
          </Row>
        )}
      </section>

      {/* Owner, 20 Nov 2026: "add a new option for device profile expiry". Its own section: the one above is who must
          verify, and an expiry is not a "who". */}
      {DEVICE_PROFILE_EXPIRY && (
        <section aria-labelledby={`${id}-dev`}>
          <h3 id={`${id}-dev`}>Devices</h3>
          {/* A number the admin types, not a list of choices (owner, 20 Nov 2026: "a textbox with number … we don't
              provide dropdown for this, treat it like custom"). The same width as Mobile issuer name, so the ends line up. */}
          <Row
            title="Device profile expiry"
            hint="A trusted device must be verified again after this many days."
            error={issues.deviceExpiryDays}
            errorId={`${id}-expiry-err`}
          >
            <span className={`bm8__gnum ${issues.deviceExpiryDays ? 'is-invalid' : ''}`}>
              <input
                type="number"
                inputMode="numeric"
                min={EXPIRY_DAYS.min}
                max={EXPIRY_DAYS.max}
                step={1}
                value={value.deviceExpiryDays}
                onChange={(e) => set('deviceExpiryDays', e.target.value.replace(/\D/g, ''))}
                aria-label="Device profile expiry in days"
                aria-invalid={issues.deviceExpiryDays ? true : undefined}
                aria-describedby={issues.deviceExpiryDays ? `${id}-expiry-err` : undefined}
              />
              <span aria-hidden>days</span>
            </span>
          </Row>
        </section>
      )}

      {MORE_GENERAL_SETTINGS && (
      <section aria-labelledby={`${id}-rules`}>
        <h3 id={`${id}-rules`}>Sign-in</h3>
        <Row title="Remember this device" hint="A device that passed two-step verification is not asked again for this long.">
          <Picker label="Remember this device" width="content" value={value.rememberDays} options={REMEMBER} onChange={(v) => set('rememberDays', v)} />
        </Row>
        <Row title="Grace period" hint="How long a person can sign in before they must set a method up.">
          <Picker label="Grace period" width="content" value={value.graceDays} options={GRACE} onChange={(v) => set('graceDays', v)} />
        </Row>
        <Row title="Let people choose their method" hint="Off: everyone uses the default method.">
          <Toggle checked={value.choose} onChange={(v) => set('choose', v)} label="Let people choose their method" />
        </Row>
        <Row title="Lock after failed attempts" hint="Failed verifications in a row before the person is locked out for a while.">
          <Picker label="Lock after failed attempts" width="content" value={value.lockAfter} options={LOCK} onChange={(v) => set('lockAfter', v)} />
        </Row>
      </section>
      )}

      {MORE_GENERAL_SETTINGS && (
      <section aria-labelledby={`${id}-sec`}>
        <h3 id={`${id}-sec`}>Changes to methods</h3>
        <Row title="Ask again before a sensitive change" hint="A method, a password or a recovery option is changed only after verifying again.">
          <Toggle checked={value.reauth} onChange={(v) => set('reauth', v)} label="Ask again before a sensitive change" />
        </Row>
        <Row title="Tell the person" hint="An email when a method is added or removed.">
          <Toggle checked={value.notify} onChange={(v) => set('notify', v)} label="Tell the person when a method changes" />
        </Row>
      </section>
      )}
    </div>
  )
}

/* The page's own tab with the typed values held back for the footer (GENERAL_SAVE). `value` is what is saved and
   `onSave` stores a whole AuthGeneral: the setter the tab used to call on every change.

   Only the two typed fields live in the draft. A switch flicked while the footer is up saves at once, with the SAVED
   typed values under it, so it neither saves the half-typed name nor throws it away. Leaving with the draft open asks
   first (leave-guard.ts), from the rail and from the page's other tabs alike. */
export function GeneralSettingsTab({ value, onSave }: { value: AuthGeneral; onSave: (v: AuthGeneral) => void }) {
  const store = useBrand()
  const saved = typedGeneral(value)
  const [typed, setTyped] = useState<TypedGeneral>(saved)
  const dirty = TYPED_GENERAL.some((k) => typed[k] !== saved[k])
  const issues = typedIssues(typed)
  const blocked = issues.mobileIssuer ?? issues.deviceExpiryDays ?? null

  const save = () => {
    if (blocked) return false
    const next: TypedGeneral = { mobileIssuer: typed.mobileIssuer.trim(), deviceExpiryDays: String(Number(typed.deviceExpiryDays)) }
    onSave({ ...value, ...next })
    setTyped(next)
    store.showToast('General settings saved')
    return true
  }
  /* With Undo in the toast, as every other footer's Discard has (owner, 23 Oct 2026). */
  const cancel = () => {
    const was = typed
    setTyped(saved)
    store.showToast('Changes discarded', { label: 'Undo', run: () => setTyped(was) })
  }

  useLeaveGuard({ dirty, save, saveLabel: 'Save', blocked })

  return (
    <>
      <GeneralSettings
        value={{ ...value, ...typed }}
        issues={issues}
        onChange={(next) => {
          setTyped(typedGeneral(next))
          const picked: AuthGeneral = { ...next, ...saved }
          if ((Object.keys(picked) as (keyof AuthGeneral)[]).some((k) => picked[k] !== value[k])) onSave(picked)
        }}
      />
      <SaveBar
        open={dirty}
        onSave={save}
        saveLabel="Save"
        blocked={!!blocked}
        blockedReason={blocked ?? undefined}
        onDiscard={cancel}
        discardLabel="Cancel"
      />
    </>
  )
}

/* The same rows in the slide-over, kept for the comparison (VERIFICATION_RULES_DRAWER). No footer and no caption
   saying so: every row has already saved by the time you look for one, and a line explaining that is a sentence about
   the UI (CLAUDE.md, copy). The close is the only control. */
export function GeneralSettingsDrawer({ open, value, onClose, onSave }: { open: boolean; value: AuthGeneral; onClose: () => void; onSave: (v: AuthGeneral) => void }) {
  return open ? (
    <Drawer open onClose={onClose} title="Verification rules" width={560}>
      <GeneralSettings value={value} onChange={onSave} />
    </Drawer>
  ) : null
}
