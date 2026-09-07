import { useMemo, useState } from 'react'
import {
  Activity,
  AppWindow,
  Bug,
  Copy,
  Crosshair,
  Eye,
  FileWarning,
  House,
  Info,
  MonitorSmartphone,
  Puzzle,
  Route,
  Search,
  Server,
  ShieldOff,
  Smartphone,
  Unlock,
  Waypoints,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import { PageHead } from '../Shell'
import { Button, Toggle } from '../kit'
import { Picker } from '../picker'
import { TierPick } from '../tier-pick'
import { PlatformMark } from '../logos/PlatformMark'
import { useBrand } from '../store'
import {
  EMPTY_RISK_PROFILE,
  PLATFORMS,
  RISK_SIGNALS,
  SIGNAL_CATEGORIES,
  countOn,
  isOn,
  tierFor,
  tierKey,
  type RiskProfile,
  type RiskSignal,
  type SignalCategory,
} from '../risk-signals'

import './risk-signals.css'

/* A mark per signal, tinted by the family it belongs to.

   Two jobs, and the second is the one that earns it. A distinct glyph makes a
   row recognisable in a table of sixteen that are all one sentence of grey text
   under one name of dark text — but a glyph alone is decoration. The TONE
   carries the category, which matters precisely when the category heading is
   not on screen: searching flattens the list, and until now the only thing
   saying which family a hit came from was a 10px line of muted text under the
   sentence.

   Never `negative`. Red means danger in this kit, and every one of these
   signals is about danger — if they were all red the tone would carry nothing,
   and the two that genuinely warrant alarm (a rooted handset, a known attack
   source) would stop standing out. The severity is the weight column's job.

   Sixteen distinct glyphs, and the distinctness is the point rather than a
   flourish. The first pass reused one for both emulator and simulator, one for
   both rooted and jailbroken, and one for both VPN and residential proxy —
   three pairs that a reader scanning the column would have taken for the same
   thing twice. Those are exactly the pairs worth telling apart: they differ by
   platform, and the platform is the next column along. */
const SIGNAL_ICON: Record<string, LucideIcon> = {
  // Device integrity — the handset is not what it claims to be.
  emulator: MonitorSmartphone, // a handset drawn on a desktop
  simulator: AppWindow, // Xcode's window
  rooted: Unlock,
  jailbroken: ShieldOff,
  cloned: Copy,
  'dev-mode': Wrench,

  // Instrumentation — something is interfering with the running app.
  hooking: Puzzle, // a piece slotted into the app as it runs
  debugger: Bug,
  'tampered-request': FileWarning,
  mitm: Eye, // something is reading the traffic

  // Network origin — where the connection actually came from.
  tor: Waypoints, // relayed through nodes
  datacenter: Server,
  'residential-proxy': House, // somebody else's home address
  vpn: Route, // a tunnel

  // The last two.
  'known-attacker': Crosshair,
  'high-activity': Activity,
}

const CATEGORY_TONE: Record<SignalCategory, string> = {
  'Device integrity': 'accent',
  Instrumentation: 'magenta',
  'Network origin': 'info',
  'Address reputation': 'notice',
  Behaviour: 'lime',
}

/** The glyph for a signal, falling back rather than rendering nothing. */
const signalIcon = (id: string): LucideIcon => SIGNAL_ICON[id] ?? Smartphone

/* -----------------------------------------------------------------------------
   The risk signal profile.

   One page, one weighting, for the whole tenant. Every signal a mobile sign-in
   can carry, whether this tenant listens to it, and how hard it pushes when it
   fires — on Android and on iOS separately, because the two platforms do not
   report the same things with the same confidence.

   The thing that makes this a settings page rather than a decoration is at the
   top of it: the scale. `device-risk` — "Device Risk Score above 60" — is the
   one condition in the product that compares a rule's threshold against a
   number, and that number now comes from here. So the strip is not a summary of
   the page, it is the page's output, and it moves while you edit.
   -------------------------------------------------------------------------- */

const ALL = 'All'

export function RiskSignals() {
  const store = useBrand()
  const { riskProfile: profile, setRiskProfile, riskScale } = store
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>(ALL)

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return RISK_SIGNALS.filter((s) => {
      if (cat !== ALL && s.category !== cat) return false
      if (!n) return true
      /* Searching leaves the category behind, the same way the condition
         catalogue's does: a query that matches nothing in the selected
         category would otherwise show an empty pane with the answer one click
         away. */
      return `${s.name} ${s.purpose} ${s.category}`.toLowerCase().includes(n)
    })
  }, [q, cat])

  /* Grouped into five sections once, each with its own heading, its own count
     and its own repeated `Signal / Android / iOS / On` header row. Sixteen
     signals do not need five tables: the headings were four fifths chrome, and
     a reader scanning for one signal had to find which of five blocks it lived
     in first. One table, and the category rides on the row as a pill — which is
     where it was already going whenever a search flattened the list. */

  const toggle = (s: RiskSignal, on: boolean) =>
    setRiskProfile({ ...profile, off: on ? profile.off.filter((id) => id !== s.id) : [...profile.off, s.id] })

  const setTier = (s: RiskSignal, p: 'android' | 'ios', t: (typeof RISK_SIGNALS)[number]['tier']) =>
    setRiskProfile({ ...profile, tiers: { ...profile.tiers, [tierKey(s.id, p)]: t } })

  const touched = profile.off.length > 0 || Object.keys(profile.tiers).length > 0
  const onCount = countOn(profile)

  return (
    <div className="bpage">
      <PageHead
        title="Risk signal profile"
        caption="What a suspicious sign-in is worth. Switch a signal off to stop listening to it, or change how hard it pushes when it fires."
        actions={
          /* Absent until there is something to restore. A button that resets a
             page nobody has changed is a button whose only possible outcome is
             nothing happening. */
          touched ? (
            <Button
              variant="secondary"
              onClick={() => {
                setRiskProfile(EMPTY_RISK_PROFILE)
                store.showToast('Risk signals back to their shipped weights')
              }}
            >
              Restore defaults
            </Button>
          ) : undefined
        }
      />

      {/* The output, not a summary.

          Three numbers a rule can be written against, recalculated as the page
          is edited. Somebody who switches off half the catalogue should watch
          "High" fall while they do it — that is the consequence of the choice,
          and it is the only place in the product where it is visible. */}
      <div className="brs__scale" aria-live="polite">
        <div className="brs__scale__what">
          <b>What a risk verdict scores</b>
          <em>
            Rules compare against these with <strong>Device Risk Score</strong>. {onCount} of {RISK_SIGNALS.length} signals on.
          </em>
        </div>
        <dl className="brs__bands">
          {(['Low', 'Medium', 'High'] as const).map((b) => (
            <div key={b} className={`brs__band is-${b.toLowerCase()}`}>
              <dt>{b}</dt>
              <dd>{riskScale[b]}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Said once, plainly, rather than implied by a column of dashes.

          The reference this was modelled on carries a Web column full of them.
          A dash reads as "not yet", and there is no web collection coming — so
          the gap is a sentence, where somebody can read it and decide whether
          it matters to them. */}
      <p className="brs__gap">
        <Info size={13} strokeWidth={2} aria-hidden />
        <span>
          These signals come from the mobile SDKs. A sign-in from a browser carries none of them, so its risk verdict is
          whatever the rest of the policy decides — this page does not change it.
        </span>
      </p>

      <div className="btoolbar">
        <label className="brs__search">
          <Search size={14} strokeWidth={2} aria-hidden />
          <input
            type="search"
            value={q}
            placeholder="Search signals…"
            aria-label="Search risk signals"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {/* A select, not six chips.

            Six chips is a row of buttons showing five answers nobody chose in
            order to show the one they did, and it wrapped to two lines on a
            narrow window — where the thing it filters is a single table that
            fits comfortably. A closed select says which filter is on, in the
            width of the word. */}
        <Picker
          label="Filter by category"
          value={cat}
          options={[
            { value: ALL, label: 'All categories', meta: `${RISK_SIGNALS.length} signals` },
            ...SIGNAL_CATEGORIES.map((c) => {
              const n = RISK_SIGNALS.filter((s) => s.category === c).length
              return { value: c, label: c, meta: `${n} signal${n === 1 ? '' : 's'}` }
            }),
          ]}
          onChange={setCat}
        />
      </div>

      {shown.length === 0 ? (
        <p className="brs__none">No signal matches “{q.trim()}”.</p>
      ) : (
        <SignalTable items={shown} profile={profile} onToggle={toggle} onTier={setTier} />
      )}
    </div>
  )
}

/* Every signal, in one table.

   It was five, one per category, each with a heading carrying a count and its
   own repeated column header. That shape earns its keep when the sections are
   long enough that you lose the header scrolling; sixteen rows is not that, and
   the cost was paid on every read — four extra headings, five extra header
   rows, and the question "which block is Tor in" standing between somebody and
   the row they came for.

   The category is on the row instead, as a pill. It was already rendered there
   whenever a search flattened the list, which is the tell: the information was
   wanted per row, and the headings were how it got there when nothing had been
   typed. */
function SignalTable({
  items,
  profile,
  onToggle,
  onTier,
}: {
  items: RiskSignal[]
  profile: RiskProfile
  onToggle: (s: RiskSignal, on: boolean) => void
  onTier: (s: RiskSignal, p: 'android' | 'ios', t: RiskSignal['tier']) => void
}) {
  return (
    <div className="brs__table" role="table" aria-label="Risk signals">
      <div className="brs__row brs__row--head" role="row">
        <span role="columnheader">Signal</span>
        {/* Mapped from PLATFORMS, like the cells underneath, so a third
            platform cannot arrive as two columns of weights under one heading.
            The marks are the real ones — a row saying "Not collected" is
            answering a question about a PLATFORM, and the platform is quicker
            to recognise by its logo than to read. */}
        {PLATFORMS.map((p) => (
          <span role="columnheader" className="brs__col" key={p.id}>
            <PlatformMark platform={p.id} />
            {p.label}
          </span>
        ))}
        <span role="columnheader" className="brs__col brs__col--on">
          On
        </span>
      </div>

      {items.map((s) => {
        const live = isOn(profile, s.id)
        return (
          <div className={`brs__row ${live ? '' : 'is-off'}`} role="row" key={s.id}>
            <span className="brs__sig" role="cell">
              {/* Outside the text column, so the name and the sentence keep one
                  left edge down the whole table. Inside it, every row's text
                  would start wherever that row's glyph happened to end. */}
              <i className={`brs__mark is-${CATEGORY_TONE[s.category]}`} aria-hidden>
                {(() => {
                  const Ico = signalIcon(s.id)
                  return <Ico size={15} strokeWidth={1.9} />
                })()}
              </i>
              <span className="brs__sigtext">
                <span className="brs__name">
                  <b>{s.name}</b>
                  {/* The heading, per row. Same tone as the mark beside it, so
                      the two say one thing rather than two. */}
                  <i className={`brs__cat is-${CATEGORY_TONE[s.category]}`}>{s.category}</i>
                </span>
                <em>{s.purpose}</em>
              </span>
            </span>

            {PLATFORMS.map((p) => (
              /* `data-label` feeds the narrow layout, where the header row is
                 hidden and each cell prints its own column name. The rule that
                 reads it has been in the stylesheet all along with nothing to
                 read — so under 900px both weight columns were unlabelled and
                 the two dropdowns sat in a row with nothing saying which was
                 Android and which was iOS. */
              <span className="brs__col" role="cell" data-label={p.label} key={p.id}>
                {s.on.includes(p.id) ? (
                  <TierPick value={tierFor(profile, s, p.id)} label={`${s.name} weight on ${p.label}`} onChange={(t) => onTier(s, p.id, t)} />
                ) : (
                  /* A dash, and the words moved to where they can still be
                     had.

                     This said "Not collected" in full, on the argument that a
                     dash is ambiguous between "off", "zero" and "not
                     collected" when only the third is true. The argument was
                     right about the ambiguity and wrong about the cost: two
                     words of grey text repeated down two columns sixteen rows
                     deep drew the eye to the cells that hold nothing, which is
                     the opposite of what a weights table is for. The signals
                     that DO collect are the content, and they were competing
                     with a sentence.

                     So the cell is a dash and the sentence survives as the
                     accessible name — hover it, or reach it with a screen
                     reader, and it still says which of the three it is. An em
                     dash rather than two hyphens, because that is the
                     character this console already uses for "nothing here"
                     wherever a cell has no value. */
                  <span className="bx-tiers--none" title={`Not collected on ${p.label}`}>
                    <span aria-hidden>—</span>
                    <span className="u-sr">Not collected</span>
                  </span>
                )}
              </span>
            ))}

            <span className="brs__col brs__col--on" role="cell">
              <Toggle checked={live} onChange={(v) => onToggle(s, v)} label={`${s.name} is ${live ? 'on' : 'off'}`} size="sm" />
            </span>
          </div>
        )
      })}
    </div>
  )
}
