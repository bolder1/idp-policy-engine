/* The version switcher is gone, and so are the alternatives it switched
   between. Several designs were kept side by side while the direction was
   being chosen; the v2 fingerprint screen is the direction, so the rest have been
   deleted rather than left to rot behind a tab nobody presses.

   This wrapper stays because the router names it, and because it is where a
   future variant would be introduced if one is ever needed again. */
import { DeviceFingerprintV2 } from './DeviceFingerprintV2'

export function FingerprintPage() {
  return <DeviceFingerprintV2 />
}
