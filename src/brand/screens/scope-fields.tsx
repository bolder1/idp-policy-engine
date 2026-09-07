import { AppLogo } from '../logos/AppLogo'
import { Picker } from '../picker'
import { useBrand } from '../store'

/* -----------------------------------------------------------------------------
   What a policy protects, as one control.

   Two screens ask it — Create Policy's name step and Policy details — and each
   did it with a resident 475px scrolling list of ten applications, beside a
   second 475px list for the audience. Two copies of one question, in the shape
   that takes the most room to ask it. One control now, stating the current
   answer and opening a picker to change it, in one place so the two screens
   cannot drift.

   THE AUDIENCE FIELD HAS GONE FROM BOTH. It was a required question on the
   policy, answered with a tabbed list of groups and people, and it is now
   answered per RULE by the Who step — which reads and writes the `group` and
   `user` conditions the rule already held. `blankPolicy` has always defaulted a
   new policy to `EVERYONE` with the reason written beside it ("a new policy
   governs everyone until somebody narrows it"), so asking for a narrowing at
   creation time was asking for a decision the model was happy to defer and the
   rules are better placed to make. `Audience` stays on the model, and the
   builder's own drawer still edits it for a policy that has one.
   -------------------------------------------------------------------------- */

/** What the policy protects. Required — a policy that protects nothing is inert. */
export function ApplicationField({ appId, onChange }: { appId: string | null; onChange: (id: string | null) => void }) {
  const store = useBrand()
  return (
    <Picker
      label="Application this policy protects"
      width="fill"
      size="md"
      searchable
      value={appId}
      /* No "No application" row and no sentinel.

         There was one, pinned above the list, carrying the check when nothing
         was chosen and explaining the consequence — "the rules are saved, but
         nothing reaches them until one is attached". That was the right control
         for an optional question. The question is not optional any more: a
         policy exists to govern access TO something, and one that names nothing
         is a set of rules no sign-in can ever reach. So the empty state is a
         placeholder again, and the footer will not let you past it. */
      placeholder="Choose an application"
      invalid={!appId}
      /* The real marks, back from the list this control replaced.

         `AppList` drew them, and answering the same question with a picker had
         quietly dropped them — ten rows of two grey lines where the eye was
         used to finding Salesforce by its cloud. `AppLogo` keeps its own
         fallback, so a logo host that moves a file gives a monogram on the
         app's tint rather than a broken image. */
      options={store.apps.map((a) => ({
        value: a.id,
        label: a.name,
        meta: a.protocol,
        art: <AppLogo appId={a.id} name={a.name} size={18} />,
      }))}
      onChange={onChange}
    />
  )
}

/* The application, stated. For a caller that already knows which one it is.

   The Applications screen opens the naming dialog from a row, so the answer is
   the row. Asking again would be offering a choice whose only other outcomes
   are wrong: pick a different application there and the panel you return to is
   about an app the policy does not protect, with no way for that surface to
   represent the result.

   Not a disabled `Picker`. `Picker` has no whole-control `disabled` prop —
   only per-option — so adding one for this caller would give every other
   picker in the console a state nobody asked for; and a greyed combobox reads
   "you could change this, but not now", which is not what is true. A plain
   statement reads "this is what it is", and it takes a tab stop out of the
   dialog's focus trap so Enter has one obvious meaning.

   It lives here rather than in the dialog because this module's whole purpose
   is that the question is asked in one place. A third rendering of it
   elsewhere restarts the drift this file was made to end. */
export function ApplicationFixed({ appId }: { appId: string }) {
  const store = useBrand()
  const app = store.apps.find((a) => a.id === appId)
  if (!app) return null
  return (
    <div className="bname2__fixed">
      <AppLogo appId={app.id} name={app.name} size={20} />
      <strong>{app.name}</strong>
      <span className="u-muted">{app.protocol}</span>
      <em>Set by the application you opened this from.</em>
    </div>
  )
}
