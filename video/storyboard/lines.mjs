/* -----------------------------------------------------------------------------
   Every word the film speaks, keyed by id.

   Tenth cut — restructured end-to-end: intro → live product tour → policy
   concept → builder anatomy (Bento) → full demo (board tour → create →
   simple rule → complex rule → priority/reorder → review) → outro.
   Enterprise-SaaS voice throughout: direct, no personification, no forced
   metaphor. Names woven into sentences, not appended after colons. Each
   worked example is framed once ("we'll use ... as our example"), not
   re-announced every line.
   -------------------------------------------------------------------------- */

export const VOICE = { name: 'en-IN-NeerjaExpressiveNeural', rate: '+10%', pitch: '+0Hz' }

export const LINES = {
  // --- 00 · intro -------------------------------------------------------------
  'hk.1': 'Who gets in, from where, and what they have to prove. Policy Engine — access policy, in plain English.',

  // --- 01 · live product tour --------------------------------------------------
  'sh.1': 'This is Policy Engine, inside your admin console.',
  'sh.2': 'Every application, and every policy protecting it, in one place.',
  'sh.3': "Let's open one.",

  // --- 02 · what a policy is ---------------------------------------------------
  'pc.1': 'A policy protects one application.',
  'pc.2': "It's made of rules, checked in order, top to bottom.",
  'pc.3': 'Each rule decides who it applies to, when, and what happens next.',

  // --- 03 · the builder, broken down (Bento) ------------------------------------
  'bt.1': 'Every rule is one card, built from three parts.',
  'bt.2': 'Who: the people or groups this rule applies to.',
  'bt.3': 'If: the conditions that must be true. Combine them with AND, or group them with OR.',
  'bt.4': 'Then: allow, deny, or require a second factor.',
  'bt.5': 'Rules sit on a board, top to bottom — order sets priority. Review reads the policy back before you save.',

  // --- 04.1 · board tour (an existing, populated policy) -----------------------
  'db.1': "Here's a board with more than one rule already.",
  'db.2': 'Top to bottom. Each sign-in is checked against rule one first.',
  'db.3': "If it matches, that rule decides — allow, deny, or a factor. If not, it's checked against the next rule.",

  // --- 04.2 · create a new policy ------------------------------------------------
  'cr.1': "Let's build one from scratch.",
  'cr.2': "A policy needs a name and the application it protects. We'll use Workday as our example.",
  'cr.3': 'Create it as a draft — nothing changes until you activate it.',

  // --- 04.3 · rule one, the simple rule ------------------------------------------
  'r1.1': 'Rule one is simple: everyone, every time, a second factor. No conditions needed.',
  'r1.2': 'We leave Who and If empty — that means everyone, always.',
  'r1.3': 'Then: allow, but require a second factor — a push notification, or an authenticator app.',
  'r1.4': 'One rule, no conditions, still exact.',

  // --- 04.4 · rule two, the complete rule -----------------------------------------
  'r2.1': 'Rule two is more complete — it uses every part of the builder.',
  'r2.2': 'Who: specific groups, plus one named person alongside them.',
  'r2.3': 'If: start with one condition — flag any sign-in from outside the usual network.',
  'r2.4': "Now a condition group of its own: a device that isn't company-managed...",
  'r2.5': "...or a network known for anonymizing traffic. Inside the group, either is enough — that's OR.",
  'r2.6': 'The group combines with the first condition using AND — both must hold.',
  'r2.7': 'Then: allow, but only with a second factor, and remember a verified device for a set number of days.',
  'r2.8': 'And a third rule, on its own: deny outright for a known risk network. No conditions to weigh, no factor to offer.',
  'r2.9': 'Three rules — one plain, one conditional, one absolute.',

  // --- 04.5 · priority: order changes the outcome ---------------------------------
  'pr.1': 'Three rules. Order decides which one actually applies.',
  'pr.2': 'Right now, the broadest rule runs first — it catches every sign-in, including the one that should have been blocked.',
  'pr.3': 'Move the strictest rule to the top, and the broadest to the bottom, so specific checks run before the default.',
  'pr.4': 'Same three rules, reordered. Now a risky sign-in is caught immediately, instead of slipping through as the default.',

  // --- 04.6 · review & save ---------------------------------------------------------
  'rv.1': 'Before saving, Review and Save reads every rule back in plain English.',
  'rv.2': 'Rule one blocks the known risk outright. Rule two adds a second factor for finance, off the usual network. Rule three is the default — everyone else still needs a second factor.',
  'rv.3': "Confirm, and it's saved — inactive until you switch it on.",

  // --- 05 · outro ---------------------------------------------------------------------
  'out.1': 'Access policy, in plain English. Policy Engine, by Xecurify.',
}

/* Chapter banners for the guided-demo section only (04.1–04.6). The cold
   open — showcase, concept, bento — plays banner-free, same pattern as the
   old card scene. */
export const CHAPTERS = [
  { id: 'board',  n: '01', title: 'The board',        kicker: 'Rules, checked top to bottom.' },
  { id: 'create', n: '02', title: 'A new policy',      kicker: 'One name, one application.' },
  { id: 'rule1',  n: '03', title: 'Rule one — simple', kicker: 'No conditions. Always required.' },
  { id: 'rule2',  n: '04', title: 'Rule two — complete', kicker: 'Groups, conditions, AND / OR.' },
  { id: 'order',  n: '05', title: 'Priority',          kicker: 'Same rules. Different order, different outcome.' },
  { id: 'save',   n: '06', title: 'Save it',           kicker: 'Every rule, read back in plain English.' },
]
