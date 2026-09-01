import { useBrand } from '../store'
import { AuthMethods } from './AuthMethods'

/* One layout, two points of view.

   There were two layouts and a switch between them: v1, a list that opens a
   slide-over, and v2, a rail beside a pane. They were never two
   implementations — v2 imported the primary sign-in block, the default-method
   picker, the method card, the settings pane and the setup form from v1, so
   everything you could DO was the same code and only the place the detail
   opened differed.

   v1 is the screen now, the switch went with the decision, and v2 is deleted.
   It was kept unreferenced for a while on the argument that it was the case for
   the other arrangement written out — but an unreferenced screen is not
   documentation, it is a file that typechecks, gets linted, and quietly holds
   exports the live screen then cannot tidy away. What it argued is in the
   commit history and in this paragraph, which is where an argument belongs.

   THE POINTS OF VIEW are the part that stays. Not two screens: one screen that
   knows who is looking. The end-user page in the live product
   (moas/showenduserconfiguration) is the same shape as this one, so the two
   roles were never going to need different furniture. What they need is for the
   furniture to mean different things:

     admin  a toggle enables a method for the tenant; Edit opens the connection
     user   a toggle picks the one method that runs for you; Edit opens your own
            details, inline in the card, and you only see what the admin left on
*/

export function AuthMethodsPage() {
  const store = useBrand()

  /* Read, not owned. Switching sides is an account action taken from the avatar
     menu — it changes the chrome, the nav and the landing screen, none of which
     this page has any business deciding.

     One screen serves both roles. v1 used to be admin-only on the argument that
     it was the archived layout and a second mode would mean maintaining four
     screens to compare two things — which held while it was a wall of category
     cards with nothing a person could act on. It is one list of rows now, and a
     row is the same object whichever side you are on: the admin's toggle
     enables a method for the tenant, the person's picks the one that runs for
     them. Same list, same filter, same search; the control on the right means
     two different things, which is the difference worth showing. */
  return <AuthMethods role={store.role} />
}
