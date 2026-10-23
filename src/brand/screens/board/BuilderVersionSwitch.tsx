import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Picker } from '../../picker'
import { BUILDER_VERSIONS, lockBuilder, setBuilderVersion, unlockBuilder, useBuilderUnlocked, useBuilderVersion, type BuilderVersion } from './builder-version'

const LOCK = 'lock'

/* Locking puts it all back, from the dropdown or the keys alike: V0, and the switch hidden until the password is given
   again (owner, 23 Oct 2026: "always add a lock-again option, back to V0"). The keys only locked, so the next unlock
   opened straight on the version left behind. */
function relock() {
  setBuilderVersion('v0')
  lockBuilder()
}

/* The bar's switch between the builds of the builder, and the door to it: see
   builder-version.ts. While the builder is locked this draws nothing at all, so
   nobody looking at the screen can tell there is anything to switch. Ctrl+P asks
   for the password; once in, a dropdown lists every version with Lock again at the
   foot, and the same keys hide it too. The same keys also put the password field
   away again, as do Escape and a click anywhere else. */
export function BuilderVersionSwitch() {
  const version = useBuilderVersion()
  const unlocked = useBuilderUnlocked()
  const [asking, setAsking] = useState(false)
  const [wrong, setWrong] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'p')) return
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
      {unlocked && (
        <Picker
          label="Builder version"
          size="sm"
          value={version}
          options={[...BUILDER_VERSIONS.map((v) => ({ value: v.value, label: v.label })), { value: LOCK, label: 'Lock again' }]}
          onChange={(v) => {
            if (v === LOCK) relock()
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
