import { useState, type ReactNode } from 'react'
import { Globe, MapPin, Users } from 'lucide-react'

/* -----------------------------------------------------------------------------
   The drawings for the migration guide, made of the product's own pieces (a console card, a rule row, a chip), as the
   intro film draws them. Static: they explain, they do not animate. Words are the console's own.
   -------------------------------------------------------------------------- */

/** A picture of the real screen, with its caption. Hidden quietly until the file exists. */
export function Shot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  const [gone, setGone] = useState(false)
  if (gone) return null
  return (
    <figure className="mg__shot">
      <img src={src} alt={alt} loading="lazy" onError={() => setGone(true)} />
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

/** Where to look for what: the old policies stay, and the new ones say where they came from. */
export function FindDiagram() {
  const rows: { icon: ReactNode; where: string; what: string }[] = [
    { icon: <Globe size={15} strokeWidth={1.9} aria-hidden />, where: 'Old policies tab', what: 'Every old policy, still readable.' },
    { icon: <Users size={15} strokeWidth={1.9} aria-hidden />, where: 'From old policy badge', what: 'On a migrated draft in New policies.' },
    { icon: <MapPin size={15} strokeWidth={1.9} aria-hidden />, where: 'Old policies panel', what: 'In the builder: the old policies a draft came from, and the rules each became.' },
  ]
  return (
    <div className="mgd mgd__find" role="img" aria-label="Where to find your old policies after the move.">
      {rows.map((r) => (
        <div className="mgd__findrow" key={r.where}>
          <span className="mgd__findicon">{r.icon}</span>
          <b>{r.where}</b>
          <span>{r.what}</span>
        </div>
      ))}
    </div>
  )
}
