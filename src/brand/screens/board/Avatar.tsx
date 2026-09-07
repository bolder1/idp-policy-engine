/* -----------------------------------------------------------------------------
   A round mark with one letter, and a stack of them that does not grow.

   Two surfaces draw the same people — the card's `who` row and the Who pane's
   chosen row — and they were drawing them differently: the pane had faces, the
   card had one named chip per person. At eighteen people the card's row was
   four lines of chips inside a rule you are trying to read at a glance, and a
   real tenant has five thousand.

   So the stack is a FIXED SIZE whatever it holds. Five marks and a count, in
   one row, always. That is the only shape that survives the directory getting
   bigger, and it is what an avatar stack is for everywhere else.
   -------------------------------------------------------------------------- */

/* One letter, never two.

   Initials from two words would be the obvious choice and it is wrong here:
   half these names are one word — Finance, Engineering, Contractors — so a
   stack would carry one letter on some marks and two on others and read as two
   kinds of thing.

   ONE COLOUR, TWO STATES. The tint used to be derived from the name, which gave
   every row its own hue — a list of twenty-four people was twenty-four pastel
   circles, and the colour carried no meaning at all. Worse, it spent the one
   thing colour is for on this screen: saying which of these is chosen.

   So the mark is quiet until it is picked, and brand when it is. That reads the
   same in the list and in the chosen row above it, which is the point — the
   same person looks the same wherever they appear, and "chosen" is legible
   without cross-referencing the two. */
export function Avatar({ name, size = 18, on = false }: { name: string; size?: number; on?: boolean }) {
  return (
    <span
      className={`bb__avatar ${on ? 'is-on' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** How many marks are drawn before the rest become a number. */
const CAP = 5

/* The stack: at most `CAP` marks, then `+N`, in one row that is the same width
   at five names and at five thousand.

   The overflow is a COUNT and never more marks. The full list goes on the
   title, which is the honest place for it — a row that tries to show everything
   is a row that shows nothing once there is enough of it. */
export function AvatarStack({ names, empty = 'everyone' }: { names: string[]; empty?: string }) {
  if (names.length === 0) return <span className="bb__stack__none">{empty}</span>

  const shown = names.slice(0, CAP)
  const rest = names.length - shown.length

  return (
    <span className="bb__stack" title={names.join(', ')}>
      <span className="bb__stack__faces">
        {shown.map((n) => (
          /* Everything in this stack is chosen by definition — it is the list
             of who the rule is about — so they all wear the picked state. */
          <Avatar key={n} name={n} size={17} on />
        ))}
      </span>
      {/* The first name in words as well as a mark, because a row of circles
          alone is a puzzle. One name and a count reads as a sentence:
          "Finance and sixteen others". */}
      <span className="bb__stack__lead">{names[0]}</span>
      {rest > 0 && <span className="bb__stack__more">+{rest}</span>}
    </span>
  )
}
