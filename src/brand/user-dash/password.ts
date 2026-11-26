/* The Password page's rules (live parity, read 26 Nov 2026), apart from the page so the page file exports only a
   component (oxlint only-export-components). PURE. */

export const PASSWORD_MIN = 6
export const PASSWORD_MAX = 15
export const PASSWORD_SYMBOLS = '!@#$.%^&*-_'

const ALLOWED = /^[A-Za-z0-9!@#$.%^&*\-_]*$/

export type PasswordIssue = { field: 'current' | 'next' | 'confirm'; text: string }

/** What stops the change, said under the field it is about; null when it can go. */
export function passwordIssue(current: string, next: string, confirm: string): PasswordIssue | null {
  if (current === '') return { field: 'current', text: 'Enter your current password' }
  if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) return { field: 'next', text: `Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters` }
  if (!ALLOWED.test(next)) return { field: 'next', text: `Use only these symbols: ${PASSWORD_SYMBOLS}` }
  if (confirm !== next) return { field: 'confirm', text: "Passwords don't match" }
  return null
}
