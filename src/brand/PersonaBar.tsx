import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, UserRound } from 'lucide-react'

import { DEPTHS } from './fixtures'
import { Tip } from './kit'
import { PERSONAS, TAB_LABEL, personaById, tabsFor } from './personas'
import { useBrand } from './store'

/* -----------------------------------------------------------------------------
   The persona switcher.

   Prototype furniture, and it says so — this would not ship. It exists because
   the framework doc's central finding is that there is no single admin, and a
   room cannot check that claim against a product that only ever shows them one
   tenant.

   Picking a persona loads their tenant into **every tab**: policies, zones,
   fingerprint profiles, method sets, hooks, and the group directory the rule
   previews count against. Then it lands you where that persona starts. Nothing
   here is a view filter or an overlay — the screens are the real screens, and
   what changes is what is in them.

   The two lines under each name are the two things a meeting actually argues
   about: the question that persona arrives with, and how much is in their
   tenant. A dropdown of six names alone would make this look like a theme
   picker.
   -------------------------------------------------------------------------- */

export function PersonaBar() {
  const store = useBrand()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const list = useRef<HTMLDivElement | null>(null)

  /* Closing from inside the list puts focus back on the trigger; otherwise the
     focused option unmounts with the panel and focus falls to the page. */
  const close = (restore: boolean) => {
    setOpen(false)
    if (restore) trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const inside = wrap.current?.contains(document.activeElement)
      setOpen(false)
      if (inside) trigger.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const options = () => [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])]

  /* On open, focus the persona already loaded. */
  useEffect(() => {
    if (!open) return
    const all = options()
    ;(all.find((o) => o.getAttribute('aria-selected') === 'true') ?? all[0])?.focus()
  }, [open])

  const onListKey = (e: ReactKeyboardEvent) => {
    const all = options()
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const move = (i: number) => {
      e.preventDefault()
      all[Math.max(0, Math.min(all.length - 1, i))]?.focus()
    }
    if (e.key === 'ArrowDown') move(at + 1)
    else if (e.key === 'ArrowUp') move(at - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(all.length - 1)
    else if (e.key === 'Tab') setOpen(false)
  }

  const current = personaById(store.persona)

  return (
    <div className="bpb" ref={wrap}>
      {/* The caveat in a Tip, like the Rebrand switch beside it. It was a native
          title, which a keyboard never reached. */}
      <Tip text="Prototype only: loads another persona’s tenant into every tab.">
        <button
          ref={trigger}
          type="button"
          className="bpb__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Persona: ${current.label}`}
          onClick={() => setOpen((o) => !o)}
        >
          <UserRound size={14} strokeWidth={1.9} aria-hidden />
          <strong>{current.label}</strong>
          <ChevronDown size={14} strokeWidth={2} aria-hidden />
        </button>
      </Tip>

      {open && (
        <div className="bpb__panel" role="listbox" aria-label="Persona" ref={list} onKeyDown={onListKey}>
          <p className="bpb__intro">Each persona has its own tenant. Picking one loads it into every tab.</p>
          <ul>
            {PERSONAS.map((p) => {
              const on = p.id === store.persona
              const unmet = p.needs.filter((n) => !n.met).length
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={on ? 'is-on' : ''}
                    onClick={() => {
                      /* The persona already loaded only closes the list:
                         loading it again would undo every saved change. */
                      close(true)
                      if (!on) store.setPersona(p.id)
                    }}
                  >
                    <span className="bpb__name">
                      {p.label}
                      <em>{p.archetype}</em>
                    </span>
                    <span className="bpb__q">{p.question}</span>
                    <span className="bpb__meta">
                      <i>{p.size}</i>
                      <i>{DEPTHS[p.depth].label}</i>
                      {/* Counted, not hidden. A persona the product does not
                          fully serve yet is the most useful thing on this list
                          — it is the next piece of work, and burying it would
                          make the switcher a sales tool rather than a check. */}
                      {unmet > 0 && <i className="is-gap">{unmet} unmet</i>}
                    </span>
                    {/* One line, comma-separated: the tabs used to be separate
                        items joined by dots. */}
                    <span className="bpb__tabs">
                      <em>{tabsFor(p).map((t) => TAB_LABEL[t]).join(', ')}</em>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
