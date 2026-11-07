import { useState } from 'react'
import { Layers, ScanSearch, ShieldCheck, Shapes } from 'lucide-react'
import { Button, Modal } from '../kit'
import { useBrand } from '../store'
import { MIGRATION_FIRST } from './phase'
import './home-hub.css'

/* The first visit to the new builder (owner, 4 Nov 2026; Employment Hero's "the new version is here", WhatsApp's intro
   sheet): once per browser, while old policies are still to move. Three plain facts, a row each, and two buttons:
   Start exploring closes it, See what's new plays the intro. Never at the same time as the intro.
   Remembered in localStorage (a per-viewer convenience); a blocked store just shows it again next visit. */

const KEY = 'idp.policyBuilder.welcomed'
const seen = () => {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
const remember = () => {
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    /* Private mode or blocked storage: it shows again next time, nothing breaks. */
  }
}

export function FirstVisit() {
  const store = useBrand()
  const unmoved = store.legacy.policies.some((lp) => !store.movedLegacy[lp.id])
  /* Migration first (phase.ts): the intro and the tour already say it, so the welcome stays away. */
  const [open, setOpen] = useState(() => !MIGRATION_FIRST && unmoved && !seen())
  const close = () => {
    remember()
    setOpen(false)
  }
  return (
    <Modal
      open={open && !store.intro}
      onClose={close}
      title="Welcome to the new Policy builder"
      width={520}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              close()
              store.openIntro('learn')
            }}
          >
            See what’s new
          </Button>
          <Button variant="brand" onClick={close}>
            Start exploring
          </Button>
        </>
      }
    >
      <div className="bfv">
        <span className="bfv__mark" aria-hidden>
          <Layers size={24} strokeWidth={1.8} />
        </span>
        <ul className="bfv__rows">
          <li>
            <ShieldCheck size={18} strokeWidth={1.9} aria-hidden />
            <span>
              <b>One policy per application</b>
              App Login and Adaptive Access settings live together as rules.
            </span>
          </li>
          <li>
            <Shapes size={18} strokeWidth={1.9} aria-hidden />
            <span>
              <b>Pieces you reuse</b>
              Zones, device profiles and risk signals, built once and used in any rule.
            </span>
          </li>
          <li>
            <ScanSearch size={18} strokeWidth={1.9} aria-hidden />
            <span>
              <b>Check before it decides</b>
              Your old policies keep deciding until you move them and make the new ones active.
            </span>
          </li>
        </ul>
      </div>
    </Modal>
  )
}
