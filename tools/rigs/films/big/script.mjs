/* -----------------------------------------------------------------------------
   The big film, second cut — the script.

   Short, to the point, premium. Six drawn scenes carry the ideas (intro, zone,
   device, outcome, order, close); the console is covered in full but FAST —
   labelled push-ins, one line of narration per tour, no explaining templates.
   The band shows every line verbatim.

   Voice spellings: Zecurify, I.P., Windows eleven / ten. `readable` undoes them.
   -------------------------------------------------------------------------- */

export const readable = (s) =>
  s
    .replace(/Zecurify/g, 'Xecurify')
    .replace(/\bI\.P\./g, 'IP')
    .replace(/Windows eleven/g, 'Windows 11')
    .replace(/Windows ten/g, 'Windows 10')

/** id → { say, sub? } */
export const SCRIPT = {
  /* ===== intro (drawn, 15 s) ===== */
  i1: { say: 'For years, a sign-in asked one question.' },
  i2: { say: 'Password.' },
  i3: { say: 'And every one of them got the same answer.' },
  i4: { say: 'A password knows who typed it. Not where. Not on what.' },
  i5: { say: 'So we ask three.' },
  i6: { say: 'Zecurify policy engine.' },

  /* ===== zone (drawn) ===== */
  z1: { say: 'Every sign-in arrives with an I.P. address.' },
  z2: { say: 'A zone is a named place: a country, a state, a city with a radius.' },
  z3: { say: 'Or an office network. Or both.' },
  z4: { say: 'The I.P. address decides who is inside.' },
  z5: { say: 'Name it once. Then every rule can point at it.' },
  /* ===== zone (console) ===== */
  zc1: { say: 'In the console, zones are a list you can search, and filter by what they’re made of.' },
  zc2: { say: 'New zone. A name. A location with its radius — or an I.P. range.' },
  zc3: { say: 'Review, save. And every zone shows the policies that use it.' },

  /* ===== device (drawn) ===== */
  d1: { say: 'A device profile comes in two kinds.' },
  d2: { say: 'Health: a checklist the machine must pass.' },
  d3: { say: 'A version is a floor. That one, or newer. Older stops here.' },
  d4: { say: 'Trusted: a machine your console has seen before.' },
  d5: { say: 'Same signals. Same machine.' },
  d6: { say: 'Your rule hears one word. Match. Or no match.' },
  /* ===== device (console) ===== */
  dc1: { say: 'Device profiles: both kinds in one list, filtered by type.' },
  dc2: { say: 'Create one. A name, a type. Tick the checks, set the floors. Review. Create.' },
  dc3: { say: 'A trusted device profile asks how the machine is recognised — with an agent or without — how it registers, and which signals count, each with a priority.' },
  dc4: { say: 'And any profile shows who uses it.' },

  /* ===== outcome (drawn) ===== */
  o1: { say: 'Allow. The password was enough.' },
  o2: { say: 'Or allow after a second factor: any enabled method, or one you name.' },
  o3: { say: 'Or deny, with the message you wrote.' },

  /* ===== builder (console) ===== */
  p1: { say: 'A new policy opens as a draft. Start from a template, or from scratch.' },
  p2: { say: 'Name it. Choose the applications it protects.' },
  p3: { say: 'Add a rule. Who it covers — everyone, or the groups and people you pick.' },
  p4: { say: 'If: the conditions. The device profile, the zone — and you can group them.' },
  p5: { say: 'Then: allow, with the factors you choose. Or deny.' },
  p6: { say: 'Save the rule. Add the next one, for everyone else.' },
  /* ===== order (drawn, over the console) ===== */
  r1: { say: 'Your rules are read from the top.' },
  r2: { say: 'The first match decides. The rest are never read.' },
  r3: { say: 'Swap two rules,' },
  r4: { say: 'and the same sign-in gets a different answer.' },
  r5: { say: 'Delete what you like. The default stays. It can’t be deleted.' },
  r6: { say: 'Whatever falls through lands on the default.' },
  /* ===== builder canvas (console) ===== */
  k1: { say: 'On the canvas: expand or collapse every card. Undo, redo. Zoom, and fit.' },
  k2: { say: 'Drag a rule to reorder it. Switch one off. Duplicate or delete it from its menu.' },
  k3: { say: 'Save as a draft — or save the policy, and turn it on.' },

  /* ===== templates (console) ===== */
  t1: { say: 'Templates: ready-made policies. Search, filter, preview, use.' },
  t2: { say: 'Yours to edit.' },

  /* ===== methods (console) ===== */
  f1: { say: 'Authentication methods: every factor a rule can ask for, how many are on, and a switch for each.' },

  /* ===== close (drawn) ===== */
  e1: { say: 'Now every sign-in gets its own answer.' },
  e2: { say: 'Allow.' },
  e3: { say: 'Allow, after a second factor.' },
  e4: { say: 'Or deny, with a message you wrote.' },
  e5: { say: 'Zecurify. Every sign-in, decided by your rules.' },
}

export const VOICE = { name: 'en-IN-NeerjaNeural', rate: '-2%', pitch: '+0Hz' }
export const LINES = Object.fromEntries(Object.entries(SCRIPT).map(([id, v]) => [id, v.say]))
export const SUBS = Object.fromEntries(Object.entries(SCRIPT).map(([id, v]) => [id, v.sub ?? readable(v.say)]))
