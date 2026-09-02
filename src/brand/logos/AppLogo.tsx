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

const BY_ID = new Map(LOGO_SOURCES.map((s) => [s.id, s]))

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
  const resolved = RESOLVED_LOGOS[appId]
  const [failed, setFailed] = useState(false)

  const label = name ?? meta?.name ?? appId
  const showImage = resolved?.file && !failed

  const box: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: rounded ? Math.max(3, size * 0.22) : 0,
    fontSize: size * 0.42,
  }

  if (showImage) {
    return (
      <span className="applogo applogo--img" style={box} title={label}>
        <img src={resolved.file!} alt="" aria-hidden loading="lazy" onError={() => setFailed(true)} />
      </span>
    )
  }

  return (
    <span
      className="applogo applogo--mono"
      style={{ ...box, background: meta?.fallbackTint ?? 'var(--surface-inset)' }}
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
