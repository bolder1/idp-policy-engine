import type { BrandScreen } from '../store'

/* -----------------------------------------------------------------------------
   The account checkup on My account's Overview, and the "Things to do" strip on Apps (spec goals 1-2). Four items,
   each done or one action away; the person's own state only, never a policy. PURE.
   -------------------------------------------------------------------------- */

export type CheckId = 'second' | 'backup' | 'passkey' | 'password'

export interface CheckItem {
  id: CheckId
  done: boolean
  label: string
  action: { label: string; to: BrandScreen }
  /** The open item as a thing to do, for the Apps home's strip. */
  todo: string
}

/** The second-step method that is a passkey (methods.ts). */
export const PASSKEY_METHOD_ID = 'fido2'
/** A password older than this asks to be changed. */
export const PASSWORD_MAX_DAYS = 90

const METHODS: BrandScreen = { name: 'account', page: 'methods' }
const PASSWORD: BrandScreen = { name: 'account', page: 'password' }

export function checkup(configured: readonly string[], passwordAgeDays: number): { items: CheckItem[]; todo: CheckItem[] } {
  const items: CheckItem[] = [
    { id: 'second', done: configured.length >= 1, label: 'Second method', action: { label: 'Set up', to: METHODS }, todo: 'Set up a second method' },
    { id: 'backup', done: configured.length >= 2, label: 'Backup method', action: { label: 'Add', to: METHODS }, todo: 'Add a backup method' },
    { id: 'passkey', done: configured.includes(PASSKEY_METHOD_ID), label: 'Passkey', action: { label: 'Add', to: METHODS }, todo: 'Add a passkey' },
    { id: 'password', done: passwordAgeDays <= PASSWORD_MAX_DAYS, label: 'Password', action: { label: 'Change', to: PASSWORD }, todo: 'Change your password' },
  ]
  return { items, todo: items.filter((i) => !i.done) }
}
