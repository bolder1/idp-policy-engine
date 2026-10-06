import { DEVICE_PRESETS, type DevicePresetId } from '../../../testing/device-presets'
import { ORIGIN_PRESETS, originPatch, type FormField, type OriginPresetId, type SignInForm } from '../../../testing/sign-in-form'

/* -----------------------------------------------------------------------------
   A sentence, read as a sign-in (assistant/, shared): "Can Maya get into
   GitHub from home on her Android?" → Maya Iyer · GitHub Enterprise · Home
   broadband · Android 12 phone. PURE, and a fixed reader of the tenant's own
   names — no model, no guessing: what it cannot place it hands back as
   `unread`, to be said ("I didn't recognise 'Acme VPN'").

   API:
     readSignIn(text, dict) → ReadSignIn
       patch    the form change the words state (only what they state)
       fields   the fields in it, in form order
       read     what was read, said: ["Maya Iyer", "GitHub Enterprise", "Home broadband"]
       groups   groups named ("anyone in Finance"): not a form field — said, never run
       unread   capitalised words it could not place, as typed

   The words it knows: people by full and first name (a first name only when
   it is one person's), applications by full name or a word only one has
   ("GitHub", "AWS"), groups by name, the origins (their labels, and home /
   office / branch / tor), the device presets (their labels, and android /
   iphone / ios / windows 10 / windows 11, "not registered", "no device"),
   "risk <n>" and a time "at 22:30" / "at 9 pm".
   -------------------------------------------------------------------------- */

export interface SignInDict {
  people: readonly { id: string; name: string }[]
  groups: readonly { id: string; name: string }[]
  apps: readonly { id: string; name: string }[]
}

export interface ReadSignIn {
  patch: Partial<SignInForm>
  fields: FormField[]
  read: string[]
  groups: { id: string; name: string }[]
  unread: string[]
}

const FIELD_ORDER: readonly FormField[] = ['person', 'app', 'address', 'place', 'when', 'device', 'risk', 'assume-on']

/* Words that are never a name: how people ask, and the small words between. */
const STOP = new Set(
  'a an and any anyone are at be but can check could did do does for from get gets getting go has have he her him his how i if in into is it its let me my of ok on or please run re rerun replay set she should show sign signs signing so the their them then they this to try turn use using via was we what when where which who why will with would you your yes no now today tomorrow tonight morning evening laptop phone device risk score network access allowed denied deny allow mfa 2fa app application office home branch tor'.split(
    ' ',
  ),
)

interface Tok {
  low: string
  raw: string
}

function tokens(text: string): Tok[] {
  const out: Tok[] = []
  for (const m of text.matchAll(/[A-Za-z0-9][A-Za-z0-9.:]*(?:'s)?/g)) {
    const raw = m[0].replace(/'s$/i, '').replace(/[.:]+$/, '')
    if (raw) out.push({ raw, low: raw.toLowerCase() })
  }
  return out
}

const words = (s: string) => tokens(s).map((t) => t.low)

/** Where `phrase` (lower-case words) first occurs in `toks` from an uncovered start, or -1. */
function find(toks: readonly Tok[], phrase: readonly string[], covered: readonly boolean[]): number {
  if (phrase.length === 0) return -1
  outer: for (let i = 0; i + phrase.length <= toks.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (covered[i + j] || toks[i + j].low !== phrase[j]) continue outer
    return i
  }
  return -1
}

const GENERIC = new Set(['enterprise', 'console', 'workspace', 'cloud', 'online', 'suite', 'app', 'portal', 'the', 'for', 'and', 'of'])

/* The device words, most specific first. */
const DEVICE_WORDS: readonly { words: string; id: DevicePresetId | 'none' }[] = [
  { words: 'no device agent', id: 'win11-no-agent' },
  { words: 'no device', id: 'none' },
  { words: 'without a device', id: 'none' },
  { words: 'windows 11 laptop not registered', id: 'win11-unregistered' },
  { words: 'windows 11 not registered', id: 'win11-unregistered' },
  { words: 'unregistered windows 11 laptop', id: 'win11-unregistered' },
  { words: 'unregistered windows laptop', id: 'win11-unregistered' },
  { words: 'unregistered laptop', id: 'win11-unregistered' },
  { words: 'windows laptop not registered', id: 'win11-unregistered' },
  { words: 'windows 10 laptop', id: 'win10' },
  { words: 'windows 10', id: 'win10' },
  { words: 'registered windows 11 laptop', id: 'win11-registered' },
  { words: 'registered windows laptop', id: 'win11-registered' },
  { words: 'windows 11 laptop', id: 'win11-registered' },
  { words: 'windows 11', id: 'win11-registered' },
  { words: 'windows laptop', id: 'win11-registered' },
  { words: 'windows', id: 'win11-registered' },
  { words: 'android 14 phone', id: 'android-14' },
  { words: 'android 14', id: 'android-14' },
  { words: 'android 12 phone', id: 'android-12' },
  { words: 'android 12', id: 'android-12' },
  { words: 'android phone', id: 'android-12' },
  { words: 'android', id: 'android-12' },
  { words: 'iphone', id: 'iphone' },
  { words: 'ios', id: 'iphone' },
]

const ORIGIN_WORDS: readonly { words: string; id: OriginPresetId }[] = [
  ...ORIGIN_PRESETS.map((o) => ({ words: o.label.toLowerCase(), id: o.id as OriginPresetId })),
  { words: 'branch', id: 'branch' },
  { words: 'corporate office', id: 'office' },
  { words: 'the office', id: 'office' },
  { words: 'office', id: 'office' },
  { words: 'home', id: 'home' },
  { words: 'tor', id: 'tor' },
]

const pad = (n: number) => String(n).padStart(2, '0')

/** The sentence's sign-in: only what the words state, and what they could not place. Never throws. */
export function readSignIn(text: string, dict: SignInDict): ReadSignIn {
  const out: ReadSignIn = { patch: {}, fields: [], read: [], groups: [], unread: [] }
  try {
    const toks = tokens(text)
    const covered = toks.map(() => false)
    const saidOf = new Map<FormField, string>()
    const take = (phrase: readonly string[]): boolean => {
      const at = find(toks, phrase, covered)
      if (at < 0) return false
      for (let j = 0; j < phrase.length; j++) covered[at + j] = true
      return true
    }
    const state = (field: FormField, patch: Partial<SignInForm>, said: string) => {
      if (out.fields.includes(field)) return
      Object.assign(out.patch, patch)
      out.fields.push(field)
      saidOf.set(field, said)
    }

    /* Applications: the full name, then the name without its generic words, then a word only one has. */
    const appKeys = dict.apps.flatMap((a) => {
      const full = words(a.name)
      const core = full.filter((w) => !GENERIC.has(w))
      return [
        { a, k: full, rank: 0 },
        ...(core.length > 0 && core.length < full.length ? [{ a, k: core, rank: 1 }] : []),
        ...core.filter((w) => w.length >= 3 && dict.apps.filter((b) => words(b.name).includes(w)).length === 1).map((w) => ({ a, k: [w], rank: 2 })),
      ]
    })
    for (const rank of [0, 1, 2]) {
      if (out.patch.appId) break
      for (const { a, k } of appKeys.filter((x) => x.rank === rank).sort((x, y) => y.k.length - x.k.length)) {
        if (take(k)) {
          state('app', { appId: a.id }, a.name)
          break
        }
      }
    }

    /* People: the full name, else a first name that is one person's. */
    for (const p of [...dict.people].sort((x, y) => y.name.length - x.name.length)) {
      if (take(words(p.name))) {
        state('person', { personId: p.id }, p.name)
        break
      }
    }
    if (!out.patch.personId) {
      for (const p of dict.people) {
        const first = words(p.name)[0]
        if (!first || dict.people.filter((q) => words(q.name)[0] === first).length !== 1) continue
        if (take([first])) {
          state('person', { personId: p.id }, p.name)
          break
        }
      }
    }

    /* Groups: named, said back, never a form field. */
    for (const g of [...dict.groups].sort((x, y) => y.name.length - x.name.length)) {
      const k = words(g.name)
      if (take(k) || (k.length === 1 && take([`${k[0]}s`]))) out.groups.push({ id: g.id, name: g.name })
    }

    /* Where from. */
    for (const o of ORIGIN_WORDS) {
      if (take(words(o.words))) {
        const label = ORIGIN_PRESETS.find((x) => x.id === o.id)?.label ?? o.words
        state('address', { ...originPatch(o.id), place: { kind: 'from-address' } }, label)
        break
      }
    }

    /* The device. */
    for (const d of DEVICE_WORDS) {
      if (take(words(d.words))) {
        if (d.id === 'none') state('device', { device: { kind: 'none' } }, 'No device')
        else state('device', { device: { kind: 'preset', id: d.id } }, DEVICE_PRESETS.find((x) => x.id === d.id)?.label ?? d.words)
        break
      }
    }

    /* The risk score: "risk 55", "risk score of 86". */
    const lows = toks.map((t) => t.low)
    for (let i = 0; i < lows.length; i++) {
      if (lows[i] !== 'risk' || covered[i]) continue
      let j = i + 1
      while (j < lows.length && ['score', 'of', 'at', 'is', 'to'].includes(lows[j])) j++
      const n = Number(lows[j])
      if (j < lows.length && /^\d{1,3}$/.test(lows[j]) && n >= 0 && n <= 100) {
        for (let k = i; k <= j; k++) covered[k] = true
        state('risk', { risk: String(n) }, `Risk ${n}`)
        break
      }
    }

    /* A time: "at 22:30", "9 pm". */
    for (let i = 0; i < lows.length; i++) {
      if (covered[i]) continue
      const hm = /^(\d{1,2}):(\d{2})$/.exec(lows[i])
      const ampm = /^(\d{1,2})$/.exec(lows[i]) && (lows[i + 1] === 'am' || lows[i + 1] === 'pm') ? lows[i + 1] : null
      if (hm && Number(hm[1]) < 24 && Number(hm[2]) < 60) {
        covered[i] = true
        state('when', { time: `${pad(Number(hm[1]))}:${hm[2]}` }, `${pad(Number(hm[1]))}:${hm[2]}`)
        break
      }
      if (ampm) {
        const h = Number(lows[i]) % 12 + (ampm === 'pm' ? 12 : 0)
        if (h < 24) {
          covered[i] = covered[i + 1] = true
          state('when', { time: `${pad(h)}:00` }, `${pad(h)}:00`)
          break
        }
      }
    }

    /* What it could not place: a run of capitalised words that are not small words. */
    let run: string[] = []
    const flush = () => {
      if (run.length > 0) out.unread.push(run.join(' '))
      run = []
    }
    toks.forEach((t, i) => {
      const named = !covered[i] && /^[A-Z]/.test(t.raw) && !STOP.has(t.low) && !/^\d/.test(t.raw)
      if (named) run.push(t.raw)
      else flush()
    })
    flush()
    out.fields.sort((a, b) => FIELD_ORDER.indexOf(a) - FIELD_ORDER.indexOf(b))
    out.read = out.fields.map((f) => saidOf.get(f) ?? '')
  } catch {
    /* Words it cannot read: nothing read. */
  }
  return out
}
