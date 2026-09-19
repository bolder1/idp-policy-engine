import { useId, useState, type ReactNode } from 'react'
import { ArrowRight, ChevronDown, type LucideIcon } from 'lucide-react'

/* -----------------------------------------------------------------------------
   A list of what a save will do — Review changes' body, and the device profile
   wizard's Review step.

   The shape, after four passes on 17–18 Sep 2026 and the live console's own
   Review Changes as the reference the owner kept pointing at:

     - A SECTION per part of the page, as an accordion: Basic details, Signals,
       IP networks, and "Also changes" last for the knock-on effects. A change
       stays in the step it belongs to — "if something changes in the basic
       details it should stay in that step only" (owner, 18 Sep 2026), which is
       what the kind-first version lost by pooling every added row together.
     - Inside a section, one tinted chip per kind — Added, Changed, Removed —
       over the rows it covers, so the word is said once and the colour says
       which.
     - A row is a name and a value on ONE line, sharing the section's grid, so
       the value starts just past the longest name. Pushed to the far edge it
       made the reader cross 600px of white between the two halves of one fact.
     - The value carries the kind's ink: it is what the change DOES.
     - The rows sit on a quiet fill, which holds a block together without the
       reference's tint on every row.

   Two layouts from the same rows. `list` is the name and what it will be —
   what a create flow can show, since it has no before. `compare` adds a Before
   column and a thin arrow, with the key drawn once above the first section.

   A long section shows its first `limit` rows and a "Show N more", keeping at
   least one row of every kind it holds.
   -------------------------------------------------------------------------- */

export type ChangeLayout = 'compare' | 'list'
export type ChangeTone = 'added' | 'changed' | 'removed' | 'effect'

export interface ChangeItem {
  id: string
  /** Empty where the section and the chip already say it — a zone's own list rows. */
  name?: string
  /** What is saved now. The compare layout's Before; the list shows it only for a value that is `leaving`. */
  before?: ReactNode
  /** What will be saved. */
  after?: ReactNode
  /** The value is going: the list shows it struck. */
  leaving?: boolean
}

export interface ChangeBlock {
  /** The kind's chip over the rows. Without it the rows stand on their own — a wizard step is not a kind. */
  tone?: ChangeTone
  label?: string
  mark?: LucideIcon
  items: ChangeItem[]
}

/* The chip is the kit's own badge — `.bx-badge` and one of its tones — so the
   review's pills are the same object as every other pill in the console. The
   classes rather than the component, because the kit imports this file. */
const BADGE_TONE: Record<ChangeTone, string> = {
  added: 'positive',
  changed: 'info',
  removed: 'negative',
  effect: 'notice',
}

const isNil = (v: ReactNode) => v === null || v === undefined || v === '' || v === false

/** The whole list: one layout, and the column key when it compares. */
export function ChangeList({ layout, children }: { layout: ChangeLayout; children: ReactNode }) {
  return (
    /* The wrapper carries the container, not the list itself: an element is
       never matched by its OWN container query, so the narrow rule that turns
       the list into one column could not reach `.bx-cl` while `.bx-cl` was the
       container. */
    <div className="bx-cl__wrap">
      <div className={`bx-cl is-${layout}`}>
        {layout === 'compare' && (
          <div className="bx-cl__key" aria-hidden>
            <span />
            <span>Before</span>
            <span />
            <span>After</span>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

/* One section of the review. Open by default — a review that hides what it is
   reviewing is not a review — and shut to start with only where it is long
   enough to push the save button off the screen. */
export function ChangeSection({
  title,
  summary,
  layout,
  blocks,
  action,
  collapsible = false,
  defaultOpen = true,
  limit = 8,
  empty = 'None',
}: {
  title: string
  /** What the section holds, in words: "3 changes", "38 signals". The caller
      counts it — a row can stand for several changes, which no count of rows
      would know. */
  summary?: string
  layout: ChangeLayout
  blocks: ChangeBlock[]
  /** A control at the header's right end — the wizard's Edit. */
  action?: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  limit?: number
  /** Said when the section has no rows. */
  empty?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [all, setAll] = useState(false)
  const id = useId()
  const total = blocks.reduce((n, b) => n + b.items.length, 0)
  const trims = total > limit + 1
  const shown = trims && !all ? trimBlocks(blocks, limit) : blocks
  const body = (
    /* Mounted while shut, and hidden: the toggle's `aria-controls` has to
       point at something that exists. */
    <div className="bx-cl__body" id={`${id}-b`} hidden={!open}>
      {total === 0 ? (
        <p className="bx-cl__none">{empty}</p>
      ) : (
        shown.map((block, i) => (
          <div className={`bx-cl__block${block.tone ? ` is-${block.tone}` : ''}`} key={block.tone ?? i}>
            {block.tone && block.label && (
              <p className="bx-cl__kindrow">
                <span className={`bx-badge bx-badge--${BADGE_TONE[block.tone]} bx-cl__kind`} id={`${id}-k${i}`}>
                  {block.mark && <block.mark size={12} strokeWidth={2.4} aria-hidden />}
                  <span className="bx-badge__label">{block.label}</span>
                </span>
              </p>
            )}
            <ul className="bx-cl__rows" aria-labelledby={block.tone && block.label ? `${id}-k${i}` : `${id}-h`}>
              {block.items.map((item) =>
                layout === 'compare' ? (
                  <CompareRow key={item.id} item={item} />
                ) : (
                  <ListRow key={item.id} item={item} />
                ),
              )}
            </ul>
          </div>
        ))
      )}
      {trims && (
        <button type="button" className="bx-cl__more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show less' : `Show ${total - limit} more`}
        </button>
      )}
    </div>
  )

  return (
    <section className={`bx-cl__sec${open ? ' is-open' : ''}`} aria-labelledby={`${id}-h`}>
      <div className="bx-cl__head">
        {/* The heading holds the toggle rather than the other way round: a
            button's children never reach the accessibility tree as a heading,
            so heading navigation could not find the sections. */}
        <h3 className="bx-cl__title" id={`${id}-h`}>
          {/* The spaces between the name and the count are load-bearing:
              without them the accessible name runs together as
              "Checks11 changes". */}
          {collapsible ? (
            <button type="button" className="bx-cl__toggle" aria-expanded={open} aria-controls={`${id}-b`} onClick={() => setOpen((v) => !v)}>
              <ChevronDown className="bx-cl__chev" size={15} strokeWidth={2} aria-hidden />
              {title}
              {summary && <span className="bx-cl__count"> {summary}</span>}
            </button>
          ) : (
            <>
              {title}
              {summary && <span className="bx-cl__count"> {summary}</span>}
            </>
          )}
        </h3>
        {action}
      </div>
      {body}
    </section>
  )
}

/* The first `limit` rows — but every block keeps at least one row, so a
   trimmed section can never lose a whole kind. Dropping the Removed block
   entirely (nine added rows spent the budget) left a review that counted a
   deletion in its header and showed nothing of it. */
function trimBlocks(blocks: ChangeBlock[], limit: number): ChangeBlock[] {
  let left = Math.max(limit, blocks.length)
  return blocks.map((block) => {
    /* One for this block, and one held back for each block after it. */
    const others = blocks.length - blocks.indexOf(block) - 1
    const take = Math.max(1, Math.min(block.items.length, left - others))
    left -= take
    return { ...block, items: block.items.slice(0, take) }
  })
}

function CompareRow({ item }: { item: ChangeItem }) {
  return (
    <li className="bx-cl__row">
      <span className="bx-cl__name">{item.name}</span>
      <span className="bx-cl__before">
        <span className="u-sr-only">Before: </span>
        <Value value={item.before} nil="—" />
      </span>
      <ArrowRight className="bx-cl__arrow" size={13} strokeWidth={1.8} aria-hidden />
      <span className="bx-cl__after">
        <span className="u-sr-only">After: </span>
        <Value value={item.after} nil="—" />
      </span>
    </li>
  )
}

function ListRow({ item }: { item: ChangeItem }) {
  const value = item.leaving ? item.before : item.after
  /* A row with no name of its own gives the whole line to its value. */
  return (
    <li className={`bx-cl__row${item.name ? '' : ' is-bare'}`}>
      {item.name && <span className="bx-cl__name">{item.name}</span>}
      <span className={`bx-cl__value${item.leaving ? ' is-leaving' : ''}`}>
        <Value value={value} nil="None" />
      </span>
    </li>
  )
}

/* Nothing there is a muted word; a dash still reads "None" aloud. */
function Value({ value, nil }: { value: ReactNode; nil: string }) {
  if (!isNil(value)) return <>{value}</>
  if (nil === 'None') return <span className="bx-cl__nil">None</span>
  return (
    <span className="bx-cl__nil">
      <span aria-hidden>{nil}</span>
      <span className="u-sr-only">None</span>
    </span>
  )
}
