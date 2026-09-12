import { useId, useMemo } from 'react'
import { Copy, ExternalLink, Plus } from 'lucide-react'

import { Button, Callout, IconButton } from '../kit'
import type { AuthMethod } from '../methods'
import { Picker } from '../picker'
import { QR_SIZE, qrMatrix, secretFor, type NpsServer, type SetupCard } from '../setup-guide'
import { useBrand } from '../store'

/* -----------------------------------------------------------------------------
   The setup card an authenticator app opens onto, as a page in the slider.

   One card each, holding the one step's worth of controls the console asks for
   and nothing more: a code app's install, scan and code, or Microsoft Push's
   server. The console opened the second as a centred dialog over the list; here
   it is the same page every other setup is, with Back to the family under it.
   -------------------------------------------------------------------------- */

type AppCard = Extract<SetupCard, { kind: 'app' }>

export function AppSetupCard({
  method,
  card,
  passcode,
  onPasscode,
}: {
  method: AuthMethod
  card: AppCard
  passcode: string
  onPasscode: (v: string) => void
}) {
  const store = useBrand()
  const uid = useId()
  const secret = secretFor(method.id)

  /* Copied without the spaces. They are there so a person can read the key in
     fours; an app it is pasted into wants it whole. */
  const copy = () => {
    const failed = () => store.showToast('Could not copy the key — select it instead')
    if (!navigator.clipboard) return failed()
    navigator.clipboard.writeText(secret.replace(/\s/g, '')).then(() => store.showToast('Key copied'), failed)
  }

  return (
    <section className="bm8__setcard" aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`} className="bm8__setcardtitle">
        Setup
      </h3>

      {/* Numbered because the order is the instruction: nothing scans before the
          app is installed, and there is no code to enter before it has scanned. */}
      <ol className="bm8__steps">
        <li className="bm8__step">
          <span className="bm8__stepn" aria-hidden>
            1
          </span>
          <div className="bm8__stepbody">
            <p>Install {card.app} on your phone.</p>
            <div className="bm8__stores">
              <a className="bm8__store" href={card.android} target="_blank" rel="noreferrer">
                Google Play
                <ExternalLink size={12} strokeWidth={2} aria-hidden />
              </a>
              <a className="bm8__store" href={card.ios} target="_blank" rel="noreferrer">
                App Store
                <ExternalLink size={12} strokeWidth={2} aria-hidden />
              </a>
            </div>
          </div>
        </li>

        <li className="bm8__step">
          <span className="bm8__stepn" aria-hidden>
            2
          </span>
          <div className="bm8__stepbody">
            <p>Scan this code with {card.app}, or type the key.</p>
            {/* The key beside the code rather than behind an "or": they are the
                same secret, and a phone that cannot scan is common enough that
                the typed half should not be the afterthought. */}
            <div className="bm8__scan">
              <QrPicture id={method.id} label={`QR code to scan with ${card.app}`} />
              <div className="bm8__key">
                <span className="bm8__keylabel">Key</span>
                <span className="bm8__keyrow">
                  <code>{secret}</code>
                  <IconButton icon={Copy} label="Copy key" size="sm" tone="ghost" onClick={copy} />
                </span>
              </div>
            </div>
          </div>
        </li>

        <li className="bm8__step">
          <span className="bm8__stepn" aria-hidden>
            3
          </span>
          <div className="bm8__stepbody">
            <label htmlFor={`${uid}-code`}>Enter the 6-digit code {card.app} shows.</label>
            {/* The setup form's own input, so this field and a field on the RSA
                form are one control. Digits only, and never more than six —
                the one mistake worth stopping at the keyboard. */}
            <div className="bmc__control bm8__codefield">
              <input
                id={`${uid}-code`}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={passcode}
                onChange={(e) => onPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
          </div>
        </li>
      </ol>
    </section>
  )
}

export function NpsSetupCard({
  servers,
  value,
  onChange,
}: {
  servers: NpsServer[]
  value: string
  onChange: (id: string) => void
}) {
  const store = useBrand()
  const uid = useId()
  /* Adding a server is its own screen in the console, and outside this revamp. */
  const add = () => store.showToast('Adding an Azure NPS server is outside the scope of this revamp')

  return (
    <section className="bm8__setcard" aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`} className="bm8__setcardtitle">
        Setup
      </h3>

      <div className="bm8__stepbody">
        <p className="bm8__setcardlabel">Azure NPS server</p>
        <p>Microsoft Push sends its approval requests through this server.</p>

        {/* The console's first state, kept: with nothing configured there is
            nothing to choose, so the step says so and offers the way to fix it,
            rather than a dropdown holding only "None". */}
        {servers.length > 0 ? (
          <Picker
            label="Azure NPS server"
            value={value || null}
            placeholder="Choose a server"
            size="md"
            width="fill"
            options={servers.map((s) => ({ value: s.id, label: s.name, meta: s.host }))}
            onChange={onChange}
            /* In the list it adds to, where the console had a link under the
               dialog. */
            footer={
              <>
                <Plus size={13} strokeWidth={2} aria-hidden />
                Add an Azure NPS server
              </>
            }
            onFooter={add}
          />
        ) : (
          <>
            <Callout tone="notice" title="No Azure NPS server is configured">
              Microsoft Push cannot send until one is added.
            </Callout>
            <div>
              <Button variant="secondary" size="sm" icon={Plus} onClick={add}>
                Add an Azure NPS server
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/* The picture of a QR code — see `qrMatrix` for why it is only a picture. One
   path rather than four hundred rectangles. */
function QrPicture({ id, label }: { id: string; label: string }) {
  const d = useMemo(() => {
    let out = ''
    qrMatrix(id).forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) out += `M${x} ${y}h1v1h-1z`
      }),
    )
    return out
  }, [id])

  return (
    <svg
      className="bm8__qr"
      viewBox={`-2 -2 ${QR_SIZE + 4} ${QR_SIZE + 4}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <path d={d} fill="currentColor" />
    </svg>
  )
}
