import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import {
  Activity,
  AppWindow,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FileText,
  IdCard,
  KeyRound,
  LayoutGrid,
  type LucideIcon,
  MonitorSmartphone,
  Moon,
  Palette,
  PanelLeft,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
  Zap,
} from 'lucide-react'

// `EditionBar` is not imported while the bar is hidden — see the note at its
// call site below. The component and its stylesheet are untouched.
import { ProfileMenu } from './ProfileMenu'
import { PersonaBar } from './PersonaBar'
import { BrandSwitch } from './BrandSwitch'
import { Tip } from './kit'
import { useBrand, useToast, type BrandScreen } from './store'
import { useTheme } from './theme-mode'

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
  children?: {
    label: string
    screen?: BrandScreen
    tag?: string
    /** False for a shortcut into a page that another item already lights. See `UNDER_ITEM`. */
    lights?: boolean
  }[]
}

/* The tree, its order and its sub-menus are the console's. Items without a
   screen are present so the rail matches what an admin already knows; they open
   and close, but their pages are outside this revamp. */
const NAV: { section?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: 'Dashboard', icon: LayoutGrid },
      { label: 'Getting Started', icon: ClipboardCheck },
    ],
  },
  {
    section: 'Configure',
    items: [
      { label: 'Identity Providers', icon: IdCard },
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
          { label: 'Templates', screen: { name: 'templates' }, tag: 'In progress' },
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
          { label: 'External Hooks', screen: { name: 'hooks' }, tag: 'In progress' },
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
          /* The live console's own way in to the Display tokens page, so it
             opens it (15 Sep 2026). It does not light: the page says it is under
             Policies > Authentication methods, and one place in the rail says so. */
          { label: 'Assign Hardware Token to Users', screen: { name: 'display-tokens', tab: 'assignments' }, lights: false },
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
        icon: UserRound,
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
const WIP_TIP = 'The page opens, but it is not finished.'

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
  'display-tokens',
]

/* The two builders, which want the rail out of the way.

   Landing on a builder used to auto-open the Policies submenu, which expands
   the rail and takes ~171px off a canvas whose whole job is to show a chain of
   cards. The submenu is one click away and the builder is a place you come to
   work, not to navigate. */
const BUILDER_SCREENS = ['builder', 'board']

/* Screens that light a sub-item without being its screen: a page opened from
   inside another lights the item it was opened from. Both builders and the
   details page are a policy opened from All Policies; Display tokens is opened
   only from Authentication methods, so that is where the rail says you are. */
const UNDER_ITEM: Record<string, string[]> = {
  policies: [...BUILDER_SCREENS, 'policy-details'],
  methods: ['display-tokens'],
}

function isActive(current: BrandScreen, item: NavItem): boolean {
  if (item.label === 'Policies') return POLICY_SCREENS.includes(current.name)
  return item.screen ? current.name === item.screen.name : false
}

/* Below this the rail stops being a column and becomes an overlay drawer.

   The console had no phone layout at all: `.bshell` is a two-track grid and its
   last width breakpoint was 1120px, which only takes the rail 235px → 200px. On
   a 375px screen that left the rail holding 53% of the width and the content
   column 175px, with the page overflowing 308px. Measured 18 Sep 2026.

   900px, the same number `PolicyBuilderMain` floats its rules panel at — one
   breakpoint for "there is no room for a second column", not two. */
const RAIL_OVERLAYS = '(max-width: 900px)'

function useNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(RAIL_OVERLAYS).matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(RAIL_OVERLAYS)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

export function Shell({ children }: { children: ReactNode }) {
  const { screen, go } = useBrand()
  const main = useRef<HTMLElement>(null)
  const nav = useRef<HTMLElement>(null)
  const [theme, setTheme] = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const narrow = useNarrow()
  /* The overlay drawer's own state, kept apart from `collapsed` on purpose.
     `collapsed` means "the rail is a 64px icon strip" and the builder drives it;
     reusing it for "the drawer is off-canvas" would make leaving a builder slide
     the drawer OPEN on a phone. Two meanings, two flags. Closed to start with:
     an overlay that covers the page is not what you want on arrival. */
  const [navOpen, setNavOpen] = useState(false)
  /* The rail row to put focus back on after the rail changes width. A row
     gains or loses its Tip wrapper when the rail collapses or expands, which
     remounts the button that had focus and drops focus to the page. */
  const refocus = useRef<string | null>(null)
  // One at a time. Opening a menu closes whichever was open before it.
  const [open, setOpen] = useState<string | null>('Policies')
  /* True only while the rail is collapsed because the builder asked for the
     width — not because the admin chose to collapse it. Without the
     distinction, leaving the builder would expand a rail the admin had
     deliberately closed. */
  const autoCollapsed = useRef(false)

  useEffect(() => {
    const label = refocus.current
    refocus.current = null
    if (!label) return
    const row = [...(nav.current?.querySelectorAll<HTMLButtonElement>('[data-rail-item]') ?? [])].find(
      (b) => b.dataset.railItem === label,
    )
    row?.focus()
  }, [collapsed])

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
    /* Nothing to hand over on a phone: the rail is already off the page, and
       running this here would leave `collapsed` true after the admin leaves a
       builder, so the rail came back as the 64px strip once the window widened
       again. */
    if (narrow) return
    if (BUILDER_SCREENS.includes(screen.name)) {
      setCollapsed((c) => {
        if (!c) autoCollapsed.current = true
        return true
      })
    } else if (autoCollapsed.current) {
      autoCollapsed.current = false
      setCollapsed(false)
    }
  }, [screen.name, narrow])

  /* The drawer covers the page, so it closes the moment it has done its job —
     on arrival at a screen, and when the window grows back into a real column. */
  useEffect(() => {
    setNavOpen(false)
  }, [screen.name])
  useEffect(() => {
    if (!narrow) setNavOpen(false)
  }, [narrow])
  /* Escape shuts it, the way every other overlay in the console closes. */
  useEffect(() => {
    if (!navOpen) return
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [navOpen])

  function toggleRail() {
    /* One button, two jobs, because there is only ever one of them on screen:
       narrow, it opens and shuts the overlay; wide, it sets the rail's width. */
    if (narrow) {
      setNavOpen((o) => !o)
      return
    }
    // A deliberate choice, so the builder stops managing it from here.
    autoCollapsed.current = false
    setCollapsed((c) => !c)
  }

  /* What the burger says, in whichever layout is on screen. A drawer opens and
     closes; a column expands and collapses — the wide wording is the console's
     own and is left exactly as it was. */
  const railShut = narrow ? !navOpen : collapsed
  const railLabel = narrow
    ? railShut
      ? 'Open navigation'
      : 'Close navigation'
    : railShut
      ? 'Expand navigation'
      : 'Collapse navigation'

  function toggle(item: NavItem) {
    /* A submenu cannot render in 64px, so a parent has to open the rail — and
       that counts as the admin's choice. A leaf just navigates: clicking an
       icon in a collapsed rail is not a request to un-collapse it. */
    if (collapsed && item.children) {
      autoCollapsed.current = false
      refocus.current = item.label
      setCollapsed(false)
      /* Expanding shows this item's submenu. Toggling here closed a submenu
         that was already marked open behind the collapsed rail, so the click
         only widened the rail. */
      setOpen(item.label)
      return
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
    <div className={`bshell ${!narrow && collapsed ? 'is-collapsed' : ''} ${narrow && navOpen ? 'is-navopen' : ''}`}>
      <header className="bshell__top">
        <Tip text={railLabel}>
          <button
            type="button"
            className="bshell__burger"
            onClick={toggleRail}
            aria-label={railLabel}
            aria-expanded={!railShut}
          >
            <PanelLeft size={21} strokeWidth={1.7} />
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
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            >
              {theme === 'light' ? <Moon size={20} strokeWidth={1.7} /> : <Sun size={20} strokeWidth={1.7} />}
            </button>
          </Tip>
          <Tip text={`Documentation. ${NOT_BUILT}`}>
            <button type="button" className="bshell__icon is-inert" aria-label="Documentation" aria-disabled="true">
              <BookOpen size={20} strokeWidth={1.7} />
            </button>
          </Tip>
          <Tip text={`Settings. ${NOT_BUILT}`}>
            <button type="button" className="bshell__icon is-inert" aria-label="Settings" aria-disabled="true">
              <Settings size={20} strokeWidth={1.7} />
            </button>
          </Tip>
          <ProfileMenu />
        </div>
      </header>

      {/* The way out of an overlay that covers the page. A button, not a div:
          it is a real control, so it is reachable and it says what it does. */}
      {narrow && navOpen && (
        <button type="button" className="bshell__scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)} />
      )}

      <aside className="bshell__rail" inert={narrow && !navOpen ? true : undefined}>
        <nav className="bshell__nav" aria-label="Console" ref={nav}>
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
                /* A group with one built page in it is not "not built". */
                const caveat = item.screen || item.children?.some((c) => c.screen) ? null : NOT_BUILT
                const collapsedTip = caveat ? `${name}. ${caveat}` : name
                const tip = collapsed ? collapsedTip : caveat
                const row = (
                  <button
                    type="button"
                    className={`bshell__item ${active ? 'is-active' : ''} ${caveat ? 'is-inert' : ''}`}
                    data-rail-item={item.label}
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
                              /* Its own screen, or one opened from it — see `UNDER_ITEM`. */
                              const on =
                                c.screen &&
                                c.lights !== false &&
                                (screen.name === c.screen.name || !!UNDER_ITEM[c.screen.name]?.includes(screen.name))
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

      {/* The toast and the one leave dialog are mounted beside the shell in
          BrandApp's Chrome, so the end-user side has them too. */}
    </div>
  )
}

/* Its own component, so subscribing to the toast re-renders this node rather
   than the whole shell around it.

   Two parts. The live region is always in the page and only its text changes,
   because a region inserted together with its text is often not announced; the
   text node is keyed by the toast id so the same message twice is read twice.
   The pill is only visual, keyed the same way so a repeat animates in again. */
export function Toast() {
  const toast = useToast()
  return (
    <>
      <div className="u-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {toast && <span key={toast.id}>{toast.text}</span>}
      </div>
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className="bshell__toast"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            aria-hidden="true"
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/** Page header used by every screen: the title and its caption, and at most a
    Documentation link or a page's preview switches. See `PageBar` for where a
    page's actions go. */
export function PageHead({
  title,
  caption,
  docs,
  preview,
  headRef,
}: {
  title: string
  caption?: string
  /** A Documentation link against the right edge. */
  docs?: boolean
  /** Switches that compare two versions of this page — its width, Device
      profiles' create flow — against the right edge. Never a list action;
      those are on `PageBar`. */
  preview?: ReactNode
  /** For a page that puts focus back on its heading. */
  headRef?: Ref<HTMLElement>
}) {
  return (
    <header className="bpage__head" ref={headRef}>
      {/* Title, then caption under it, in one container on one row (owner, 16
          Sep 2026: "the heading and subheading in one container, in one row").
          Beside it: at most Documentation, or the page's preview switches.

          No `title` on the caption any more. It was there because the caption
          used to truncate, and a tooltip repeating a sentence that is now
          printed in full is a hover box with nothing in it. */}
      <div className="bpage__headrow">
        <div className="bpage__title">
          <h1>{title}</h1>
          {caption && <p>{caption}</p>}
        </div>
        {preview && <div className="bpage__preview">{preview}</div>}
        {/* Documentation is not built in this prototype, so the link is the top
            bar's inert one — present, named, and saying so — rather than a
            link to nowhere. */}
        {docs && (
          <Tip text={`Documentation. ${NOT_BUILT}`}>
            <button type="button" className="bpage__docs" aria-disabled="true">
              <BookOpen size={15} strokeWidth={1.8} aria-hidden />
              Documentation
            </button>
          </Tip>
        )}
      </div>
    </header>
  )
}
