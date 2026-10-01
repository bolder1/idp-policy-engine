import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Download, FileBadge, FileText, Info, Plus, Replace, Trash2, Upload, X } from 'lucide-react'

import { EmptyState } from '../empty'
import { Badge, Button, Drawer, IconButton, RowMenu, TipDot, type MenuItem } from '../kit'
import {
  ALIAS_MAX,
  CA_FILE_ACCEPT,
  CA_STATUS_LABEL,
  caDate,
  canUpload,
  certsSaid,
  chainFrom,
  chainStatus,
  daysLeft,
  expiresSoon,
  pendingFiles,
  planUpload,
  replaceChainFile,
  uploadedSaid,
  uploadedWhen,
  type CaChain,
  type CaChainStatus,
  type PendingCaFile,
} from './ca-chain'
import { useCaChains } from './ca-chains'

/* CAC Card's trusted CA chains, as a slider (owner, 21 Sep 2026: "on click a
   Slider should open with this exact content"; 30 Sep: "this upload can be
   multiple … add a list view of all uploaded files").

   Two pages in one panel, the way the method sliders on this screen push and
   pop: the tenant's chains, and Add CA chain over them. The add page keeps the
   live dialog's words — its title, caption, Alias, the certificate file, the
   support note — and takes one file or many; each file becomes a row with its
   own alias and its own error. See ca-chain.ts for the model and ca-chains.ts
   for the session's list. */

type Page = 'list' | 'add'

const PAGE_EASE: [number, number, number, number] = [0.2, 0, 0, 1]

const STATUS_TONE: Record<CaChainStatus, 'positive' | 'notice' | 'negative'> = {
  enabled: 'positive',
  waiting: 'notice',
  expired: 'negative',
}

const MENU: MenuItem[] = [
  { id: 'replace', label: 'Replace file', icon: Replace },
  { id: 'download', label: 'Download', icon: Download },
  { id: 'delete', label: 'Delete', icon: Trash2, danger: true, divide: true },
]

/* The live dialog's words for one file; the same note for several. */
const supportNote = (many: boolean) =>
  `After successful upload, contact miniOrange support to enable ${many ? 'these CA chains' : 'this CA chain'} for authentication.`

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')

/* What the last action did, said in the slider's own footer beside Done rather
   than in the app's toast. The toast sits outside this panel, where Tab never
   goes while the panel is open, and top right, which is where this panel draws
   its first row. Here Undo is inside the panel, reachable by keyboard, and
   covers nothing. It stays until the next action: nothing times out. */
interface Said {
  id: number
  text: string
  undo?: () => void
}

/* Where focus lands once the page has redrawn. The control that had it is
   gone by then, or on another page. */
type FocusTo = { row: number } | { id: string } | 'add'

/* Read here and nowhere else: nothing is sent anywhere. */
const readAll = (files: readonly File[]) =>
  Promise.all(
    files.map((f) =>
      f.text().then(
        (text) => ({ name: f.name, text, unread: false }),
        () => ({ name: f.name, text: '', unread: true }),
      ),
    ),
  )

function download(c: CaChain) {
  const url = URL.createObjectURL(new Blob([c.pem], { type: 'application/x-pem-file' }))
  const a = document.createElement('a')
  a.href = url
  a.download = c.fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  /* Not on the next tick: Firefox can still be starting the download then. */
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function CaChainDrawer({
  open,
  onClose,
  by,
}: {
  open: boolean
  onClose: () => void
  /** Who is signed in: the name a new or replaced chain is uploaded by. */
  by: string
}) {
  const uid = useId()
  const reduce = useReducedMotion()
  const [chains, setChains] = useCaChains()

  const [page, setPage] = useState<Page>('list')
  const [dir, setDir] = useState(1)
  const [pending, setPending] = useState<PendingCaFile[]>([])
  /* Upload has been pressed: every error on the page shows from then on. Before
     it, an alias says what is wrong only once it has been edited. */
  const [tried, setTried] = useState(false)
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [dragging, setDragging] = useState(false)
  /* Replace file's error, under the row it was for. */
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null)
  /* The rows Upload just added, marked for a moment so the eye finds them. */
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set())
  const [said, setSaid] = useState<Said | null>(null)
  const saidSeq = useRef(0)
  const say = (text: string, undo?: () => void) => setSaid({ id: ++saidSeq.current, text, undo })

  const seq = useRef(0)
  const nextKey = () => `${uid}-f${++seq.current}`
  const picker = useRef<HTMLInputElement>(null)
  const replacer = useRef<HTMLInputElement>(null)
  const replacing = useRef<string | null>(null)
  const drop = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const addRef = useRef<HTMLSpanElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  /* A row's ⋯ after a delete or an upload — the row that took the deleted
     one's place, or the first new one; the row itself after an Undo; and Add
     CA chain on coming back from the add page, or when the list has emptied. */
  const [focusNext, setFocusNext] = useState<FocusTo | null>(null)
  useEffect(() => {
    if (!focusNext) return
    const menus = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]') ?? [])
    const row =
      focusNext === 'add'
        ? undefined
        : 'id' in focusNext
          ? listRef.current?.querySelector<HTMLButtonElement>(`[data-chain="${CSS.escape(focusNext.id)}"] button[aria-haspopup="menu"]`)
          : menus[Math.min(focusNext.row, menus.length - 1)]
    ;(row ?? addRef.current?.querySelector('button'))?.focus()
    setFocusNext(null)
  }, [focusNext])

  /* The list every time it opens. Reset on opening rather than on closing, so
     the slider keeps its page while it slides out. */
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setPage('list')
      setPending([])
      setTried(false)
      setTouched(new Set())
      setRowError(null)
      setFresh(new Set())
      setSaid(null)
    }
  }

  const clearAdd = () => {
    setPending([])
    setTried(false)
    setTouched(new Set())
  }
  const toAdd = () => {
    setDir(1)
    setRowError(null)
    setSaid(null)
    setPage('add')
  }
  const toList = () => {
    setDir(-1)
    clearAdd()
    setPage('list')
  }
  /* Back by ← CA chains, Cancel, Esc, × or the scrim: one page, not the whole
     slider, and focus goes back to the button that opened the page. */
  const back = () => {
    toList()
    setFocusNext('add')
  }

  /* Each page starts at its top. The two share one scroller, so without this
     the list came back as far down as the add page had been scrolled. */
  useLayoutEffect(() => {
    const scroller = bodyRef.current?.closest('.bx-drawer__body')
    if (scroller) scroller.scrollTop = 0
  }, [page])

  /* The drop zone takes focus when the add page arrives: there is nothing else
     to do there until a file is in. */
  useEffect(() => {
    if (open && page === 'add') drop.current?.focus()
  }, [open, page])

  /* The fresh mark fades on its own; the state goes once it has. */
  useEffect(() => {
    if (fresh.size === 0) return
    const t = window.setTimeout(() => setFresh(new Set()), 2400)
    return () => window.clearTimeout(t)
  }, [fresh])

  const addFiles = (list: FileList | null | undefined) => {
    const files = Array.from(list ?? [])
    if (files.length === 0) return
    readAll(files).then((read) => {
      setPending((was) => {
        const taken = [...chains.map((c) => c.alias), ...was.map((p) => p.alias)]
        const rows = pendingFiles(read, taken, new Date(), nextKey).map((p, i) =>
          read[i].unread ? { ...p, alias: '', certs: [], issue: 'The file could not be read.' } : p,
        )
        return [...was, ...rows]
      })
    })
  }

  /* A file dropped anywhere on the slider — its head and Add CA chain, the
     footer, the padding — not only on the drop zone: on the list it opens Add
     with the files in. Anywhere else while the slider is open the drop is
     refused, so the browser never opens a file in place of the console. */
  const dropped = useEffectEvent((files: FileList) => {
    if (page === 'list') toAdd()
    addFiles(files)
  })
  useEffect(() => {
    if (!open) return
    const inPanel = (e: DragEvent) => {
      const panel = bodyRef.current?.closest('.bx-drawer')
      return !!panel && e.target instanceof Node && panel.contains(e.target)
    }
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      const inside = inPanel(e)
      if (e.dataTransfer) e.dataTransfer.dropEffect = inside ? 'copy' : 'none'
      setDragging(inside)
    }
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragging(false)
      if (inPanel(e) && e.dataTransfer) dropped(e.dataTransfer.files)
    }
    const end = () => setDragging(false)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    window.addEventListener('dragend', end)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      window.removeEventListener('dragend', end)
      setDragging(false)
    }
  }, [open])

  const existing = chains.map((c) => c.alias)
  const plan = planUpload(pending, existing)

  const upload = () => {
    setTried(true)
    if (!canUpload(plan)) {
      /* To the first thing to fix. */
      const bad = plan.ready.find((p) => plan.aliasErrors[p.key])
      if (bad) document.getElementById(`${bad.key}-alias`)?.focus()
      else drop.current?.focus()
      return
    }
    const now = new Date()
    const added = plan.ready.map((p) => chainFrom(p, by, now, `ca-${p.key}`))
    setChains((was) => [...added, ...was])
    setFresh(new Set(added.map((c) => c.id)))
    toList()
    say(uploadedSaid(added.length, plan.skipped))
    setFocusNext({ row: 0 })
  }

  const remove = (key: string) => {
    setPending((was) => was.filter((p) => p.key !== key))
    drop.current?.focus()
  }
  const rename = (key: string, alias: string) => {
    setPending((was) => was.map((p) => (p.key === key ? { ...p, alias } : p)))
    setTouched((was) => new Set(was).add(key))
  }

  /* --- Row actions ------------------------------------------------------------ */

  const del = (c: CaChain) => {
    const at = chains.findIndex((x) => x.id === c.id)
    setChains((was) => was.filter((x) => x.id !== c.id))
    setFocusNext({ row: at })
    if (rowError?.id === c.id) setRowError(null)
    say(`${c.alias} deleted`, () => {
      setChains((was) => {
        if (was.some((x) => x.id === c.id)) return was
        const next = [...was]
        next.splice(Math.min(at, next.length), 0, c)
        return next
      })
      say(`${c.alias} restored`)
      setFocusNext({ id: c.id })
    })
  }

  const replace = (list: FileList | null) => {
    const id = replacing.current
    replacing.current = null
    const f = list?.[0]
    const was = chains.find((c) => c.id === id)
    if (!f || !was) return
    f.text().then(
      (text) => {
        const r = replaceChainFile(was, { name: f.name, text }, by, new Date())
        if (r.issue !== null) {
          setRowError({ id: was.id, text: `Not replaced. ${r.issue}` })
          return
        }
        setRowError(null)
        setChains((all) => all.map((c) => (c.id === was.id ? r.chain : c)))
        setFresh(new Set([was.id]))
        say(`${was.alias} file replaced`, () => {
          setChains((all) => all.map((c) => (c.id === was.id ? was : c)))
          say(`${was.alias} restored`)
          setFocusNext({ id: was.id })
        })
      },
      () => setRowError({ id: was.id, text: 'Not replaced. The file could not be read.' }),
    )
  }

  const onMenu = (c: CaChain, id: string) => {
    if (id === 'download') download(c)
    else if (id === 'delete') del(c)
    else if (id === 'replace') {
      replacing.current = c.id
      replacer.current?.click()
    }
  }

  /* --- Pages ------------------------------------------------------------------- */

  const slide = {
    initial: { opacity: 0, x: reduce ? 0 : 24 * dir },
    animate: { opacity: 1, x: 0 },
    transition: { duration: reduce ? 0 : 0.2, ease: PAGE_EASE },
  }
  const now = new Date()

  const head =
    page === 'list' ? (
      <motion.div key="list" className="bm8__cahead" {...slide}>
        <div className="bm8__catitle">
          <h2>CA chains</h2>
          <TipDot
            label="About CA chains"
            text="The root CAs and certificate chains a CAC/PIV card's certificate is checked against. miniOrange support enables each one after it is uploaded."
          />
        </div>
        {/* Once, in the head; the empty state carries it when there is no list. */}
        {chains.length > 0 && (
          <span ref={addRef} className="bm8__caaddbtn">
            <Button variant="secondary" size="sm" icon={Plus} onClick={toAdd}>
              Add CA chain
            </Button>
          </span>
        )}
      </motion.div>
    ) : (
      <motion.div key="add" className="bm8__dwstack" {...slide}>
        <button type="button" className="bm8__back" onClick={back}>
          <ArrowLeft size={14} strokeWidth={2} aria-hidden />
          CA chains
        </button>
        <div className="bm8__caaddhead">
          <h2>Add trusted CA or certificate chain (.pem format)</h2>
          <p>Upload a PEM-formatted root CA or certificate chain to establish trust for CAC/PIV authentication for users.</p>
        </div>
      </motion.div>
    )

  const list =
    chains.length === 0 ? (
      <EmptyState
        compact
        icon={FileBadge}
        title="No CA chains yet"
        blurb="Add a root CA or certificate chain to check CAC/PIV cards against."
        action={
          /* Secondary, so Done stays the one orange. */
          <span ref={addRef} className="bm8__caaddbtn">
            <Button variant="secondary" icon={Plus} onClick={toAdd}>
              Add CA chain
            </Button>
          </span>
        }
      />
    ) : (
      <ul ref={listRef} className="bm8__calist" aria-label="CA chains">
        {chains.map((c) => {
          const status = chainStatus(c, now)
          const soon = status !== 'expired' && expiresSoon(c, now)
          const left = daysLeft(c, now)
          const err = rowError?.id === c.id ? rowError.text : null
          return (
            <li key={c.id} data-chain={c.id} className={`bm8__carow${fresh.has(c.id) ? ' is-fresh' : ''}`}>
              <span className="bm8__catile" aria-hidden>
                <FileBadge size={16} strokeWidth={1.8} />
              </span>
              <div className="bm8__camain">
                <div className="bm8__catop">
                  <span className="bm8__caname" title={c.alias}>
                    {c.alias}
                  </span>
                  <Badge tone={STATUS_TONE[status]}>{CA_STATUS_LABEL[status]}</Badge>
                </div>
                <span className="bm8__cameta">
                  <span className="bm8__cacn" title={c.subject}>
                    {c.subject}
                  </span>
                  <span>{certsSaid(c.certCount)}</span>
                  {/* Past tense once it has passed. The status says it in red, so the date does not again. */}
                  <span
                    className={`bm8__cadate${soon ? ' is-soon' : ''}`}
                    title={soon ? `Valid until ${caDate(c.validUntil)}` : undefined}
                  >
                    {status === 'expired'
                      ? `Expired ${caDate(c.validUntil)}`
                      : soon
                        ? `Expires in ${left} ${left === 1 ? 'day' : 'days'}`
                        : `Valid until ${caDate(c.validUntil)}`}
                  </span>
                </span>
                <span className="bm8__cameta">
                  <span className="bm8__cafile" title={c.fileName}>
                    {c.fileName}
                  </span>
                  <span>
                    {c.uploadedBy}, {uploadedWhen(c.uploadedAt, now)}
                  </span>
                </span>
                {err && (
                  <p className="bmc__error" role="alert">
                    {err}
                  </p>
                )}
              </div>
              <RowMenu label={`Actions for ${c.alias}`} items={MENU} onSelect={(id) => onMenu(c, id)} />
            </li>
          )
        })}
      </ul>
    )

  const blockerShown = tried && plan.blocker
  const add = (
    <div className="bm8__caadd">
      <button
        ref={drop}
        type="button"
        className={`bm8__cadrop${dragging ? ' is-over' : ''}${pending.length ? ' is-compact' : ''}`}
        aria-describedby={blockerShown ? `${uid}-drop-err` : undefined}
        onClick={() => picker.current?.click()}
      >
        <Upload size={18} strokeWidth={1.8} aria-hidden />
        <span className="bm8__cadroptext">{pending.length ? 'Add more files' : 'Choose files or drop them here'}</span>
        <span className="bm8__cadrophint">.pem, .crt or .cer</span>
      </button>
      {blockerShown && (
        <p id={`${uid}-drop-err`} className="bmc__error" role="alert">
          {plan.blocker}
        </p>
      )}

      {pending.length > 0 && (
        <ul className="bm8__capend" aria-label="Files to upload">
          {pending.map((p) => {
            const aliasErr = (tried || touched.has(p.key)) && plan.aliasErrors[p.key]
            return (
              <li key={p.key} className={`bm8__capf${p.issue ? ' is-bad' : ''}`}>
                <span className="bm8__catile" aria-hidden>
                  <FileText size={16} strokeWidth={1.8} />
                </span>
                <div className="bm8__capfmain">
                  <span className="bm8__caname" title={p.fileName}>
                    {p.fileName}
                  </span>
                  {p.issue ? (
                    <p className="bmc__error">{p.issue}</p>
                  ) : (
                    <>
                      <span className="bm8__cameta">
                        <span className="bm8__cacn" title={p.certs[0]?.subject}>
                          {p.certs[0]?.subject}
                        </span>
                        <span>{certsSaid(p.certs.length)}</span>
                      </span>
                      <div className="bmc__field is-text bm8__capfalias">
                        <div className="bmc__label">
                          <label htmlFor={`${p.key}-alias`}>
                            Alias
                            <b aria-hidden title="Required">
                              *
                            </b>
                          </label>
                        </div>
                        <div className="bmc__control">
                          <input
                            id={`${p.key}-alias`}
                            type="text"
                            value={p.alias}
                            placeholder="Enter an alias for this certificate"
                            autoComplete="off"
                            maxLength={ALIAS_MAX}
                            aria-required
                            aria-invalid={!!aliasErr}
                            aria-describedby={aliasErr ? `${p.key}-alias-err` : undefined}
                            onChange={(e) => rename(p.key, e.target.value)}
                          />
                        </div>
                        {aliasErr && (
                          <p id={`${p.key}-alias-err`} className="bmc__error">
                            {aliasErr}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <IconButton icon={X} size="sm" tone="ghost" label={`Remove ${p.fileName}`} onClick={() => remove(p.key)} />
              </li>
            )
          })}
        </ul>
      )}

      <p className="bm8__canote">
        <Info size={14} strokeWidth={2} aria-hidden />
        {supportNote(plan.ready.length > 1)}
      </p>
    </div>
  )

  return (
    <Drawer
      open={open}
      /* Esc, × and the scrim close the list; on the add page they go back to
         it, like Cancel, so chosen files are never thrown away with the panel. */
      onClose={page === 'add' ? back : onClose}
      /* The page's slider width — the same 560 the method sliders open at. */
      width={560}
      title={page === 'list' ? 'CA chains' : 'Add trusted CA or certificate chain (.pem format)'}
      head={head}
      actions={
        page === 'list' ? (
          <>
            {said && (
              <p className="bm8__casaid">
                {/* Said by the live region in the body; the Undo is a real control. */}
                <span className="bm8__casaidtext" title={said.text} aria-hidden>
                  {said.text}
                </span>
                {said.undo && (
                  <Button variant="ghost" size="sm" onClick={said.undo}>
                    Undo
                  </Button>
                )}
              </p>
            )}
            <Button variant="brand" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={back}>
              Cancel
            </Button>
            <Button variant="brand" onClick={upload}>
              Upload
            </Button>
          </>
        )
      }
    >
      {/* The files go into these two inputs and no further. Hidden from view
          and from the keyboard: the drop zone and Replace file are the
          controls, and each says what it does. */}
      <input
        ref={picker}
        type="file"
        multiple
        accept={CA_FILE_ACCEPT}
        className="u-sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          addFiles(e.currentTarget.files)
          e.currentTarget.value = ''
        }}
      />
      <input
        ref={replacer}
        type="file"
        accept={CA_FILE_ACCEPT}
        className="u-sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          replace(e.currentTarget.files)
          e.currentTarget.value = ''
        }}
      />
      {/* Mounted for as long as the slider is, so every change is announced. */}
      <div className="u-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {said && <span key={said.id}>{said.text}</span>}
      </div>
      <div ref={bodyRef} className={`bm8__cabody${dragging && page === 'list' ? ' is-over' : ''}`}>
        <motion.div key={page} {...slide}>
          {page === 'list' ? list : add}
        </motion.div>
      </div>
    </Drawer>
  )
}
