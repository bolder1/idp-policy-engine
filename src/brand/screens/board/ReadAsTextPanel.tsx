import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Copy, X } from 'lucide-react'

import { Drawer, IconButton } from '../../kit'
import type { Policy } from '../../data'
import { useBrand, useNameLookup } from '../../store'
import { policySentences, policyText, type PolicyLine } from '../predicate-prose'
import { readFoot, readVersions, storedVersions, type TextVersion } from './read-as-text'
import { Seg } from './Section'
// read-as-text.css is imported in main.tsx, after kit.css — see there.

/* -----------------------------------------------------------------------------
   Read as text (describe spec, §7.2): the whole policy as numbered sentences.

   Two ways in, one body. The board's bar opens it in the inspector's slot,
   beside the chain it reads — a sentence under the pointer rings its card,
   and a click selects the card and brings it into view while the panel
   stays. The Policies row menu opens it in a 560 px drawer, where there is
   no chain to point at.

   Read-only everywhere, so it is on in both editions and needs no flag. Grey
   throughout: the numbers are a column of their own, and the only control
   with a state is the Draft · Live choice, which is there only when the two
   say different things.
   -------------------------------------------------------------------------- */

const VERSIONS: { value: TextVersion; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'live', label: 'Live' },
]

/* The version on screen and its lines. Draft first and chosen; when the live
   rules stop differing — an edit undone, a draft saved — the choice goes,
   and so does a Live that was picked. */
function useLines(versions: { draft: Policy; live: Policy | null }) {
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

/* Copy text: the lines as plain text, numbered. Where the clipboard cannot be
   written, the toast says so rather than claiming a copy. */
function useCopy() {
  const store = useBrand()
  return (lines: readonly PolicyLine[]) => {
    const failed = () => store.showToast('Could not copy the text')
    if (!navigator.clipboard) return failed()
    navigator.clipboard.writeText(policyText(lines)).then(() => store.showToast('Text copied'), failed)
  }
}

function ReadAsTextBody({
  lines,
  version,
  onVersion,
  foot,
  onHover,
  onPick,
}: {
  lines: readonly PolicyLine[]
  /** The version on screen; `null` when there is only one to read. */
  version: TextVersion | null
  onVersion: (v: TextVersion) => void
  foot: string
  /** A rule's line under the pointer: its card, or none. The board only. */
  onHover?: (ruleId: string | null) => void
  /** A rule's line pressed: select its card. The board only. */
  onPick?: (ruleId: string) => void
}) {
  return (
    <>
      {version && <Seg label="Version" value={version} options={VERSIONS} onChange={onVersion} />}
      <ol className="brat__list">
        {lines.map((l) => {
          const said = (
            <>
              <span className="brat__n" aria-hidden={l.n === null}>
                {l.n === null ? '' : `${l.n}.`}
              </span>
              <span className="brat__text">{l.text}</span>
            </>
          )
          const id = l.ruleId
          return (
            <li key={l.key}>
              {id && onPick ? (
                <button
                  type="button"
                  className="brat__line is-rule"
                  onClick={() => onPick(id)}
                  onMouseEnter={() => onHover?.(id)}
                  onMouseLeave={() => onHover?.(null)}
                  onFocus={() => onHover?.(id)}
                  onBlur={() => onHover?.(null)}
                >
                  {said}
                </button>
              ) : (
                <p className="brat__line">{said}</p>
              )}
            </li>
          )
        })}
      </ol>
      <p className="brat__foot">{foot}</p>
    </>
  )
}

/* In the board's inspector slot. `saved` is the stored policy, `draft` the
   rules on the board: Live is offered only when they differ from what is
   live (read-as-text.ts). */
export function ReadAsTextPanel({
  saved,
  draft,
  onClose,
  onHover,
  onPick,
}: {
  saved: Policy
  draft: Policy
  /** The ×, and Esc from anywhere in the panel. */
  onClose: () => void
  /** Stable (a state setter): it is also called once as the panel goes, to clear the ring. */
  onHover: (ruleId: string | null) => void
  onPick: (ruleId: string) => void
}) {
  const uid = useId()
  const versions = useMemo(() => readVersions(saved, draft), [saved, draft])
  const { version, setVersion, lines } = useLines(versions)
  const copy = useCopy()
  const heading = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    heading.current?.focus()
  }, [])
  /* Nothing is left ringed on the chain once the panel goes. */
  useEffect(() => () => onHover(null), [onHover])

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <aside className="bb__insp brat" aria-labelledby={`${uid}-title`} onKeyDown={onKey}>
      <div className="bb__inspbar brat__bar">
        <h2
          id={`${uid}-title`}
          ref={heading}
          tabIndex={-1}
          className="brat__title"
        >
          Read as text
        </h2>
        <span className="brat__barend">
          <IconButton icon={Copy} size="sm" tone="ghost" label="Copy text" onClick={() => copy(lines)} />
          <IconButton icon={X} size="sm" tone="ghost" label="Close Read as text" onClick={onClose} />
        </span>
      </div>
      <div className="bb__inspbody brat__body">
        <ReadAsTextBody
          lines={lines}
          version={versions.live ? version : null}
          onVersion={setVersion}
          foot={readFoot(saved)}
          onHover={onHover}
          onPick={onPick}
        />
      </div>
    </aside>
  )
}

/* From the Policies row menu: the same body in a 560 px drawer titled with
   the policy's name, Copy beside the close. The stored policy is read — its
   saved draft when it has one, with Live beside it. */
export function ReadAsTextDrawer({ open, policy, onClose }: { open: boolean; policy: Policy; onClose: () => void }) {
  const versions = useMemo(() => storedVersions(policy), [policy])
  const { version, setVersion, lines } = useLines(versions)
  const copy = useCopy()
  /* Each opening starts on the draft. */
  useEffect(() => {
    if (open) setVersion('draft')
  }, [open, setVersion])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={policy.name}
      width={560}
      head={
        <div className="brat__drawerhead">
          <h2>{policy.name}</h2>
          <IconButton icon={Copy} size="sm" tone="ghost" label="Copy text" onClick={() => copy(lines)} />
        </div>
      }
    >
      <div className="brat__drawerbody">
        <ReadAsTextBody lines={lines} version={versions.live ? version : null} onVersion={setVersion} foot={readFoot(policy)} />
      </div>
    </Drawer>
  )
}
