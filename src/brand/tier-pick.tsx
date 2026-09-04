import type { Priority } from './fingerprint'

/* -----------------------------------------------------------------------------
   How much one thing pushes a risk score, in three words.

   Two screens ask this question now — the device profile, per attribute, and
   the risk signal profile, per signal per platform — and they were one copy and
   paste away from asking it in two different orders with two different palettes
   and two different accessible names. So the control moved here, and the
   arguments that shaped it moved with it into kit.css rather than being
   rediscovered by whoever changed the second copy.

   The signature is `Priority` in, `Priority` out. The device profile stores
   numbers, so it converts at its own edge with `tierOf` and `TIER_WEIGHT` —
   which is the right place for that, because the numbers are its storage
   format and not this control's business.
   -------------------------------------------------------------------------- */

/* High first. It is the order the scale runs in — hot to cool — and it matches
   the hue ramp, so the leftmost pill is always the one that pushes hardest. */
const TIERS: Priority[] = ['High', 'Medium', 'Low']

export function TierPick({
  value,
  label,
  onChange,
}: {
  value: Priority
  /* The accessible name for the group, and the only place the word "weight"
     appears. A visible caption read "Weight Low" on every row of fourteen —
     the same word repeated down a column beside the one control on the row —
     so it went, and the group kept the name where it was doing work. */
  label: string
  onChange: (t: Priority) => void
}) {
  return (
    <div className="bx-tiers" role="radiogroup" aria-label={label}>
      {TIERS.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          /* A roving tabindex, which `role="radiogroup"` promises: one stop for
             the group, arrows to move within it. Three buttons all in the tab
             order announce themselves as a radio group and then behave like
             three unrelated buttons. */
          tabIndex={value === t ? 0 : -1}
          className={`bx-tier is-${t.toLowerCase()} ${value === t ? 'is-on' : ''}`}
          onClick={() => onChange(t)}
          onKeyDown={(e) => {
            const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key as 'ArrowRight']
            if (!d) return
            e.preventDefault()
            onChange(TIERS[(TIERS.indexOf(value) + d + TIERS.length) % TIERS.length])
          }}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
