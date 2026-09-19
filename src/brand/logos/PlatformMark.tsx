import type { Platform } from '../risk-signals'
import { BrandMark, type Brand } from './BrandMark'

/* -----------------------------------------------------------------------------
   The platform marks, as paths rather than as files.

   `AppLogo` cannot do this job. It resolves an APP id against the fetched
   favicon set in public/logos, and Android and iOS are not applications — they
   have no entry in the catalogue, no domain in the logo registry, and adding
   fake ones so a favicon could be fetched for them would put two things that
   are not apps into the list that answers "which apps does this tenant have".

   So they are inline. Three reasons beyond that one:

   · These render at 13px in a column header. A favicon is a 16px or 32px
     bitmap and would be resampled to something soft beside crisp text.
   · The logo set depends on third-party hosts, which is why `AppLogo` carries
     a monogram fallback at all. A column header that sometimes says "AN" in a
     tinted box is worse than no mark.
   · Apple's mark has to invert for dark mode. A fetched black PNG cannot;
     `currentColor` does it for free.

   Android keeps its green, which reads on both themes and is the thing people
   recognise it by. Apple takes `currentColor` deliberately — the mark is
   monochrome by convention, so it should be whatever colour the text beside it
   is, in both themes and in the muted state a disabled row gives it.

   The paths themselves live in `BrandMark`, with the other brands a device
   check can name, so there is one copy of each.
   -------------------------------------------------------------------------- */

/* A map, not a ternary. This was `android ? 'android' : 'apple'` while `Platform`
   was the two mobile ones, so widening it to Windows and macOS (18 Sep 2026) put
   the APPLE mark on the Windows row of the new platform filter. A total map
   cannot drift that way again: a fifth platform stops the build here. */
const MARK: Record<Platform, Brand> = {
  android: 'android',
  ios: 'apple',
  macos: 'apple',
  windows: 'windows',
}

export function PlatformMark({ platform, size = 13 }: { platform: Platform; size?: number }) {
  return <BrandMark brand={MARK[platform]} size={size} className="bplat" />
}
