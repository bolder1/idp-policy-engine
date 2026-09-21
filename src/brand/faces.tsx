import { initials } from './data'
import { Tip } from './kit'

/* -----------------------------------------------------------------------------
   Faces — a group or a person as an avatar.

   Owner, 21 Sep 2026: "add avatars for people and groups; no need to show the
   full name — the avatar, and on hover the full name." So where a rule SUMMARISES
   who it is about (the Who rows in the panel, the who line on a card), it draws
   a stack of faces with each name on hover; where somebody is CHOOSING (the Who
   dialog's lists) the face sits beside the name, because a list you pick from
   has to be read.

   Two shapes, so the kind is legible before the letters are: a person is a
   circle, a group a rounded square. Both neutral — initials on the inset grey —
   so a stack of eight is one quiet object rather than eight colours.
   -------------------------------------------------------------------------- */

export type FaceKind = 'group' | 'user'

export interface FaceItem {
  kind: FaceKind
  name: string
  key: string
}

export function Face({
  kind,
  name,
  size = 'md',
  tip = false,
  decorative = false,
}: {
  kind: FaceKind
  name: string
  size?: 'sm' | 'md'
  /** The name on hover, for a face drawn without its name beside it. */
  tip?: boolean
  /** Printed next to its name: hidden from assistive tech, which reads the name once. */
  decorative?: boolean
}) {
  const face = decorative ? (
    <span className={`bx-face is-${kind} is-${size}`} aria-hidden>
      {initials(name)}
    </span>
  ) : (
    <span className={`bx-face is-${kind} is-${size}`} role="img" aria-label={name}>
      {initials(name)}
    </span>
  )
  return tip ? (
    <Tip text={name} placement="top">
      {face}
    </Tip>
  ) : (
    face
  )
}

/** Overlapping faces, up to `max`, then a "+N" whose hover lists the rest. Small: it sits in a row. */
export function FaceStack({ faces, max = 5 }: { faces: FaceItem[]; max?: number }) {
  const size = 'sm'
  /* One more than `max` shows the last face rather than a "+1" in its place. */
  const cut = faces.length > max + 1 ? max : faces.length
  const shown = faces.slice(0, cut)
  const rest = faces.slice(cut)
  return (
    <span className={`bx-faces is-${size}`}>
      {shown.map((f) => (
        <Face key={f.key} kind={f.kind} name={f.name} size={size} tip />
      ))}
      {rest.length > 0 && (
        <Tip text={rest.map((f) => f.name).join(', ')} placement="top">
          <span className={`bx-face is-more is-${size}`} role="img" aria-label={`and ${rest.length} more: ${rest.map((f) => f.name).join(', ')}`}>
            +{rest.length}
          </span>
        </Tip>
      )}
    </span>
  )
}
