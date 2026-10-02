import { ArrowRight } from 'lucide-react'

import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { useBrand } from '../../../store'
import { sentenceTokens, tokenValue, type SentenceContext, type TokenId } from '../../testing/sign-in-sentence'
import { ValueMark } from '../SignInCard'
import { groupNamesOf } from '../sign-in-card'
import { SIGN_W } from './gates-geometry'
import type { RunLayoutProps } from './types'

const SHORT: Partial<Record<TokenId, string>> = { from: 'From', device: 'Device', when: 'When', risk: 'Risk' }

/* The sign-in the token steps out of: who, to what, the facts the app's rules
   read (an unstated one said so). Pressed, the panel opens on the form. It is
   never judged, so it never takes the answer's colour. */
export function GatesSignIn({ props, top, depends }: { props: RunLayoutProps; top: number; depends: boolean }) {
  const { form, rows, asGroup, onPressPerson } = props
  const { users, groups, apps, zones } = useBrand()
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const groupLine = asGroup ? `A member of ${asGroup}` : person ? groupNamesOf(person, groups).join(', ') : ''
  const ctx: SentenceContext = { people: users, apps, zones, rows }
  const facts = sentenceTokens(rows)
    .filter((t) => t !== 'person' && t !== 'app')
    .map((t) => tokenValue(t, form, ctx))
  return (
    <button
      type="button"
      className="rl-gates__card rl-gates__sign"
      data-card
      data-node="sign-in"
      style={{ top, width: SIGN_W }}
      onClick={onPressPerson}
      title="Change the sign-in"
    >
      <span className="rl-gates__signhead">
        {person && <Face kind="user" name={person.name} size="md" decorative />}
        <span className="rl-gates__signwho">
          <strong>{person?.name ?? 'Choose a person'}</strong>
          {groupLine && <span>{groupLine}</span>}
        </span>
      </span>
      <span className="rl-gates__signapp">
        <ArrowRight size={13} strokeWidth={2} aria-hidden />
        {app && <AppLogo appId={app.id} name={app.name} size={16} />}
        <span>{app?.name ?? 'Choose an application'}</span>
      </span>
      {facts.length > 0 && (
        <span className="rl-gates__facts">
          {facts.map((v) => (
            <span key={v.token} className={`rl-gates__fact${v.unset ? ` is-unset${depends ? ' is-needed' : ''}` : ''}`}>
              <span className="rl-gates__factlabel">{SHORT[v.token] ?? v.label}</span>
              <span className="rl-gates__factmark" aria-hidden>
                <ValueMark v={v} size={12} />
              </span>
              <span className="rl-gates__facttext">{v.unset ? 'Not stated' : v.text}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  )
}
