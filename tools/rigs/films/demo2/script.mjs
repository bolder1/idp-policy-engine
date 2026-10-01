/* -----------------------------------------------------------------------------
   The demo — second cut.

   The first ran nine and a half minutes and explained everything twice. This
   one is built the way the product demos the owner pointed at are built:
   one idea per line, the product on screen only when there is something to
   see, and a scene of its own whenever the idea is the point.

   WHAT CHANGED, and why:
   · SHORTER. Every line is one clause. Concepts that took four sentences take
     one ("A zone is a named place"). Nothing is said that the picture is
     already saying.
   · A REAL STORY. Office laptops, in Pune, signing in to GitHub and Jira —
     the owner's example, and a better one than "Corporate Email" because it
     shows a policy covering SEVERAL apps, which is a thing people ask about.
   · SUBTITLES, not captions. The band at the foot of the frame carries what is
     actually being said, word for word, the way YouTube does it — rather than
     a slogan summarising it. `sub` is only written out where a word wants
     emphasis; otherwise it is generated from `say`.
   · SCENES. `scene` names a full-frame explainer for the lines that are ideas
     rather than actions. The console is not left sitting on screen doing
     nothing while somebody talks over it.
   · POINTING. `focus` names a control in the app; the stage draws a ring round
     it and a label beside it, so the eye lands where the voice is.

   SPELLING FOR THE VOICE: Zecurify (X as a Z), I.P., twenty five kilometres,
   Windows eleven, GitHub, Jira. The subtitle spells them the normal way.
   -------------------------------------------------------------------------- */

/** The readable form of a spoken line: the voice's spelling undone. */
export const readable = (s) =>
  s
    .replace(/Zecurify/g, 'Xecurify')
    .replace(/\bI\.P\./g, 'IP')
    .replace(/twenty five kilometres/g, '25 kilometres')
    .replace(/Windows eleven/g, 'Windows 11')

/** id → { say, sub?, scene?, focus? } */
export const SCRIPT = {
  /* --- Cold open ---------------------------------------------------------- */
  o1: {
    say: 'Every sign-in asks the same question. Should this person, on this device, from this place, get into this app?',
    scene: 'open',
  },
  o2: {
    say: 'Here is how you answer it once, and have it hold everywhere.',
    scene: 'open',
  },

  /* --- 1 · Zones ---------------------------------------------------------- */
  z1: { say: 'Start with where. A zone is a named place.', scene: 'where' },
  z2: {
    say: 'An office network, a country, or a city and the ground around it. Name it once, and every policy can point at the name.',
    scene: 'where',
  },
  z3: { say: 'We will make one for the Pune office.' },
  z4: { say: 'A city, and twenty five kilometres around it.' },
  z5: {
    say: 'It matches on the I.P. address the sign-in arrives from, so a V.P.N. shows where it comes out.',
    sub: 'It matches on the <b>IP address</b> the sign-in arrives from, so a VPN shows where it comes out.',
  },
  z6: { say: 'Saved. That place now has a name.' },

  /* --- 2 · Device profiles ------------------------------------------------ */
  d1: { say: 'Then what. A device profile is a checklist the machine has to pass.', scene: 'device' },
  d2: { say: 'We will build the one every tenant starts with — the office laptop.' },
  d3: {
    say: 'Windows eleven or newer. A screen lock. And nothing rooted or tampered with.',
    sub: '<b>Windows 11 or newer</b>. A <b>screen lock</b>. And nothing <b>rooted or tampered with</b>.',
  },
  d4: { say: 'A version is a floor, not a match. That version or newer passes.' },
  d5: { say: 'Read it back, and create.' },

  /* --- 3 · The policy ----------------------------------------------------- */
  p1: {
    say: 'Now put the two together. An office laptop, in Pune, signing in to GitHub and Jira.',
    scene: 'story',
  },
  p2: {
    say: 'A policy is a list of rules, read from the top. The first one that matches decides.',
    scene: 'order',
  },
  p3: { say: 'It opens as a draft. Name it whenever you like.' },
  p4: { say: 'One policy, both applications. GitHub Enterprise, and Jira.' },
  p5: {
    say: 'Rule one. The device matches the office laptop profile, and the sign-in is in the Pune zone.',
    sub: 'Rule one. The device matches the <b>office laptop</b> profile, and the sign-in is in the <b>Pune</b> zone.',
  },
  p6: { say: 'That gets in on a password.' },
  p7: { say: 'Rule two catches everyone else. In, but after a second factor.' },
  p8: { say: 'And at the foot, the default — what happens when nothing above matched.' },
  p9: { say: 'Save. Two rules, two applications, one sentence each.' },

  /* --- 4 · In practice ---------------------------------------------------- */
  x1: { say: 'Real policies stack the same parts.' },
  x2: { say: 'This one grades the device instead of judging it once — current goes straight in, behind gets a second factor, tampered is refused.' },
  x3: { say: 'And this one raises the bar as risk rises.' },
  x4: { say: 'The ladder gets longer. The sentence never changes.', scene: 'order' },

  /* --- 5 · Authentication methods ----------------------------------------- */
  m1: { say: 'Every rule ended in a factor. This is the catalogue they come from.' },
  m2: { say: 'Each family says how many methods are on, and opens to show them.' },
  m3: { say: 'Turn one off here, and no policy can ask for it.' },

  /* --- Close --------------------------------------------------------------- */
  c1: { say: 'Name the place. Name the device. Write the rule once.', scene: 'close' },
  c2: { say: 'The Zecurify policy engine.', scene: 'close' },
}

/* The full-frame explainers, by key. Plain HTML — the stage's own type scale
   does the work, so these stay legible at any size and cost nothing to edit. */
export const SCENES = {
  open: `<div class="card">
    <div class="kick">xecurify · by miniOrange</div>
    <h1>The policy engine</h1>
    <p>Who gets in, on what device, from where — decided once, in plain language.</p>
  </div>`,

  where: `<div class="card">
    <div class="kick">Zones</div>
    <h1>Where the sign-in is from</h1>
    <div class="flow">
      <div class="b"><u>Network</u><strong>Office network</strong><em>An IP range you own</em></div>
      <div class="b is-on"><u>Place</u><strong>Pune + 25 km</strong><em>A city and the ground around it</em></div>
      <div class="b"><u>Country</u><strong>India</strong><em>Everything inside it</em></div>
    </div>
    <div class="chips"><span>Named once</span><span>Used by every policy</span><span>Change it in one place</span></div>
  </div>`,

  device: `<div class="card">
    <div class="kick">Device profiles</div>
    <h1>What the machine has to be</h1>
    <div class="flow">
      <div class="b is-on"><u>Version</u><strong>Windows 11 or newer</strong><em>A floor, not a match</em></div>
      <div class="b is-on"><u>Lock</u><strong>Screen lock set</strong><em>Reported by the agent</em></div>
      <div class="b is-on"><u>Integrity</u><strong>Not rooted or tampered</strong><em>Jailbreak and root checks</em></div>
    </div>
  </div>`,

  story: `<div class="card">
    <div class="kick">The policy we are about to write</div>
    <h1>Office laptops, in Pune,<br>into GitHub and Jira</h1>
    <div class="flow">
      <div class="b"><u>If</u><strong>Office laptop</strong><em>The device profile</em></div>
      <div class="arw">+</div>
      <div class="b"><u>And</u><strong>Pune office</strong><em>The zone</em></div>
      <div class="arw">→</div>
      <div class="b is-on"><u>Then</u><strong>Password only</strong><em>Everyone else: a second factor</em></div>
    </div>
  </div>`,

  order: `<div class="card">
    <div class="kick">How a policy is read</div>
    <h1>Top to bottom.<br>First match decides.</h1>
    <div class="stack">
      <div class="r is-on"><i>1</i> Office laptop, in Pune <span>Allow · password</span></div>
      <div class="r is-off"><i>2</i> Everyone else <span>Allow · second factor</span></div>
      <div class="r is-off"><i>*</i> Nothing else matched <span>The default</span></div>
    </div>
  </div>`,

  close: `<div class="card">
    <div class="kick">xecurify · by miniOrange</div>
    <h1>Name it once.<br>Use it everywhere.</h1>
    <div class="chips"><span>Zones</span><span>Device profiles</span><span>Policies</span><span>Authentication methods</span></div>
  </div>`,
}

/** Chapter cards, shown between sections. */
export const CHAPTERS = {
  zones: ['01', 'Zones', 'A named place, described once.'],
  device: ['02', 'Device profiles', 'A checklist the machine has to pass.'],
  policy: ['03', 'The policy', 'Who it covers, what has to be true, what happens.'],
  practice: ['04', 'In practice', 'The same parts, stacked further.'],
  methods: ['05', 'Authentication methods', 'Where the factors come from.'],
}

export const VOICE = { name: 'en-IN-NeerjaNeural', rate: '-3%', pitch: '+0Hz' }
export const LINES = Object.fromEntries(Object.entries(SCRIPT).map(([id, v]) => [id, v.say]))
/** What the band shows: the spoken line, in its readable spelling. */
export const SUBS = Object.fromEntries(
  Object.entries(SCRIPT).map(([id, v]) => [id, v.sub ?? readable(v.say)]),
)
