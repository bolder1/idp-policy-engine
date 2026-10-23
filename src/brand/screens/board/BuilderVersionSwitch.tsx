import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Picker } from '../../picker'
import { BUILDER_VERSIONS, lockBuilder, setBuilderVersion, unlockBuilder, useBuilderUnlocked, useBuilderVersion, type BuilderVersion } from './builder-version'

const LOCK = 'lock'

/* The bar's switch between the builds of the builder, and the door to it: see
   builder-version.ts. While the builder is locked this draws nothing at all, so
   nobody looking at the screen can tell there is anything to switch. Ctrl+P asks
   for the password; once in, a dropdown lists every version with Lock again at the
   foot, and the same keys hide it too. */
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
      if (unlocked) lockBuilder()
      else {
        setWrong(false)
        setAsking(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [unlocked])

  useEffect(() => {
    if (asking) field.current?.focus()
  }, [asking])

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const ok = await unlockBuilder(field.current?.value ?? '')
    if (ok) setAsking(false)
    else setWrong(true)
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
            /* The last option puts it all back: V0, and the switch hidden until the password is given again (owner,
               23 Oct 2026: "always add a lock-again option, back to V0"). */
            if (v === LOCK) {
              setBuilderVersion('v0')
              lockBuilder()
            } else setBuilderVersion(v as BuilderVersion)
          }}
        />
      )}
      {asking && !unlocked && (
        <form className="bb__vlock" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && setAsking(false)}>
          <input ref={field} type="password" autoComplete="off" aria-label="Password" placeholder="Password" aria-invalid={wrong} />
        </form>
      )}
    </>
  )
}
