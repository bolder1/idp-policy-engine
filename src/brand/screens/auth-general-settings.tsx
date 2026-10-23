import { useId } from 'react'

import { Drawer, Toggle } from '../kit'
import { Picker } from '../picker'
import { MORE_GENERAL_SETTINGS, type AuthGeneral } from './auth-general'

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

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="bm8__grow">
      <div className="bm8__gtext">
        <b>{title}</b>
        <span>{hint}</span>
      </div>
      <div className="bm8__gctl">{children}</div>
    </div>
  )
}

/** The rows themselves, in their sections. Both placements render this, so neither can drift from the other. */
export function GeneralSettings({ value, onChange }: { value: AuthGeneral; onChange: (v: AuthGeneral) => void }) {
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
        <Row title="Users" hint="Everyone who signs in to an application.">
          <Toggle checked={value.forUsers} onChange={(v) => set('forUsers', v)} label="Require two-step verification for users" />
        </Row>
        <Row title="Additional admins" hint="Every other administrator of this tenant.">
          <Toggle checked={value.forAdmins} onChange={(v) => set('forAdmins', v)} label="Require two-step verification for additional admins" />
        </Row>
      </section>

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
