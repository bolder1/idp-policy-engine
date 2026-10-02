/* -----------------------------------------------------------------------------
   Film A — the explainer. See TREATMENT.md beside this file for why each line
   is what it is; this is the script as the voice reads it and as the film's
   shot list keys on it.

   Voice spellings: Zecurify, twenty five kilometres, Windows eleven, two in the
   morning. `readable` undoes them for the subtitle track.
   -------------------------------------------------------------------------- */

export const readable = (s) =>
  s
    .replace(/Zecurify/g, 'Xecurify')
    .replace(/twenty five kilometres/g, '25 kilometres')
    .replace(/Windows eleven/g, 'Windows 11')
    .replace(/two in the morning/g, '2am')

/** id → { say, shot } — one shot per line; the stage builds the shot. */
export const SCRIPT = {
  h1: { say: 'Somebody just signed in.', shot: 'hook' },
  h2: { say: 'Should they get in?', shot: 'hook2' },

  p1: { say: 'A contractor’s laptop, two updates behind.', shot: 'pain1' },
  p2: { say: 'A login from a country you’ve never sold to.', shot: 'pain2' },
  p3: { say: 'Your own admin, on hotel wifi, at two in the morning.', shot: 'pain3' },

  b1: { say: 'Same door. Same password. Same answer.', shot: 'break' },
  b2: { say: 'One rule for everyone isn’t a policy. It’s a guess.', shot: 'break2' },

  t1: { say: 'The Zecurify policy engine answers each sign-in on its own.', shot: 'turn' },

  c1: { say: 'Other consoles hand you a page of checkboxes. This one hands you a sentence.', shot: 'contrast' },
  c2: { say: 'Who it covers. What has to be true. What happens.', shot: 'sentence' },
  c3: { say: 'Here’s how.', shot: 'how' },

  w1: { say: 'Name the place once. The Pune office, and twenty five kilometres around it.', shot: 'zone' },
  w2: { say: 'Name the device once. Windows eleven or newer, untampered, and locked.', shot: 'device' },
  w3: {
    say: 'Then write the rule. Office laptops in Pune reach GitHub and Jira on a password. Everyone else proves it with a second factor.',
    shot: 'rule',
  },

  l1: { say: 'Rules are read from the top. The first one that matches decides.', shot: 'order' },
  l2: { say: 'So the safest sign-in is answered first, and nothing below it can undo that.', shot: 'order2' },

  e1: { say: 'Stop writing one rule for everyone.', shot: 'close1' },
  e2: { say: 'Start deciding sign-in by sign-in.', shot: 'close2' },
  e3: { say: 'Zecurify. The policy engine.', shot: 'end' },
}

export const VOICE = { name: 'en-IN-NeerjaNeural', rate: '-2%', pitch: '+0Hz' }
export const LINES = Object.fromEntries(Object.entries(SCRIPT).map(([id, v]) => [id, v.say]))
export const SUBS = Object.fromEntries(Object.entries(SCRIPT).map(([id, v]) => [id, readable(v.say)]))
