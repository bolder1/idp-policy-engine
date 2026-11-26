import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from '../store'
import { BellPanel } from './UserBell'
import { PasswordPage } from './PasswordPage'
import { passwordIssue } from './password'
import { ProfilePage } from './ProfilePage'
import { reduceUserDash } from './state'
import { seedUserDash } from './seed'

/* Profile, Password (live parity: fields, words and order) and the bell (plan Task 6). */

const wrap = (node: React.ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const order = (out: string, words: string[]) => words.map((w) => out.indexOf(w))

describe('Profile', () => {
  it('profile fields in live order', () => {
    const at = order(wrap(<ProfilePage />), ['Account information', 'Username', 'Email', 'Phone', 'Profile information', 'First name', 'Last name', 'Alternate email'])
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })
})

describe('Password', () => {
  it('lists the rules beside the form', () => {
    const out = wrap(<PasswordPage />)
    for (const w of ['Current password', 'New password', 'Confirm password', 'Passwords must contain']) expect(out).toContain(w)
  })

  it('passwordIssue', () => {
    expect(passwordIssue('', 'abcdef', 'abcdef')?.field).toBe('current')
    expect(passwordIssue('old', 'abcde', 'abcde')?.text).toBe('Use 6 to 15 characters')
    expect(passwordIssue('old', 'a'.repeat(16), 'a'.repeat(16))?.text).toBe('Use 6 to 15 characters')
    expect(passwordIssue('old', 'abc~def', 'abc~def')?.text).toBe('Use only these symbols: !@#$.%^&*-_')
    expect(passwordIssue('old', 'abcdef1!', 'abcdef1?')?.field).toBe('confirm')
    expect(passwordIssue('old', 'abcdef1!', 'abcdef1!')).toBeNull()
  })

  it('changing it clears the checkup item', () => {
    const s = seedUserDash()
    expect(s.passwordAgeDays).toBeGreaterThan(90)
    expect(reduceUserDash(s, { type: 'password-changed' }).passwordAgeDays).toBe(0)
  })
})

describe('the bell', () => {
  it('bell empty state', () => {
    expect(wrap(<BellPanel notes={[]} onlyUnread={false} onOnlyUnread={() => {}} onReadAll={() => {}} />)).toContain('You&#x27;re all caught up')
  })

  it('only unread hides read notes', () => {
    const notes = [
      { id: 'a', text: 'Old news', at: '12 Nov', read: true },
      { id: 'b', text: 'Travel access approved', at: 'Just now', read: false },
    ]
    const out = wrap(<BellPanel notes={notes} onlyUnread onOnlyUnread={() => {}} onReadAll={() => {}} />)
    expect(out).toContain('Travel access approved')
    expect(out).not.toContain('Old news')
  })
})
