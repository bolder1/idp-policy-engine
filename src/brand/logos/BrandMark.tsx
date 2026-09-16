/* -----------------------------------------------------------------------------
   Brand marks for the platforms, browsers and clients a device check names.

   Inline paths on a 24 viewBox, for the reasons `PlatformMark` gives: these
   render at 15-16px beside a name, a fetched favicon resamples soft at that
   size, and Apple's mark has to follow the text colour into dark mode.

   Colour where the brand is recognised by colour, `currentColor` where the mark
   is monochrome by convention (Apple). Flat fills only — no gradients, so there
   are no ids to collide when a list draws the same mark twelve times.

   Sources
   · Android, Apple: Simple Icons path data (CC0), the same paths PlatformMark
     has always drawn.
   · Windows: drawn here, four panes. Microsoft marks are no longer in Simple
     Icons, and the current mark is four squares in #0078D4.
   · Chrome: drawn here from its construction — three blades, each bounded by a
     line tangent to the inner ring, rotated 120° apart — in Google's palette.
   · Edge, Firefox, Safari: drawn here as simplified marks that keep what each
     is known by at small size — Edge's blue wave over green, Firefox's orange
     wrap and ear around a purple globe, Safari's blue compass and red needle.
   · miniOrange: the product's own favicon in public/logos.
   -------------------------------------------------------------------------- */

export type Brand = 'windows' | 'android' | 'apple' | 'chrome' | 'edge' | 'firefox' | 'safari' | 'miniorange'

const CHROME_BLADE = 'M2.77 6.01A11 11 0 0 1 21.8 7H12a5 5 0 0 0-4.33 7.5Z'

export function BrandMark({ brand, size = 15, className }: { brand: Brand; size?: number; className?: string }) {
  if (brand === 'miniorange') {
    return <img className={className} src="/logos/miniorange.png" width={size} height={size} alt="" aria-hidden />
  }

  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    focusable: false as const,
    className,
  }

  switch (brand) {
    case 'windows':
      return (
        <svg {...common} fill="#0078D4">
          <path d="M2.5 2.5h8.75v8.75H2.5zM12.75 2.5h8.75v8.75h-8.75zM2.5 12.75h8.75v8.75H2.5zM12.75 12.75h8.75v8.75h-8.75z" />
        </svg>
      )

    case 'android':
      return (
        <svg {...common} fill="#3DDC84">
          <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396" />
        </svg>
      )

    case 'apple':
      return (
        <svg {...common} fill="currentColor">
          <path d="M17.05 12.536c-.026-2.93 2.39-4.336 2.5-4.404-1.36-1.99-3.476-2.263-4.232-2.294-1.803-.182-3.518 1.06-4.434 1.06-.915 0-2.323-1.033-3.816-1.005-1.964.029-3.775 1.141-4.786 2.9-2.04 3.54-.522 8.786 1.465 11.657.97 1.404 2.126 2.982 3.642 2.926 1.462-.058 2.014-.947 3.78-.947 1.766 0 2.264.947 3.81.918 1.572-.026 2.567-1.432 3.53-2.84 1.112-1.63 1.57-3.21 1.597-3.29-.035-.014-3.063-1.175-3.094-4.66M14.5 3.9c.81-.98 1.355-2.343 1.206-3.7-1.166.047-2.577.777-3.414 1.755-.75.867-1.406 2.253-1.23 3.583 1.3.1 2.628-.66 3.438-1.638" />
        </svg>
      )

    case 'chrome':
      /* A hairline stroke in each blade's own colour closes the anti-aliasing
         seam where two blades meet, which otherwise shows as a pale line. */
      return (
        <svg {...common}>
          <g strokeWidth={0.3} strokeLinejoin="round">
            <path fill="#EA4335" stroke="#EA4335" d={CHROME_BLADE} />
            <path fill="#FBBC04" stroke="#FBBC04" d={CHROME_BLADE} transform="rotate(120 12 12)" />
            <path fill="#34A853" stroke="#34A853" d={CHROME_BLADE} transform="rotate(240 12 12)" />
          </g>
          <circle cx="12" cy="12" r="5" fill="#fff" />
          <circle cx="12" cy="12" r="4" fill="#1A73E8" />
        </svg>
      )

    case 'edge':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10.4" fill="#2FB5E6" />
          <path
            fill="#4FCB6E"
            d="M1.6 12A10.4 10.4 0 0 0 16.5 21.4C11 22 6.4 18.6 6.6 14.2 6.7 12.4 8 11.2 9.6 11.2 5.4 10.6 2.2 11 1.6 12Z"
          />
          <path
            fill="#0C59A4"
            d="M1.6 12A10.4 10.4 0 0 1 22.4 12 10.4 10.4 0 0 1 20.9 17.4C19.2 19 15.8 19.3 13.9 17.7 12.4 16.4 13.6 14.6 15.6 14.6 17.4 14.6 17.8 13 16.6 11.6 14.6 9.3 10.4 8.2 6.8 9.2 4.4 9.9 2.4 10.9 1.6 12Z"
          />
        </svg>
      )

    case 'firefox':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10.8" fill="#FF7139" />
          <path fill="#FF7139" d="M4 5.4 4.3.9 8.4 2.7Z" />
          <circle cx="11.2" cy="13" r="7.9" fill="#FFBD4F" />
          <circle cx="13.2" cy="10.4" r="7.6" fill="#7542E5" />
        </svg>
      )

    case 'safari':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="11" fill="#1B8EF2" />
          <circle
            cx="12"
            cy="12"
            r="8.9"
            fill="none"
            stroke="#fff"
            strokeOpacity={0.75}
            strokeWidth={1.3}
            strokeDasharray=".45 1.88"
          />
          <path fill="#FF3B30" d="M17.3 6.7 13.34 13.34 10.66 10.66Z" />
          <path fill="#fff" d="M6.7 17.3 10.66 10.66 13.34 13.34Z" />
        </svg>
      )
  }
}
