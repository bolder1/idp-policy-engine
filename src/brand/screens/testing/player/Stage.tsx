import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'

import { Browser } from './Browser'
import { FingerprintReader, SecurityKey, SmartCard, TokenFob } from './Hardware'
import { MailToast } from './MailToast'
import { Phone } from './Phone'
import { EASE_OUT, usePlay } from './play-state'
import type { Device, Scene } from './script'

/* -----------------------------------------------------------------------------
   One scene, drawn: the browser across the whole stage, whatever is in
   front of it on the right, and the mail over the top. A phone or a key
   slides in over the browser's right part, as one held up to a screen
   would, and the sign-in card steps aside just enough to stay in view.

   The room it keeps is worked out in player.css, from the sizes it draws
   the device at — so a narrow section can draw a smaller phone and the
   card still clears it. The stage names the device (`has-phone`…), and
   keeps naming it while the device leaves, so the room closes as smoothly
   as it opened; motion animates only how far in the device is (`--tp-in`,
   0 to 1, on the browser's view).
   -------------------------------------------------------------------------- */

export function Stage({
  appId,
  appName,
  person,
  scene,
  pageKey,
}: {
  appId: string
  appName: string
  person: { name: string; email: string } | null
  scene: Scene
  pageKey: string
}) {
  const { reduced } = usePlay()
  const d = scene.device
  /* The last device in front, still named while it slides away. */
  const [kind, setKind] = useState<Device['kind'] | null>(d?.kind ?? null)
  if (d && d.kind !== kind) setKind(d.kind)
  return (
    <div className={`tpstage${kind ? ` has-${kind}` : ''}`}>
      <Browser appId={appId} appName={appName} person={person} page={scene.page} sheet={scene.sheet} pageKey={pageKey} covered={d !== null} />
      <AnimatePresence initial={false}>
        {d && (
          <motion.div
            key={d.kind}
            className={`tpdev is-${d.kind}`}
            initial={reduced ? false : { opacity: 0, x: 56 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0, x: 56 }}
            transition={{ duration: reduced ? 0 : 0.4, ease: EASE_OUT }}
          >
            <DeviceView device={d} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>{scene.toast && <MailToast key="mail" toast={scene.toast} />}</AnimatePresence>
    </div>
  )
}

function DeviceView({ device }: { device: Device }) {
  switch (device.kind) {
    case 'phone':
      return <Phone screen={device.screen} />
    case 'token':
      return <TokenFob label={device.label} code={device.code} />
    case 'key':
      return <SecurityKey touched={device.touched} />
    case 'card':
      return <SmartCard inserted={device.inserted} person={device.person} />
    case 'reader':
      return <FingerprintReader read={device.read} />
  }
}
