import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import type { AccessDecision } from '../../data'
import { DECISION_WORDS } from '../../decision-words'
import { Button, Field } from '../../kit'
import { Picker } from '../../picker'
import { LEVEL_LABEL, LEVEL_META, LEVEL_PICKER_ORDER, SAVED_NAME_MAX, type SignInLevel } from '../../saved-sign-ins'
import { useBrand } from '../../store'
import { currentDraft, defaultSaveDraft, saveIssue, savedSignInOf, type SaveDraft } from './save-sign-in'
import type { SignInForm } from './sign-in-form'
import './testing.css'

/* -----------------------------------------------------------------------------
   Save sign-in: the form that keeps the sign-in on screen as a saved one.

   Inline, at the top of the panel or under the result's head row, never a
   dialog — the answer being saved stays in view while it is named (the
   final spec's panel rules). Name, Expected and Level, each the screen's own
   answer until the admin gives theirs (save-sign-in.ts), so changing the
   sign-in while the form is open changes what it will save as.

   Save is orange only where nothing else on screen is. On the Policy testing
   page it is the page's one primary. On the board the bar's "Save policy" is
   already the orange control, and two orange buttons both reading "Save" is
   what the owner ruled out on 23 Sep — so there it is "Save sign-in", a weight
   quieter (`emphasis="quiet"`), beside a ghost Cancel.
   -------------------------------------------------------------------------- */

const DECISIONS: AccessDecision[] = ['1fa', '2fa', 'deny']

export function SaveSignInForm({
  form,
  shown,
  emphasis = 'brand',
  onClose,
  onSaved,
}: {
  form: SignInForm
  /** The decision on screen, or null for Can't tell. */
  shown: AccessDecision | null
  /** `quiet` where another orange control is already on screen: the board. */
  emphasis?: 'brand' | 'quiet'
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const { users, apps, zones, savedSignIns, addSavedSignIn, showToast, account } = useBrand()
  const [edits, setEdits] = useState<Partial<SaveDraft>>({})
  const screen = useMemo(() => defaultSaveDraft(form, shown, users, apps, savedSignIns), [form, shown, users, apps, savedSignIns])
  const draft = currentDraft(screen, edits)
  const nameId = useId()
  const nameRef = useRef<HTMLInputElement | null>(null)
  const issue = saveIssue(form, draft, savedSignIns)

  /* The name first: it is the one answer the screen could not guess. */
  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [])

  const expected = useMemo(() => DECISIONS.map((d) => ({ value: d, label: DECISION_WORDS[d] })), [])
  const levels = useMemo(() => LEVEL_PICKER_ORDER.map((l) => ({ value: l, label: LEVEL_LABEL[l], meta: LEVEL_META[l] })), [])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (issue) return
    const id = addSavedSignIn(savedSignInOf(form, draft, zones, account.name, new Date().toISOString()))
    showToast('Sign-in saved')
    onSaved?.(id)
    onClose()
  }

  const quiet = emphasis === 'quiet'
  /* Esc closes this form and nothing under it. The board closes test mode on
     an Esc nobody handled (Spec A §7: the innermost open thing first), so it
     is marked handled here — from the Name field, and from Cancel and Save,
     which the board would otherwise read as an Esc on the panel. */
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    onClose()
  }
  return (
    <form className="tsave" onSubmit={submit} aria-label="Save sign-in" onKeyDown={onKeyDown}>
      <Field label="Name" htmlFor={nameId}>
        <input
          ref={nameRef}
          id={nameId}
          type="text"
          maxLength={SAVED_NAME_MAX}
          value={draft.name}
          onChange={(e) => setEdits((d) => ({ ...d, name: e.target.value }))}
        />
      </Field>
      <Field label="Expected">
        <Picker
          label="Expected"
          value={draft.expected}
          placeholder="Choose a decision"
          options={expected}
          onChange={(v) => setEdits((d) => ({ ...d, expected: v as AccessDecision }))}
          width="fill"
        />
      </Field>
      <Field label="Level">
        <Picker label="Level" value={draft.level} options={levels} onChange={(v) => setEdits((d) => ({ ...d, level: v as SignInLevel }))} width="fill" />
      </Field>
      <div className="tsave__actions">
        <Button variant={quiet ? 'ghost' : 'neutral'} size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant={quiet ? 'secondary' : 'brand'} size="sm" type="submit" disabled={issue !== null} title={issue ?? undefined}>
          {quiet ? 'Save sign-in' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
