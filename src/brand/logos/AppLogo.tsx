import { useState } from 'react'
import { AppWindow } from 'lucide-react'

import { RESOLVED_LOGOS } from './manifest.generated'
import { LOGO_SOURCES } from './sources'

/* -----------------------------------------------------------------------------
   AppLogo — one component, every app mark in the console.

   Resolution order:
     1. the fetched file from public/logos, recorded in the generated manifest
     2. a generic application mark, when this app has no logo or the image 404s

   The fallback is not decorative. A broken image in a table of applications
   reads as a broken product, and the logo set depends on third-party hosts
   that will eventually move something.

   What the fallback USED to be was a two-letter monogram on the app's brand
   tint — "MO" for Production Monitoring, "KN" for Internal Knowledge Base. Two
   problems, and the second is the one that mattered.

   The first is that a monogram is a logo's shape without a logo's content: it
   sits in the same square, at the same size, in the same column, so a row
   reading "GO · Google Workspace" looks like a brand mark until you read it.
   The second is that it was never distinctive. Sixteen of the twenty-six apps
   in this tenant are internal systems with no brand at all — Payroll System,
   VPN Portal, Legal Document Vault — and their initials collide, carry no
   meaning, and are already spelled out in full one inch to the right. The
   column was rendering the same information twice, once badly.

   So: a real mark where one exists, and one generic application icon where one
   does not. The icon does not pretend to identify the app — it says "this is an
   application", which is the only thing that square honestly knows.
   -------------------------------------------------------------------------- */

const BY_ID = new Map(LOGO_SOURCES.map((s) => [s.id, s]))

/* App ids that are the same product under a different name in the tenant data.

   The tenant calls it `google-workspace`; the logo registry keys the file on
   the domain it was fetched from, which is `google`. Without this the console
   drew a placeholder over a logo that was already sitting in public/logos —
   which is exactly what it was doing on four rows of the policies table.

   An alias rather than a second registry entry, because there is one file and
   one domain: a second entry would fetch google.com twice and give two ids a
   chance to disagree about which mark is Google's. */
const ALIASES: Record<string, string> = {
  'google-workspace': 'google',
}

export function AppLogo({
  appId,
  name,
  size = 20,
  rounded = true,
}: {
  appId: string
  name?: string
  size?: number
  rounded?: boolean
}) {
  const id = ALIASES[appId] ?? appId
  const meta = BY_ID.get(id)
  const resolved = RESOLVED_LOGOS[id]
  const [failed, setFailed] = useState(false)

  const label = name ?? meta?.name ?? appId
  const showImage = resolved?.file && !failed

  const box: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: rounded ? Math.max(3, size * 0.22) : 0,
  }

  if (showImage) {
    return (
      <span className="applogo applogo--img" style={box} title={label}>
        <img src={resolved.file!} alt="" aria-hidden loading="lazy" onError={() => setFailed(true)} />
      </span>
    )
  }

  /* Neutral, not tinted. The tint was the app's brand colour, which is a claim
     this square can no longer make: it is saying "unidentified application",
     and saying it in Salesforce blue would be the same false note as the
     monogram. The icon scales with the box — 62% of it, which is the ratio the
     fetched favicons sit at inside their own padding, so a generic row and a
     branded row have the same optical weight in a column of both. */
  return (
    <span className="applogo applogo--generic" style={box} title={label} aria-hidden>
      <AppWindow size={Math.round(size * 0.62)} strokeWidth={1.7} />
    </span>
  )
}

/* `AppLogoStack` is gone with the model it drew.

   It overlapped up to three marks and printed "3 apps" — the right cell for a
   policy that covered three. A policy covers one, so the list names it. */
