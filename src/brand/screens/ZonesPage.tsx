import { ZonesFinal } from './ZonesFinal'

/* -----------------------------------------------------------------------------
   Zones.

   There were two designs here and a switcher between them. They disagreed about
   the model, not the layout: v1's zone has two halves — networks and places —
   evaluated together; v2 asked which kind a zone was when you named it and then
   offered only that one.

   v1 won, and the argument it won on is the one v2's own header conceded: a
   zone like "Reliance Jio, in India" needs both halves, because one operator
   spans several countries and one country holds many operators, so neither half
   alone says what that zone says. What v2 did better has been ported — the
   Used-by column that opens, a duplicate that asks for a name and deep-copies,
   the formats reference on the detail page, an Actions header, a create dialog
   that resets when it opens — and the rest went with the file.
   -------------------------------------------------------------------------- */

export function ZonesPage() {
  return <ZonesFinal />
}
