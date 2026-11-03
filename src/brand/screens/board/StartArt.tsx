import type { ReactNode } from 'react'
import { motion, useReducedMotion, type Variants } from 'motion/react'

/* -----------------------------------------------------------------------------
   The pictures on the three start cards (owner, 3 Nov 2026: "I like the paper version, add animation on hover", then
   "make it single … simple"). One sheet of paper each, in the card's own colour (board.css `--start-hover`), with no words
   in it; the card's icon, below, says which it is.

   · Use a Xecurify template: the sheet behind eases out.
   · Reuse an existing policy: a second, dashed sheet slides out from behind.
   · Start from scratch: the sheet's lines are written in.

   Motion props move them, never a CSS transform; with reduced motion nothing plays and the colour still comes on hover.
   Every picture is drawn in the same 264 by 176 box so the three line up across the row.
   -------------------------------------------------------------------------- */

export type StartKind = 'template' | 'reuse' | 'scratch'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** A line that runs longer: its width at rest, then its width when hot (`custom` is [rest, hot]). */
const run: Variants = {
  rest: ([w]: [number, number]) => ({ width: w, transition: { duration: 0.3, ease: EASE } }),
  hot: ([, w]: [number, number]) => ({ width: w, transition: { duration: 0.5, ease: EASE } }),
}
/** The second sheet, sliding out from behind the first. */
const emerge: Variants = {
  rest: { x: 0, transition: { duration: 0.3, ease: EASE } },
  hot: { x: 14, transition: { duration: 0.5, ease: EASE } },
}

function ArtFrame({ hot, label, children }: { hot: boolean; label: string; children: ReactNode }) {
  const still = useReducedMotion()
  return (
    <motion.svg
      className="bb__start2__art"
      viewBox="0 0 264 176"
      role="img"
      aria-label={label}
      initial={false}
      animate={hot && !still ? 'hot' : 'rest'}
    >
      {children}
    </motion.svg>
  )
}

/** The one sheet every card draws: a header and four lines. `lead` makes the header solid; the lines can run on hover. */
function Sheet({ lead, widths }: { lead: boolean; widths: [number, number][] }) {
  return (
    <>
      <rect className="bb__g__shade" x="86" y="30" width="100" height="124" rx="10" />
      <rect className="bb__g__paper" x="82" y="26" width="100" height="124" rx="10" />
      <rect className={lead ? 'bb__g__solid' : 'bb__g__tint2'} x="96" y="42" width="72" height="14" rx="4" />
      {widths.map((w, i) => (
        <motion.rect
          key={i}
          className={i === 0 ? 'bb__g__tint2' : 'bb__g__tint'}
          x="96"
          y={66 + i * 14}
          height="7"
          rx="3.5"
          initial={false}
          variants={run}
          custom={w}
        />
      ))}
    </>
  )
}

/** The template, as it was drawn first and liked best: a header and three blocks on a sheet, with a second sheet behind that eases out on hover. */
function TemplateArt({ hot }: { hot: boolean }) {
  return (
    <ArtFrame hot={hot} label="A ready-made template">
      <motion.rect className="bb__ill__sheet is-back" x="78" y="24" width="108" height="100" rx="10" variants={emerge} />
      <rect className="bb__ill__shade" x="66" y="40" width="140" height="112" rx="10" />
      <rect className="bb__ill__sheet" x="62" y="36" width="140" height="112" rx="10" />
      <rect className="bb__ill__block is-lead" x="74" y="48" width="116" height="14" rx="4" />
      <rect className="bb__ill__block" x="74" y="70" width="56" height="66" rx="4" />
      <rect className="bb__ill__block" x="138" y="70" width="52" height="29" rx="4" />
      <rect className="bb__ill__block" x="138" y="107" width="52" height="29" rx="4" />
    </ArtFrame>
  )
}

function CopyArt({ hot }: { hot: boolean }) {
  return (
    <ArtFrame hot={hot} label="A policy of yours, copied">
      <motion.g variants={emerge}>
        <rect className="bb__g__ghost" x="104" y="38" width="100" height="124" rx="10" />
      </motion.g>
      <Sheet
        lead
        widths={[
          [44, 44],
          [72, 72],
          [56, 56],
          [32, 32],
        ]}
      />
    </ArtFrame>
  )
}

function ScratchArt({ hot }: { hot: boolean }) {
  return (
    <ArtFrame hot={hot} label="A blank policy, with a place for the first rule">
      <Sheet
        lead={false}
        widths={[
          [20, 44],
          [28, 72],
          [20, 56],
          [12, 40],
        ]}
      />
    </ArtFrame>
  )
}

/** The picture on one start card. */
export function StartPicture({ kind, hot }: { kind: StartKind; hot: boolean }) {
  return kind === 'template' ? <TemplateArt hot={hot} /> : kind === 'reuse' ? <CopyArt hot={hot} /> : <ScratchArt hot={hot} />
}
