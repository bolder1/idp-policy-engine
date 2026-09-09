import { AppLogo } from '../logos/AppLogo'
import { appsLabel } from '../data'
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

/* What the policy protects. Required — a policy that protects nothing is inert.

   Multi-select, because `Policy.appIds` is a list: one set of rules can govern
   several applications, which is what S17 needed and had to fake with two
   identical policies. `Picker` already had `multiple`, so this is the prop and
   a toggling `onChange` rather than a new control.

   The trigger states the answer the way every other surface does — one name, or
   the first name and a count — instead of the built-in "3 selected", which is a
   number you have to open the control to interpret. */
export function ApplicationField({ appIds, onChange }: { appIds: string[]; onChange: (ids: string[]) => void }) {
  const store = useBrand()
  const named = store.apps.filter((a) => appIds.includes(a.id))
  return (
    <Picker
      label="Applications this policy protects"
      width="fill"
      size="md"
      searchable
      multiple
      value={appIds}
      /* Undefined while empty, deliberately: `summary` overrides the
         placeholder, so stating one here would replace "Choose applications"
         with a sentence nobody needs before they have chosen anything. */
      summary={named.length === 0 ? undefined : appsLabel(named)}
      /* No "No application" row and no sentinel.

         There was one, pinned above the list, carrying the check when nothing
         was chosen and explaining the consequence — "the rules are saved, but
         nothing reaches them until one is attached". That was the right control
         for an optional question. The question is not optional any more: a
         policy exists to govern access TO something, and one that names nothing
         is a set of rules no sign-in can ever reach. So the empty state is a
         placeholder again, and the footer will not let you past it. */
      placeholder="Choose applications"
      /* Never invalid. Empty is a legitimate answer — a policy with no
         application is a draft, which is a state this product carries on
         purpose — so the red edge that used to sit here was reporting a fault
         where there is a choice. The dialog says what blank means instead. */
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
      /* `Picker` in multiple mode reports the row that was pressed, not the new
         set, so the toggle is the caller's. Order follows the catalogue rather
         than the clicks — `appsOf` reads it back that way, and two orders for
         one list is how a "changed" check starts firing on nothing. */
      onChange={(id) =>
        onChange(
          appIds.includes(id)
            ? appIds.filter((x) => x !== id)
            : store.apps.filter((a) => a.id === id || appIds.includes(a.id)).map((a) => a.id),
        )
      }
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
