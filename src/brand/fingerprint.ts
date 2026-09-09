/* -----------------------------------------------------------------------------
   Device profiles — the attribute master, and the two kinds of profile.

   Transcribed from "Adaptive MFA - Device Fingerprint v2.xlsx": the 38
   attributes on the *Devic Fingerprint* sheet, the weights and bands from
   *Sheet2*, and the outcome matrix from *Sheet9*.

   Two kinds, and the whole screen turns on which one you pick. They were called
   "Attribute match" and "Risk score", which named the ARITHMETIC each one runs
   — and an admin does not arrive wanting an arithmetic. They arrive wanting to
   keep unpatched Androids out, or to recognise the machine somebody signed in
   from last week. So the two are named after the QUESTION now:

   · **OS and version.** What must a device be running? A form factor, and a
     version floor per platform: `Windows ≥ 10`, `Android ≥ 13`. Each one you
     name is a condition, and they are ANDed. Everything it reads arrives with
     the request, so there is nothing to install and nothing to decide about
     collection — which is why this kind never asks the agent question.
   · **Device attributes.** Is this the same machine as last time? Many weak
     signals, each carrying a weight, and what changed since last time adds up
     to a score. It is more expressive and considerably harder to reason about,
     which is the honest trade. Half of what it can read needs software on the
     machine, so this kind asks the agent question first — before the attributes,
     because the answer decides which attributes exist at all.

   An earlier version of this comment said attribute-match let you "set how many
   may drift before the device stops counting as known". No such control has
   ever existed here — the only `tolerance` config in the file belongs to `time`,
   which is a device attribute. What the OS catalogue holds is a set of
   conditions, not a drift budget, and under its new name the old sentence would
   have been actively misleading.

   Weights come from the sheet's own table rather than being invented: unique
   hardware identifiers 30, hardware specifications 20, browser and network 10,
   software and configuration 5.
   -------------------------------------------------------------------------- */

/* Back, and only for the device catalogue. See DEVICE_ATTRIBUTES below: the two
   kinds ask different questions and were never well served by one list. */
/* Seven, and two of them belong to the requirements catalogue rather than the
   risk one.

   `Platform` and `Client` are not filing for the risk list — a machine's OS is
   `Hardware` there, because what that list wants to know is how hard a signal
   is to forge. They exist because the requirements list now asks two questions
   the risk list never does: what is this device RUNNING, and what miniOrange
   software is on it. See `categoriesFor`, which is why one union can serve two
   catalogues that file differently. */
export type AttrCategory = 'Platform' | 'Hardware' | 'Browser' | 'Security' | 'Client' | 'Network' | 'Behaviour'

export type Priority = 'High' | 'Medium' | 'Low'

/* --- What an attribute is tuned WITH --------------------------------------------
   Three of these are a single control: a number, a dropdown, a list of strings.
   The fourth is a sentence.

   Some attributes are not usefully described by "how loosely do you match
   this". "Operating system, matched on major version" is a precision setting;
   "operating system is not Android 12" is a different question, and the second
   is the one an admin arrives with. Those attributes need an operator and a
   value, and the value belongs to the attribute rather than to the control —
   the versions that mean something for iOS are not the ones that mean
   something for Windows.

   Values are GROUPED for the same reason. An OS version means nothing without
   its platform, and thirty version strings in one flat list is a list you
   scroll rather than read. The group is the type; the values are that type's
   own. Adding a platform is adding a group. */
export interface AttrRuleValue {
  op: string
  value: string
}

/** What a profile has stored against one attribute. */
export type AttrConfigValue = string | number | AttrRuleValue

export const isRuleValue = (v: AttrConfigValue | undefined): v is AttrRuleValue =>
  typeof v === 'object' && v !== null && 'op' in v

/** How a configurable attribute is tuned. Only some attributes have one. */
export type AttrConfig =
  | { kind: 'tolerance'; label: string; value: number; min: number; max: number; unit: string }
  | { kind: 'choice'; label: string; value: string; options: string[] }
  | { kind: 'list'; label: string; values: string[]; placeholder: string }
  | {
      kind: 'rule'
      label: string
      /* Named per attribute rather than shared, because the operators that make
         sense are not the same everywhere: a version can be "at least", a
         country cannot. */
      operators: string[]
      groups: { label: string; values: string[] }[]
      value: AttrRuleValue
    }
  /* A comparison against one of the platform's released versions.

     This was a free text field, on the argument that a version list is never
     complete — stale the week after a release, and the number an admin wants is
     usually the one that just shipped. The argument is real and it lost to a
     bigger one: a typed version is a typed MISTAKE. "11 " and "Windows 11" and
     "22h2" all parse as nothing, the field validated none of them, and a policy
     whose floor is an unparseable string is a policy that silently stops
     drawing a floor. A closed list cannot produce that state.

     `versions` is the platform's own list, most recent first, because the floor
     an admin is drawing is nearly always near the top of it. The staleness the
     old comment worried about is a data edit here rather than a user's problem:
     a release ships, one line is added to this file, and every profile offering
     it updates at once. A stored value that is NOT in the list is still shown
     and still selected — see `AttrControl` — so a fixture or an older profile
     never has its floor rewritten by a catalogue that moved on.

     Operators are shared across the four version attributes because a version
     compares the same way whatever platform it belongs to. */
  | {
      kind: 'version'
      label: string
      value: AttrRuleValue
      /* The platform this compares, as a word rather than as something to
         recover from the attribute's name.

         It was derived — `name.replace(/ ?OS version$/, '')` — which turned
         "iOS version" into "i", because the platform's own name ends in the
         word being stripped. That is the general failure of parsing a label to
         get back a fact somebody already knew when they wrote it. The overview
         names the platforms a profile checks, so this is now read rather than
         reconstructed. */
      platform: string
      /* What may be chosen, most recent first — WHEN there is a list worth
         offering. Plain version numbers: the marketing name goes in the label
         beside it where one helps, and a value that has to be parsed back out
         of "macOS 14 (Sonoma)" is a value that will eventually be parsed wrong.

         Optional, and the two cases are genuinely different rather than one
         being unfinished.

         An OPERATING SYSTEM has a handful of majors that everybody knows and
         that change once a year: Windows 10 and 11, iOS 17 and 18. A list there
         is complete, short, and stops a typed floor — "Windows 11", "11 ",
         "22h2" — from silently parsing as nothing, which is what a free field
         allowed and never validated.

         A BROWSER does not. Chrome ships a major every four weeks, so any list
         is stale within the month and the floor somebody wants is usually the
         one that shipped after this file was last edited. The same is true of
         the client apps. Those keep the typed field and its `placeholder`,
         which is what `AttrControl` falls back to when this is absent. */
      versions?: { value: string; label?: string }[]
      /** Real examples, for the attributes that are typed rather than chosen. */
      placeholder?: string
      hint: string
    }

export interface Attribute {
  id: string
  /* Only the risk catalogue files its attributes. The five an attribute-match
     profile can use are a list, not a taxonomy — five things do not need
     filing. */
  category?: AttrCategory
  name: string
  /** What the attribute is. Sits on a tip, never in the row. */
  purpose: string
  priority: Priority
  /** The sheet's weight, used when the profile scores rather than matches. */
  weight: number
  /** Phase 1 attributes are the ones that actually collect today. */
  phase: 1 | 2
  /* True when nothing but an installed agent can read this.

     Not a preference — a hard limit on which signals EXIST. A page cannot ask
     for a TPM identifier or a motherboard serial, so an agentless profile that
     names one is not misconfigured, it is inert: the value never arrives, so it
     never mismatches, and the profile is quietly weaker than it reads. */
  needsAgent?: true
  /* Collected on every request whether or not a profile asks for it, so a
     profile cannot turn it off.

     Not a recommendation and not a default — a default is something you can
     change. These four are what the request itself carries: a form factor, an
     operating system, a browser and an address. They arrive before any profile
     is consulted, they cost nothing to read, and a device fingerprint that
     ignores them is not a weaker fingerprint, it is one throwing away the only
     signals it is guaranteed to have.

     What a profile still decides about them is how much each one COUNTS. That
     is the whole of the difference between "always collected" and "always
     mattering", and it is why these rows are ticked-and-locked rather than
     hidden: an admin has to be able to see what is being weighed. */
  always?: true
  /** Absent when the attribute has nothing to tune. */
  config?: AttrConfig
}

/* --- The requirements catalogue, and why it grew from five to thirteen ----------
   This was thirty-eight in the sheet, then fourteen on the screen, then five,
   and it is thirteen. The five were one form-factor question and four version
   questions, and the argument for stopping there was that a device profile is
   asked two things: what KIND of device is this, and what is it RUNNING.

   That argument was right and the list was still short of it, in a way this
   file already said out loud. The note above `seedProfiles` names three
   requirements that had nowhere to live — screen lock, browser floors, and
   posture generally — records that the rules needing them were shipped with
   those clauses simply dropped, and says the fix is a catalogue change with its
   own argument. This is that change, and the argument is that "what is it
   running" was being read too narrowly. An operating system is one answer. A
   browser is another, and on a web SSO it is the thing actually rendering the
   session. Whether the OS is still the one the vendor shipped is a third, and
   it is the one that decides whether the other two can be believed at all.

   So the list is four groups rather than one flat five, and it is filed now —
   five rows do not need a taxonomy and thirteen do:

     Platform  what the device is and what OS it runs
     Browser   a version floor per family, which is the allowlist that was cut
     Security  integrity and screen lock — the posture checks with no home
     Client    the miniOrange app and agent, by version

   Still no `needsAgent` on anything here, and that is a deliberate answer to an
   obvious objection: only the miniOrange client can report a jailbreak or a
   screen lock, so surely those need an agent? They do — and in a REQUIREMENTS
   catalogue that is not a reason to hide the row, it is the requirement itself.
   A handset with no client cannot show a screen lock is set, so it fails "a
   screen lock is set", exactly as a handset on Android 12 fails "≥ 13". The
   risk catalogue is the one where a signal that never arrives is dangerous —
   there it silently never mismatches, and the profile is quietly weaker than it
   reads. Here an absent signal is a failed condition, which is the whole point.

   The consequence, said plainly: `asksReach('os')` stays false, an OS profile
   is still never asked the agent question, and this list is still offered
   whole. What changes is that it is now longer than the small-catalogue path
   allows, so it arrives with a search field and a category filter — which at
   thirteen rows is the right control and at five was not. */
/* The comparisons a version supports — a symbol, and the words for it.

   Stored as an id and shown as a SYMBOL, which is the shape Figma's conditional
   row uses and the right one here. A version comparison is an expression, and
   an expression reads as one line when its operator is one glyph: `Windows OS
   version  ≥  10` is a sentence, where "Windows OS version · is at least ·
   10" is three controls that happen to be adjacent. The words are not lost —
   they are how the menu names each symbol, so nobody has to know what ≥ means
   before choosing it.

   Both directions and both edges, because a policy is written either way round:
   ≥ 14 draws a floor and < 14 names what to challenge, and those are not the
   same rule with the sign flipped — one says who may in, the other who gets
   stopped. = and ≠ pin an exact build, which is what a rollback or a known-bad
   release needs. */
export interface VersionOp {
  id: string
  label: string
  symbol: string
}

export const VERSION_OPS: VersionOp[] = [
  { id: 'gte', label: 'Greater than or equal to', symbol: '≥' },
  { id: 'gt', label: 'Greater than', symbol: '>' },
  { id: 'lte', label: 'Less than or equal to', symbol: '≤' },
  { id: 'lt', label: 'Less than', symbol: '<' },
  { id: 'eq', label: 'Equal to', symbol: '=' },
  { id: 'ne', label: 'Not equal to', symbol: '≠' },
]

/** Falls back rather than rendering an empty token: an operator that went out
    of the list should read as the nearest thing, not as a blank chip. */
export const versionOp = (id: string): VersionOp =>
  VERSION_OPS.find((o) => o.id === id) ?? VERSION_OPS[0]

export const OS_ATTRIBUTES: Attribute[] = [
  {
    id: 'device-type', category: 'Platform', name: 'Device type',
    purpose: 'The form factor the request came from. A laptop and a phone are not the same risk, and some apps have no business being opened on one of them.',
    priority: 'Low', weight: 5, phase: 1,
    /* Three, and no "Desktop". The distinction that pays is portable versus
       not, and a desktop and a laptop answer that the same way for every rule
       anyone writes here — splitting them adds an option and no decision. */
    config: {
      kind: 'choice',
      label: 'Device type',
      value: 'Laptop',
      options: ['Mobile', 'Tablet', 'Laptop'],
    },
  },
  {
    id: 'os-windows', category: 'Platform', name: 'Windows OS version',
    purpose: 'The Windows build the request came from. Compare it to draw a floor under what may sign in.',
    priority: 'High', weight: 20, phase: 1,
    config: {
      kind: 'version',
      platform: 'Windows',
      label: 'Windows version',
      value: { op: 'gte', value: '10' },
      /* Windows names its releases twice — the major version and the annual
         feature update — and an admin drawing a floor means one or the other.
         Both are here, the feature updates labelled with the build they are,
         because "22H2" is what the update is called and 10.0.19045 is what the
         device reports. */
      versions: [
        { value: '11', label: 'Windows 11' },
        { value: '10.0.22631', label: 'Windows 11 · 23H2' },
        { value: '10.0.22621', label: 'Windows 11 · 22H2' },
        { value: '10', label: 'Windows 10' },
        { value: '10.0.19045', label: 'Windows 10 · 22H2' },
        { value: '10.0.19044', label: 'Windows 10 · 21H2' },
        { value: '8.1', label: 'Windows 8.1' },
      ],
      hint: 'The floor, not the exact build — a device reporting anything at or above this passes.',
    },
  },
  {
    id: 'os-android', category: 'Platform', name: 'Android OS version',
    purpose: 'The Android version the request came from. Compare it to keep unpatched handsets out.',
    priority: 'High', weight: 20, phase: 1,
    config: {
      kind: 'version',
      platform: 'Android',
      label: 'Android version',
      value: { op: 'gte', value: '13' },
      /* Whole numbers, which is how Android ships: there is no 14.1 to draw a
         floor under. */
      versions: [
        { value: '16', label: 'Android 16' },
        { value: '15', label: 'Android 15' },
        { value: '14', label: 'Android 14' },
        { value: '13', label: 'Android 13' },
        { value: '12', label: 'Android 12' },
        { value: '11', label: 'Android 11' },
        { value: '10', label: 'Android 10' },
      ],
      hint: 'The floor, not the exact release — a handset at or above this passes.',
    },
  },
  {
    id: 'os-ios', category: 'Platform', name: 'iOS version',
    purpose: 'The iOS version the request came from. Compare it to keep unpatched phones out.',
    priority: 'High', weight: 20, phase: 1,
    config: {
      kind: 'version',
      platform: 'iOS',
      label: 'iOS version',
      value: { op: 'gte', value: '17' },
      /* Majors only. iOS ships a point release most months, and a list carrying
         every 18.x would be forty rows deep to express a floor nobody draws at
         that precision. */
      versions: [
        { value: '26', label: 'iOS 26' },
        { value: '18', label: 'iOS 18' },
        { value: '17', label: 'iOS 17' },
        { value: '16', label: 'iOS 16' },
        { value: '15', label: 'iOS 15' },
      ],
      hint: 'The floor, not the exact release — a phone at or above this passes.',
    },
  },
  {
    id: 'os-macos', category: 'Platform', name: 'macOS version',
    purpose: 'The macOS version the request came from. Compare it to draw a floor under what may sign in.',
    priority: 'High', weight: 20, phase: 1,
    config: {
      kind: 'version',
      platform: 'macOS',
      label: 'macOS version',
      value: { op: 'gte', value: '14' },
      /* Labelled with the release name as well as the number, because macOS is
         the one platform where people say the name — "we are on Sonoma" — and
         the number is what the device reports. Both, so neither has to be
         translated in somebody's head. */
      versions: [
        { value: '26', label: 'macOS 26 · Tahoe' },
        { value: '15', label: 'macOS 15 · Sequoia' },
        { value: '14', label: 'macOS 14 · Sonoma' },
        { value: '13', label: 'macOS 13 · Ventura' },
        { value: '12', label: 'macOS 12 · Monterey' },
      ],
      hint: 'The floor, not the exact release — a Mac at or above this passes.',
    },
  },

  /* --- Browser: the allowlist that was cut, in the shape that works ----------

     Four, one per family, and it is the OS argument again: a version
     comparison only means something inside a product. "≥ 120" is a floor for
     Chrome and a floor for Edge and they are not the same number in the same
     week, so asking it of "the browser" is not a question.

     Deliberately a floor rather than a list of permitted names, which is what
     the cut condition was. A tenant enforcing browser hygiene is not saying
     "Chrome only" — it is saying "not the Chrome from eighteen months ago",
     and a name allowlist cannot express that at all. It is also the cheapest
     control in this catalogue: the browser states its version on every
     request, with nothing installed and nothing to enrol.

     A family a profile says nothing about is unconstrained. That is the same
     rule the OS floors follow, and it is what makes these safe to add: a
     profile naming a Chrome floor does not thereby ban Firefox. */
  {
    id: 'browser-chrome', category: 'Browser', name: 'Chrome version',
    purpose: 'The Chrome build the request came from. Chrome ships a major version roughly every four weeks, so a floor here decays into a patch-level control on its own.',
    priority: 'Medium', weight: 10, phase: 1,
    config: {
      kind: 'version',
      platform: 'Chrome',
      label: 'Chrome version',
      value: { op: 'gte', value: '120' },
      placeholder: '120, 131, 131.0.6778.86',
      hint: 'The major number is usually what you mean — 120, 131.',
    },
  },
  {
    id: 'browser-edge', category: 'Browser', name: 'Edge version',
    purpose: 'The Edge build the request came from. Numbered alongside Chrome since it moved to Chromium, and still worth stating separately — a managed Windows estate updates it on its own schedule.',
    priority: 'Medium', weight: 10, phase: 1,
    config: {
      kind: 'version',
      platform: 'Edge',
      label: 'Edge version',
      value: { op: 'gte', value: '120' },
      placeholder: '120, 131, 131.0.2903.70',
      hint: 'The major number — 120, 131.',
    },
  },
  {
    id: 'browser-firefox', category: 'Browser', name: 'Firefox version',
    purpose: 'The Firefox build the request came from. Its own release train and its own numbers, which is why it is not folded in with the Chromium pair.',
    priority: 'Medium', weight: 10, phase: 1,
    config: {
      kind: 'version',
      platform: 'Firefox',
      label: 'Firefox version',
      value: { op: 'gte', value: '128' },
      placeholder: '128, 133, 133.0.3',
      hint: 'The major number — 128, 133. ESR builds report their own.',
    },
  },
  {
    id: 'browser-safari', category: 'Browser', name: 'Safari version',
    purpose: 'The Safari build the request came from. Tied to the OS release rather than shipped on its own, so a floor here and a macOS floor usually move together.',
    priority: 'Medium', weight: 10, phase: 1,
    config: {
      kind: 'version',
      platform: 'Safari',
      label: 'Safari version',
      value: { op: 'gte', value: '17' },
      placeholder: '17, 18, 18.1.1',
      hint: 'Major, or major and minor — 17, 18.1.',
    },
  },

  /* --- Security: the two posture checks that had nowhere to live -------------

     Both are stated as a REQUIREMENT rather than as a detection with an
     outcome attached, and that is the difference between this catalogue and
     the risk one. The risk list's `root` carries "When detected → Deny /
     Challenge / Flag only", which puts the decision inside the library object:
     a rule saying "matches profile X" cannot then say what happens, because X
     already said. Here the profile states a condition and the RULE decides —
     which is the division of labour every other condition in this product
     follows, and the reason a policy can now answer a rooted handset with a
     flag on one app and a deny on another. */
  {
    id: 'integrity', category: 'Security', name: 'Device integrity',
    purpose: 'Whether the operating system is still the one the vendor shipped. A rooted, jailbroken or tampered device can report whatever it likes about every other check in this profile, so this is the row that decides whether the rest mean anything.',
    priority: 'High', weight: 30, phase: 1,
    /* `phase: 1` — this collects today, and the contrast with the risk
       catalogue's `root` is the point rather than an inconsistency.

       That row is `phase: 2` and `needsAgent`, because the collector it names
       is the Windows desktop agent, which does not inspect handsets. This one
       is read by the miniOrange Authenticator on the device itself, which
       attests its own integrity as part of doing its job. Same fact, two
       collectors, and only one of them exists on a phone. */
    /* A ladder rather than three tick boxes, and the ladder is ordered: each
       option is the one above it plus one more class of device. Three
       independent switches would let somebody build "tampered is fine but
       rooted is not", which is not a posture anybody holds — tampering is the
       broader fact and rooting is one way to achieve it. */
    config: {
      kind: 'choice',
      label: 'Require',
      value: 'Not rooted or jailbroken',
      options: [
        'Not rooted or jailbroken',
        'Not rooted, jailbroken or tampered',
        'Not rooted, tampered, or running in an emulator',
      ],
    },
  },
  {
    id: 'screen-lock', category: 'Security', name: 'Screen lock',
    purpose: 'Whether the device locks itself when it is put down. A handset with no passcode is not a device that might be stolen — it is a signed-in session that anybody who picks it up inherits.',
    priority: 'High', weight: 20, phase: 1,
    config: {
      kind: 'choice',
      label: 'Require',
      value: 'A screen lock is set',
      options: ['A screen lock is set', 'PIN, passcode or password', 'Biometric unlock'],
    },
  },

  /* --- Client: the miniOrange software, by version ---------------------------

     Two rows, not one, and the reason is the reason there are four OS rows.
     The app and the agent are separate products on separate release trains,
     and "≥ 6.4" is a sentence about one of them. A single "miniOrange version"
     floor would be a number that means one thing on a phone and another on a
     laptop, which is the shape this catalogue has refused everywhere else.

     Worth stating plainly because it is easy to read this as bureaucracy: a
     version floor on the client is not housekeeping, it is what makes the
     other controls enforceable. Number matching, verified push and the
     integrity checks above each arrived in a release. A tenant that has
     switched them on has switched them on for the handsets that can do them,
     and has no way to say so — until it can require the release. */
  {
    id: 'mo-authenticator', category: 'Client', name: 'miniOrange Authenticator version',
    purpose: 'The version of the authenticator app on the handset. Number matching, verified push and the integrity signals above each shipped in a release — a floor here is what turns them from settings into requirements.',
    /* The app reports its own version on every request it takes part in, which
       is as close to free as a signal gets. */
    priority: 'High', weight: 20, phase: 1,
    config: {
      kind: 'version',
      platform: 'miniOrange Authenticator',
      label: 'Authenticator version',
      value: { op: 'gte', value: '6.4' },
      placeholder: '6.4, 6.4.1',
      hint: 'Major and minor — 6.4 — unless a specific build is what you mean.',
    },
  },
  {
    id: 'mo-agent', category: 'Client', name: 'miniOrange Agent version',
    purpose: 'The version of the desktop agent. Separate from the app because they are separate products, and a floor meant for one must not be readable as a floor on the other.',
    priority: 'Medium', weight: 20, phase: 1,
    config: {
      kind: 'version',
      platform: 'miniOrange Agent',
      label: 'Agent version',
      value: { op: 'gte', value: '4.2' },
      placeholder: '4.2, 4.2.7',
      hint: 'The version the console reports for the agent — 4.2, 4.2.7.',
    },
  },
]

/* --- The risk catalogue, and why it is a different list ------------------------
   Attribute match and risk score ask different questions, and one list served
   neither well.

   MATCH asks "may this device sign in", and the answer is a small set of
   conditions an admin states outright: what kind of device, and what it is
   running. Five things, no taxonomy — filing five items is filing for its own
   sake.

   RISK asks "is this the same device as last time", and that is a scoring
   problem: it wants MANY weak signals, because the score is the sum and no
   single signal carries it. Thirty-eight of them do need a filing scheme, which
   is what the five categories are — Hardware, Browser, Security, Network,
   Behaviour, in descending order of how hard they are to forge.

   The sheet's own weights, unchanged: unique hardware identifiers 30, hardware
   specifications 20, browser and network 10, software and configuration 5.

   This list was deleted when the master narrowed to five and is restored from
   `ba0e53d^` rather than retyped, so the weights and the purposes are the
   sheet's own rather than a paraphrase of them. */
export const DEVICE_ATTRIBUTES: Attribute[] = [
  // --- Hardware -------------------------------------------------------------
  /* No config, and it is the only row in either catalogue to have lost one.

     It carried `Treat a change as → Significant / Minor / Ignore`, which is the
     weight question asked a second time in different words: Significant and
     Minor ARE High and Low, and Ignore is unticking the row. A device row now
     shows its weight and, where it has one, its precision — and this was the
     one attribute where those two controls would have been the same control
     printed twice with disagreeing vocabularies.

     It also settles something worse. `device-type` is the one id in both
     catalogues, and the merged lookup that used to resolve it always returned
     the OS copy — so a device profile asking for this row's configuration got
     `Device type → Laptop / Mobile / Tablet`, which is a CONDITION, on a
     profile that has no conditions. `attrOf(mode, id)` resolves by kind now,
     and with the config gone the two rows differ only in what they are for. */
  {
    id: 'device-type', category: 'Hardware', name: 'Device type',
    purpose: 'Desktop, laptop, mobile or tablet. Different form factors carry different risk.',
    priority: 'Low', weight: 5, phase: 1,
    always: true,
  },
  {
    id: 'manufacturer', category: 'Hardware', name: 'Manufacturer and model',
    purpose: 'Apple, Samsung, Dell. Identifies hardware families with known weaknesses.',
    priority: 'Medium', weight: 20, phase: 1, needsAgent: true,
  },
  {
    id: 'mac', category: 'Hardware', name: 'MAC address',
    purpose: 'The network adapter address. Strong, but changes when the adapter does.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'os', category: 'Hardware', name: 'Operating system and version',
    purpose: 'An unpatched OS is a reason to ask for more, independent of whether the device is known.',
    priority: 'High', weight: 20, phase: 1,
    always: true,
    config: { kind: 'choice', label: 'Match on', value: 'Major version', options: ['Exact build', 'Major version', 'Name only'] },
  },
  {
    id: 'os-install', category: 'Hardware', name: 'OS installation ID',
    purpose: 'Identifies one installation. Survives hardware changes, dies on a reinstall.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'tpm', category: 'Hardware', name: 'TPM ID',
    purpose: 'The Trusted Platform Module identifier. The strongest signal available, where a TPM exists.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'cpu', category: 'Hardware', name: 'Processor',
    purpose: 'CPU and GPU model. Stable for the life of the machine.',
    priority: 'Medium', weight: 20, phase: 1, needsAgent: true,
  },
  {
    id: 'screen', category: 'Hardware', name: 'Screen resolution',
    purpose: 'Changes when a monitor is plugged in, so it is weak on its own.',
    priority: 'Low', weight: 5, phase: 2,
  },
  {
    id: 'ram', category: 'Hardware', name: 'Memory and storage',
    purpose: 'Capacity, not serials. Changes on an upgrade.',
    priority: 'Medium', weight: 20, phase: 1, needsAgent: true,
  },
  {
    id: 'battery', category: 'Hardware', name: 'Battery status',
    purpose: 'Present or absent, and health. Distinguishes a laptop from a desktop.',
    priority: 'Low', weight: 5, phase: 2, needsAgent: true,
  },
  {
    id: 'motherboard', category: 'Hardware', name: 'Motherboard serial',
    purpose: 'Unique to the board. Effectively the machine itself.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'bios', category: 'Hardware', name: 'BIOS UUID',
    purpose: 'A unique firmware identifier, set at manufacture.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'disk', category: 'Hardware', name: 'Hard disk serial',
    purpose: 'Unique to the drive. Changes if the drive is replaced or cloned.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },
  {
    id: 'ram-serial', category: 'Hardware', name: 'RAM serials',
    purpose: 'Module serial numbers. Strong, but changes on any memory upgrade.',
    priority: 'Medium', weight: 5, phase: 1, needsAgent: true,
  },
  {
    id: 'machine-sid', category: 'Hardware', name: 'Machine SID',
    purpose: 'The Windows security identifier for the machine.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
  },

  // --- Browser --------------------------------------------------------------
  {
    id: 'browser', category: 'Browser', name: 'Browser and version',
    purpose: 'Changes on every browser update, so it is noisy unless matched loosely.',
    priority: 'Medium', weight: 10, phase: 1,
    always: true,
    config: { kind: 'choice', label: 'Match on', value: 'Family only', options: ['Exact version', 'Major version', 'Family only'] },
  },
  {
    id: 'user-agent', category: 'Browser', name: 'User agent',
    purpose: 'The full UA string. Trivially spoofed, and included for completeness.',
    priority: 'Low', weight: 10, phase: 1,
  },
  {
    id: 'plugins', category: 'Browser', name: 'Plugins and extensions',
    purpose: 'A distinctive set, and one the user changes without warning.',
    priority: 'Low', weight: 10, phase: 2,
  },
  {
    id: 'locale', category: 'Browser', name: 'Language and locale',
    purpose: 'Stable for most people, and a strong tell when it moves.',
    priority: 'Medium', weight: 5, phase: 1,
  },
  {
    id: 'canvas', category: 'Browser', name: 'Canvas fingerprint',
    purpose: 'A rendering signature derived from the GPU and font stack.',
    priority: 'Medium', weight: 10, phase: 1,
  },

  // --- Security -------------------------------------------------------------
  {
    id: 'root', category: 'Security', name: 'Root or jailbreak',
    purpose: 'A rooted device cannot be trusted to report anything else honestly.',
    priority: 'High', weight: 30, phase: 2, needsAgent: true,
    config: { kind: 'choice', label: 'When detected', value: 'Deny', options: ['Deny', 'Challenge', 'Flag only'] },
  },
  {
    id: 'vm', category: 'Security', name: 'Virtual machine or emulator',
    purpose: 'Detects a device that is not physical. Legitimate in engineering, suspicious elsewhere.',
    priority: 'High', weight: 30, phase: 1, needsAgent: true,
    config: { kind: 'choice', label: 'When detected', value: 'Challenge', options: ['Deny', 'Challenge', 'Flag only'] },
  },
  {
    id: 'secure-boot', category: 'Security', name: 'Secure Boot and certificates',
    purpose: 'Firmware integrity. Off is not proof of anything, but it is worth knowing.',
    priority: 'High', weight: 20, phase: 1, needsAgent: true,
  },
  {
    id: 'app-integrity', category: 'Security', name: 'Application integrity',
    purpose: 'Whether the client has been tampered with since it was installed.',
    priority: 'Medium', weight: 20, phase: 2, needsAgent: true,
  },

  // --- Network --------------------------------------------------------------
  {
    id: 'hostname', category: 'Network', name: 'Host name and user name',
    purpose: 'Set by the owner, so it is meaningful on managed estates and noise elsewhere.',
    priority: 'Low', weight: 5, phase: 2, needsAgent: true,
  },
  {
    id: 'ip', category: 'Network', name: 'IP address',
    purpose: 'Public and private. Changes constantly on mobile networks.',
    priority: 'Medium', weight: 10, phase: 1,
    always: true,
    config: { kind: 'choice', label: 'Match on', value: 'Subnet', options: ['Exact address', 'Subnet', 'Country only'] },
  },
  {
    id: 'isp', category: 'Network', name: 'ISP and carrier',
    purpose: 'Stable for a fixed line, and a good proxy for "somewhere else" on mobile.',
    priority: 'Medium', weight: 10, phase: 1,
  },
  {
    id: 'geo', category: 'Network', name: 'Geolocation',
    purpose: 'Country, region, city. The signal behind impossible-travel checks.',
    priority: 'High', weight: 10, phase: 1,
    config: { kind: 'choice', label: 'Match on', value: 'Country', options: ['City', 'Region', 'Country'] },
  },
  {
    id: 'vpn', category: 'Network', name: 'Proxy or VPN',
    purpose: 'A VPN hides every other network signal, which is why it is worth its own row.',
    priority: 'High', weight: 5, phase: 1,
    config: { kind: 'choice', label: 'When detected', value: 'Challenge', options: ['Deny', 'Challenge', 'Flag only'] },
  },
  {
    id: 'conn', category: 'Network', name: 'Connection type',
    purpose: 'Cellular, Wi-Fi or Ethernet. Changes as somebody walks out of the building.',
    priority: 'Medium', weight: 10, phase: 1,
  },
  {
    id: 'domain', category: 'Network', name: 'Domain membership',
    purpose: 'Whether the machine is joined to your directory. Binary, and decisive when true.',
    priority: 'High', weight: 20, phase: 1, needsAgent: true,
  },

  // --- Behaviour ------------------------------------------------------------
  {
    id: 'typing', category: 'Behaviour', name: 'Typing dynamics',
    purpose: 'Keystroke speed and intervals. Needs a baseline before it says anything.',
    priority: 'Low', weight: 5, phase: 2,
  },
  {
    id: 'mouse', category: 'Behaviour', name: 'Mouse and scroll patterns',
    purpose: 'Movement signatures. Same caveat: useless until there is history.',
    priority: 'Low', weight: 5, phase: 2,
  },
  {
    id: 'login-freq', category: 'Behaviour', name: 'Login frequency',
    purpose: 'How often this person signs in, and from where.',
    priority: 'High', weight: 10, phase: 2,
  },
  {
    id: 'session', category: 'Behaviour', name: 'Session duration and navigation',
    purpose: 'How long sessions run and where they go.',
    priority: 'Medium', weight: 5, phase: 2,
  },
  {
    id: 'time', category: 'Behaviour', name: 'Time of access',
    purpose: 'Sign-ins outside the usual window are the cheapest anomaly to detect.',
    priority: 'High', weight: 10, phase: 2,
    config: { kind: 'tolerance', label: 'Hours either side of normal', value: 3, min: 0, max: 12, unit: 'hours' },
  },
  {
    id: 'resource', category: 'Behaviour', name: 'Resource being accessed',
    purpose: 'Which app. A finance system at 3am is a different question from a wiki.',
    priority: 'High', weight: 10, phase: 2,
  },
  {
    id: 'role', category: 'Behaviour', name: 'Role and privileges',
    purpose: 'What the account can do if the sign-in is not who it claims to be.',
    priority: 'High', weight: 20, phase: 2,
  },
]

/* The filing scheme, PER CATALOGUE, and it has to be per catalogue.

   It was one list, which was correct while only one catalogue had categories.
   The requirements list files differently — an OS version is `Platform` there
   and `Hardware` in the risk list, because the two lists sort by different
   questions: one asks what the device must be, the other asks how hard a signal
   is to forge.

   One shared list would also have lied in a specific, visible way. The picker's
   filter counts `offered.filter(a => a.category === c.id)` and labels an empty
   category "needs an agent" — true for Security on an agentless risk profile,
   and nonsense for Behaviour on a requirements profile, which has no behaviour
   rows and never will. A category that does not apply to a catalogue should not
   be in that catalogue's filter at all. */
const OS_CATEGORIES: { id: AttrCategory; label: string; blurb: string }[] = [
  { id: 'Platform', label: 'Platform', blurb: 'What the device is, and what it runs. Arrives with the request.' },
  { id: 'Browser', label: 'Browser', blurb: 'A version floor per family. The cheapest patch-level control there is.' },
  { id: 'Security', label: 'Security', blurb: 'Whether the device is still the one the vendor shipped, and whether it locks.' },
  { id: 'Client', label: 'Client', blurb: 'The miniOrange app and agent, by version.' },
]

const DEVICE_CATEGORIES: { id: AttrCategory; label: string; blurb: string }[] = [
  { id: 'Hardware', label: 'Hardware', blurb: 'The machine itself. The strongest signals and the slowest to change.' },
  { id: 'Browser', label: 'Browser', blurb: 'What the browser reports. Easy to collect, easy to change.' },
  { id: 'Security', label: 'Security', blurb: 'Whether the device can be trusted to report the rest honestly.' },
  { id: 'Network', label: 'Network', blurb: 'Where the sign-in came from. Moves with the person.' },
  { id: 'Behaviour', label: 'Behaviour', blurb: 'Patterns over time. Needs history before it says anything.' },
]

export const categoriesFor = (mode: ProfileMode): { id: AttrCategory; label: string; blurb: string }[] =>
  mode === 'os' ? OS_CATEGORIES : DEVICE_CATEGORIES

/* Which catalogue a profile draws from. The two are disjoint in intent and
   overlap in one id — `device-type` is a sensible signal either way — so this
   is a function of the KIND rather than a merged list with a flag on each row.

   A `Record` rather than the ternary it replaced. `mode === 'risk' ? … : …` was
   else-shaped: a mode added without a catalogue, or an id typed wrong, silently
   returned the other list rather than failing. A total map cannot be
   incomplete, and adding a third kind without a catalogue is a compile error. */
export const CATALOGUE: Record<ProfileMode, Attribute[]> = {
  os: OS_ATTRIBUTES,
  device: DEVICE_ATTRIBUTES,
}

export const attributesFor = (mode: ProfileMode): Attribute[] => CATALOGUE[mode]

/* One attribute, resolved BY KIND — and it replaces `byId`.

   `byId` searched a merged list built as `[...OS, ...DEVICE.filter(not in OS)]`,
   which de-duplicated on `device-type` by keeping the OS copy. So every device
   profile that asked what `device-type` was got the OS catalogue's answer: a
   different purpose, a different category, and until a moment ago a different
   config entirely. Nothing noticed because nothing rendered a device row's
   configuration — and the whole point of this pass is that now something does.

   Nothing that calls this lacks a mode. That is the argument for the shape:
   an id alone was never enough to identify an attribute, and pretending it was
   is what let the wrong row through. */
export const attrOf = (mode: ProfileMode, id: string): Attribute | undefined =>
  CATALOGUE[mode].find((a) => a.id === id)

/* Both lists, WITH the duplicate, and only for the transcription receipt.

   `ATTRIBUTES` de-duplicated, which is exactly why the uniqueness assertion in
   the test passed while one of the two `device-type` rows was unreachable. The
   test now asserts uniqueness per catalogue, which is the property that
   actually matters, and this list is what the weight and naming checks sweep. */
export const ALL_ATTRIBUTES: Attribute[] = [...OS_ATTRIBUTES, ...DEVICE_ATTRIBUTES]

/* --- Profiles ---------------------------------------------------------------- */

/* --- The two kinds ------------------------------------------------------------

   `'match'` and `'risk'` before, which named the arithmetic. They are named
   after the question now, and the ids moved with the labels rather than being
   left behind — leaving `mode === 'risk'` to mean "device attributes" is how a
   codebase ends up with two vocabularies for one thing, which is precisely the
   state this file was in: the create dialog said "Attribute based" and every
   other surface said "Attribute match", for the same profile, on the same day.

   The tint is a FIELD here rather than the id interpolated into a class name.
   `.bfp2__modechip.is-${p.mode}` meant a mode rename had to be mirrored in the
   stylesheet, and a class that matches nothing renders an untinted chip — no
   error, no failing test, just a chip that quietly stops saying anything. The
   chip emits the tint, so this can never happen again. */
export type ProfileMode = 'os' | 'device'

export interface ModeMeta {
  id: ProfileMode
  label: string
  blurb: string
  /** The feedback ramp this kind wears, named for the ramp and not for itself. */
  tint: 'info' | 'accent'
}

export const MODES: ModeMeta[] = [
  {
    id: 'os',
    label: 'OS and version',
    blurb:
      'State what a device must be running — a form factor, and a version floor per platform. Everything it reads arrives with the request, so there is nothing to install.',
    tint: 'info',
  },
  {
    id: 'device',
    label: 'Device attributes',
    blurb:
      'Recognise the machine itself. Each attribute carries a weight, what changed since last time adds up to a score, and the score picks the outcome.',
    tint: 'accent',
  },
]

export const MODE_META: Record<ProfileMode, ModeMeta> = Object.fromEntries(
  MODES.map((m) => [m.id, m]),
) as Record<ProfileMode, ModeMeta>

/* The noun for a thing this kind holds. An OS profile's rows are CONDITIONS a
   device has to satisfy; a device profile's rows are SIGNALS it watches. Both
   were called "attributes", which is true of the catalogue and wrong about what
   the profile does with them. */
export const ITEM_NOUN: Record<ProfileMode, { one: string; many: string; verb: string }> = {
  os: { one: 'requirement', many: 'requirements', verb: 'requires' },
  device: { one: 'attribute', many: 'attributes', verb: 'watches' },
}

export const countLabel = (mode: ProfileMode, n: number) =>
  `${n} ${n === 1 ? ITEM_NOUN[mode].one : ITEM_NOUN[mode].many}`

/* The two ways a device can be identified, and the console's own split.

   Agentless is what a browser and the request itself give up. Agent-based adds
   everything only software running on the machine can read — the TPM, the disk,
   whether Secure Boot is on. Higher assurance, and it has a prerequisite an
   admin has to satisfy before any of it works.

   This is asked at CREATION now, and only of a device-attributes profile. It
   used to be the first row of a panel on the detail page, which put it after
   the attributes it governs: you chose eighteen signals and then discovered,
   on a different surface, that half of them never arrive. A question whose
   answer decides what the next question can even offer belongs before it.

   An OS-and-version profile is never asked, because for that catalogue there is
   nothing to decide — see `offeredAttributes`. It still carries the field, and
   carries `'agentless'`, because that is what the five OS attributes actually
   need: they arrive with the request. Nothing reads it on an OS profile. */
export type ProfileReach = 'agentless' | 'agent'

export interface ReachMeta {
  id: ProfileReach
  label: string
  blurb: string
  /* The console puts "Windows only" in a callout that appears AFTER agent-based
     has been chosen, which is one screen too late to be a decision input. A
     platform limit is a property of the choice, so it travels on the card. */
  note?: string
}

export const REACHES: ReachMeta[] = [
  {
    id: 'agentless',
    label: 'Agentless',
    blurb:
      'Browser, network and geolocation attributes establish device identity. Nothing to install.',
  },
  {
    id: 'agent',
    label: 'Agent-based',
    blurb:
      'An installed agent adds hardware identifiers — TPM, motherboard, disk — for high-assurance access.',
    note: 'Windows only. Users without the agent cannot sign in.',
  },
]

export const REACH_META: Record<ProfileReach, ReachMeta> = Object.fromEntries(
  REACHES.map((r) => [r.id, r]),
) as Record<ProfileReach, ReachMeta>

export const reachLabel = (r: ProfileReach) => REACH_META[r].label

/* What this kind, at this reach, may actually collect — and its complement.

   `reach` is nullable because the wizard has not asked yet on the step before
   it asks, and `null` reads as "no agent", which is the conservative half.

   The reason the OS kind never asks the question is here rather than in a
   comment: nothing in `OS_ATTRIBUTES` carries `needsAgent`, so
   `offeredAttributes('os', anything)` is all five. Asking would be asking a
   question with no consequence attached to either answer. */
export const offeredAttributes = (mode: ProfileMode, reach: ProfileReach | null): Attribute[] =>
  CATALOGUE[mode].filter((a) => !(a.needsAgent && reach !== 'agent'))

export const blockedAttributes = (mode: ProfileMode, reach: ProfileReach | null): Attribute[] =>
  CATALOGUE[mode].filter((a) => a.needsAgent && reach !== 'agent')

/* The signals a profile of this kind cannot switch off.

   Only the device kind has any. An OS-and-version profile is a set of
   conditions somebody states outright — there is no baseline to it, and a
   profile that required something nobody asked for would be a rule with a
   clause the author never wrote. */
export const alwaysOn = (mode: ProfileMode): Attribute[] => CATALOGUE[mode].filter((a) => a.always)

/** `enabled`, with the unswitchable ones present whether they were listed or not. */
export const withAlwaysOn = (mode: ProfileMode, enabled: string[]): string[] => {
  const base = alwaysOn(mode).map((a) => a.id)
  return [...base, ...enabled.filter((id) => !base.includes(id))]
}

/** Whether this kind of profile is ever asked the agent question. */
export const asksReach = (mode: ProfileMode) => blockedAttributes(mode, 'agentless').length > 0

/* How a device gets onto a person's list in the first place. The console's two,
   and they are a BRANCH rather than a menu: choosing a roster removes the
   device allowance entirely and replaces it with an upload. */
export type Registration = 'self' | 'pre-approved'

export const REGISTRATION_LABEL: Record<Registration, string> = {
  self: 'Users register their own devices',
  'pre-approved': 'Pre-approved devices only',
}

/* The same two answers in the two words a stated column has room for.

   The sentences above are what a dropdown needs — an option has to say what
   choosing it does. A fact in a 260px rail is a different job: "Users register
   their own devices" wraps to three ragged right-aligned lines there, which is
   a paragraph pretending to be a value. The sentence is not lost; it is on the
   tip beside the label, where this page already puts the thing you want once. */
export const REGISTRATION_SHORT: Record<Registration, string> = {
  self: 'Self-service',
  'pre-approved': 'Roster only',
}

/** An uploaded roster of approved devices. Keyed on MAC, so it needs an agent. */
export interface Roster {
  fileName: string
  rows: number
  uploadedAt: string
}


/** How many devices a new profile allows. The console ships 1, which denies
    anybody with a laptop and a desktop on the day it goes live. */
export const DEFAULT_MAX_DEVICES = 3

export interface FingerprintProfile {
  id: string
  name: string
  mode: ProfileMode
  /** Attribute ids that are switched on. */
  enabled: string[]
  /** Per-attribute overrides of the master's config default. */
  config: Record<string, AttrConfigValue>
  /** Risk mode: per-attribute weight overrides, as one of three tiers. */
  weights: Record<string, number>

  /* --- Device restriction ----------------------------------------------------
     Which signals this profile may draw on at all, and what happens the first
     time a device is seen. The attributes above decide whether this is the SAME
     device; these decide whether it is allowed to become a known one. */

  /** Decides whether half the master is even collectable. */
  reach: ProfileReach
  /** How a device gets onto a person's list. */
  registration: Registration
  /** How many one person may register. Null when a roster replaces the limit. */
  maxDevices: number | null
  /** Pre-approved only. */
  roster: Roster | null
  /** First sight of a device enrols it silently rather than challenging. */
  autoRegister: boolean
  /* Whether anybody has answered these questions yet.

     Not derivable from the values: every field above has a working default, so
     a profile nobody has opened is indistinguishable from one deliberately set
     to exactly those defaults. The difference matters because the section shows
     an empty state until it is true, and "agentless, self-service, 3 devices"
     presented as a configuration nobody chose is a claim the screen cannot
     support. */
  restrictionSet: boolean

  usedIn: number
}

/* --- Coherence, as functions rather than as care -------------------------------

   Four things the screen used to get right by remembering to. Each one is a
   state the model could previously express and nobody could see.
   -------------------------------------------------------------------------- */

/* Values for attributes the profile no longer enables.

   `enabled` and `config` were written by different hands: dropping a row wrote
   `enabled` and left `config['os-windows'] = { op: 'gte', value: '10' }` behind
   forever. Invisible — no surface renders a value for a row that is not there —
   and it came back the moment somebody re-ticked the attribute, restoring a
   setting nobody had re-approved and nobody had been shown.

   It mattered less when the only way to set a value was to open the profile and
   type it. The wizard writes values now, so a profile can be created, have a
   row removed, and be handed to somebody else still carrying it. */
export function pruneValues<P extends FingerprintProfile>(p: P): P {
  const live = new Set(p.enabled)
  const keep = <T,>(rec: Record<string, T>) =>
    Object.fromEntries(Object.entries(rec).filter(([id]) => live.has(id)))
  return { ...p, config: keep(p.config), weights: keep(p.weights) }
}

/* The one writer for reach, wherever it is written.

   It filters `enabled`, prunes what that orphans, and forces the registration
   branch agentless cannot support — a roster is matched on MAC address, and MAC
   is one of the eighteen things only an agent can read, so an agentless roster
   matches nothing at all.

   It lived inline in the restriction drawer as `setReach`, which is where the
   pruning was missing: switching to agentless dropped the attributes and kept
   their settings. */
export function withReach(p: FingerprintProfile, reach: ProfileReach): FingerprintProfile {
  const offered = offeredAttributes(p.mode, reach)
  return pruneValues({
    ...p,
    reach,
    enabled: p.enabled.filter((id) => offered.some((a) => a.id === id)),
    registration: reach === 'agentless' ? 'self' : p.registration,
    maxDevices: reach === 'agentless' ? (p.maxDevices ?? DEFAULT_MAX_DEVICES) : p.maxDevices,
    roster: reach === 'agentless' ? null : p.roster,
  })
}

/* A stored value as the string a row prints.

   The overview states every configured value, and it states them as text rather
   than as the control that set them — a page describing a profile should not be
   a second copy of the editor. One function so the pill and the control cannot
   disagree about what is stored, and it falls back to the master's own default
   for exactly the reason `AttrControl` does: an untouched attribute IS at its
   default, and printing nothing would say it was unset. */
export function valueLabel(a: Attribute, v: AttrConfigValue | undefined): string {
  const c = a.config
  if (!c) return ''
  if (c.kind === 'tolerance') return `${typeof v === 'number' ? v : c.value} ${c.unit}`
  if (c.kind === 'choice') return typeof v === 'string' ? v : c.value
  if (c.kind === 'list') return `${c.values.length} entries`
  const r = isRuleValue(v) ? v : c.value
  /* The symbol, not the id — `≥ 10`, which is how the row draws it. A `rule`
     stores its operator as the word already, so it prints itself. */
  return c.kind === 'version' ? `${versionOp(r.op).symbol} ${r.value}` : `${r.op} ${r.value}`
}

/* Which platforms an OS profile actually names.

   The sharpest thing the overview says, and the screen could not say it before.
   An OS profile holding only `device-type` checks no platform at all — a Mac
   signing in passes every condition on it — and the old subtitle printed that
   state as "Attribute match · 1 attribute", which reads like a configured
   profile. */
/* `category === 'Platform'`, not "every version attribute".

   It was the latter, and that was the same statement while the only version
   rows were the four operating systems. There are ten now — four browsers and
   two miniOrange clients joined them — and a subtitle reading "Windows, Chrome,
   miniOrange Authenticator" would be calling three different kinds of thing a
   platform. The sentence this feeds is about which operating systems a profile
   pins; the other floors are counted with everything else. */
export const platformsNamed = (p: FingerprintProfile): string[] =>
  CATALOGUE[p.mode]
    .filter((a) => a.category === 'Platform' && a.config?.kind === 'version' && p.enabled.includes(a.id))
    .map((a) => (a.config as { platform: string }).platform)

/* A roster keyed on an address the profile never reads.

   The roster is matched on MAC. `fp-kiosk` shipped holding a roster of 24
   machines and watching only `device-type`, so the roster matched nothing and
   the screen said so nowhere. */
/* Structural, not the whole profile, and for the same reason `enforces` in
   data.ts takes `{ status }`: this reads exactly two fields, and the enrolment
   form that asks the question holds those two before a profile exists to put
   them on. Demanding the full record there would mean building a fake one. */
export const rosterNeedsMac = (p: Pick<FingerprintProfile, 'registration' | 'enabled'>): boolean =>
  p.registration === 'pre-approved' && !p.enabled.includes('mac')

/* The page's one-line description of a whole profile.

   Joined with ` · ` and never with "and": a list of facets is not a conjunction,
   and the moment it reads as one somebody starts asking whether they all have to
   be true.

   The enrolment facet appears only once somebody has answered it, which is the
   same claim `restrictionSet` exists to refuse — printed as one clause here
   instead of as three rows. */
export function describeProfile(p: FingerprintProfile): string {
  const parts = [modeLabel(p)]
  if (asksReach(p.mode)) parts.push(reachLabel(p.reach))
  parts.push(countLabel(p.mode, p.enabled.length))
  if (p.restrictionSet) parts.push(REGISTRATION_LABEL[p.registration])
  return parts.join(' · ')
}

/* The steps a profile takes to create, and what each is called.

   Words, not numerals. Three is few enough to name every step rather than count
   them, which is the difference between a progress bar and a table of contents
   — and the last one is named after what that kind actually holds, so the
   ladder says "Requirements" on one and "Attributes" on the other.

   The DEVICES step is the device kind's alone, and this is the second time
   that boundary has moved, so it is worth writing down where it settled.

   That step holds two questions: what the collector can read, and how machines
   enrol. The first is the device kind's by construction — nothing in the OS
   catalogue carries `needsAgent`, so the question has no consequence there. The
   second applies to both, which is why it was briefly asked of both, giving the
   OS kind a middle step of three rows and a caveat explaining why one of them
   was unavailable. That is a step that exists to be short: it interrupts a
   two-question flow to ask something with no dependency on either side of it.

   So enrolment is asked HERE only where it has a neighbour to depend on — a
   roster needs MAC, MAC needs an agent — and an OS profile answers it from the
   detail page's one Edit instead. `restrictionSet` records the difference
   honestly: false on a new OS profile, because nobody asked. */
export const stepsFor = (mode: ProfileMode): string[] =>
  asksReach(mode)
    ? ['Profile', 'Devices', 'Attributes']
    : ['Profile', ITEM_NOUN[mode].many.replace(/^./, (c) => c.toUpperCase())]

/* --- The three weights a risk profile can give an attribute ---------------------
   The master carries four (5, 10, 20, 30) because the sheet does. A profile
   picks from three, because a person setting thirty-eight of these is choosing
   how much something matters, and "how much" has never usefully had four
   answers — the fourth is the one that makes the other three ambiguous.

   The master weight still seeds it: an attribute the sheet scores at 5 or 10
   arrives as Low, 20 as Medium, 30 as High, so the defaults are the sheet's
   even though the vocabulary is not. */
export const TIER_WEIGHT: Record<Priority, number> = { High: 30, Medium: 20, Low: 10 }

export const tierOf = (weight: number): Priority =>
  weight >= 30 ? 'High' : weight >= 20 ? 'Medium' : 'Low'

/* A profile's kind, in the words a picker row has space for.

   Typed on `ProfileMode`, not on an inline union. The old signature spelled the
   two ids out again — `{ mode: 'match' | 'risk' }` — so the ids and the thing
   that labels them could drift apart without TypeScript noticing, which is one
   of the two ways two vocabularies got in here.

   The other way was that this function and the create dialog's `MODES` held
   DIFFERENT strings for the same kind. There is one list now and this reads
   from it. */
export const modeLabel = (p: { mode: ProfileMode }) => MODE_META[p.mode].label

/* `byId` stood here. See `attrOf` above: an id alone never identified an
   attribute, because `device-type` is in both catalogues and the merged list
   this searched always answered with the OS copy. */

/* The score a profile would produce if `changed` attributes came back
   different. Weights are the profile's overrides falling back to the master,
   and the total is capped at 100 because the bands are expressed on that
   scale — an uncapped total makes "71 and above" meaningless. */
export function scoreOf(p: FingerprintProfile, changed: string[]): number {
  const live = changed.filter((id) => p.enabled.includes(id))
  /* `attrOf(p.mode, …)`, not a merged lookup. Scoring is a device-attributes
     thing and the weight it must use is the device catalogue's — `device-type`
     weighs 5 in both, but the next id to appear in both need not. */
  const raw = live.reduce((sum, id) => sum + (p.weights[id] ?? attrOf(p.mode, id)?.weight ?? 0), 0)
  return Math.min(100, raw)
}

/* `bandOf`, `ceilingOf` and `unreachableBands` lived here and went with the
   thresholds they read. The profile page no longer offers an Allow-below /
   Challenge-below pair to set, so there is nothing left for them to check, and
   a reachability warning about numbers nobody can edit is a warning with no
   action attached to it.

   `scoreOf` above stays. It is what a risk profile computes, and the
   per-attribute tiers are only meaningful because something adds them up. */
export const seedProfiles: FingerprintProfile[] = [
  {
    id: 'fp-corp',
    name: 'Corporate managed',
    mode: 'os',
    /* A managed Windows fleet: the form factor it should be, and a floor
       under the build. */
    enabled: ['device-type', 'os-windows'],
    config: {
      'device-type': 'Laptop',
      'os-windows': { op: 'gte', value: '10' },
    },
    weights: {},
    /* Agentless, and the comment here used to say the opposite — "every signal
       it names is one only an agent can read" — about a profile naming a form
       factor and a Windows build, neither of which needs one. An OS profile is
       always agentless; that is why it is never asked. */
    reach: 'agentless',
    registration: 'self',
    maxDevices: 3,
    roster: null,
    autoRegister: false,
    restrictionSet: true,
    usedIn: 3,
  },
  {
    id: 'fp-byod',
    name: 'BYOD phones and tablets',
    /* This was `mode: 'risk'` holding `os-android` and `os-ios`, and neither id
       exists in the device catalogue. It was not a risk profile that had drifted
       — it was an OS profile filed under the wrong kind since the two lists
       split: all three of its attributes and both of its version comparisons
       live only in `OS_ATTRIBUTES`. The picker counted "3 of 38 selected" with
       one row ticked, and "Clear all" deleted two entries nothing had drawn.

       Converting it preserves every stored value, which is the tell that this
       is a correction rather than a change. The name goes with it: it never
       scored anything. */
    mode: 'os',
    enabled: ['device-type', 'os-android', 'os-ios'],
    config: {
      'device-type': 'Mobile',
      'os-android': { op: 'gte', value: '13' },
      'os-ios': { op: 'gte', value: '17' },
    },
    weights: {},
    reach: 'agentless',
    registration: 'self',
    maxDevices: 5,
    roster: null,
    autoRegister: true,
    restrictionSet: true,
    usedIn: 5,
  },
  {
    id: 'fp-kiosk',
    name: 'Shared kiosk',
    /* Also re-filed, and for a harder reason than `fp-byod`.

       It is a roster profile — 24 named machines, nobody else — and a roster is
       matched on MAC address. It watched `device-type` and nothing else, so the
       roster matched nothing: the one setting the whole profile exists for was
       inert, and no surface said so. A roster needs MAC, MAC needs an agent, and
       an agent-based profile that recognises specific machines is a device
       profile. `rosterNeedsMac` now names that state wherever it occurs. */
    mode: 'device',
    /* The four always-collected signals lead, because they are what every
       device profile starts from — the roster's MAC and the machine SID are
       what this one adds. */
    enabled: ['device-type', 'os', 'browser', 'ip', 'mac', 'machine-sid'],
    config: {},
    weights: {},
    reach: 'agent',
    registration: 'pre-approved',
    maxDevices: null,
    roster: { fileName: 'kiosks-floor-3.csv', rows: 24, uploadedAt: '12 Aug 2026' },
    autoRegister: false,
    restrictionSet: true,
    usedIn: 1,
  },
  {
    id: 'fp-unmanaged',
    name: 'Unmanaged access',
    /* The store held no agentless device profile, so the answer that gates half
       the catalogue was never demonstrated by anything an admin could open — and
       neither was a device row carrying both a weight and a precision setting.
       This is that profile: the four every request carries, plus four more a
       browser gives up for free — and four of the eight tuned.

       `restrictionSet: false` on purpose. The enrolment empty state is a real
       state of the product and this is the only way to reach it without creating
       something. */
    mode: 'device',
    enabled: ['device-type', 'os', 'browser', 'ip', 'geo', 'canvas', 'locale', 'vpn'],
    config: {
      browser: 'Family only',
      ip: 'Subnet',
      geo: 'Country',
      vpn: 'Challenge',
    },
    weights: {},
    reach: 'agentless',
    registration: 'self',
    maxDevices: DEFAULT_MAX_DEVICES,
    roster: null,
    autoRegister: false,
    restrictionSet: false,
    usedIn: 0,
  },
  /* --- The profiles the rules used to spell out inline -----------------------

     Five, and every one of them exists because a condition that used to say the
     thing directly no longer can. `os is Windows`, `mdm is Enrolled`, `mac is
     00:1B:44:…` and `posture passes Disk encryption` are gone from the
     condition catalogue; a rule reaches the device through a profile now, so
     the profiles have to be able to say what those rules said.

     THREE OF THEM CANNOT, AND THIS IS THE HONEST PLACE TO SAY SO.

     There is no MDM attribute in either catalogue. There is no disk-encryption,
     screen-lock, antivirus or firewall attribute — the Security category is
     `root`, `vm`, `secure-boot` and `app-integrity`, which are integrity
     signals rather than posture checks. And `browser` is a match-PRECISION
     choice ("Exact version" / "Major version" / "Family only"), not a browser
     allowlist. So:

       · `fp-managed` uses `domain` — directory-joined — as a stand-in for MDM
         enrolment. Those are not the same fact. A domain-joined laptop with no
         MDM agent satisfies this profile and did not satisfy the condition it
         replaces. The name says "MDM-managed" because that is what the rules
         using it mean; the attribute list is the closest this model can get.
       · Posture checks have no stand-in at all. `fp-patched` carries the one
         posture check with a real home — "OS up to date" is an OS floor, which
         is exactly what an OS profile is — and disk encryption and screen lock
         are simply dropped from the rules that named them.
       · Browser allowlists are dropped.

     Recorded rather than smoothed over, because a profile whose name promises
     more than its attributes deliver is the failure mode this consolidation was
     supposed to remove, and here it is reintroduced in one place under its own
     name. Adding `mdm` and a posture group to `DEVICE_ATTRIBUTES` is the fix;
     it is a separate change with its own catalogue argument.

     `usedIn: 0` on all five. They are referenced by seeded policies the moment
     this lands, so the number is wrong the way every other `usedIn` in this
     file is wrong — stated, not derived. The Device profiles screen counts the
     truth. */
  {
    id: 'fp-managed',
    name: 'MDM-managed corporate device',
    mode: 'device',
    /* The four always-collected, plus the two that come closest to "this
       machine is under management": directory membership and a verified boot
       chain. */
    enabled: ['device-type', 'os', 'browser', 'ip', 'domain', 'secure-boot'],
    config: {},
    weights: {},
    reach: 'agent',
    registration: 'self',
    maxDevices: 3,
    roster: null,
    autoRegister: false,
    restrictionSet: true,
    usedIn: 0,
  },
  {
    id: 'fp-apple',
    name: 'Managed Apple · iOS 17, macOS 14',
    mode: 'os',
    enabled: ['os-ios', 'os-macos'],
    config: {
      'os-ios': { op: 'gte', value: '17' },
      'os-macos': { op: 'gte', value: '14' },
    },
    weights: {},
    reach: 'agentless',
    registration: 'self',
    maxDevices: 3,
    roster: null,
    autoRegister: false,
    restrictionSet: true,
    usedIn: 0,
  },
  {
    id: 'fp-win-android',
    name: 'Managed Android and Windows',
    mode: 'os',
    enabled: ['os-android', 'os-windows'],
    config: {
      'os-android': { op: 'gte', value: '13' },
      'os-windows': { op: 'gte', value: '10' },
    },
    weights: {},
    reach: 'agentless',
    registration: 'self',
    maxDevices: 3,
    roster: null,
    autoRegister: false,
    restrictionSet: true,
    usedIn: 0,
  },
  /* The three MAC addresses that used to sit in the trading-floor rule are
     three rows of a roster now. Worth knowing what that costs: they were
     readable in the rule and they are not readable anywhere in this prototype —
     no surface renders a roster's contents. `mac` is enabled so
     `rosterNeedsMac` is satisfied; a roster profile that does not read MAC is
     the exact inert state that function exists to name. */
  {
    id: 'fp-floor',
    name: 'Trading floor terminals',
    mode: 'device',
    enabled: ['device-type', 'os', 'browser', 'ip', 'mac'],
    config: {},
    weights: {},
    reach: 'agent',
    registration: 'pre-approved',
    maxDevices: null,
    roster: { fileName: 'floor-terminals.csv', rows: 3, uploadedAt: '12 Aug 2026' },
    autoRegister: false,
    restrictionSet: true,
    usedIn: 0,
  },
  /* Every platform named, each with a floor. An OS profile checks the platforms
     it names and leaves the rest alone, so naming all four is "whatever you are
     on, be current" — which is what "OS up to date" meant. */
  {
    id: 'fp-patched',
    name: 'Current OS builds',
    mode: 'os',
    enabled: ['os-windows', 'os-macos', 'os-ios', 'os-android'],
    config: {
      'os-windows': { op: 'gte', value: '11' },
      'os-macos': { op: 'gte', value: '15' },
      'os-ios': { op: 'gte', value: '18' },
      'os-android': { op: 'gte', value: '14' },
    },
    weights: {},
    reach: 'agentless',
    registration: 'self',
    maxDevices: 3,
    roster: null,
    autoRegister: false,
    restrictionSet: true,
    usedIn: 0,
  },

  /* --- The profiles the new requirements exist for --------------------------

     Five, and they are deliberately NARROW. Each one names as few requirements
     as it can and still be worth referencing, because a rule composes profiles
     — `matches A and matches B` — and the alternative is a handful of fat
     profiles that overlap, so that changing an OS floor for one policy silently
     moves it for four others. `fp-compliant` is the exception and says so.

     The floor VALUES are one release behind current, on purpose. A demo estate
     where every device passes every requirement demonstrates nothing: the point
     of an adaptive policy is the population that sits between "fine" and
     "refused", and these floors are set so that population exists. */

  {
    id: 'fp-os-floor',
    name: 'Minimum supported OS',
    /* The FLOOR, as distinct from `fp-patched`, which is the current builds.
       Two profiles rather than one because the interesting population is
       between them: a device that satisfies this and fails that is behind but
       supported, which is the only state a "warn" outcome has anything to say
       about. With one profile a policy can only sort devices into two piles,
       and the whole argument for the third outcome is that two is not enough. */
    mode: 'os',
    enabled: ['os-windows', 'os-macos', 'os-ios', 'os-android'],
    config: {
      'os-windows': { op: 'gte', value: '10' },
      'os-macos': { op: 'gte', value: '13' },
      'os-ios': { op: 'gte', value: '16' },
      'os-android': { op: 'gte', value: '12' },
    },
    weights: {},
    reach: 'agentless',
    registration: 'self',
    maxDevices: DEFAULT_MAX_DEVICES,
    roster: null,
    autoRegister: false,
    restrictionSet: true,
    usedIn: 0,
  },

  {
    id: 'fp-mobile',
    name: 'Any phone or tablet',
    /* One requirement and no floor of any kind, which makes it look pointless
       until you need to say "on a handset" in a rule.

       A screen-lock policy is the case. "Does not match `fp-mobile-locked`" is
       true of every laptop in the tenant, because a laptop is not a locked
       handset — so a rule written with that condition alone denies the entire
       desktop estate. Pairing it with this profile is what narrows the
       statement to the population it was written about. A profile that names a
       form factor and nothing else is the honest way to say "when this is a
       phone". */
    mode: 'os',
    enabled: ['device-type'],
    config: { 'device-type': 'Mobile' },
    weights: {},
    reach: 'agentless',
    registration: 'self',
    maxDevices: DEFAULT_MAX_DEVICES,
    roster: null,
    autoRegister: false,
    restrictionSet: true,
    usedIn: 0,
  },

  {
    id: 'fp-integrity',
    name: 'Untampered device',
    /* One requirement, and the narrowest profile here. It is separate from
       every other posture check because it is the one that decides whether the
       others can be believed: a rooted handset reports a screen lock it does
       not have. A rule that wants both states both, in that order, and the
       order is visible on the card. */
    mode: 'os',
    enabled: ['integrity'],
    config: { integrity: 'Not rooted, jailbroken or tampered' },
    weights: {},
    reach: 'agentless',
    registration: 'self',
    maxDevices: DEFAULT_MAX_DEVICES,
    roster: null,
    autoRegister: false,
    restrictionSet: true,
    usedIn: 0,
  },

  {
    id: 'fp-mobile-locked',
    name: 'Phones and tablets with a screen lock',
    /* The form factor is part of the requirement rather than incidental to it.
       "A screen lock is set" is a condition a laptop answers differently and
       mostly trivially; the case this exists for is the handset somebody
       carries, and pinning the device type is what stops the profile reading as
       a claim about the whole estate. */
    mode: 'os',
    enabled: ['device-type', 'screen-lock'],
    config: { 'device-type': 'Mobile', 'screen-lock': 'PIN, passcode or password' },
    weights: {},
    reach: 'agentless',
    registration: 'self',
    maxDevices: DEFAULT_MAX_DEVICES,
    roster: null,
    autoRegister: false,
    restrictionSet: true,
    usedIn: 0,
  },

  {
    id: 'fp-client-current',
    name: 'Current miniOrange client',
    /* Both products, one profile, and this is the one place the two-row split
       in the catalogue pays visibly: the app floor and the agent floor are
       different numbers, and a tenant that pinned "6.4" across both would be
       pinning a version the agent has never had. */
    mode: 'os',
    enabled: ['mo-authenticator', 'mo-agent'],
    config: {
      'mo-authenticator': { op: 'gte', value: '6.4' },
      'mo-agent': { op: 'gte', value: '4.2' },
    },
    weights: {},
    reach: 'agentless',
    registration: 'self',
    maxDevices: DEFAULT_MAX_DEVICES,
    roster: null,
    autoRegister: false,
    restrictionSet: true,
    usedIn: 0,
  },

  {
    id: 'fp-browser-current',
    name: 'Supported browser versions',
    /* Four floors, one per family, and a family this profile says nothing about
       is unconstrained — which is the property that makes a browser floor safe
       to apply broadly. This is not "Chrome only"; it is "not the Chrome from
       eighteen months ago", which is the control a tenant actually wants and
       the one the cut condition could never express. */
    mode: 'os',
    enabled: ['browser-chrome', 'browser-edge', 'browser-firefox', 'browser-safari'],
    config: {
      'browser-chrome': { op: 'gte', value: '126' },
      'browser-edge': { op: 'gte', value: '126' },
      'browser-firefox': { op: 'gte', value: '128' },
      'browser-safari': { op: 'gte', value: '17' },
    },
    weights: {},
    reach: 'agentless',
    registration: 'self',
    maxDevices: DEFAULT_MAX_DEVICES,
    roster: null,
    autoRegister: false,
    restrictionSet: true,
    usedIn: 0,
  },

  {
    id: 'fp-compliant',
    name: 'Fully compliant device',
    /* The fat one, and the exception to the rule above it.

       It exists because "device compliance" is a thing tenants ask for as one
       word — OS current, not tampered, locked, running a client that can be
       trusted — and a rule that spelled all four out would carry four
       conditions saying one thing. Referencing this says the one thing.

       The cost is real and is the cost of every composite: raising the Android
       floor here moves it for every policy pointing at this profile, and a
       policy that wanted three of the four legs cannot use it. Those policies
       compose the narrow profiles above instead, which is why both shapes
       exist. */
    mode: 'os',
    enabled: ['os-windows', 'os-macos', 'os-ios', 'os-android', 'integrity', 'screen-lock', 'mo-authenticator'],
    config: {
      'os-windows': { op: 'gte', value: '11' },
      'os-macos': { op: 'gte', value: '15' },
      'os-ios': { op: 'gte', value: '18' },
      'os-android': { op: 'gte', value: '14' },
      integrity: 'Not rooted, jailbroken or tampered',
      'screen-lock': 'A screen lock is set',
      'mo-authenticator': { op: 'gte', value: '6.4' },
    },
    weights: {},
    reach: 'agentless',
    registration: 'self',
    maxDevices: DEFAULT_MAX_DEVICES,
    roster: null,
    autoRegister: false,
    restrictionSet: true,
    usedIn: 0,
  },
]