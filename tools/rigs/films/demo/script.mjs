/* -----------------------------------------------------------------------------
   The demo film — every spoken line, and the caption that stands under it.

   The manager's flow, in five chapters: make a zone, make a device profile,
   build a policy out of both, look at policies that go further, and finish on
   the authentication methods every one of those rules leans on. Nothing the
   product does not do is shown or claimed.

   SPELLING FOR THE VOICE, not for the eye. `say` is what the synthesiser
   reads; `cap` is what the viewer sees. They differ wherever the reader would
   get it wrong:
     Xecurify     → "Zecurify"      (the owner's call: X as a Z)
     IP / VPN     → "I.P." "V.P.N."  (Azure's neural voices letter these out
                                      reliably only with the stops)
     25 km        → "twenty five kilometres"
     Windows 11   → "Windows eleven"
     OS           → spoken as "operating system"
     MFA          → never said; "a second factor" is the English for it
   Numbers are written as words for the same reason.

   ON LENGTH. This was cut to five minutes and then let back out — the owner:
   "no need to cut anything, if it needs to and goes nine minutes let it be."
   What came back is EXPLANATION, not padding: why a zone is worth naming, what
   a version floor means, what first-match-wins costs you if you get the order
   wrong. What stayed out is commentary about the film itself. A demo earns its
   length by answering the question the viewer is already forming.

   EVERY CLAIM IS CHECKED against the console as it stands. The first draft of
   this script had the device profile asking for disk encryption and a platform
   picker; the product asks for neither. Write from the probe, not from memory.
   -------------------------------------------------------------------------- */

/** id → { say, cap }. `cap` omitted means the line plays with no caption. */
export const SCRIPT = {
  /* --- Opening ------------------------------------------------------------ */
  t1: { say: 'This is the Zecurify policy engine — the part of the console that decides what happens when somebody signs in.' },
  t2: { say: 'Over the next few minutes we will build the two pieces a policy is made from, put them together into a working policy, look at a few that go further, and finish on the factors they all lean on.' },

  /* --- Chapter 1 · Zones --------------------------------------------------- */
  z0: { say: 'First, zones. A zone is a named place.' },
  z1: {
    say: 'Rather than writing a network range into every policy that needs it, you describe the place once — an office network, a country, a city — give it a name, and point at that name from anywhere.',
    cap: 'Describe a place once — use it everywhere',
  },
  z2: {
    say: 'Change the address later, and every policy pointing at that zone follows, without any of them being edited.',
    cap: 'Change it once; every policy follows',
  },
  z3: {
    say: 'Here is the library as it stands — office networks, whole countries, a private range. We will add one for the Pune office.',
    cap: 'Policies · <b>Zones</b>',
  },
  z4: {
    say: 'A zone is two things: the networks it covers, and the places it covers. Either one is enough on its own, and a zone can have both.',
    cap: 'Networks, places, or both',
  },
  z5: {
    say: 'A location can be a country, a state, or a city — and a city can carry a radius around it, for the offices and homes that sit just outside the city line.',
    cap: 'Country · state · city',
  },
  z6: {
    say: 'Twenty five kilometres around Pune. Miles, if you would rather — the unit sits beside the number.',
    cap: 'A city, and the ground around it',
  },
  z7: {
    say: 'One thing worth being clear about: matching is on the I.P. address the sign-in arrives from. A V.P.N. shows up wherever it comes out, not where the person is sitting.',
    cap: 'Matched on the <b>IP address</b> the sign-in arrives from',
  },
  z8: {
    say: 'Saved. From here on, any policy can refer to this place by name.',
    cap: 'One zone — ready to use by name',
  },

  /* --- Chapter 2 · Device profiles ---------------------------------------- */
  d0: { say: 'Second, device profiles. The same idea, a different question: not where the sign-in is from, but what the machine has to be.' },
  d1: {
    say: 'A device profile is a checklist. The operating system and how recent it is, the browser, whether a screen lock is set, and whether the device has been rooted, jailbroken or otherwise tampered with.',
    cap: 'A checklist a machine has to pass',
  },
  d2: {
    say: 'We will build the one most tenants start with — a company laptop that is patched, locked and intact.',
    cap: 'Policies · <b>Device profiles</b>',
  },
  d3: {
    say: 'First, what kind of profile this is. Device health checks the machine itself. Trusted device asks a different question — whether we have seen this machine before.',
    cap: 'Two kinds: <b>device health</b> · <b>trusted device</b>',
  },
  d4: {
    say: 'Then the checks. Every version here is a floor rather than an exact match — that version or anything newer passes, so the profile does not need editing every patch Tuesday.',
    cap: 'A floor, not a match: <b>that version or newer</b>',
  },
  d5: {
    say: 'Windows eleven or newer. A screen lock set. And the device not rooted or tampered with. Three checks, and a machine has to pass all of them.',
    cap: 'Patched · locked · untampered',
  },
  d6: {
    say: 'The last step reads the whole profile back before anything is stored. Nothing is guessed at, and nothing is saved until this is right.',
    cap: 'Read it back before it is saved',
  },
  d7: {
    say: 'That is the second piece. Two named things now — a place, and a standard for a machine.',
    cap: 'Two pieces, ready to use',
  },

  /* --- Chapter 3 · The policy builder ------------------------------------- */
  p0: { say: 'Now the policy itself, built out of both.' },
  p1: {
    say: 'A policy is a list of rules, read from the top. The first rule that matches decides, and nothing below it runs. That one sentence is most of what there is to learn here — and it means the order of your rules is part of what they mean.',
    cap: 'Read top to bottom · <b>first match decides</b>',
  },
  p2: {
    say: 'A new policy opens straight away, as a draft. Nothing is asked of you up front — you name it when you have something worth naming.',
    cap: 'Opens as a draft — name it when you like',
  },
  p3: {
    say: 'Every rule is one sentence in three parts. Who it applies to. What has to be true. And what happens.',
    cap: '<b>Who</b> · <b>If</b> · <b>Then</b>',
  },
  p4: {
    say: 'Leave the who alone and the rule covers everybody the policy covers. The first condition: the device has to match the profile we just built.',
    cap: 'If: the device matches <b>Company laptops</b>',
  },
  p5: {
    say: 'And the second: the sign-in has to be inside the Pune office zone. Both of the pieces we made, used by name.',
    cap: 'And: the sign-in is in <b>Pune office</b>',
  },
  p6: {
    say: 'A patched company laptop on the office network is the safest sign-in this tenant has. It gets in on a password.',
    cap: 'Then: <b>allow</b>, with a password',
  },
  p7: {
    say: 'Everything that is not both of those things has to prove more. A second rule, below the first, catching whatever fell through.',
    cap: 'A second rule catches what fell through',
  },
  p8: {
    say: 'Anyone else is allowed in, but only after a second factor. The order is doing the work: the strict case is answered first, and this rule is simply what is left.',
    cap: 'Then: allow, <b>after a second factor</b>',
  },
  p9: {
    say: 'At the foot of every policy is the default. It is what happens when no rule above it matched, it cannot be deleted, and it is the reason a policy can never quietly fall through to nothing.',
    cap: 'The default — when nothing matched',
  },
  p10: {
    say: 'Save, and the draft becomes a policy. It starts deciding sign-ins the moment it is switched on.',
    cap: 'Saved',
  },

  /* --- Chapter 4 · Policies in practice ----------------------------------- */
  x0: { say: 'Two rules is a real policy. It is also about the smallest one worth writing, so here are a few that go further.' },
  x1: {
    say: 'This one grades the device rather than judging it once. A current, healthy machine goes straight in. One that is behind but still supported is let in after a second factor.',
    cap: 'A ladder, not a gate',
  },
  x2: {
    say: 'And anything rooted, jailbroken or out of support is refused, with a message that tells the person why.',
    cap: 'Refused — and told why',
  },
  x3: {
    say: 'This one raises the bar as risk rises, reading the signals the tenant has switched on. The same three parts in every rule: who, if, then. The ladder gets longer; the sentence never changes.',
    cap: 'Risk-tiered — the same three parts, every rule',
  },
  x4: {
    say: 'Whatever a policy ends up looking like, it is made of the same pieces — the zones and profiles you named once, arranged in the order you want them read.',
    cap: 'Every policy, the same pieces',
  },

  /* --- Chapter 5 · Authentication methods ---------------------------------
     Last, because every rule above ended in one: the rules kept saying "after a
     second factor", and this is the catalogue that sentence draws from. After
     the policies, not before, so the question is already in the viewer's head
     when the answer arrives. */
  m0: { say: 'Every rule you have just seen ended the same way — allow, after a second factor. This is where those factors come from.' },
  m1: {
    say: 'The authentication methods tab is the tenant’s catalogue. Each row is a family of methods, and the switch says whether this tenant offers that family at all.',
    cap: 'Policies · <b>Authentication methods</b>',
  },
  m2: {
    say: 'A family holding several methods says how many of them are on, right there on the row — so you can read the whole catalogue without opening anything.',
    cap: 'How many are on, on the row itself',
  },
  m3: {
    say: 'Open one, and each method inside has a switch of its own, with whatever it needs to be set up sitting on the method it belongs to.',
    cap: 'One switch per method',
  },
  m4: {
    say: 'One method is marked the default — the one a person is offered first, before they choose anything else.',
    cap: 'A default, for the first thing offered',
  },
  m5: {
    say: 'And turning a method off here turns it off everywhere: no policy can ask for a factor this tenant does not offer. The catalogue is the floor the policies are written on top of.',
    cap: 'Off here means off everywhere',
  },

  /* --- Close --------------------------------------------------------------- */
  c1: { say: 'Describe the pieces once — a place, a standard for a machine, the factors you accept. Use them everywhere, and read the rules from the top.' },
  c2: { say: 'That is the Zecurify policy engine.' },
}

/** The voice, as `ensureVO` wants it. A touch under default speed: this is
    explanation, and the product's own words need room. */
export const VOICE = { name: 'en-IN-NeerjaNeural', rate: '-4%', pitch: '+0Hz' }

/** id → text, for vo.py. */
export const LINES = Object.fromEntries(Object.entries(SCRIPT).map(([id, v]) => [id, v.say]))
