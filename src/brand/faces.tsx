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

/** Overlapping faces, up to `max`, then a "+N" whose hover lists the rest. Small: it sits in a row.
    `tips={false}`: faces printed beside their names, for the eye only — no hover, and nothing read twice. */
export function FaceStack({ faces, max = 5, tips = true }: { faces: FaceItem[]; max?: number; tips?: boolean }) {
  const size = 'sm'
  /* ONE of them, and the name is written out (owner, 22 Oct 2026: "for single I guess we can show the name;
     change this globally as well").

     Initials are a compression, and compression only pays where there is something to compress: "CO" beside a
     face, with the word Contractors a hover away, is a riddle set for the reader when the row had room for the
     answer. A stack of eight is the case the avatars were drawn for (owner, 21 Sep 2026: "the avatar, and on
     hover the full name") and it keeps them. One is not a stack. */
  if (faces.length === 1) {
    const only = faces[0]
    return (
      <span className={`bx-faces is-${size} is-one`}>
        <Face kind={only.kind} name={only.name} size={size} decorative />
        <b className="bx-faces__name">{only.name}</b>
      </span>
    )
  }
  /* One more than `max` shows the last face rather than a "+1" in its place. */
  const cut = faces.length > max + 1 ? max : faces.length
  const shown = faces.slice(0, cut)
  const rest = faces.slice(cut)
  if (!tips) {
    return (
      <span className={`bx-faces is-${size}`} aria-hidden>
        {shown.map((f) => (
          <Face key={f.key} kind={f.kind} name={f.name} size={size} decorative />
        ))}
        {rest.length > 0 && <span className={`bx-face is-more is-${size}`}>+{rest.length}</span>}
      </span>
    )
  }
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
