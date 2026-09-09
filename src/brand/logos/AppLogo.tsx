import { useState } from 'react'

import { RESOLVED_LOGOS } from './manifest.generated'
import { LOGO_SOURCES } from './sources'

/* -----------------------------------------------------------------------------
   AppLogo — one component, every app mark in the console.

   Resolution order:
     1. the fetched file from public/logos, recorded in the generated manifest
     2. a monogram on the app's brand tint, if the fetch failed or the image
        404s at runtime

   The fallback is not decorative. A broken image in a table of applications
   reads as a broken product, and the logo set depends on third-party hosts
   that will eventually move something.
   -------------------------------------------------------------------------- */

/* Keyed on the registry id AND on every alias, so a catalogue that calls an app
   something slightly different still finds its mark. */
const BY_ID = new Map(LOGO_SOURCES.flatMap((s) => [[s.id, s] as const, ...(s.aliases ?? []).map((a) => [a, s] as const)]))

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
    /* 0.48, not 0.42. On a 20px tile that is the difference between an 8px
       glyph and a 10px one — and at 8px a two-letter monogram stops being
       letters you read and becomes a smudge that is only distinguishable from
       the next row's by its width. */
    fontSize: Math.round(size * 0.48),
  }

  if (showImage) {
    return (
      <span className="applogo applogo--img" style={box} title={label}>
        <img src={resolved.file!} alt="" aria-hidden loading="lazy" onError={() => setFailed(true)} />
      </span>
    )
  }

  /* Two monograms, because there are two reasons to be here.

     A KNOWN vendor whose fetch failed keeps its brand tint: Salesforce blue,
     Slack aubergine, white letters on top. That is what `fallbackTint` is for
     and it reads correctly.

     An app with no registry entry at all — which is most of a real tenant's
     catalogue, every internal ERP and VPN portal and payroll system — had no
     tint to fall back to, so it took `--surface-inset` and kept the white
     letters meant for a saturated one. #ffffff on #eef1f4 is 1.13:1. Eleven of
     the sixteen rows on the Applications table, and most of the Policies table,
     were rendering an empty grey square where the app's mark should be, which
     reads as an image that failed to load rather than as an app without a logo.

     The unbranded case gets a neutral tile instead: the console's own inset
     grey, a hairline, and the initials in secondary ink at 7.2:1. It is calm,
     it is legible, and it spends none of the colour budget on a label that is
     only there to make a row findable by shape. */
  const branded = Boolean(meta?.fallbackTint)
  return (
    <span
      className={`applogo applogo--mono ${branded ? 'is-branded' : 'is-plain'}`}
      style={branded ? { ...box, background: meta!.fallbackTint } : box}
      title={label}
      aria-hidden
    >
      {meta?.fallbackMonogram ?? label.slice(0, 2).toUpperCase()}
    </span>
  )
}

/* `AppLogoStack` is gone with the model it drew.

   It overlapped up to three marks and printed "3 apps" — the right cell for a
   policy that covered three. A policy covers one, so the list names it. */
