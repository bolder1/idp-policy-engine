/* The version switcher is gone, and so are the alternatives it switched
   between. Several designs were kept side by side while the direction was
   being chosen; the final zones screen is the direction, so the rest have been
   deleted rather than left to rot behind a tab nobody presses.

   This wrapper stays because the router names it, and because it is where a
   future variant would be introduced if one is ever needed again. */
import { ZonesFinal } from './ZonesFinal'

export function ZonesPage() {
  return <ZonesFinal />
}
