import { blankRule, cond, type Rule } from '../data'

/* -----------------------------------------------------------------------------
   The interview — a policy built from answers.

   A first-time administrator opening the builder meets an ordered list, a
   condition grammar and first-match-wins, and has to know all three before the
   first rule. This asks five questions instead and writes the rules.

   Two rules govern everything here:

   · **It authors, it does not invent.** Every answer maps to conditions and
     decisions that already exist in the model. Nothing this produces is
     unreachable from the builder, and everything it produces is editable there.

   · **Order is the answer, not a detail.** Under first-match-wins the relief
     rule must sit *below* the guard rule, or an unmanaged laptop on the office
     network gets the easy path. compose() puts them in that order deliberately
     and the experience says so — it is the single most useful thing a first
     policy can teach.

   Parsing is keyword matching, not a model. It seeds the answers it is
   confident about and asks anyway, so a wrong guess costs one glance.
   -------------------------------------------------------------------------- */

export interface Option {
  id: string
  label: string
  caption: string
}

export interface Question {
  id: QuestionId
  prompt: string
  /** Sits on the Tip beside the question rather than under it. */
  hint: string
  options: Option[]
}

export type QuestionId = 'audience' | 'threat' | 'response' | 'relief' | 'remember'
export type Answers = Partial<Record<QuestionId, string>>

const GROUPS: Option[] = [
  { id: 'all', label: 'Everyone', caption: '1,240 people' },
  { id: 'finance', label: 'Finance', caption: '86 people' },
  { id: 'engineering', label: 'Engineering', caption: '310 people' },
  { id: 'executives', label: 'Executives', caption: '12 people' },
  { id: 'contractors', label: 'Contractors', caption: '154 people' },
  { id: 'it-admins', label: 'IT Admins', caption: '9 people' },
]

export const QUESTIONS: Question[] = [
  {
    id: 'audience',
    prompt: 'Who is this policy for?',
    hint: 'The audience is checked before any condition. Somebody outside it never reaches these rules at all.',
    options: GROUPS,
  },
  {
    id: 'threat',
    prompt: 'What worries you most about their sign-ins?',
    hint: 'This becomes the condition on the first rule — the one that gets checked before anything else.',
    options: [
      { id: 'unmanaged', label: 'Devices we do not manage', caption: 'Personal laptops and phones' },
      { id: 'offsite', label: 'Sign-ins from outside the network', caption: 'Anywhere that is not an office' },
      { id: 'risky', label: 'Sessions the risk engine flags', caption: 'Impossible travel, new fingerprints' },
      { id: 'newuser', label: 'Accounts with no second factor yet', caption: 'First logins and MFA resets' },
    ],
  },
  {
    id: 'response',
    prompt: 'When that happens, what should the policy do?',
    hint: 'Deny is final — there is no alternate path once a rule denies. The other two ask for more proof instead.',
    options: [
      { id: 'deny', label: 'Refuse the sign-in', caption: 'Nothing gets through' },
      { id: 'mfa', label: 'Ask for a second factor', caption: 'Any enrolled method' },
      { id: 'strong', label: 'Ask for a phishing-resistant factor', caption: 'WebAuthn or a security key' },
    ],
  },
  {
    id: 'relief',
    prompt: 'Should the office network be easier?',
    hint: 'This rule sits below the guard rule on purpose — otherwise an unmanaged laptop in the office would take the easy path.',
    options: [
      { id: 'yes', label: 'Yes — one factor on the office network', caption: 'Fewer prompts for people at their desk' },
      { id: 'no', label: 'No — same treatment everywhere', caption: 'One rule for every location' },
    ],
  },
  {
    id: 'remember',
    prompt: 'How long should a trusted device stay trusted?',
    hint: 'A remembered device skips the second factor until the window expires.',
    options: [
      { id: '0', label: 'Never — ask every time', caption: 'Strictest, and the most prompts' },
      { id: '7', label: 'A week', caption: 'Re-checked every 7 days' },
      { id: '30', label: 'A month', caption: 'The common choice' },
      { id: '90', label: 'A quarter', caption: 'Fewest prompts' },
    ],
  },
]

/* --- Reading the prompt ---------------------------------------------------------

   Keyword matching, and it says so wherever it shows a guess. The point is not
   to be clever: it is that the first question already has an answer in it, so
   the interview starts as a confirmation rather than a blank form. */

const SEEDS: { q: QuestionId; option: string; words: RegExp }[] = [
  { q: 'audience', option: 'finance', words: /\bfinance|accounting|payroll|billing\b/i },
  { q: 'audience', option: 'executives', words: /\bexec|executive|leadership|c-level|board\b/i },
  { q: 'audience', option: 'engineering', words: /\bengineer|developer|dev team|eng\b/i },
  { q: 'audience', option: 'contractors', words: /\bcontractor|vendor|agency|freelance|partner\b/i },
  { q: 'audience', option: 'it-admins', words: /\badmin|it team|helpdesk|sysadmin\b/i },

  { q: 'threat', option: 'unmanaged', words: /\bunmanaged|personal device|byod|not enrolled|unenrolled|mdm\b/i },
  { q: 'threat', option: 'offsite', words: /\bremote|off.?site|outside|home|travel|abroad|public wifi\b/i },
  { q: 'threat', option: 'risky', words: /\brisk|suspicious|anomal|threat|compromis|attack\b/i },
  { q: 'threat', option: 'newuser', words: /\bnew (user|joiner|hire)|first login|onboard|no mfa|reset\b/i },

  { q: 'response', option: 'deny', words: /\bblock|deny|refuse|stop|prevent|ban\b/i },
  { q: 'response', option: 'strong', words: /\bphishing.?resistant|webauthn|fido|passkey|security key|hardware\b/i },
  { q: 'response', option: 'mfa', words: /\bmfa|2fa|second factor|two.?factor|step.?up|challenge\b/i },

  { q: 'relief', option: 'yes', words: /\boffice|on.?site|corporate network|hq|headquarters\b/i },
  { q: 'remember', option: '0', words: /\bevery time|every login|always ask|never remember\b/i },
  { q: 'remember', option: '90', words: /\b90|quarter|three months\b/i },
  { q: 'remember', option: '7', words: /\bweek|weekly|7 days\b/i },
  { q: 'remember', option: '30', words: /\bmonth|monthly|30 days\b/i },
]

/** What the prompt already answered. Later seeds never overwrite earlier ones,
    so the first match for a question wins and the order above is the priority. */
export function readPrompt(text: string): Answers {
  const found: Answers = {}
  for (const s of SEEDS) {
    if (found[s.q]) continue
    if (s.words.test(text)) found[s.q] = s.option
  }
  return found
}

/** A short name for the policy, from the prompt if it is usable. */
export function nameFor(text: string, answers: Answers): string {
  const who = QUESTIONS[0].options.find((o) => o.id === answers.audience)?.label ?? 'Everyone'
  const trimmed = text.trim().replace(/\.$/, '')
  if (trimmed.length >= 8 && trimmed.length <= 42) {
    return trimmed[0].toUpperCase() + trimmed.slice(1)
  }
  const t = answers.threat
  const what =
    t === 'unmanaged' ? 'device trust' : t === 'offsite' ? 'off-network access' : t === 'risky' ? 'risk step-up' : t === 'newuser' ? 'enrolment' : 'access'
  return `${who} — ${what}`
}

/* --- Composing the rules ------------------------------------------------------ */

/** Every rule this produces is an ordinary rule: same factory, same defaults,
    fully editable in the builder afterwards. */
function make(over: Partial<Rule> & Pick<Rule, 'name'>): Rule {
  return { ...blankRule(over.name), ...over }
}

const THREAT_CONDITION: Record<string, () => ReturnType<typeof cond>> = {
  unmanaged: () => cond('mdm', 'is', ['Not enrolled']),
  offsite: () => cond('zone', 'not in zone', ['office']),
  risky: () => cond('ml-risk', 'is', ['High', 'Medium']),
  newuser: () => cond('auth-state', 'is', ['No MFA configured']),
}

const THREAT_NAME: Record<string, string> = {
  unmanaged: 'Unmanaged devices',
  offsite: 'Off-network sign-ins',
  risky: 'Flagged sessions',
  newuser: 'Accounts without a second factor',
}

/** Ordered rules, first-match-wins, built from the answers. */
export function compose(answers: Answers): Rule[] {
  const audience = [answers.audience ?? 'all']
  const rules: Rule[] = []

  /* 1 — the guard. It goes first because everything below it is relief, and
     relief above a guard is a hole rather than a convenience. */
  const threat = answers.threat
  if (threat && THREAT_CONDITION[threat]) {
    const response = answers.response ?? 'mfa'
    rules.push(
      make({
        name: THREAT_NAME[threat],
        appliesTo: audience,
        conditions: [THREAT_CONDITION[threat]()],
        decision: response === 'deny' ? 'deny' : '2fa',
        ...(response === 'strong'
          ? { secondFactor: 'specific' as const, secondFactorMethods: ['WebAuthn / FIDO2'] }
          : {}),
        matchEstimate: 180,
      }),
    )
  }

  /* 2 — the relief, below the guard. */
  if (answers.relief === 'yes') {
    rules.push(
      make({
        name: 'On the office network',
        appliesTo: audience,
        conditions: [cond('zone', 'in zone', ['office'])],
        decision: '1fa',
        matchEstimate: 620,
      }),
    )
  }

  /* 3 — the baseline, so the audience is governed rather than falling through
     to the engine default. */
  const days = Number(answers.remember ?? '30')
  rules.push(
    make({
      name: 'Everyone else in this audience',
      appliesTo: audience,
      conditions: [],
      decision: '2fa',
      rememberMfa: days > 0,
      ...(days > 0 ? { rememberDays: days } : { forceMfaEachLogin: true }),
      matchEstimate: 440,
    }),
  )

  return rules
}

/** One line per rule, in evaluation order — what the build animation reads out. */
export function narrate(rules: Rule[]): string[] {
  return rules.map((r, i) => {
    const what = r.decision === 'deny' ? 'is refused' : r.decision === '1fa' ? 'signs in on one factor' : 'is asked for a second factor'
    const when = r.conditions.length === 0 ? 'anyone still unmatched' : describe(r)
    return `${i + 1}. ${when} ${what}.`
  })
}

function describe(r: Rule): string {
  const c = r.conditions[0]
  if (!c) return 'anyone still unmatched'
  if (c.typeId === 'mdm') return 'a device we do not manage'
  if (c.typeId === 'zone') return c.operator === 'in zone' ? 'a sign-in from the office network' : 'a sign-in from outside the office network'
  if (c.typeId === 'ml-risk') return 'a session the risk engine flagged'
  if (c.typeId === 'auth-state') return 'an account with no second factor'
  return 'a matching sign-in'
}
