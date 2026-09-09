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

/* Keyed on the registry id AND on every alias, so a catalogue that calls an app
   something slightly different still finds its mark. */
const BY_ID = new Map(LOGO_SOURCES.flatMap((s) => [[s.id, s] as const, ...(s.aliases ?? []).map((a) => [a, s] as const)]))

/* An `ALIASES` map stood here — `{ 'google-workspace': 'google' }` — resolving
   the tenant's id to the registry's before either lookup.

   The registry carries its own aliases now (`LogoSource.aliases`), which is the
   better home for the same fact: the alias lives on the entry it belongs to
   rather than in a second table this component has to keep in step, and adding
   a second aliased app is a field rather than a map entry plus a lookup. Both
   fixes were written for the same bug — Google Workspace drawing a placeholder
   over a logo already sitting in `public/logos`. */

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
  const meta = BY_ID.get(appId)
  /* Through the registry entry, not the raw id: an aliased app resolves to the
     file its canonical id was fetched under. */
  const resolved = RESOLVED_LOGOS[meta?.id ?? appId]
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

  /* One generic mark, and it settles the contrast bug main found here rather
     than keeping the two monograms that were the fix for it.

     Main's finding was real and worth recording: the unbranded monogram took
     `--surface-inset` and kept the white letters meant for a saturated tint, so
     #ffffff on #eef1f4 is 1.13:1 — eleven of the sixteen rows on Applications
     were rendering what looked like an image that had failed to load. Its fix
     was a second monogram flavour: a neutral tile with the initials in
     secondary ink.

     This goes further and deletes the monogram entirely, which removes the
     unreadable case by removing the case. Initials are a logo's shape without
     its content — they sit in the same square at the same size, so a row
     reading "GO · Google Workspace" looks like a brand mark until you read it —
     and for the sixteen internal systems in this tenant they were two letters
     of a name printed in full an inch to the right. The icon says "this is an
     application", which is the only thing that square honestly knows, and it
     says it at `--text-muted` on `--surface-inset`, which is legible.

     Neutral, not tinted, for the same reason: the tint was the app's brand
     colour, and this square can no longer make that claim. The icon scales with
     the box — 62% of it, the ratio the fetched favicons sit at inside their own
     padding — so a generic row and a branded row carry the same optical weight
     in a column of both. */
  return (
    <span className="applogo applogo--generic" style={box} title={label} aria-hidden>
      <AppWindow size={Math.round(size * 0.62)} strokeWidth={1.7} />
    </span>
  )
}

/* `AppLogoStack` is gone with the model it drew.

   It overlapped up to three marks and printed "3 apps" — the right cell for a
   policy that covered three. A policy covers one, so the list names it. */
