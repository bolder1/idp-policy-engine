import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Ban, ChevronDown, ChevronUp, Download, MonitorSmartphone } from 'lucide-react'
import { Button, Note } from '../kit'
import { useBrand } from '../store'
import { PlatformMark } from '../logos/PlatformMark'
import type { Platform } from '../risk-signals'
import { FilterTabs } from './page-bar'

/* The agent-based prerequisites, in six drawings to compare (owner, 16 Oct 2026:
   "give me 5 options of this, also keep this version with us … go through
   Mobbin and check some inspirations"). Every word is the live console's.

   - Note: the kit Note, the version he kept.
   - Checklist: open, three marked points, Download agent beside the heading.
   - Stripe: a blue edge down the left and a quiet tint (Okta's feature banner).
   - Strip: one line with Details and the button; the points open under it
     (Pipedrive's single-line banner).
   - Steps: numbered setup steps, the download as step one's own button.
   - Split: the words on the left, the installers listed on the right, no popup
     (1Password's "Get the apps", Asana's two-up panel).

   Download agent opens the installers panel in every drawing but Split
   (owner: "a popup with multiple download agent options for Windows, iOS,
   Android, macOS"). PREVIEW: the switch shows in the showcase build too, as a
   pending decision; set AGENT_COMPARE to false once one is picked. */

/* Off (owner, 21 Oct 2026: "they want the note one only"): the Note is the one drawn, the switch is hidden, and the other
   five stay in the code. */
const AGENT_COMPARE = false

type AgentStyle = 'note' | 'checklist' | 'stripe' | 'strip' | 'steps' | 'split'

const AGENT_STYLES: { value: AgentStyle; label: string }[] = [
  { value: 'note', label: 'Note' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'strip', label: 'Strip' },
  { value: 'steps', label: 'Steps' },
  { value: 'split', label: 'Split' },
]

const KEY = 'idp.agentNoteStyle'
const parse = (v: unknown): AgentStyle => AGENT_STYLES.find((o) => o.value === v)?.value ?? 'note'
let current: AgentStyle | null = null
const listeners = new Set<() => void>()
function read(): AgentStyle {
  if (current) return current
  try {
    current = AGENT_COMPARE ? parse(window.localStorage.getItem(KEY)) : 'note'
  } catch {
    current = 'note'
  }
  return current
}
function setStyle(v: AgentStyle) {
  current = v
  try {
    window.localStorage.setItem(KEY, v)
  } catch {
    /* This visit only. */
  }
  listeners.forEach((l) => l())
}
function useAgentStyle(): [AgentStyle, (v: AgentStyle) => void] {
  const v = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    read,
    () => 'note' as AgentStyle,
  )
  return [v, setStyle]
}

const TITLE = 'Prerequisites for enabling agent-based device restriction'
const P1 = 'All end users must install the Device Agent on their devices before accessing the application.'
const P2 =
  'Users without the Device Agent will be unable to log in and will see the following message: “Please install the miniOrange Device Agent on your device and try again.”'
const P3 = 'The Device Agent is currently supported on Windows devices only. Use the link below to download the agent.'
const POINTS = [
  { icon: Download, text: P1 },
  { icon: Ban, text: P2 },
  { icon: MonitorSmartphone, text: P3 },
]

const GROUPS: { title: string; items: { platform: Platform; name: string; file: string }[] }[] = [
  {
    title: 'Desktop',
    items: [
      { platform: 'windows', name: 'Windows', file: 'Installer (.msi)' },
      { platform: 'macos', name: 'macOS', file: 'Installer (.pkg)' },
    ],
  },
  {
    title: 'Mobile',
    items: [
      { platform: 'ios', name: 'iOS and iPadOS', file: 'App Store' },
      { platform: 'android', name: 'Android', file: 'Google Play' },
    ],
  },
]

function useGet() {
  const store = useBrand()
  return (name: string) => store.showToast(`Device Agent for ${name} download started`)
}

export function AgentPrerequisites() {
  const [style, set] = useAgentStyle()
  return (
    <div className="bagent__wrap">
      {AGENT_COMPARE && (
        <div className="bwidth bagent__switch">
          <span className="bwidth__label" aria-hidden>
            Prerequisites style
          </span>
          <FilterTabs label="Prerequisites style" value={style} options={AGENT_STYLES} onChange={set} />
        </div>
      )}
      {style === 'note' && <AsNote />}
      {style === 'checklist' && <AsChecklist />}
      {style === 'stripe' && <AsStripe />}
      {style === 'strip' && <AsStrip />}
      {style === 'steps' && <AsSteps />}
      {style === 'split' && <AsSplit />}
    </div>
  )
}

/* 1. The kit Note, as it was on 16 Oct. */
function AsNote() {
  return (
    <Note
      className="bagent__note"
      title={TITLE}
      more={
        <ul>
          <li>{P2}</li>
          <li>{P3}</li>
        </ul>
      }
      action={<AgentDownload />}
    >
      {P1}
    </Note>
  )
}

/* 2. Open checklist. */
function AsChecklist() {
  return (
    <section className="bagent" aria-labelledby="bagent-title">
      <div className="bagent__head">
        <h3 id="bagent-title">{TITLE}</h3>
        <AgentDownload />
      </div>
      <Points />
    </section>
  )
}

function Points() {
  return (
    <ul className="bagent__list">
      {POINTS.map(({ icon: Icon, text }) => (
        <li key={text}>
          <span className="bagent__mark" aria-hidden>
            <Icon size={14} strokeWidth={2} />
          </span>
          <span>{text}</span>
        </li>
      ))}
    </ul>
  )
}

/* 3. Blue edge, quiet tint. */
function AsStripe() {
  return (
    <section className="bagent-stripe" aria-labelledby="bagent-stripe-title">
      <div className="bagent__head">
        <h3 id="bagent-stripe-title">{TITLE}</h3>
        <AgentDownload />
      </div>
      <ul className="bagent-stripe__list">
        <li>{P1}</li>
        <li>{P2}</li>
        <li>{P3}</li>
      </ul>
    </section>
  )
}

/* 4. One line, the points behind Details. */
function AsStrip() {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  return (
    <section className="bagent-strip" aria-label={TITLE}>
      <div className="bagent-strip__row">
        <span className="bagent-strip__text">
          <strong>Device Agent required.</strong> {P1}
        </span>
        <button type="button" className="bagent__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide details' : 'Details'}
          {open ? <ChevronUp size={14} strokeWidth={2} aria-hidden /> : <ChevronDown size={14} strokeWidth={2} aria-hidden />}
        </button>
        <AgentDownload />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="bagent-strip__more"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
          >
            <ul>
              <li>{P2}</li>
              <li>{P3}</li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/* 5. Setup steps. */
function AsSteps() {
  return (
    <section className="bagent-steps" aria-labelledby="bagent-steps-title">
      <h3 id="bagent-steps-title">{TITLE}</h3>
      <ol>
        <li>
          <span className="bagent-steps__n" aria-hidden>
            1
          </span>
          <div className="bagent-steps__body">
            <span>{P1}</span>
            <AgentDownload />
          </div>
        </li>
        <li>
          <span className="bagent-steps__n" aria-hidden>
            2
          </span>
          <div className="bagent-steps__body">
            <span>{P2}</span>
          </div>
        </li>
        <li>
          <span className="bagent-steps__n" aria-hidden>
            3
          </span>
          <div className="bagent-steps__body">
            <span>{P3}</span>
          </div>
        </li>
      </ol>
    </section>
  )
}

/* 6. Words left, installers right. */
function AsSplit() {
  const get = useGet()
  return (
    <section className="bagent-split" aria-labelledby="bagent-split-title">
      <div className="bagent-split__words">
        <h3 id="bagent-split-title">{TITLE}</h3>
        <ul>
          <li>{P1}</li>
          <li>{P2}</li>
          <li>{P3}</li>
        </ul>
      </div>
      <div className="bagent-split__get">
        <p className="bagent__grouphead">Download the Device Agent</p>
        <ul>
          {GROUPS.flatMap((g) => g.items).map((it) => (
            <li key={it.platform}>
              <Installer platform={it.platform} name={it.name} file={it.file} onGet={() => get(it.name)} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Installer({ platform, name, file, onGet }: { platform: Platform; name: string; file: string; onGet: () => void }) {
  return (
    <button type="button" className="bagent__item" onClick={onGet}>
      <span className="bagent__os" aria-hidden>
        <PlatformMark platform={platform} size={16} />
      </span>
      <span className="bagent__itemtext">
        <strong>{name}</strong>
        <span>{file}</span>
      </span>
      <Download size={14} strokeWidth={2} aria-hidden className="bagent__itemdl" />
    </button>
  )
}

/* The installers panel, anchored under the button. */
function AgentDownload(): ReactNode {
  const get = useGet()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)
  const reduce = useReducedMotion()
  /* Where the panel goes, measured when it opens (owner, 23 Oct 2026: "fix this, half of it I can't even see"). It was
     absolute and right-aligned under a button near the left of the page, so its left half ran under the sidebar and
     the page column's overflow. Fixed, it is clipped by neither: right-aligned to the button when there is room, else
     left-aligned to it, and never past the page column's own left edge or the window's right. */
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) {
      setAt(null)
      return
    }
    const b = wrap.current?.getBoundingClientRect()
    if (!b) return
    const W = Math.min(420, window.innerWidth - 40)
    const floor = (wrap.current?.closest('main')?.getBoundingClientRect().left ?? 0) + 8
    let left = b.right - W
    if (left < floor) left = b.left
    left = Math.max(floor, Math.min(left, window.innerWidth - W - 8))
    setAt({ top: b.bottom + 8, left })
  }, [open])

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      wrap.current?.querySelector<HTMLButtonElement>('.bagent__trigger button')?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <div className="bagent__dl" ref={wrap}>
      <span className="bagent__trigger">
        <Button variant="secondary" size="sm" icon={Download} expanded={open} onClick={() => setOpen((o) => !o)}>
          Download agent
        </Button>
      </span>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Download the Device Agent"
            className="bagent__pop"
            style={at ? { position: 'fixed', top: at.top, left: at.left, right: 'auto' } : { visibility: 'hidden' }}
            initial={{ opacity: 0, y: reduce ? 0 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -4 }}
            transition={{ duration: reduce ? 0 : 0.14, ease: [0.2, 0, 0, 1] }}
          >
            <p className="bagent__poptitle">Download the Device Agent</p>
            <div className="bagent__groups">
              {GROUPS.map((g) => (
                <div key={g.title} className="bagent__group">
                  <p className="bagent__grouphead">{g.title}</p>
                  <ul>
                    {g.items.map((it) => (
                      <li key={it.platform}>
                        <Installer
                          platform={it.platform}
                          name={it.name}
                          file={it.file}
                          onGet={() => {
                            setOpen(false)
                            get(it.name)
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
