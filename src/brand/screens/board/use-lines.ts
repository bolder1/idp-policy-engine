import { useEffect, useMemo, useState } from 'react'

import type { Policy } from '../../data'
import { useBrand, useNameLookup } from '../../store'
import { policySentences } from '../predicate-prose'
import { draftDiff } from '../sign-in-tests/inspect-facts'
import type { TextVersion } from './read-as-text'

/* The version on screen and its lines. Draft first and chosen; when the live
   rules stop differing — an edit undone, a draft saved — the choice goes,
   and so does a Live that was picked. */
export function useLines(versions: { draft: Policy; live: Policy | null }) {
  const store = useBrand()
  const resolve = useNameLookup()
  const [version, setVersion] = useState<TextVersion>('draft')
  const hasLive = versions.live !== null
  /* Back on Draft once the choice goes, so it returns on Draft too. */
  useEffect(() => {
    if (!hasLive) setVersion('draft')
  }, [hasLive])
  const shown = version === 'live' && versions.live ? versions.live : versions.draft
  const lines = useMemo(
    /* An application the tenant no longer has is said as gone, never as its id. */
    () => policySentences(shown, resolve, (id) => store.apps.find((a) => a.id === id)?.name ?? 'a deleted application'),
    [shown, resolve, store.apps],
  )
  return { version: versions.live ? version : 'draft', setVersion, lines }
}

/** The sentences a published policy's draft adds and drops against what is live; null when there is no draft to differ. */
export function useDraftDiff(versions: { draft: Policy; live: Policy | null }) {
  const store = useBrand()
  const resolve = useNameLookup()
  return useMemo(() => {
    if (!versions.live) return null
    const appName = (id: string) => store.apps.find((a) => a.id === id)?.name ?? 'a deleted application'
    return draftDiff(policySentences(versions.live, resolve, appName), policySentences(versions.draft, resolve, appName))
  }, [versions, resolve, store.apps])
}
