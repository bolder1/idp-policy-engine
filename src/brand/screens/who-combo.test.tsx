/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../fixtures'
import { WhoCombo } from './who-combo'
import { valuesOfWho, whoOfValues, whoOptions } from './who-options'
import comboSrc from './sign-in-tests/identity-combo.tsx?raw'

/* -----------------------------------------------------------------------------
   A rule's Who as the Access checks Identity field (who-combo.tsx): the round
   trip between a RuleWho and the field's values, every group listed (members or
   not), no cap, and nothing picked read as the answer "Everyone".
   -------------------------------------------------------------------------- */

const T = showcaseTenant()
const users = T.directory.people
const groups = T.groups

describe('the round trip', () => {
  it('a who becomes the field’s values — groups first, then people — and back, the exceptions kept', () => {
    const who = { groupIds: ['finance', 'contractors'], userIds: ['u-maya'], exceptUserIds: ['u-leo'] }
    const values = valuesOfWho(who)
    expect(values).toEqual(['group:finance', 'group:contractors', 'u-maya'])
    expect(whoOfValues(values, who)).toEqual(who)
  })

  it('nothing picked is Everyone: no who at all', () => {
    expect(valuesOfWho(undefined)).toEqual([])
    expect(whoOfValues([])).toBeUndefined()
  })
})

describe('the list', () => {
  it('lists every group, members or not, with its member count, and every person', () => {
    const options = whoOptions(users, [...groups, { id: 'empty', name: 'New hires', memberCount: 0 }])
    const listed = options.filter((o) => o.kind === 'group').map((o) => o.value)
    expect(listed).toContain('group:empty')
    expect(listed).toHaveLength(groups.length + 1)
    expect(options.find((o) => o.value === 'group:contractors')?.meta).toBe('154 members')
    expect(options.filter((o) => o.kind === 'user')).toHaveLength(users.length)
  })
})

describe('the field', () => {
  const html = (who?: Parameters<typeof WhoCombo>[0]['who']) => renderToStaticMarkup(<WhoCombo who={who} onChange={() => {}} users={users} groups={groups} />)

  it('reads Everyone, in the answer’s colour, with a group’s mark, when nothing is picked', () => {
    const out = html()
    expect(out).toContain('aria-label="Who: Everyone"')
    expect(out).toMatch(/class="sit-ident__field is-empty is-answer"/)
    expect(out).toContain('sit-ident__blank is-group')
    expect(out).toContain('>Everyone</span>')
  })

  it('takes more than Access checks’ five: no cap', () => {
    const who = { groupIds: groups.slice(0, 7).map((g) => g.id), userIds: [] }
    const out = html(who)
    expect(out).toContain(`aria-label="Who: ${groups.slice(0, 7).map((g) => g.name).join(', ')}"`)
    expect(out).not.toContain('is-answer')
    /* The cap is a prop with Access checks' five as its default; the rule's Who passes Infinity and opens on Groups. */
    expect(comboSrc).toContain('max = MAX_IDENTITIES,')
    expect(comboSrc).toContain('const full = value.length >= max')
  })
})
