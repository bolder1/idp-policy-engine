/* -----------------------------------------------------------------------------
   The words Describe it knows that no tenant supplies.

   Input vocabulary, not copy: nothing here is ever put on screen as it stands.
   The reader (describe-model.ts) builds the rest of its dictionary from the
   tenant — the apps, groups, people, zones, profiles and methods it holds — and
   these tables are the fixed part around them: the verbs, the structure words,
   the aliases people actually type, and the words it reads past.

   Which is why this file is deliberately NOT in the ui-copy scan. It has to
   hold "login" and "logins" as words to read past, and a scan that refused
   them here would refuse the reader the sentences admins write (describe spec,
   §4 and §6.2).

   Every phrase is lower case and written the way the tokenizer splits a
   sentence: words of letters and digits, with `/`, `-`, `–`, `.`, `:` and an
   apostrophe allowed inside a word. So "two-factor" is one word and "two
   factor" is two, and both are listed.
   -------------------------------------------------------------------------- */

/** Words an app name may start with that people leave off: "Outlook", "Workspace". */
export const VENDOR_WORDS = ['microsoft', 'google', 'amazon'] as const
/** Words an app name may end with that people leave off: "GitHub", "AWS". */
export const EDITION_WORDS = ['enterprise', 'console', 'cloud'] as const

/* Categories are always a CHOICE, never a silent pick: "the CRM" on a tenant
   with one CRM still asks, because the admin may mean one the tenant has not
   added yet ("Another application"). Filtered to the apps the tenant has, by
   name, when the dictionary is built. */
export const APP_CATEGORIES: readonly { words: readonly string[]; apps: readonly string[] }[] = [
  { words: ['crm'], apps: ['Salesforce'] },
  { words: ['email', 'mail'], apps: ['Microsoft Outlook', 'Google Workspace'] },
  { words: ['file sharing', 'files'], apps: ['Dropbox', 'Box'] },
  { words: ['hr system', 'hris'], apps: ['HRMS', 'Workday'] },
  { words: ['ticketing'], apps: ['ServiceNow', 'Jira'] },
  { words: ['chat'], apps: ['Slack'] },
  { words: ['meetings', 'video calls'], apps: ['Zoom'] },
]

/* Group aliases, each added only when its target group exists by name.

   Not `admin` (singular) and not `it` alone: "the admin dashboard" is a place
   in an application, and "it" is a pronoun far more often than a department. */
export const GROUP_ALIASES: readonly { words: readonly string[]; group: string }[] = [
  { words: ['hr', 'hr team'], group: 'Human Resources' },
  { words: ['sales team', 'salespeople', 'sales people'], group: 'Sales' },
  { words: ['finance team'], group: 'Finance' },
  { words: ['engineers', 'engineering team', 'developers', 'devs'], group: 'Engineering' },
  { words: ['devops team'], group: 'DevOps' },
  { words: ['execs', 'leadership'], group: 'Executives' },
  { words: ['it admins', 'it team', 'admins'], group: 'IT Admins' },
]
/** One-word group names ending in "s" that are not plurals. */
export const NOT_PLURAL = ['sales', 'devops'] as const

/** "Employees" is a group AND the everyday word for everyone, so it always asks. */
export const EMPLOYEE_WORDS = ['employees', 'employee'] as const

export const EVERYONE_WORDS = ['everyone', 'all users', 'everybody', 'all staff'] as const

/* What every zone whose name holds the word "office" also answers to. The
   network one reads the zone by address (Match on: IP). */
export const OFFICE_WORDS = ['office', 'offices', 'the office', 'an office', 'a corporate office', 'corporate office'] as const
export const OFFICE_NETWORK_WORDS = ['office network', 'the office network'] as const

/* A device, said in a way that fits more than one profile. Always a choice. */
export const DEVICE_AMBIGUOUS = ['company laptop', 'company laptops', 'company device', 'company devices', 'work laptop', 'work laptops', 'work device', 'work devices', 'managed device', 'managed devices'] as const
/* The absence of management: a choice between "not a trusted device" and no condition at all. */
export const UNMANAGED_WORDS = ['unmanaged', 'unmanaged device', 'unmanaged devices', 'personal device', 'personal devices', 'byod'] as const
/* A kind of device, which no condition on this console reads directly: the
   device type lives in a device profile. */
export const DEVICE_TYPE_WORDS = [
  'laptop', 'laptops', 'phone', 'phones', 'mobile', 'mobiles', 'tablet', 'tablets', 'desktop', 'desktops',
  'windows', 'mac', 'macs', 'macbook', 'iphone', 'iphones', 'android',
] as const

/* Method aliases, by the console's own method name. */
export const METHOD_ALIASES: readonly { words: readonly string[]; method: string }[] = [
  { words: ['google auth'], method: 'Google Authenticator' },
  { words: ['microsoft auth'], method: 'Microsoft Authenticator' },
  { words: ['push', 'mo push', 'push notification', 'push notifications'], method: 'miniOrange Push' },
  { words: ['passkey', 'passkeys', 'a passkey', 'fido2', 'fido', 'security key', 'security keys', 'a security key'], method: 'FIDO2 / Passkey' },
  { words: ['yubikey', 'a yubikey'], method: 'Yubikey Token' },
  { words: ['email otp', 'otp by email', 'email code', 'an email code'], method: 'OTP over Email' },
  { words: ['sms', 'sms otp', 'text message', 'a text message'], method: 'OTP over SMS' },
]
/** Three methods answer to this, so it is always a choice among the enabled ones. */
export const AUTHENTICATOR_APP_WORDS = ['authenticator app', 'an authenticator app', 'authenticator apps'] as const
export const AUTHENTICATOR_APPS = ['Google Authenticator', 'Microsoft Authenticator', 'miniOrange OTP'] as const

/* A second factor, any enabled method. */
export const FACTOR_2FA = ['mfa', '2fa', 'two-factor', 'two factor', '2-step', 'two-step', 'second factor', 'a second factor', 'multi-factor', 'multifactor', 'multi factor', 'step up', 'step-up'] as const
/* One factor: the password. */
export const FACTOR_1FA = ['password', 'a password', 'passwords', 'password only', 'just a password', 'one factor', 'single factor', '1 factor', 'only a password'] as const

export const DENY_WORDS = ['block', 'blocks', 'blocked', 'deny', 'denied', 'denies', 'refuse', 'refused', 'reject', 'rejected', 'stop', 'no access'] as const
export const ALLOW_VERBS = ['reach', 'reaches', 'access', 'accesses', 'accessing', 'use', 'uses', 'using', 'open', 'opens', 'sign in to', 'signs in to', 'log in to', 'logs in to', 'allow', 'allowed', 'let', 'lets'] as const
export const REQUIREMENT_VERBS = ['need', 'needs', 'require', 'requires', 'required', 'must use', 'with', 'add', 'ask for', 'asks for'] as const

export const ONLY_WORDS = ['only'] as const
/** "Everyone else": the policy stays for everyone, and this clause is the last row. */
export const COMPLEMENT_WORDS = ['everyone else', 'anyone else', 'everybody else', 'all other users', 'other users'] as const
/** Whatever no rule above caught: the last row. */
export const REST_WORDS = ['anything else', 'everything else', 'otherwise', 'the rest', 'other devices', 'any other device', 'any other devices'] as const

/* Where. A positive word before a zone reads "in it"; a negative one "not in it". */
export const WHERE_WORDS = ['in', 'from', 'at', 'inside', 'within'] as const
export const NOT_WHERE_WORDS = ['outside', 'outside of', 'not from', 'not in', 'not at'] as const
/** A branch word: the other half of a split, "…in the office, push elsewhere". */
export const ELSEWHERE_WORDS = ['elsewhere', 'anywhere else', 'everywhere else', 'remotely', 'remote'] as const

/* Device words before a profile. */
export const ON_WORDS = ['on'] as const
export const NOT_ON_WORDS = ['not on', 'not a', 'not an'] as const

/* Which half of a zone. */
export const SCOPE_IP_WORDS = ['by ip', 'by network', 'on the network', 'office ip', 'the office ip'] as const
export const SCOPE_LOCATION_WORDS = ['by location', 'located in', 'physically in'] as const

/* A risk band, said. All three in one text are the tenant's own bands; one or
   two alone ask which cut-off is meant. */
export type Band = 'low' | 'medium' | 'high'
export const BAND_WORDS: readonly { words: readonly string[]; band: Band }[] = [
  { words: ['low risk', 'at low risk', 'risk is low'], band: 'low' },
  { words: ['medium risk', 'at medium risk', 'risk is medium'], band: 'medium' },
  { words: ['high risk', 'at high risk', 'risk is high', 'risky', 'risk profile is high', 'the risk profile is high'], band: 'high' },
]

/** Hours with no start or end: read, and set aside. */
export const HOURS_WORDS = ['office hours', 'working hours', 'business hours'] as const

/** What comes before the people a rule leaves out. */
export const EXCEPT_WORDS = ['except', 'except for', 'but not', 'excluding', 'other than'] as const

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export const DAY_ALIASES: readonly { words: readonly string[]; days: readonly string[] }[] = [
  { words: ['weekdays', 'on weekdays', 'mon-fri', 'mon–fri', 'monday-friday', 'monday–friday'], days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] },
  { words: ['weekends', 'at weekends', 'on weekends', 'the weekend', 'at the weekend'], days: ['Saturday', 'Sunday'] },
]
/** Three-letter day names, read like the whole name. */
export const DAY_SHORT: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', tues: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}
export const TZ_ALIASES: Record<string, string> = { ist: 'Asia/Kolkata' }

/* Read past, never reported. Articles, pronouns and the nouns every policy
   is about ("users", "sign-ins"), so "all sales team members" is Sales and
   nothing else. "staff" alone is here; "all staff" is everyone. */
export const STOP_WORDS = [
  'a', 'an', 'the', 'and', 'or', 'to', 'of', 'for', 'is', 'are', 'be', 'should', 'must', 'can', 'will', 'any', 'every',
  'each', 'all', 'that', 'who', 'which', 'if', 'when', 'whenever', 'while', 'they', 'them', 'their', 'it', 'its', 'this',
  'these', 'those', 'members', 'team members', 'member', 'users', 'user', 'people', 'person', 'staff', 'sign-ins',
  'sign-in', 'sign ins', 'sign in', 'signs in', 'signing in', 'signing', 'logins', 'login', 'log in', 'logs in',
  'logging in', 'log-ins', 'log-in', 'we', 'our', 'us', 'please', 'also', 'then', 'there', 'but', 'by', 'as',
  'app', 'apps', 'application', 'applications', 'device', 'devices', 'time', 'times', 'hours', 'on', 'with',
  'without', 'have', 'has', 'get', 'gets', 'into', 'onto', 'via', 'through',
] as const
