import { useEffect, useRef, useState } from 'react'

import { nameTaken, type NewPolicyStart } from '../data'
import { Button, Modal } from '../kit'
import { useBrand } from '../store'

/* -----------------------------------------------------------------------------
   New policy: the name, and nothing else.

   Owner, 2 Nov 2026, the final shape after a day of versions: "when clicking New policy, a centre-aligned pop-up where
   we just ask for the name, nothing else. Then we go inside, and inside we have three options: Use template, Use
   existing policy, Start from scratch … this will be the final version." The team's reason stands behind it: New policy
   made a draft at once, so pressing it and going back left an empty policy. The name comes first, here; how to start is
   the builder's own question (board/BoardEmpty.tsx); and nothing is kept until a save with a rule (policy-draft.ts
   `newPolicy`).

   Two buttons. The name's reason goes under the field, and Create policy is never disabled for it (26 Sep 2026).
   -------------------------------------------------------------------------- */

export interface NewPolicyAsk {
  /** The answer. The caller stores it and decides where to go. */
  onCreate: (name: string, start: NewPolicyStart) => void
  /** Filled in and selected, to take or type over: an application's, a template's. */
  seedName?: string
  /** Open the builder on its three ways to start. Absent, it opens on what `rules` holds (a template's Use) or the chain. */
  ways?: boolean
  /** Rules the policy starts with: a template's, from the Templates page. */
  rules?: NewPolicyStart['rules']
}

export function NewPolicyDialog({ open, ask, onClose }: { open: boolean; ask: NewPolicyAsk; onClose: () => void }) {
  const store = useBrand()
  const seedName = ask.seedName ?? ''
  const [name, setName] = useState(seedName)
  const [tried, setTried] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  /* Cleared when it OPENS, not when it closes: the popup animates out holding what it had. */
  useEffect(() => {
    if (!open) return
    setName(seedName)
    setTried(false)
  }, [open, seedName])

  /* After Modal's own focus on its panel, which lands on the next frame. Selected, so a seeded name is typed over. */
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      field.current?.focus()
      field.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  const missing = name.trim().length === 0
  const taken = nameTaken(name, store.policies.map((p) => p.name))
  const reason = taken ? 'A policy with this name already exists.' : tried && missing ? 'Give the policy a name.' : null

  const create = () => {
    if (missing || taken) {
      setTried(true)
      field.current?.focus()
      return
    }
    onClose()
    ask.onCreate(name.trim(), ask.ways ? { rules: [], choose: true } : { rules: ask.rules ?? [] })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New policy"
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={create}>
            Create policy
          </Button>
        </>
      }
    >
      <div className="bnp">
        <div className="bname2__field">
          {/* The counter rides on the label row, so appearing at character 40 moves nothing. */}
          <span className="bname2__labelrow">
            <label htmlFor="np-name" className="bname2__label">
              Policy name <i>*</i>
            </label>
            {name.length > 39 && <span className="bname2__count">{50 - name.length} left</span>}
          </span>
          <input
            id="np-name"
            ref={field}
            type="text"
            value={name}
            maxLength={50}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              create()
            }}
            aria-invalid={!!reason || undefined}
            aria-describedby={reason ? 'np-name-error' : undefined}
            placeholder="Finance team, high security"
          />
          {reason && (
            <p id="np-name-error" className="bnp__error" role="alert">
              {reason}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
