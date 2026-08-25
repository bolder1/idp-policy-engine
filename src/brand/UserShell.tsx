import { useState, type ReactNode } from 'react'
import { Globe } from 'lucide-react'

import { ProfileMenu } from './ProfileMenu'
import { useBrand, type BrandScreen } from './store'

/* -----------------------------------------------------------------------------
   The end-user site's chrome, which is the admin console's minus almost all of
   it.

   Measured off login.xecurify.com/moas/showenduserconfiguration. The whole
   navigation is a fixed top bar: the logo, two links, a language picker and the
   account menu. There is no rail, and the reason is not restraint — it is that
   there are two destinations. A rail exists to hold a tree; two items are a row.

     Dashboard   the apps you can sign in to
     Setup 2FA   the methods screen, in its end-user point of view

   Everything else an admin has — policies, zones, hooks, the builder — is not
   hidden from a person here, it simply is not part of their product. That is
   the difference this shell exists to show, and it is why the role lives on the
   store: a screen cannot decide it has different chrome.
   -------------------------------------------------------------------------- */

const NAV: { label: string; screen: BrandScreen }[] = [
  { label: 'Dashboard', screen: { name: 'apps' } },
  { label: 'Setup 2FA', screen: { name: 'methods' } },
]

const LANGUAGES = ['English', 'Arabic', 'French', 'German', 'Italian', 'Portuguese', 'Spanish']

export function UserShell({ children }: { children: ReactNode }) {
  const { screen, go } = useBrand()
  const [lang, setLang] = useState('English')

  return (
    <div className="bus">
      <header className="bus__top">
        <a className="bus__logo" href="#" onClick={(e) => e.preventDefault()} aria-label="Xecurify by miniOrange">
          <img src="/xecurify-logo.png" alt="Xecurify by miniOrange" />
        </a>

        <nav className="bus__nav" aria-label="Main">
          {NAV.map((item) => {
            const on = screen.name === item.screen.name
            return (
              <button
                key={item.label}
                type="button"
                className={`bus__navitem ${on ? 'is-on' : ''}`}
                aria-current={on ? 'page' : undefined}
                onClick={() => go(item.screen)}
              >
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="bus__right">
          {/* The live bar carries a language picker, and it is worth keeping
              rather than dropping as chrome: it is the clearest single signal
              that this site is for everyone in the tenant, not for the person
              who configured it. */}
          <label className="bus__lang">
            <Globe size={18} strokeWidth={1.7} aria-hidden />
            <span className="u-sr-only">Language</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <ProfileMenu initials="MD" />
        </div>
      </header>

      <main className="bus__main">{children}</main>
    </div>
  )
}
