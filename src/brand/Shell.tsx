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
  HelpCircle,
  ListChecks,
  Settings,
  ShieldCheck,
  Sun,
  User,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { EditionBar } from './EditionBar'
import { ProfileMenu } from './ProfileMenu'
import { PersonaBar } from './PersonaBar'
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
  children?: { label: string; screen?: BrandScreen }[]
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
      { label: 'Apps', icon: AppWindow },
      {
        label: 'Policies',
        icon: ShieldCheck,
        screen: { name: 'policies' },
        children: [
          { label: 'All Policies', screen: { name: 'policies' } },
          { label: 'Templates', screen: { name: 'templates' } },
          { label: 'Zones', screen: { name: 'zones' } },
          /* The page calls itself "Device fingerprint"; so does the screen id
             and every sentence on it. The rail was the only place still saying
             "Device Restrictions". */
          { label: 'Device profiles', screen: { name: 'fingerprint' } },
          { label: 'Authentication methods', screen: { name: 'methods' } },
          { label: 'External Hooks', screen: { name: 'hooks' } },
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

const POLICY_SCREENS = ['policies', 'builder', 'templates', 'zones', 'fingerprint', 'methods']

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
    if (POLICY_SCREENS.includes(screen.name)) setOpen('Policies')
  }, [screen.name])

  /* The builder is where the rules are actually written — three columns of
     editing surface — so it gets the rail's 235px on arrival and hands them
     back on the way out. Anything the admin does to the rail in between wins,
     and is not undone when they leave. */
  useEffect(() => {
    if (screen.name === 'builder') {
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
        <button
          type="button"
          className="bshell__burger"
          onClick={toggleRail}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          <Menu size={21} strokeWidth={1.7} />
        </button>

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
          <EditionBar />
          <button
            className="bshell__icon"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? <Moon size={20} strokeWidth={1.7} /> : <Sun size={20} strokeWidth={1.7} />}
          </button>
          <button className="bshell__icon" title="Documentation" aria-label="Documentation">
            <BookOpen size={20} strokeWidth={1.7} />
          </button>
          <button className="bshell__icon" title="Settings" aria-label="Settings">
            <Settings size={20} strokeWidth={1.7} />
          </button>
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
                return (
                  <div key={item.label}>
                    <button
                      type="button"
                      className={`bshell__item ${active ? 'is-active' : ''} ${item.screen ? '' : 'is-inert'}`}
                      onClick={() => toggle(item)}
                      aria-current={active ? 'page' : undefined}
                      aria-expanded={item.children ? expanded : undefined}
                      title={collapsed ? item.label : item.screen ? undefined : 'Outside the scope of this revamp'}
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
                              const on =
                                c.screen &&
                                (screen.name === c.screen.name ||
                                  (c.screen.name === 'policies' && screen.name === 'builder'))
                              return (
                                <button
                                  key={c.label}
                                  type="button"
                                  className={`bshell__subitem ${on ? 'is-active' : ''} ${c.screen ? '' : 'is-inert'}`}
                                  onClick={() => c.screen && go(c.screen)}
                                  aria-current={on ? 'page' : undefined}
                                  title={c.screen ? undefined : 'Outside the scope of this revamp'}
                                >
                                  {c.label}
                                </button>
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

      {/* The console's quick-access rail, down the right edge.

          It is the one piece of the shipping chrome we did not have: two
          buttons that follow the page rather than scrolling with it, so help
          and the setup checklist are reachable from the bottom of a long table
          without going back to the top. Deliberately not a third copy of the
          topbar's icons — those open the same destinations, but from a bar that
          scrolls away.

          Narrow on purpose. It is a rail, not a panel: anything that needs more
          than an icon belongs in what the icon opens. */}
      <div className="bshell__quick" role="complementary" aria-label="Quick access">
        <button className="bshell__quickbtn is-primary" title="Documentation" aria-label="Documentation">
          <HelpCircle size={19} strokeWidth={2} />
        </button>
        <button className="bshell__quickbtn" title="Setup checklist" aria-label="Setup checklist">
          <ListChecks size={19} strokeWidth={1.9} />
        </button>
      </div>

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
