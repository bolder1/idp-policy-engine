/* The spoken script, and the synthesis that turns it into wavs.

   One line per caption and per slide, spoken while the step happens. The words
   are the film's own: plain, and honest where something is not built. Lines are
   cached by hash in <dir>, so editing one line re-speaks one line.

   The service is Microsoft's edge-tts, driven by the existing audio/vo.py from
   the marketing pipeline (it also writes the duration each line needs). */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const VIDEO = decodeURIComponent(new URL('../../../../video', import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
export const VOICE = 'en-IN-NeerjaNeural'

export const LINES = {
  /* ---- opening slides ---- */
  i1: 'This is where the Policy Engine prototype stands against the sixteen use cases in the brief. A first-time administrator works through today’s build. Nothing was changed for this recording.',
  i2: 'The panel on the right lists the sixteen use cases. Each one turns covered, partial or missing as the film reaches it, with what works and what is missing for the step on screen. The verdicts come from a code audit that was checked twice, and from a first-time walkthrough.',

  /* ---- chapter cards ---- */
  k0: 'Our administrator has just been handed the console.',
  k1: 'Chapter one: device health. We build a device health profile from scratch, then a policy that uses it.',
  k2: 'Chapter two: risk. Where the device risk score comes from, and a rule that asks for more when it is high.',
  k3: 'Chapter three: templates, copies, and trying a policy before it is enforced.',
  k4: 'Chapter four: zones, and the profiles that recognise a machine.',
  k5: 'Chapter five: the things that are not built at all.',

  /* ---- walkthrough ---- */
  c01: 'Signed in for the first time, the administrator lands on the Policies list.',
  c02: 'Everything a rule can use sits under Policies: templates, zones, device profiles and risk signals.',
  c03: 'Device profiles hold the checks a device must pass, or the signals that recognise it.',
  c04: 'A new profile starts with a name.',
  c05: 'And a type. Device health is a set of checks a device must pass at sign-in.',
  c06: 'Use case one: a minimum operating system version for Windows, Android, iOS and macOS. What is missing is the warn answer. A rule can only allow or deny.',
  c07: 'Use case two: device integrity. Not rooted, jailbroken or tampered with. The check can be set, but nothing evaluates it when a sign-in is tried.',
  c08: 'Use case three: a screen lock must be set. Device type takes one value today, so a profile meant for phones and tablets covers phones only.',
  c09: 'Use case four: the administrator sets the lowest miniOrange Authenticator version allowed. It is typed in rather than picked from a list of releases, and there is no grace period.',
  c10: 'Use case nine: a minimum browser version for Chrome, Edge, Firefox and Safari. Any other browser passes.',
  c11: 'Every version here is a minimum, and the column heading says so once.',
  c12: 'Review the profile, then create it.',
  c13: 'Created. Now a policy that uses it.',
  c14: 'Name the policy, and pick the application it protects.',
  c15: 'A new policy starts empty: use a template, or write the first rule by hand.',
  c16: 'If the device does not match Company devices,',
  c17: 'then deny the sign-in, with a message for the person refused. Allow and deny are the only two answers: there is no warn in between.',
  c18: 'Review the change, and turn the policy on.',
  c19: 'Saved, and live. To be sure it does what was meant, an administrator would try a sign-in. This build has no way to.',
  c20: 'Use case five: the risk signal profile. Mobile SDK signals, each with one priority, make up the device risk score.',
  c21: 'Device health does not feed this score. A health check is only pass or fail, beside the score, never inside it.',
  c22: 'Back in the policy, a second rule, for a risky device.',
  c23: 'Use case seven: if the device risk score is above sixty-nine,',
  c24: 'allow the login, but ask for a second factor. Rules run top to bottom, and the first match wins.',
  c25: 'A stronger method is a hand-picked list here. There is no phishing-resistant choice that follows whichever methods are switched on.',
  c26: 'Use case eleven: twelve ready-made templates, including the two named in the brief.',
  c27: 'Using one names the policy and picks its applications, and the template’s rules land on the board, ready to edit.',
  c28: 'Any policy can be copied from its row menu, or saved as a template of your own.',
  c29: 'Duplicate opens the copy as a draft. There is no save as inside the builder.',
  c30: 'Use case six, and this one is missing. A first-time administrator cannot see what a policy would have done before switching it on.',
  c31: 'Draft and inactive policies decide nothing and record nothing. There is no report-only mode.',
  c32: 'Use case twelve: a zone holds I P networks,',
  c33: 'and places: a country, a state, or a city with a range around it.',
  c34: 'Saved, and ready for any rule. But zones and profiles are built over here, away from the policy that needs them.',
  c35: 'A trusted device profile recognises machines it has seen before.',
  c36: 'Use case eight: agentless reads the browser, network and location. Agent-based adds hardware identifiers,',
  c37: 'but the device agent is Windows only. There is no macOS or Linux agent, and no single agent for both M F A and adaptive access.',
  c38: 'Under Devices, M F A Agents is marked coming soon.',
  c39: 'Use case ten: step-up for the admin dashboard. Setup two F A for Admin is coming soon, and nothing asks an administrator to verify again before a sensitive change.',
  c40: 'Use cases thirteen and fifteen: the only way in for an outside system is a generic external hook. There is no connection to Intune, Jamf or Sophos, and no encryption, firewall, password or antivirus check.',
  c41: 'Use case fourteen: a new two-factor method is simply added. Nothing flags, holds or reviews a suspicious registration.',
  c42: 'Use case sixteen: every policy is built by hand. There is no way to describe one in plain language.',

  /* ---- closing slides ---- */
  o1: 'Where we stand: two use cases covered, eight partial, six missing.',
  o2: 'What is missing, and why it is needed. Trying a sign-in in this build. Device checks that really run. A notice on allow. Report-only mode. Phishing-resistant step-up. And health read beside risk.',
  o3: 'Wider device coverage, for tablets and for platforms a profile does not name. Step-up for the admin dashboard. One agent for Windows, macOS and Linux. Building zones and profiles from inside the rule. And save as, with your own templates to manage.',
  o4: 'U E M posture and the providers behind it. A review for new two-factor methods. Describing a policy in plain language. And sample content that says exactly what it checks.',
  o5: 'Four decisions come first. Warn as a notice on allow. A report-only status, which reverses an earlier ruling. Showing try a login in this build. And when to build the proposals.',
  o6: 'Then we build the fixes, film video two with every use case covered, and video three with what we have and the future scope.',
}

/* Synthesise anything not already spoken, and report id → { wav, duration }. */
export function ensureVO(dir, lines = LINES) {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'lines.json')
  fs.writeFileSync(file, JSON.stringify(lines, null, 1))
  const ffmpeg = path.join(VIDEO, 'node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe')
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = spawnSync('python', [path.join(VIDEO, 'audio/vo.py'), file, dir, `--voice=${VOICE}`, '--rate=+0%', '--pitch=+0Hz', `--ffmpeg=${ffmpeg}`], {
      encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }, maxBuffer: 1 << 26,
    })
    if (r.status === 0) break
    /* edge-tts refuses lines under load; finished lines are cached, so just go again. */
    if (attempt === 3) throw new Error('voice-over failed: ' + (r.stderr || '').slice(-800))
  }
  const map = {}
  for (const id of Object.keys(lines)) {
    const meta = path.join(dir, `${id}.json`), wav = path.join(dir, `${id}.wav`)
    if (!fs.existsSync(meta) || !fs.existsSync(wav)) throw new Error('missing voice-over for ' + id)
    const d = JSON.parse(fs.readFileSync(meta, 'utf8'))
    /* Pace to the last word, not the file: every clip carries ~0.85 s of silence. */
    const last = d.words?.at(-1)
    map[id] = { wav, duration: last ? Math.min(d.duration, last.t + last.dur + 0.25) : d.duration }
  }
  return map
}
