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

/** Overlapping stack with a count, as the policy table shows assigned apps. */
export function AppLogoStack({
  appIds,
  names,
  max = 3,
  size = 20,
}: {
  appIds: string[]
  names?: string[]
  max?: number
  size?: number
}) {
  if (appIds.length === 0) return <span className="applogo__none">No apps</span>
  return (
    <span className="applogo__stack" title={(names ?? appIds).join(', ')}>
      <span className="applogo__row">
        {appIds.slice(0, max).map((id) => (
          <AppLogo key={id} appId={id} size={size} />
        ))}
      </span>
      <span className="applogo__count">
        {appIds.length} app{appIds.length === 1 ? '' : 's'}
      </span>
    </span>
  )
}

/** Provenance for the logo set — which provider answered, and when. */
export function logoProvenance() {
  const rows = Object.values(RESOLVED_LOGOS)
  return {
    total: rows.length,
    resolved: rows.filter((r) => r.file).length,
    providers: [...new Set(rows.map((r) => r.provider).filter(Boolean))] as string[],
  }
}
