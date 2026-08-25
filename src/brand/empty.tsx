import type { ReactNode } from 'react'

/* -----------------------------------------------------------------------------
   Empty states.

   Every screen had the same one: a lucide glyph in a grey circle, a heading, a
   paragraph of explanation, a button. Consistent, and completely mute — a
   shield in a circle says "security product" and nothing about zones, and the
   paragraph underneath was doing all the work at a size nobody reads on the one
   screen they have never seen before.

   The enterprise consoles worth copying — Laravel Cloud, Attio, Railway,
   Gorgias — all draw the SAME thing: a monochrome wireframe OF THE OBJECT YOU
   ARE ABOUT TO MAKE. Not a mascot, not a metaphor. Railway draws dashboard
   cards, Attio draws documents, Gorgias draws a literal chart layout. It works
   because it answers "what is this screen for" before a word is read, and it
   stays quiet because it is line art in one hue.

   So: one component, one drawing per surface, and copy cut to a heading plus a
   single line. Anything longer than that belongs on the page the button leads
   to.

   Every drawing is `currentColor` at graded opacity plus exactly ONE brand
   accent, which means it themes itself and never needs a dark-mode variant.
   -------------------------------------------------------------------------- */

export function EmptyState({
  art,
  title,
  blurb,
  action,
  note,
  compact,
}: {
  art: ReactNode
  title: string
  /** One line. If it needs two, the second one belongs somewhere else. */
  blurb: string
  action?: ReactNode
  /* The one thing this screen's model gets wrong if nobody says it. Rare —
     only zones has earned one. */
  note?: ReactNode
  /* For an empty SECTION rather than an empty page — the panel it sits in
     already has a heading and a border, so the state inside it needs less air
     and a smaller drawing or it out-weighs the thing it belongs to. */
  compact?: boolean
}) {
  return (
    <div className={`bempty ${compact ? 'is-compact' : ''}`}>
      <div className="bempty__art" aria-hidden>
        {art}
      </div>
      <h2 className="bempty__title">{title}</h2>
      <p className="bempty__blurb">{blurb}</p>
      {action && <div className="bempty__action">{action}</div>}
      {note && <p className="bempty__note">{note}</p>}
    </div>
  )
}

/* The inline kind: a filter or a search that matched nothing. No drawing — the
   surrounding page is still full of context, and an illustration here would be
   a picture of a thing that does exist, drawn because it is hidden. */
export function NoResults({ children }: { children: ReactNode }) {
  return <p className="bempty__none">{children}</p>
}

/* --- The drawings ---------------------------------------------------------------
   All on a 132×92 field, 1.5 stroke, round joins, sharing `S` — so the three
   read as one set rather than three illustrations that happen to be nearby.

   One per surface that can genuinely be empty, and no more. Policies and
   Authentication methods are never empty (the system catch-all and the
   twenty-one-method catalogue always exist), and Templates is a static
   catalogue — those get `NoResults` for a search that matched nothing, which is
   a different thing and correctly undrawn. */

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/* Zones — a dashed perimeter with addresses inside it and one outside. The
   boundary is dashed because that is exactly what a zone is: a line drawn round
   some things and not others. */
export function ZoneArt() {
  return (
    <svg viewBox="0 0 132 92" width="132" height="92" role="img">
      <g {...S} opacity="0.4" strokeDasharray="4 4">
        <rect x="14" y="16" width="76" height="60" rx="10" />
      </g>
      <g {...S} opacity="0.3">
        <circle cx="34" cy="36" r="4" />
        <circle cx="54" cy="30" r="4" />
        <circle cx="44" cy="56" r="4" />
        <circle cx="68" cy="52" r="4" />
        <path d="M34 36l20-6M44 56l24-4M34 36l10 20" />
      </g>
      {/* The one outside, which is the whole reason the line exists. */}
      <g fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="110" cy="62" r="5" />
        <path d="M104 44a22 22 0 0 1 14-9" opacity="0.5" />
      </g>
    </svg>
  )
}

/* Device profiles — a machine outline and the signals read off it. The ticks
   are the attributes; the arc is the fingerprint they add up to. */
export function DeviceArt() {
  return (
    <svg viewBox="0 0 132 92" width="132" height="92" role="img">
      <g {...S} opacity="0.3">
        <rect x="24" y="18" width="56" height="40" rx="4" />
        <path d="M18 66h68l-6-8H24z" />
      </g>
      <g {...S} opacity="0.42">
        <path d="M36 32h20M36 40h32M36 48h14" />
      </g>
      {/* The fingerprint: three arcs off the machine, one of them brand. */}
      <g fill="none" strokeWidth="1.5" strokeLinecap="round" stroke="currentColor" opacity="0.3">
        <path d="M92 26a22 22 0 0 1 0 32" />
        <path d="M100 20a32 32 0 0 1 0 44" />
      </g>
      <path
        d="M84 32a13 13 0 0 1 0 20"
        fill="none"
        stroke="var(--brand)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* Nothing references this. A card with two connectors, both hanging loose.

   Drawn rather than left as a grey sentence because "used by nothing" is the
   one answer on a detail page that decides whether the object is safe to change
   — and a centred line of muted text in an otherwise empty panel reads as a
   loading state, not as a fact. */
export function UnusedArt() {
  return (
    <svg viewBox="0 0 132 92" width="132" height="92" role="img">
      <g {...S} opacity="0.3">
        <rect x="42" y="30" width="48" height="32" rx="5" />
        <path d="M52 42h22M52 50h14" />
      </g>
      {/* The connectors that lead nowhere. Dashed, and stopping short. */}
      <g {...S} opacity="0.26" strokeDasharray="3 4">
        <path d="M42 40H16" />
        <path d="M90 52h26" />
      </g>
      <g fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round" opacity="0.75">
        <circle cx="14" cy="40" r="3.5" />
        <circle cx="118" cy="52" r="3.5" />
      </g>
    </svg>
  )
}

/* Hooks — this console on the left, something else on the right, and the call
   leaving. The dashed half is the point: the answer comes from outside. */
export function HookArt() {
  return (
    <svg viewBox="0 0 132 92" width="132" height="92" role="img">
      <g {...S} opacity="0.3">
        <rect x="10" y="26" width="40" height="40" rx="5" />
        <path d="M18 38h24M18 46h16M18 54h20" />
      </g>
      <g {...S} opacity="0.32" strokeDasharray="4 4">
        <rect x="82" y="26" width="40" height="40" rx="5" />
      </g>
      <g fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M52 42h26" />
        <path d="M72 36l6 6-6 6" />
      </g>
      <g {...S} opacity="0.25">
        <path d="M78 54H54" />
        <path d="M60 48l-6 6 6 6" />
      </g>
    </svg>
  )
}

/* Apps — a grid of tiles with one signed into. The launcher's whole job is
   "these are yours", so the drawing is the grid; the brand-tinted one is the
   one you just opened, which is the only thing that distinguishes a launcher
   from a list. */
export function AppsArt() {
  return (
    <svg viewBox="0 0 132 92" width="132" height="92" role="img">
      <g {...S} opacity="0.32">
        <rect x="22" y="18" width="24" height="24" rx="6" />
        <rect x="54" y="18" width="24" height="24" rx="6" />
        <rect x="86" y="18" width="24" height="24" rx="6" />
        <rect x="22" y="50" width="24" height="24" rx="6" />
        <rect x="86" y="50" width="24" height="24" rx="6" />
      </g>
      {/* The one that is yours. */}
      <g fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="54" y="50" width="24" height="24" rx="6" />
        <path d="M60 62l4 4 8-8" />
      </g>
    </svg>
  )
}
