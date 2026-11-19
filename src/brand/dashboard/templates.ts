import type { WidgetId } from './catalog'
import { fromBoxes, type Box } from './layout'
import type { DashTemplate, TemplateNeed } from './model'

/* -----------------------------------------------------------------------------
   Dashboard templates: Xecurify's starting layouts, each made for one need
   (owner, 18 Nov 2026), after the two personas: the power admin wants detail,
   the basic admin wants few clicks.

   Each is written as boxes on a 12-column grid, row by row: a row of stats,
   then the wide chart beside a narrower breakdown, then the lists, then a
   table. layout.ts reads them as rows, columns and stacks (`fromBoxes`), so a
   box under another in the same columns becomes a stack.
   -------------------------------------------------------------------------- */

const at = (widget: WidgetId, x: number, y: number, w: number, h: number, more: Partial<Box> = {}): Box => ({ widget, x, y, w, h, ...more })

const tpl = (id: string, name: string, blurb: string, need: TemplateNeed, boxes: Box[]): DashTemplate => ({ id, name, blurb, need, rows: fromBoxes(boxes) })

/** Every admin's first dashboard. */
export const OVERVIEW: DashTemplate = tpl('overview', 'Overview', 'Sign-ins, what was blocked and the state of your policies', 'start', [
  at('migration', 0, 0, 12, 2),
  at('sign-ins-total', 0, 2, 3, 3),
  at('blocked-total', 3, 2, 3, 3),
  at('mfa', 6, 2, 3, 3),
  at('active-policies', 9, 2, 3, 3),
  at('sign-ins', 0, 5, 8, 6),
  at('blocked', 8, 5, 4, 6),
  at('health', 0, 11, 4, 6),
  at('changes', 4, 11, 4, 6),
  at('shortcuts', 8, 11, 4, 6),
  at('heatmap', 0, 17, 8, 5),
  at('top-apps', 8, 17, 4, 5),
  at('recent-sign-ins', 0, 22, 12, 7),
])

export const BLANK_ID = 'blank'

export const XECURIFY_TEMPLATES: DashTemplate[] = [
  OVERVIEW,
  tpl('security', 'Security watch', 'Blocked sign-ins, risk and the methods people use', 'security', [
    at('blocked-total', 0, 0, 3, 3),
    at('success-rate', 3, 0, 3, 3),
    at('mfa', 6, 0, 3, 3),
    at('active-policies', 9, 0, 3, 3),
    at('sign-ins', 0, 3, 8, 6),
    at('blocked', 8, 3, 4, 6, { view: 'donut' }),
    at('risky-users', 0, 9, 4, 6),
    at('risk-signals', 4, 9, 4, 6),
    at('locations', 8, 9, 4, 6),
    at('phishing', 0, 15, 3, 6),
    at('methods', 3, 15, 4, 6),
    at('expiring', 7, 15, 5, 6),
    at('recent-sign-ins', 0, 21, 12, 7, { pick: 'blocked' }),
  ]),
  tpl('operations', 'Daily operations', 'Requests to answer and access to check, for the help desk', 'operations', [
    at('sign-ins-total', 0, 0, 3, 3),
    at('blocked-total', 3, 0, 3, 3),
    at('success-rate', 6, 0, 3, 3),
    at('mfa', 9, 0, 3, 3),
    at('approvals', 0, 3, 4, 6),
    at('check', 4, 3, 4, 6),
    at('shortcuts', 8, 3, 4, 6),
    at('recent-sign-ins', 0, 9, 12, 7),
    at('mfa-delivery', 0, 16, 6, 6),
    at('funnel', 6, 16, 3, 6),
    at('license', 9, 16, 3, 6),
  ]),
  tpl('service', 'Service health', 'Connections, delivery and syncs, and what admins changed', 'operations', [
    at('connections', 0, 0, 6, 6),
    at('mfa-delivery', 6, 0, 6, 6),
    at('provisioning', 0, 6, 8, 6),
    at('admin-activity', 8, 6, 4, 6),
    at('license', 0, 12, 12, 2),
  ]),
  tpl('architect', 'Access architect', 'Policies, coverage and the move from the old console', 'policies', [
    at('migration', 0, 0, 12, 2),
    at('active-policies', 0, 2, 3, 3),
    at('coverage', 3, 2, 6, 3),
    at('blocks', 9, 2, 3, 3),
    at('top-rules', 0, 5, 6, 6),
    at('health', 6, 5, 3, 6),
    at('apps-without', 9, 5, 3, 6),
    at('check', 0, 11, 4, 6),
    at('changes', 4, 11, 4, 6),
    at('top-apps', 8, 11, 4, 6, { view: 'grid' }),
  ]),
  tpl('audit', 'Audit ready', 'Who changed what, what is expiring and how people sign in', 'compliance', [
    at('active-policies', 0, 0, 3, 3),
    at('mfa', 3, 0, 3, 3),
    at('user-types', 6, 0, 6, 3),
    at('changes', 0, 3, 4, 6),
    at('admin-activity', 4, 3, 4, 6),
    at('expiring', 8, 3, 4, 6),
    at('license', 0, 9, 4, 5),
    at('directory', 4, 9, 4, 5),
    at('phishing', 8, 9, 4, 5),
    at('recent-sign-ins', 0, 14, 12, 7),
  ]),
  tpl('people', 'People and lifecycle', 'Who joined, who went quiet and what is waiting on you', 'people', [
    at('directory', 0, 0, 4, 4),
    at('user-types', 4, 0, 4, 4),
    at('license', 8, 0, 4, 4),
    at('registrations', 0, 4, 8, 5),
    at('groups', 8, 4, 4, 5),
    at('approvals', 0, 9, 4, 6),
    at('dormant', 4, 9, 4, 6),
    at('risky-users', 8, 9, 4, 6),
    at('provisioning', 0, 15, 12, 6),
  ]),
  tpl('first-steps', 'First steps', 'The few things a new tenant needs, in few clicks', 'start', [
    at('setup', 0, 0, 4, 6),
    at('shortcuts', 4, 0, 4, 6),
    at('whats-new', 8, 0, 4, 3),
    at('directory', 8, 3, 4, 3),
    at('apps-without', 0, 6, 4, 6),
    at('check', 4, 6, 4, 6),
    at('mfa', 8, 6, 4, 3),
    at('active-policies', 8, 9, 4, 3),
  ]),
  tpl(BLANK_ID, 'Start blank', 'An empty dashboard and the widget library', 'start', []),
]

/** What the library offers first on an empty dashboard. */
export const SUGGESTED: WidgetId[] = ['sign-ins-total', 'sign-ins', 'blocked', 'recent-sign-ins']
