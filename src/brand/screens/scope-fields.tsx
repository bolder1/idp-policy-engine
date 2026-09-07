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
