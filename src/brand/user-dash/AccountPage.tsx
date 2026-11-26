import { Gauge, History, KeyRound, Plane, ShieldCheck, Smartphone, UserRound, type LucideIcon } from 'lucide-react'

import { AuthMethodsPage } from '../screens/AuthMethodsPage'
import { useBrand, type AccountPage as Page } from '../store'
import { DevicesPage } from './DevicesPage'
import { Overview } from './Overview'
import { PasswordPage } from './PasswordPage'
import { ProfilePage } from './ProfilePage'
import { SignInsPage } from './SignInsPage'
import { TravelPage } from './TravelPage'

/* -----------------------------------------------------------------------------
   My account (proposed User Dashboard, spec goal 2): a list of the person's own pages on the left, the page on the
   right. Sign-in methods is today's Setup 2FA, unchanged.
   -------------------------------------------------------------------------- */

const ACCOUNT_PAGES: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: 'overview', label: 'Overview', icon: Gauge },
  { page: 'methods', label: 'Sign-in methods', icon: ShieldCheck },
  { page: 'sign-ins', label: 'Recent sign-ins', icon: History },
  { page: 'devices', label: 'Devices', icon: Smartphone },
  { page: 'travel', label: 'Travel', icon: Plane },
  { page: 'profile', label: 'Profile', icon: UserRound },
  { page: 'password', label: 'Password', icon: KeyRound },
]

/* Each page's body. */
const PAGES: Record<Page, () => React.ReactNode> = {
  overview: () => <Overview />,
  methods: () => <AuthMethodsPage />,
  'sign-ins': () => <SignInsPage />,
  travel: () => <TravelPage />,
  devices: () => <DevicesPage />,
  profile: () => <ProfilePage />,
  password: () => <PasswordPage />,
}

export function AccountPage({ page }: { page: Page }) {
  const { go } = useBrand()
  const body = PAGES[page]
  return (
    <div className="bpage bud bud-acct">
      <nav className="bud-acct__nav" aria-label="My account">
        {ACCOUNT_PAGES.map((p) => {
          const on = p.page === page
          const Icon = p.icon
          return (
            <button
              key={p.page}
              type="button"
              className={`bud-acct__link${on ? ' is-on' : ''}`}
              aria-current={on ? 'page' : undefined}
              onClick={() => go({ name: 'account', page: p.page })}
            >
              <Icon size={16} strokeWidth={1.8} aria-hidden />
              <span>{p.label}</span>
            </button>
          )
        })}
      </nav>
      <div className="bud-acct__page">{body()}</div>
    </div>
  )
}
