import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Users } from 'lucide-react'

import { DEPTHS } from './fixtures'
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

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = personaById(store.persona)

  return (
    <div className="bpb" ref={wrap}>
      <button
        type="button"
        className="bpb__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Load a different persona's tenant into every tab"
      >
        <Users size={14} strokeWidth={1.9} aria-hidden />
        <span className="bpb__label">Persona</span>
        <strong>{current.label}</strong>
        <ChevronDown size={14} strokeWidth={2} aria-hidden />
      </button>

      {open && (
        <div className="bpb__panel" role="listbox" aria-label="Persona">
          <p className="bpb__intro">
            Loads that persona’s tenant into every tab — policies, zones, fingerprints, method sets and hooks —
            and lands where they start. Prototype furniture; it would not ship.
          </p>
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
                      store.setPersona(p.id)
                      setOpen(false)
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
                    <span className="bpb__tabs">
                      {tabsFor(p).map((t) => (
                        <em key={t}>{TAB_LABEL[t]}</em>
                      ))}
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

