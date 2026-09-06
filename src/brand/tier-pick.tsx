import { Picker } from './picker'
import type { Priority } from './fingerprint'

/* -----------------------------------------------------------------------------
   How much one thing pushes a risk score, in three words.

   Two screens ask this question — the device profile, per attribute, and the
   risk signal profile, per signal per platform — and they were one copy and
   paste away from asking it in two different orders with two different palettes
   and two different accessible names. So the control lives here, and the
   arguments that shaped it live with it rather than being rediscovered by
   whoever changes the second copy.

   The signature is `Priority` in, `Priority` out. The device profile stores
   numbers, so it converts at its own edge with `tierOf` and `TIER_WEIGHT` —
   the right place for that, because the numbers are its storage format and not
   this control's business.

   A dropdown, not a segmented control. Three pills side by side is three
   controls' worth of width for one value, repeated down every row of a table
   whose other columns are the thing you came to read: sixteen signals times two
   platforms is thirty-two segmented controls on one screen, and every one of
   them spends two thirds of its space showing the two answers that are NOT the
   answer. A closed select shows the answer, and the two columns stop being the
   widest thing in the table.

   What survives from the segmented version is the colour, because the argument
   for it was never about the shape. Three hues, hot to cool, so a weight is
   nameable from a single row — you see one per row, many rows apart, and three
   shades of one hue are only ordered if you can see all three at once.
   -------------------------------------------------------------------------- */

/* High first. It is the order the scale runs in — hot to cool — and it matches
   the hue ramp, so the first option is always the one that pushes hardest. */
const TIERS: Priority[] = ['High', 'Medium', 'Low']

export function TierPick({
  value,
  label,
  onChange,
}: {
  value: Priority
  /* The accessible name, and the only place the word "weight" appears. A
     visible caption read "Weight Low" on every row of fourteen — the same word
     repeated down a column beside the one control on the row — so it went, and
     the control kept the name where it was doing work. */
  label: string
  onChange: (t: Priority) => void
}) {
  return (
    /* The tone rides on a wrapper rather than on the trigger, because `Picker`
       owns the trigger's own classes and a control that has to be told about
       every consumer's palette is a control two consumers will fight over. */
    <span className={`bx-tierpick is-${value.toLowerCase()}`}>
      <Picker
        label={label}
        value={value}
        width="fill"
        options={TIERS.map((t) => ({ value: t, label: t }))}
        onChange={(t) => onChange(t as Priority)}
      />
    </span>
  )
}
