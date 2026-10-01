import { UCS, TODAY } from './video1-data.mjs'

/* ---- the closing section ---- */
const ROWS = {
  1: 'No warn; no test; four platforms', 2: 'Not evaluated; template skips it', 3: 'Phones only; not evaluated', 4: 'No sample blocks it; not evaluated',
  5: 'Health never feeds the score', 6: 'No report-only; test tools hidden', 7: 'No phishing-resistant choice', 8: 'Windows only; no MFA agent',
  9: 'Other browsers pass; not evaluated', 10: 'Nothing for the admin dashboard', 11: 'No Save as in the builder', 12: 'Built away from the rule; no test',
  13: 'No UEM checks', 14: 'No review of new methods', 15: 'No Intune, Jamf, Sophos', 16: 'No plain-language setup',
}
const LBL = { covered: '✓ Covered', partial: '◐ Partial', missing: '✕ Missing' }
const CLS = { covered: 'c', partial: 'p', missing: 'm' }
const scoreboard = `<div class="kick">Where we stand</div><h2>2 covered · 8 partial · 6 missing</h2>
<table><tr><th>#</th><th>Use case</th><th>Today</th><th>What is missing</th></tr>${UCS.map((u) => `<tr><td>${u.id}</td><td>${u.short}</td><td><span class="st ${CLS[TODAY[u.id]]}">${LBL[TODAY[u.id]]}</span></td><td>${ROWS[u.id]}</td></tr>`).join('')}</table>`

const GAPS = [
  ['Try a sign-in in this build', 'Prove a policy decides what you meant before it goes live.', '#1–#7, #9, #12'],
  ['Device checks that really run', 'Today the checks are saved, and nothing reads them when a sign-in is tried.', '#1–#5, #9, #12, #13'],
  ['A notice on Allow (warn)', 'Let an outdated device in with a heads-up before it is blocked.', '#1, #4, #9'],
  ['Report-only mode', 'See what a policy would have done on real sign-ins before enforcing it.', '#6'],
  ['Phishing-resistant step-up', '“A stronger method” as a class of methods, not a hand-picked list that drifts.', '#7, #5'],
  ['Health beside risk', 'A failed health check should raise the bar next to the Device risk score.', '#5'],
  ['Phones, tablets, every platform', 'Device type is one value today, and an unnamed OS or browser passes.', '#1, #3, #9'],
  ['Step-up for the admin dashboard', 'A sensitive admin change needs a fresh check of who is making it.', '#10'],
  ['One agent for Windows, macOS, Linux', 'MFA and device signals from one install, on every desktop.', '#8'],
  ['Zones and profiles from the rule', 'A first-timer should not leave the policy to build what it needs.', '#12'],
  ['Save as, and your own templates', 'Copy a live policy safely, and manage the templates you saved.', '#11'],
  ['UEM posture and providers', 'Encryption, firewall, password and EDR / AV, from Intune, Jamf, Sophos or miniOrange UEM.', '#13, #15'],
  ['Review of new 2FA methods', 'Flag or hold a suspicious registration, with reasons, notices and history.', '#14'],
  ['Describe it in plain language', 'Turn a sentence into rules to review, instead of building by hand.', '#16'],
  ['Sample content that says what it does', 'Some templates and sample policies promise more than they check.', '#2, #4, #7, #10, #11'],
]
const gapSlide = (items, part) => `<div class="kick">What is missing · ${part}</div><h2>Why it is needed, and for which use cases</h2><div class="grid">${items.map(([t, why, ids]) => `<div class="it"><b>${t}</b><em>${why}</em><u>Use cases ${ids}</u></div>`).join('')}</div>`

export const INTRO = [
  { voId: 'i1', secs: 5, html: '<div class="kick">Policy Engine · status film · 22 Sep 2026</div><h1>Where we stand against the brief</h1><p class="lead">The 16 use cases from the scenario sheet, tried by a first-time admin on today’s prototype. Nothing was changed for this recording.</p>' },
  { voId: 'i2', secs: 6, html: '<div class="kick">How to read it</div><h2>Every step says what it covers</h2><p class="lead">The panel on the right lists the 16 use cases. Each turns <span class="st c">✓ Covered</span> <span class="st p">◐ Partial</span> or <span class="st m">✕ Missing</span> when the film reaches it, with what works and what is missing for the step on screen.</p><p class="lead">The verdicts come from a code audit, checked a second time, and a first-time walkthrough.</p>' },
]
export const OUTRO = [
  { voId: 'o1', secs: 10, html: scoreboard },
  { voId: 'o2', secs: 12, html: gapSlide(GAPS.slice(0, 6), '1 of 3') },
  { voId: 'o3', secs: 12, html: gapSlide(GAPS.slice(6, 11), '2 of 3') },
  { voId: 'o4', secs: 12, html: gapSlide(GAPS.slice(11), '3 of 3') },
  { voId: 'o5', secs: 12, html: `<div class="kick">Decisions first</div><h2>Four to settle before building</h2><div class="grid">
    <div class="it"><b>Warn as a notice on Allow</b><em>Allow and Deny stay the only answers; an Allow can show a notice.</em><u>Use cases #1, #4, #9</u></div>
    <div class="it"><b>A report-only status</b><em>Reverses the 14 Sep “No Monitor” ruling, as a labelled proposal.</em><u>Use case #6</u></div>
    <div class="it"><b>Try a login in the showcase</b><em>The one way to show any device use case working.</em><u>Use cases #1–#7, #9</u></div>
    <div class="it"><b>When to build the proposals</b><em>After the manager agrees each direction.</em><u>Use cases #8, #13–#16</u></div>
    </div><p class="lead" style="margin-top:26px">All 22 decisions, with peer sources, are in the design-decisions document.</p>` },
  { voId: 'o6', secs: 8, html: '<div class="kick">Next</div><h1>Decide, build, film again</h1><p class="lead">1. Settle the decisions. 2. Build the fixes and the missing pieces. 3. Video 2: every use case, covered. 4. Video 3: what we have, and the future scope.</p>' },
]

