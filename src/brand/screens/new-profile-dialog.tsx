import { useEffect, useId, useState } from 'react'

import { Button, Modal } from '../kit'
import { nameIssue, PROFILE_NAME_MAX, type ProfileMode } from '../fingerprint'
import { ChoiceTiles } from './device-profile-parts'
import { kindChoices } from './device-profile-choices'

/* -----------------------------------------------------------------------------
   New device profile · name first.

   The second of the three create versions (owner, 15 Sep 2026): "like zones —
   give it the name and select the type, and based on that we go inside and
   configure the attributes and the other things". So this asks only the two
   things the profile page cannot: a name, and a type, which is fixed for the
   life of the profile. Everything else is the profile's own page, opened on an
   unsaved profile that its first save creates (`ProfilePage` with `isNew`).

   Zones' `NameOnlyModal` with the type added: the same field, the same Cancel
   and Continue, Enter continues. The field and tiles are the ones the create
   wizard's first step uses, so the two versions ask the question in the same
   words.

   The type starts on Device health, as the create drawer's did, so a name is
   all that stands between the dialog and Continue. A health profile is the
   cheaper one to have picked by mistake: nothing is stored until its page
   saves, and Back from an untouched page returns to the list.
   -------------------------------------------------------------------------- */

export function NewProfileDialog({
  open,
  names,
  onClose,
  onCreate,
}: {
  open: boolean
  /** Every profile's name, for the duplicate-name check. */
  names: string[]
  onClose: () => void
  /** The trimmed name and the chosen type. Nothing is stored yet. */
  onCreate: (name: string, mode: ProfileMode) => void
}) {
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [mode, setMode] = useState<ProfileMode>('os')
  const errorId = useId()

  /* Cleared when it opens: the Modal only unmounts its children, so this state
     would otherwise keep the last name and type. */
  useEffect(() => {
    if (!open) return
    setName('')
    setTouched(false)
    setMode('os')
  }, [open])

  const problem = nameIssue(name, names)
  /* A taken name is said as it is typed; a blank one only once the field has
     been left, so the dialog does not open on an error. */
  const shown = problem !== null && (touched || name.trim() !== '')
  const go = () => {
    if (problem === null) onCreate(name.trim(), mode)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New device profile"
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" disabled={problem !== null} title={problem ?? undefined} onClick={go}>
            Continue
          </Button>
        </>
      }
    >
      {/* `.bfp2__form`, not only the field: the Modal portals out of `.bfp2`,
          and the input's styles are scoped to one or the other. */}
      <div className="bfp2__form">
        <label className="bfp2__field">
          <span>Profile name</span>
          <input
            type="text"
            value={name}
            autoFocus
            maxLength={PROFILE_NAME_MAX}
            placeholder="Corporate laptops"
            aria-invalid={shown ? true : undefined}
            aria-describedby={shown ? errorId : undefined}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                setTouched(true)
                go()
              }
            }}
          />
          {shown && (
            <span id={errorId} className="bfp2__fielderror">
              {problem}
            </span>
          )}
        </label>

        <ChoiceTiles legend="Profile type" options={kindChoices()} value={mode} onPick={setMode} />
      </div>
    </Modal>
  )
}
