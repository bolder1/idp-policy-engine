/* -----------------------------------------------------------------------------
   Setting up an authenticator app, as one small card.

   The console sets these up in a single short step each, and that step is the
   whole of what setting one up is:

   - A code app (Google, Microsoft, Authy): install it, scan a QR code or type
     the key, enter the code it shows.
   - Microsoft Push: pick which Azure NPS server carries its approvals.

   They were reachable here only as a form of issuer labels and rotation periods
   — the tenant's defaults, not anything somebody sets an app up with — so each
   now gets the one card it needs, opened from a Set up button on its row.
   -------------------------------------------------------------------------- */

export type SetupCard =
  | {
      kind: 'app'
      /** The app as its store lists it — the name somebody searches for. */
      app: string
      android: string
      ios: string
    }
  | { kind: 'nps' }

const CARDS: Record<string, SetupCard> = {
  'google-auth': {
    kind: 'app',
    app: 'Google Authenticator',
    android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2',
    ios: 'https://apps.apple.com/app/google-authenticator/id388497605',
  },
  'ms-auth': {
    kind: 'app',
    app: 'Microsoft Authenticator',
    android: 'https://play.google.com/store/apps/details?id=com.azure.authenticator',
    ios: 'https://apps.apple.com/app/microsoft-authenticator/id983156458',
  },
  authy: {
    kind: 'app',
    app: 'Authy',
    android: 'https://play.google.com/store/apps/details?id=com.authy.authy',
    ios: 'https://apps.apple.com/app/twilio-authy/id494168017',
  },
  'ms-push': { kind: 'nps' },
}

export const setupCardFor = (id: string): SetupCard | null => CARDS[id] ?? null

/* The Azure NPS servers this tenant has configured.

   Configuring one is its own screen in the console and outside this revamp, so
   the list is seeded. Two rather than none: the console's own first state is
   "no configuration found", and the card handles that — but a demo whose only
   dropdown holds nothing cannot show what the step is for. */
export interface NpsServer {
  id: string
  name: string
  host: string
}

export const NPS_SERVERS: NpsServer[] = [
  { id: 'nps-primary', name: 'Primary NPS', host: 'nps01.acme.internal' },
  { id: 'nps-failover', name: 'Failover NPS', host: 'nps02.acme.internal' },
]

/** Six digits, which is what every one of these apps shows. */
export const isPasscode = (v: string): boolean => /^\d{6}$/.test(v)

/** Whether the card has what Save needs: the code an app showed, or a server. */
export function setupReady(
  card: SetupCard,
  input: { passcode: string; server: string },
  servers: NpsServer[] = NPS_SERVERS,
): boolean {
  return card.kind === 'app' ? isPasscode(input.passcode) : servers.some((s) => s.id === input.server)
}

/* Stable per method rather than random per render.

   A key that changed every time the card was opened would read as a bug, and a
   test cannot hold a random one still. Nothing is enrolled against it — there is
   no backend here — so a deterministic stand-in is honest about what it is. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (const ch of s) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

function stream(seed: number): () => number {
  let x = seed || 1
  return () => {
    x = (x ^ (x << 13)) >>> 0
    x = (x ^ (x >>> 17)) >>> 0
    x = (x ^ (x << 5)) >>> 0
    return x
  }
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** A base32 key in four groups of four, the way the apps ask for it typed. */
export function secretFor(id: string): string {
  const next = stream(hash(`secret:${id}`))
  const groups: string[] = []
  for (let g = 0; g < 4; g++) {
    let chunk = ''
    for (let i = 0; i < 4; i++) chunk += BASE32[next() % 32]
    groups.push(chunk)
  }
  return groups.join(' ')
}

export const QR_SIZE = 21

/* The picture of a QR code, not a QR code.

   Twenty-one modules with the three finder squares and the timing lines where a
   real version-1 code has them, and the rest filled from the method's hash. It
   will not scan — there is no secret on a server for it to carry — and drawing a
   real one would mean an encoder dependency to render a demo. The key beside it
   is the working half of the step. */
export function qrMatrix(id: string): boolean[][] {
  const n = QR_SIZE
  const next = stream(hash(`qr:${id}`))
  const m = Array.from({ length: n }, () => Array.from({ length: n }, () => (next() & 1) === 1))

  const finder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const y = top + r
        const x = left + c
        if (y < 0 || x < 0 || y >= n || x >= n) continue
        const ring = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6)
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
        m[y][x] = ring || core
      }
    }
  }
  finder(0, 0)
  finder(0, n - 7)
  finder(n - 7, 0)

  for (let i = 8; i < n - 8; i++) {
    m[6][i] = i % 2 === 0
    m[i][6] = i % 2 === 0
  }
  return m
}
