import { EVERYONE, audienceOf, card, cond, fallbackRule, rule, when, type Policy, type Rule } from '../../data'
import type { Tenant } from '../../fixtures'

/* Test support. The showcase seed holds ONE sign-in policy per application
   (owner, 14 Oct 2026), so it can no longer produce a conflict between two
   policies on one application. The conflicts model is still product code, and
   these are the showcase's former split policies (AWS x3, Slack x2, the Finance
   GitHub draft, Box x2), kept here so the engine tests can still build that
   situation: `splitShowcase(t)` swaps the merged policies for them, in their
   old places in the list. Nothing in the app imports this. */

const denyAll = (denyMessage: string): Rule => ({ ...fallbackRule('deny'), denyMessage })
const onCorporateDevice = () => cond('fingerprint', 'matches', ['fp-corp-devices'])

const split: Policy[] = [
  /* AWS for the people who build: engineers on a compliant device sign in on
     a password; contractors reach it from an office only, on a compliant
     device and with Google Authenticator. The contractor Deny is rule 1 so it
     is read before anything that could let a contractor in. */
  {
    id: 'sc-aws-engineering',
    name: 'AWS for engineering teams',
    type: 'App Access',
    appIds: ['aws'],
    audience: audienceOf(['engineering', 'devops', 'contractors']),
    status: 'active',
    lastModified: '3 days ago',
    modifiedBy: 'Jaspreet Toor',
    rules: [
      rule({
        name: 'Contractors away from the office',
        who: { groupIds: ['contractors'], userIds: [] },
        when: when(card(cond('zone', 'not in zone', ['corp-offices']))),
        decision: 'deny',
        denyMessage: 'Contractors reach AWS from a corporate office only.',
        matchEstimate: 41,
      }),
      rule({
        name: 'Engineers on a compliant device',
        who: { groupIds: ['engineering', 'devops'], userIds: [] },
        when: when(card(cond('fingerprint', 'matches', ['fp-compliant']))),
        decision: '1fa',
        firstFactor: 'Password',
        matchEstimate: 262,
      }),
      rule({
        name: 'Contractors in the office',
        who: { groupIds: ['contractors'], userIds: [] },
        when: when(card(cond('zone', 'in zone', ['corp-offices']), cond('fingerprint', 'matches', ['fp-compliant']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        matchEstimate: 23,
      }),
    ],
    fallback: denyAll('AWS needs a compliant device. Update your device, or contact IT.'),
  },

  /* Finance reads the AWS bill: a compliant device and Google Authenticator.
     Thomas Byrne leaves on Friday and was named in a Deny of his own — BELOW
     the rule that lets Finance in, so on a compliant device rule 1 still lets
     him in. Naming somebody does not move their rule up. */
  {
    id: 'sc-aws-finance',
    name: 'AWS billing for Finance',
    type: 'App Access',
    appIds: ['aws'],
    audience: audienceOf(['finance']),
    status: 'active',
    lastModified: '2 days ago',
    modifiedBy: 'Jaspreet Toor',
    rules: [
      rule({
        name: 'Compliant device',
        when: when(card(cond('fingerprint', 'matches', ['fp-compliant']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        matchEstimate: 72,
      }),
      rule({
        name: 'Thomas Byrne — access ends Friday',
        who: { groupIds: [], userIds: ['u-fin-4'] },
        decision: 'deny',
        denyMessage: 'Your AWS access has ended. Contact IT if you still need it.',
        matchEstimate: 1,
      }),
    ],
    fallback: denyAll('AWS billing needs a compliant device. Update your device, or contact IT.'),
  },

  /* A stricter policy for production, made for DevOps after AWS for
     engineering teams already covered them — so for DevOps it never decides:
     one policy applies per application and group, the one higher in the list. */
  {
    id: 'sc-aws-devops',
    name: 'AWS production for DevOps',
    type: 'App Access',
    appIds: ['aws'],
    audience: audienceOf(['devops']),
    status: 'active',
    lastModified: 'Yesterday',
    modifiedBy: 'Jaspreet Toor',
    rules: [
      rule({
        name: 'Registered corporate device',
        when: when(card(onCorporateDevice())),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['miniOrange Push'],
        matchEstimate: 26,
      }),
    ],
    fallback: denyAll('AWS production needs a registered corporate device.'),
  },

  /* Slack for everyone — the DEFAULT group — from the countries we work in.
     First in the list, and still never the one deciding for somebody a Slack
     policy for their group covers. */
  {
    id: 'sc-slack-everyone',
    name: 'Slack for everyone',
    type: 'App Access',
    appIds: ['slack'],
    audience: EVERYONE,
    status: 'active',
    lastModified: '5 days ago',
    modifiedBy: 'Jaspreet Toor',
    rules: [
      rule({
        name: 'Where we operate',
        when: when(card(cond('zone', 'in zone', ['operating-countries']))),
        decision: '1fa',
        firstFactor: 'Password',
        matchEstimate: 905,
      }),
    ],
    fallback: denyAll('Slack opens only from the countries we work in.'),
  },

  /* Engineering's workspace, which contractors join: engineers sign in on a
     password from the countries we work in — except contractors, who need a
     corporate device and an OTP over Email. A contract engineer is in
     Engineering AND Contractors, and the exception wins. */
  {
    id: 'sc-slack-engineering',
    name: 'Slack for engineering and contractors',
    type: 'App Access',
    appIds: ['slack'],
    audience: audienceOf(['engineering', 'contractors']),
    status: 'active',
    lastModified: '4 days ago',
    modifiedBy: 'Jaspreet Toor',
    rules: [
      rule({
        name: 'Engineers, where we operate',
        who: { groupIds: ['engineering'], userIds: [], exceptGroupIds: ['contractors'] },
        when: when(card(cond('zone', 'in zone', ['operating-countries']))),
        decision: '1fa',
        firstFactor: 'Password',
        matchEstimate: 296,
      }),
      rule({
        name: 'Contractors on a corporate device',
        who: { groupIds: ['contractors'], userIds: [] },
        when: when(card(onCorporateDevice())),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['OTP over Email'],
        matchEstimate: 58,
      }),
    ],
    fallback: denyAll('Slack needs a corporate device for contractors, and the countries we work in for everyone.'),
  },

  /* A draft for Finance on GitHub: reviewers on a corporate device sign in on
     a password. Developer tools already covers Finance on GitHub and is higher
     in the list, so turned on, this would change nothing. */
  {
    id: 'sc-code-review-finance',
    name: 'Code review for Finance',
    type: 'App Access',
    appIds: ['github'],
    audience: audienceOf(['finance']),
    status: 'draft',
    lastModified: 'Yesterday',
    modifiedBy: 'Jaspreet Toor',
    rules: [
      rule({
        name: 'Corporate device',
        when: when(card(onCorporateDevice())),
        decision: '1fa',
        firstFactor: 'Password',
        matchEstimate: 40,
      }),
    ],
    fallback: denyAll('Code review needs a registered corporate device.'),
  },

  /* ---------------------------------------------------------------------------
     One person, two groups, a policy for each (owner, 1 Oct 2026): "think
     someone called Tanmay is in 2 groups, one is Engineering group and one is
     Design group. For Engineering there is a different policy like sign in
     with password as first factor, but for the Design group it's sign in with
     2FA … how do we fulfil this kind of use case?"

     Exactly that, on Box — the one application in the catalogue both teams
     work in every day (specs and handoff files; there is no Figma here, and
     no logo for one). Two policies, as an admin would write them: one per
     group, each a single rule from the countries we work in, each ending in
     its own last row. Engineering's was made first and is higher in the
     list, so for somebody in both, it decides: one policy applies to a
     person on an application, and within a tier it is the one higher in the
     list (tenant-resolver.ts). Tanmay Joshi gets a password; Box for design,
     which would ask him for a push, is reported beside the answer and not
     used — the Sign-in tests page says which, and why, and that a rule
     naming him in Box for engineering is the fix if Design's should win.
     Anyone in Design alone gets the push, and nobody else is in both.
     ------------------------------------------------------------------------ */

  /* Box for Engineering: a password, from the countries we work in. */
  {
    id: 'sc-box-engineering',
    name: 'Box for engineering',
    type: 'App Access',
    appIds: ['box'],
    audience: audienceOf(['engineering']),
    status: 'active',
    lastModified: '6 days ago',
    modifiedBy: 'Jaspreet Toor',
    rules: [
      rule({
        name: 'Engineers, where we operate',
        when: when(card(cond('zone', 'in zone', ['operating-countries']))),
        decision: '1fa',
        firstFactor: 'Password',
        matchEstimate: 241,
      }),
    ],
    fallback: denyAll('Box opens only from the countries we work in.'),
  },

  /* Box for Design: a password and miniOrange Push, from the same countries.
     Made after Engineering's, so it is lower in the list. */
  {
    id: 'sc-box-design',
    name: 'Box for design',
    type: 'App Access',
    appIds: ['box'],
    audience: audienceOf(['design']),
    status: 'active',
    lastModified: '2 days ago',
    modifiedBy: 'Jaspreet Toor',
    rules: [
      rule({
        name: 'Designers, where we operate',
        when: when(card(cond('zone', 'in zone', ['operating-countries']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['miniOrange Push'],
        matchEstimate: 20,
      }),
    ],
    fallback: denyAll('Box opens only from the countries we work in.'),
  },
]

const MERGED = ['sc-aws-engineering', 'sc-slack-everyone', 'sc-box-engineering']

/** The tenant with the merged AWS, Slack and Box policies replaced by the split ones, in their old order. */
export function splitShowcase(t: Tenant): Tenant {
  const at = t.policies.findIndex((p) => p.id === MERGED[0])
  const rest = t.policies.filter((p) => !MERGED.includes(p.id))
  return { ...t, policies: [...rest.slice(0, at), ...split, ...rest.slice(at)] }
}
