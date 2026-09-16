import type { Policy } from '../data'

/* What a published policy can be switched to, and where its menu and dialog
   portal. Plain functions, kept apart from the components that use them. */

export type StatusTarget = 'active' | 'inactive'

/* Portals go to the app root, not <body>: the button, heading and focus resets
   are scoped to `.brand-root`, and outside it the menu items and the dialog's
   buttons render as grey UA buttons in the system font. */
export const portalRoot = (): Element => document.querySelector('.brand-root') ?? document.body

export interface StatusOption {
  target: StatusTarget
  label: string
}

/** The switches a policy offers. Empty for drafts, always-on and system policies. */
export function statusOptions(policy: Pick<Policy, 'status' | 'isSystem'>): StatusOption[] {
  if (policy.isSystem || policy.status === 'draft' || policy.status === 'always-on') return []
  return policy.status === 'active'
    ? [{ target: 'inactive', label: 'Turn off' }]
    : [{ target: 'active', label: 'Turn on' }]
}
