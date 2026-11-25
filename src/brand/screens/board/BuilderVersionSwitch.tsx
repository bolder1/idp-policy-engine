import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Picker } from '../../picker'
import {
  BUILDER_VERSIONS,
  canHideSwitches,
  HIDE_KEYS,
  lockBuilder,
  setBuilderVersion,
  toggleSwitchesHidden,
  unlockBuilder,
  useBuilderUnlocked,
  useBuilderVersion,
  useSwitchesShown,
  type BuilderVersion,
} from './builder-version'

const LOCK = 'lock'
const HIDE = 'hide'

/* Hide sits above Lock again (builder-version.ts, HIDDEN): it puts the bar's switches away and keeps every pick, where
   Lock again goes back to V0. Each row names its keys, since a hidden switch has no other way back. Design only. */
const ROWS = [
  ...BUILDER_VERSIONS.map((v) => ({ value: v.value, label: v.label })),
  ...(canHideSwitches()
    ? [
        { value: HIDE, label: 'Hide', meta: HIDE_KEYS },
        { value: LOCK, label: 'Lock again', meta: 'Ctrl+P' },
      ]
    : [{ value: LOCK, label: 'Lock again' }]),
]

/* Locking puts it all back, from the dropdown or the keys alike: V0, and the switch hidden until the password is given
   again (owner, 23 Oct 2026: "always add a lock-again option, back to V0"). The keys only locked, so the next unlock
   opened straight on the version left behind. */
function relock() {
  setBuilderVersion('v0')
  lockBuilder()
}

/* Hiding takes the focused switch with it: focus goes on to the bar's next action rather than dropping to the page. */
function hideKeepingFocus() {
  const bar = document.activeElement instanceof Element ? document.activeElement.closest('.bbtop__acts') : null
  toggleSwitchesHidden()
  if (bar) requestAnimationFrame(() => bar.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true }))
}

/* The bar's switch between the builds of the builder, and the door to it: see
   builder-version.ts. While the builder is locked this draws nothing at all, so
   nobody looking at the screen can tell there is anything to switch. Ctrl+P asks
   for the password; once in, a dropdown lists every version with Lock again at the
   foot, and the same keys hide it too. The same keys also put the password field
   away again, as do Escape and a click anywhere else. Ctrl+Shift+P hides this and
   the Draft model switch together, and shows them again, without locking. */
export function BuilderVersionSwitch() {
  const version = useBuilderVersion()
  const unlocked = useBuilderUnlocked()
  const shown = useSwitchesShown()
  const [asking, setAsking] = useState(false)
  const [wrong, setWrong] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'p')) return
      /* Ctrl+Shift+P: hide or show, while unlocked. Locked, the keys are left to the browser, as on any other line. */
      if (e.shiftKey) {
        if (!canHideSwitches() || !unlocked) return
        e.preventDefault()
        if (!e.repeat) hideKeepingFocus()
        return
      }
      e.preventDefault()
      /* A held Ctrl+P repeats: one press, one change. */
      if (e.repeat) return
      if (unlocked) relock()
      else {
        setWrong(false)
        setAsking((a) => !a)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [unlocked])

  /* The field takes focus when it opens, and hands it back to whatever had it when it closes (Ctrl+P again, Escape,
     a click away or a right password), so focus never drops to the page. */
  const before = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (asking) {
      before.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      field.current?.focus()
      return
    }
    const back = before.current
    before.current = null
    if (back?.isConnected && (document.activeElement === document.body || document.activeElement === null)) back.focus({ preventScroll: true })
  }, [asking])

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const ok = await unlockBuilder(field.current?.value ?? '')
    if (ok) setAsking(false)
    else {
      setWrong(true)
      /* Selected, so the next try replaces it rather than adding to it. */
      field.current?.select()
    }
  }

  return (
    <>
      {shown && (
        <Picker
          label="Builder version"
          size="sm"
          value={version}
          options={ROWS}
          onChange={(v) => {
            if (v === LOCK) relock()
            else if (v === HIDE) hideKeepingFocus()
            else setBuilderVersion(v as BuilderVersion)
          }}
        />
      )}
      {asking && !unlocked && (
        <form
          className="bb__vlock"
          onSubmit={submit}
          onKeyDown={(e) => e.key === 'Escape' && setAsking(false)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAsking(false)
          }}
        >
          <input ref={field} type="password" autoComplete="off" aria-label="Password" placeholder="Password" aria-invalid={wrong} />
        </form>
      )}
    </>
  )
}
