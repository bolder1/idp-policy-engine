import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  AppWindow,
  BookOpen,
  ChevronRight,
  CreditCard,
  Fingerprint,
  FileText,
  KeyRound,
  LayoutGrid,
  Menu,
  MonitorSmartphone,
  Moon,
  Palette,
  Rocket,
  Settings,
  ShieldCheck,
  Sun,
  User,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'

// `EditionBar` is not imported while the bar is hidden — see the note at its
// call site below. The component and its stylesheet are untouched.
import { ProfileMenu } from './ProfileMenu'
import { PersonaBar } from './PersonaBar'
import { BrandSwitch } from './BrandSwitch'
import { Tip } from './kit'
import { useBrand, useToast, type BrandScreen } from './store'

/* -----------------------------------------------------------------------------
   AdminShell — the live console's chrome, measured off
   test.miniorange.in/moas/admin/customer/showmaptokentouser.

   What the console does, and what this reproduces:

   · The topbar is fixed, 52px, white, full width — it runs *over* the rail
     rather than beside it, and the logo lives in it. The rail starts below.
   · The rail is 235px of #1e2c38. Items are 14px/300 white on 40px rows and
     wrap rather than truncate, which is why the current page's item is taller
     than its neighbours.
   · The active row is rgba(0,0,0,.4) with a 4.8px #eb5424 left edge and no
     radius. Sub-items are 13px/300, and the active one is #eb5424 text only.
   · Section headings are plain 14px/300 #cbcbcb sentence case — not the small
     uppercase label pattern used elsewhere in the product.
   · Only one accordion is open at a time: opening one closes the last.

   Icons are Lucide at 20px, which is the size and stroke weight the console's
   own set is drawn at.
   -------------------------------------------------------------------------- */

interface NavItem {
  label: string
  icon: LucideIcon
  screen?: BrandScreen
  badge?: string
  children?: { label: string; screen?: BrandScreen; tag?: string }[]
}

/* The tree, its order and its sub-menus are the console's. Items without a
   screen are present so the rail matches what an admin already knows; they open
   and close, but their pages are outside this revamp. */
const NAV: { section?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: 'Dashboard', icon: LayoutGrid },
      { label: 'Getting Started', icon: Rocket },
    ],
  },
  {
    section: 'Configure',
    items: [
      { label: 'Identity Providers', icon: Fingerprint },
      { label: 'Apps', icon: AppWindow, screen: { name: 'applications' } },
      {
        label: 'Policies',
        icon: ShieldCheck,
        screen: { name: 'policies' },
        children: [
          { label: 'All Policies', screen: { name: 'policies' } },
          /* Two of these are honestly unfinished, and the rail says so rather
             than letting somebody find out by opening them. A quiet tag, not
             the brand-filled badge "New" gets: one is an announcement and the
             other is a caveat, and they must not read alike. */
          { label: 'Templates', screen: { name: 'templates' }, tag: 'WIP' },
          { label: 'Zones', screen: { name: 'zones' } },
          /* The page calls itself "Device fingerprint"; so does the screen id
             and every sentence on it. The rail was the only place still saying
             "Device Restrictions". */
          { label: 'Device profiles', screen: { name: 'fingerprint' } },
          /* Directly after the device profiles, because they are the two halves
             of one question: whether this is the same device, and whether
             anything about it is suspicious. */
          { label: 'Risk signal profile', screen: { name: 'risk-signals' } },
          { label: 'Authentication methods', screen: { name: 'methods' } },
          { label: 'External Hooks', screen: { name: 'hooks' }, tag: 'WIP' },
        ],
      },
      {
        label: 'Customization',
        icon: Palette,
        children: [
          { label: 'Login and Registration Branding' },
          { label: 'Custom Email Provider' },
          { label: 'Custom SMS Provider' },
          { label: 'Email and SMS Templates' },
          { label: 'Add Custom Scopes' },
        ],
      },
      {
        label: 'Automations',
        icon: Zap,
        children: [{ label: 'Inline Hook' }, { label: 'Workflows' }, { label: 'Rules' }, { label: 'Approvals' }],
      },
      {
        label: 'Authentication methods',
        icon: KeyRound,
        children: [
          { label: 'Setup 2FA for Admin' },
          { label: 'Alternate 2FA Login Methods' },
          { label: '2FA Options For EndUsers' },
          { label: 'Assign Hardware Token to Users' },
          { label: 'Static Code Generation' },
        ],
      },
      {
        label: 'Devices',
        icon: MonitorSmartphone,
        badge: 'New',
        children: [{ label: 'Trusted Devices' }, { label: 'MFA Agents' }],
      },
    ],
  },
  {
    section: 'Manage',
    items: [
      {
        label: 'Users',
        icon: User,
        children: [
          { label: 'User List' },
          { label: 'User Roles' },
          { label: 'User Profile Fields' },
          { label: 'Manage Shared Identity' },
          { label: 'Progressive Profiling' },
          { label: 'Impersonation' },
        ],
      },
      {
        label: 'Groups',
        icon: Users,
        children: [
          { label: 'Manage Groups' },
          { label: 'Group Custom Fields' },
          { label: 'Group Membership Custom Fields' },
          { label: 'Auto assign groups rules' },
        ],
      },
      { label: 'SIEM Management', icon: Activity },
      { label: 'Reports', icon: FileText },
      { label: 'License', icon: CreditCard, children: [{ label: 'View Licenses' }, { label: 'Manage Cards' }] },
    ],
  },
]

/* What a row says in its Tip. These were native titles, which a keyboard never
   reached. */
const NOT_BUILT = 'Not built in this prototype.'
const WIP_TIP = 'Work in progress: the page opens, but it is not finished.'

/* Every screen that lives under Policies.

   `board`, `policy-details` and `hooks` were missing, and three things key off
   this list: the parent's `is-active` class, its `aria-current`, and the
   submenu that auto-opens. So on the board the rail showed no location at all
   — no highlight, nothing announced as the current page — while being the
   widest thing on the screen. `risk-signals` was missing the same way. */
const POLICY_SCREENS = [
  'policies',
  'builder',
  'board',
  'policy-details',
  'templates',
  'zones',
  'fingerprint',
  'risk-signals',
  'hooks',
  'methods',
]

/* The two builders, which want the rail out of the way.

   Landing on a builder used to auto-open the Policies submenu, which expands
   the rail and takes ~171px off a canvas whose whole job is to show a chain of
   cards. The submenu is one click away and the builder is a place you come to
   work, not to navigate. */
const BUILDER_SCREENS = ['builder', 'board']

function isActive(current: BrandScreen, item: NavItem): boolean {
  if (item.label === 'Policies') return POLICY_SCREENS.includes(current.name)
  return item.screen ? current.name === item.screen.name : false
}

export function Shell({ children }: { children: ReactNode }) {
  const { screen, go } = useBrand()
  const main = useRef<HTMLElement>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [collapsed, setCollapsed] = useState(false)
  // One at a time. Opening a menu closes whichever was open before it.
  const [open, setOpen] = useState<string | null>('Policies')
  /* True only while the rail is collapsed because the builder asked for the
     width — not because the admin chose to collapse it. Without the
     distinction, leaving the builder would expand a rail the admin had
     deliberately closed. */
  const autoCollapsed = useRef(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    main.current?.scrollTo({ top: 0 })
  }, [screen])

  // Landing on a policy screen from anywhere else opens the menu that holds it,
  // so the rail always shows where you are.
  useEffect(() => {
    if (POLICY_SCREENS.includes(screen.name) && !BUILDER_SCREENS.includes(screen.name)) setOpen('Policies')
  }, [screen.name])

  /* A builder is where the rules are actually written — an editing surface
     that wants every pixel — so it gets the rail's 235px on arrival and hands
     them back on the way out. Anything the admin does to the rail in between
     wins, and is not undone when they leave.

     `BUILDER_SCREENS`, not `'builder'`. This named one of the two builders, so
     the trail ran at a 64px rail and the board at 235px: switching Trail →
     Board handed 171px of a canvas whose entire job is showing a chain of
     cards back to a navigation menu, and switching back took it away again.
     The board is the surface with the stronger claim to the space of the two. */
  useEffect(() => {
    if (BUILDER_SCREENS.includes(screen.name)) {
      setCollapsed((c) => {
        if (!c) autoCollapsed.current = true
        return true
      })
    } else if (autoCollapsed.current) {
      autoCollapsed.current = false
      setCollapsed(false)
    }
  }, [screen.name])

  function toggleRail() {
    // A deliberate choice, so the builder stops managing it from here.
    autoCollapsed.current = false
    setCollapsed((c) => !c)
  }

  function toggle(item: NavItem) {
    /* A submenu cannot render in 64px, so a parent has to open the rail — and
       that counts as the admin's choice. A leaf just navigates: clicking an
       icon in a collapsed rail is not a request to un-collapse it. */
    if (collapsed && item.children) {
      autoCollapsed.current = false
      setCollapsed(false)
    }
    if (item.children) {
      setOpen((cur) => (cur === item.label ? null : item.label))
      // A parent that is also a page navigates as well as opens.
      if (item.screen && open !== item.label) go(item.screen)
      return
    }
    if (item.screen) go(item.screen)
  }

  return (
    <div className={`bshell ${collapsed ? 'is-collapsed' : ''}`}>
      <header className="bshell__top">
        <Tip text={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
          <button
            type="button"
            className="bshell__burger"
            onClick={toggleRail}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!collapsed}
          >
            <Menu size={21} strokeWidth={1.7} />
          </button>
        </Tip>

        <a className="bshell__logo" href="#" onClick={(e) => e.preventDefault()} aria-label="Xecurify by miniOrange">
          <img src="/xecurify-logo.png" alt="Xecurify by miniOrange" />
        </a>

        <div className="bshell__topright">
          {/* The edition switch belongs on the shell, not on a screen: the flag
              it flips spans the list, the create flow and the builder. */}
          {/* Two prototype controls, side by side and both labelled as such.
              The edition switch changes what the product CAN do; the persona
              switch changes who is looking and what is in their tenant. */}
          <PersonaBar />
          <BrandSwitch />
          {/* `<EditionBar />` stood here: the Lite / Full switch and the
              "N things this cannot answer" button beside it.

              Hidden, not deleted. The edition machinery is untouched —
              `featuresOf`, every `features.*` gate, the whole `edition.ts`
              catalogue of what each one answers — and the store still holds an
              edition, so every screen keeps reading the flags rather than the
              name. What has gone is the control that let somebody flip it, and
              the count of open questions beside it: both are about how this
              prototype was built, and neither is a thing the product does.

              `lite` is the default now — see `store.tsx`. Restoring the bar is
              uncommenting this line. */}
          {/* Each icon shows its name in a Tip. A native title never reached a
              keyboard. */}
          <Tip text={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
            <button
              type="button"
              className="bshell__icon"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            >
              {theme === 'light' ? <Moon size={20} strokeWidth={1.7} /> : <Sun size={20} strokeWidth={1.7} />}
            </button>
          </Tip>
          <Tip text="Documentation">
            <button type="button" className="bshell__icon" aria-label="Documentation">
              <BookOpen size={20} strokeWidth={1.7} />
            </button>
          </Tip>
          <Tip text="Settings">
            <button type="button" className="bshell__icon" aria-label="Settings">
              <Settings size={20} strokeWidth={1.7} />
            </button>
          </Tip>
          <ProfileMenu initials="JT" />
        </div>
      </header>

      <aside className="bshell__rail">
        <nav className="bshell__nav" aria-label="Console">
          {NAV.map((group, gi) => (
            <div key={group.section ?? gi} className="bshell__group">
              {group.section && <p className="bshell__section">{group.section}</p>}

              {group.items.map((item) => {
                const active = isActive(screen, item)
                const expanded = !collapsed && open === item.label
                const Ico = item.icon
                /* Collapsed, the label and the badge are hidden, so the row takes
                   its name from aria-label and shows it in a Tip. */
                const name = item.badge ? `${item.label}, ${item.badge}` : item.label
                const caveat = item.screen ? null : NOT_BUILT
                const collapsedTip = caveat ? `${name}. ${caveat}` : name
                const tip = collapsed ? collapsedTip : caveat
                const row = (
                  <button
                    type="button"
                    className={`bshell__item ${active ? 'is-active' : ''} ${item.screen ? '' : 'is-inert'}`}
                    onClick={() => toggle(item)}
                    aria-current={active ? 'page' : undefined}
                    aria-expanded={item.children ? expanded : undefined}
                    aria-label={collapsed ? name : undefined}
                  >
                    <Ico className="bshell__ico" size={20} strokeWidth={1.6} aria-hidden />
                    <span className="bshell__item-label">{item.label}</span>
                    {item.badge && <span className="bshell__badge">{item.badge}</span>}
                    {item.children && (
                      <ChevronRight
                        className={`bshell__chev ${expanded ? 'is-open' : ''}`}
                        size={16}
                        strokeWidth={1.8}
                        aria-hidden
                      />
                    )}
                  </button>
                )
                return (
                  <div key={item.label}>
                    {tip ? <Tip text={tip}>{row}</Tip> : row}

                    <AnimatePresence initial={false}>
                      {item.children && expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div className="bshell__sub">
                            {item.children.map((c) => {
                              /* Both builders and the details page are a policy
                                 opened from All Policies, so all three light it. */
                              const on =
                                c.screen &&
                                (screen.name === c.screen.name ||
                                  (c.screen.name === 'policies' &&
                                    [...BUILDER_SCREENS, 'policy-details'].includes(screen.name)))
                              const tip = c.tag ? WIP_TIP : c.screen ? null : NOT_BUILT
                              const row = (
                                <button
                                  key={c.label}
                                  type="button"
                                  className={`bshell__subitem ${on ? 'is-active' : ''} ${c.screen ? '' : 'is-inert'}`}
                                  onClick={() => c.screen && go(c.screen)}
                                  aria-current={on ? 'page' : undefined}
                                >
                                  {c.label}
                                  {c.tag && <span className="bshell__wip">{c.tag}</span>}
                                </button>
                              )
                              return tip ? (
                                <Tip key={c.label} text={tip}>
                                  {row}
                                </Tip>
                              ) : (
                                row
                              )
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main className="bshell__main" ref={main}>
        {children}
      </main>

      {/* A quick-access rail floated down the right edge here — help and the
          setup checklist, following the page rather than scrolling with it.
          Both open destinations the topbar already offers, and the pair sat
          over the content on every screen to save a scroll to the top. Out for
          now; the topbar keeps the icons. */}

      <Toast />
    </div>
  )
}

/* Its own component, so subscribing to the toast re-renders this node rather
   than the whole shell around it. */
function Toast() {
  const toast = useToast()
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          className="bshell__toast"
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.99 }}
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          role="status"
        >
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Page header used by every screen — title, caption, and one brand action. */
export function PageHead({
  title,
  caption,
  actions,
  breadcrumb,
}: {
  title: string
  caption?: string
  actions?: ReactNode
  breadcrumb?: ReactNode
}) {
  return (
    <header className="bpage__head">
      {breadcrumb && <div className="bpage__crumb">{breadcrumb}</div>}
      {/* Title, then caption under it, matching the three screens that build
          their own header — Zones, Device fingerprint and Authentication
          methods. They have always stacked; this shared one did not, so the
          console drew its page head two ways depending on the screen.

          No `title` on the caption any more. It was there because the caption
          used to truncate, and a tooltip repeating a sentence that is now
          printed in full is a hover box with nothing in it. */}
      <div className="bpage__headrow">
        <div className="bpage__title">
          <h1>{title}</h1>
          {caption && <p>{caption}</p>}
        </div>
        {actions && <div className="bpage__actions">{actions}</div>}
      </div>
    </header>
  )
}
