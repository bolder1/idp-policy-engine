import { useState } from 'react'
import { AppWindow, LogIn, UserRound } from 'lucide-react'

import { memberGroupIds } from '../data'
import { listNames } from '../rule-who'
import { EmptyState } from '../empty'
import { Face } from '../faces'
import { Button, Drawer } from '../kit'
import { useBrand, type BrandScreen } from '../store'
import { groupNamesOf, userApps } from './app-people-tabs-model'
import { checkAccessFrom, followLink } from './guarded-moves'
import { Block, Hero, KindMark } from './sign-in-tests/PeekViews'
import { ACCESS_CHECK } from './sign-in-tests/names'
import { useTestingSession } from './testing/session-state'
import { formOf } from './testing/sign-in-form'

/* -----------------------------------------------------------------------------
   One person, in a slider: who they are, and what decides for them where
   (spec 10 Oct 2026, §6). Opened from a user's email on the User list and on
   an application's Users tab.

   The details drawer's grammar (policy-details-drawer.tsx, at its 680): the
   overview card — face, name, and the directory's facts — then the sections
   that belong to the person. Applications lists only where a policy of the
   tenant's own decides for them, then one line for everywhere else, so the
   two applications that differ are not lost among ten that say the default.
   Each answer is `deciderForUser`, Access checks' own pick.

   One way out at the foot, Check access, with the person loaded — the
   testing session's `load`, as Sign-in activity opens a sign-in there.

   Every way out asks the leave guard first, and the drawer closes and the
   person loads only when the move goes ahead (guarded-moves.ts).
   -------------------------------------------------------------------------- */

export function UserDrawer({
  userId,
  onClose,
  appOpen,
}: {
  userId: string | null
  onClose: () => void
  /** The application whose Users tab this is open on: its link there only closes the drawer. */
  appOpen?: string
}) {
  const store = useBrand()
  const session = useTestingSession()
  /* The person last opened, kept while the slider slides out, so it leaves
     with what it held rather than emptying first. */
  const [shown, setShown] = useState(userId)
  if (userId !== null && userId !== shown) setShown(userId)
  if (shown === null) return null

  const user = store.users.find((u) => u.id === shown)
  const leaveFor = (to: BrandScreen) => followLink(store, to, onClose, appOpen)
  const check = () => checkAccessFrom(store, () => session.load(formOf({ personId: shown }, store.zones)), onClose)

  return (
    <Drawer
      open={userId !== null}
      onClose={onClose}
      title="User details"
      width={680}
      actions={
        user && (
          <Button variant="secondary" icon={LogIn} onClick={check}>
            {ACCESS_CHECK}
          </Button>
        )
      }
    >
      {!user ? (
        <EmptyState compact icon={UserRound} title="User not found" />
      ) : (
        <UserPage key={user.id} userId={user.id} leaveFor={leaveFor} />
      )}
    </Drawer>
  )
}

function UserPage({ userId, leaveFor }: { userId: string; leaveFor: (to: BrandScreen) => void }) {
  const store = useBrand()
  const user = store.users.find((u) => u.id === userId)!
  const groupIds = memberGroupIds(user)
  const names = groupNamesOf(user, store.groups)
  const { own, fallback } = userApps(user, store.apps, store.policies)

  return (
    <div className="insp__page">
      <Hero
        target={{ kind: 'person', id: user.id }}
        kicker="User"
        name={user.name}
        facts={[
          { label: 'Email', value: user.email },
          { label: 'Groups', value: names.length === 0 ? 'None' : listNames(names, Infinity) },
          { label: 'Type', value: user.userType },
          { label: 'Role', value: user.role },
        ]}
      />

      <Block title="Applications">
        {own.length === 0 && !fallback ? (
          <p className="insp__gone">No policy decides for them.</p>
        ) : (
          <ul className="insp__list busr__apps">
            {own.map(({ app, policy }) => (
              <li key={app.id} className="insp__item">
                <KindMark target={{ kind: 'app', id: app.id }} small />
                <span className="insp__itemtext">
                  <span className="insp__itemname">
                    <button
                      type="button"
                      className="btable__link"
                      onClick={() => leaveFor({ name: 'application', appId: app.id, tab: 'users' })}
                    >
                      {app.name}
                    </button>
                  </span>
                  <span className="u-muted">{policy.name}</span>
                </span>
              </li>
            ))}
            {fallback && (
              <li className="insp__item">
                <span className="insp__mark is-small" aria-hidden>
                  <AppWindow size={13} strokeWidth={2} />
                </span>
                <span className="insp__itemtext">
                  {/* "Every other" only under rows it is the other of. */}
                  <span className="insp__itemname">{own.length > 0 ? 'Every other application' : 'Every application'}</span>
                  <span className="u-muted">{fallback.name}</span>
                </span>
              </li>
            )}
          </ul>
        )}
      </Block>

      <Block title="Groups">
        {groupIds.length === 0 ? (
          <p className="insp__gone">Not in any group.</p>
        ) : (
          <ul className="insp__list">
            {groupIds.map((id) => {
              const g = store.groups.find((x) => x.id === id)
              return (
                <li key={id} className="insp__item">
                  <Face kind="group" name={g?.name ?? '(deleted)'} size="sm" decorative />
                  <span className="insp__itemtext">
                    <span className="insp__itemname">
                      {g ? (
                        <button
                          type="button"
                          className="btable__link"
                          onClick={() => leaveFor({ name: 'groups', groupId: id, tab: 'assignment' })}
                        >
                          {g.name}
                        </button>
                      ) : (
                        <span className="u-muted">(deleted)</span>
                      )}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Block>
    </div>
  )
}
