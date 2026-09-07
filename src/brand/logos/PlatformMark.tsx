import type { Platform } from '../risk-signals'

/* -----------------------------------------------------------------------------
   The two platform marks, as paths rather than as files.

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
   -------------------------------------------------------------------------- */

export function PlatformMark({ platform, size = 13 }: { platform: Platform; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    focusable: false as const,
    className: 'bplat',
  }

  if (platform === 'android') {
    return (
      <svg {...common} fill="#3DDC84">
        <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396" />
      </svg>
    )
  }

  return (
    <svg {...common} fill="currentColor">
      <path d="M17.05 12.536c-.026-2.93 2.39-4.336 2.5-4.404-1.36-1.99-3.476-2.263-4.232-2.294-1.803-.182-3.518 1.06-4.434 1.06-.915 0-2.323-1.033-3.816-1.005-1.964.029-3.775 1.141-4.786 2.9-2.04 3.54-.522 8.786 1.465 11.657.97 1.404 2.126 2.982 3.642 2.926 1.462-.058 2.014-.947 3.78-.947 1.766 0 2.264.947 3.81.918 1.572-.026 2.567-1.432 3.53-2.84 1.112-1.63 1.57-3.21 1.597-3.29-.035-.014-3.063-1.175-3.094-4.66M14.5 3.9c.81-.98 1.355-2.343 1.206-3.7-1.166.047-2.577.777-3.414 1.755-.75.867-1.406 2.253-1.23 3.583 1.3.1 2.628-.66 3.438-1.638" />
    </svg>
  )
}
