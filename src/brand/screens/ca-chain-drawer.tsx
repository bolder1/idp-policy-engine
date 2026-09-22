import { useId, useRef, useState } from 'react'

import { Button, Callout, Drawer } from '../kit'
import { CA_FILE_ACCEPT, caFileIssue, caUploadBlocker } from './ca-chain'

/* CAC Card's Upload CA chain, as a slider (owner, 21 Sep 2026: "on click a
   Slider should open with this exact content"). The words are the live
   dialog's, in the console's sentence case. See ca-chain.ts for the model.

   The fields use the setup form's own classes (method-forms.css) — label over
   field, a red asterisk on the required ones — so this reads as the same form
   the Configure slider on this page shows, not a new one. */
export function CaChainDrawer({
  open,
  onClose,
  onUpload,
}: {
  open: boolean
  onClose: () => void
  /** Upload pressed with both fields filled. The file has only been read in the browser. */
  onUpload: (alias: string, fileName: string) => void
}) {
  const uid = useId()
  const input = useRef<HTMLInputElement>(null)
  const [alias, setAlias] = useState('')
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  /* Blank every time it opens. Reset on opening rather than on closing, so the
     slider keeps its words while it slides out. */
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setAlias('')
      setFile(null)
      setFileError(null)
    }
  }

  /* Read here and nowhere else: nothing is sent anywhere. A file that is not a
     PEM certificate is refused as it is chosen, not when Upload is pressed.

     The input keeps a file it accepted, so what a screen reader hears on it is
     the name on screen. Only a refused file is cleared from it — the input then
     agrees with "No file chosen", and the same file can be picked again once it
     is fixed. A pick that comes back empty empties the field too. */
  const read = (el: HTMLInputElement) => {
    const f = el.files?.[0]
    if (!f) {
      setFile(null)
      setFileError(null)
      return
    }
    /* A read that finishes after a newer pick is dropped, not applied. */
    const stale = () => el.files?.[0] !== f
    const refuse = (issue: string) => {
      if (stale()) return
      el.value = ''
      setFile(null)
      setFileError(issue)
    }
    f.text().then(
      (text) => {
        const issue = caFileIssue(f.name, text)
        if (issue) refuse(issue)
        else if (!stale()) {
          setFile({ name: f.name, text })
          setFileError(null)
        }
      },
      () => refuse('The file could not be read.'),
    )
  }

  const blocker = caUploadBlocker(alias, file?.name ?? null)
  const upload = () => {
    if (blocker || !file) return
    onUpload(alias.trim(), file.name)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      /* The page's slider width — the same 560 the method sliders open at. */
      width={560}
      title="Add trusted CA or certificate chain (.pem format)"
      caption="Upload a PEM-formatted root CA or certificate chain to establish trust for CAC/PIV authentication for users."
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!!blocker} title={blocker ?? undefined} onClick={upload}>
            Upload
          </Button>
        </>
      }
    >
      <div className="bm8__dw bm8__cachain">
        <div className="bmc__fields">
          <div className="bmc__field is-text">
            <div className="bmc__label">
              <label htmlFor={`${uid}-alias`}>
                Alias
                <b aria-hidden title="Required">
                  *
                </b>
              </label>
            </div>
            <div className="bmc__control">
              <input
                id={`${uid}-alias`}
                type="text"
                value={alias}
                placeholder="Enter an alias for this certificate"
                autoComplete="off"
                aria-required
                onChange={(e) => setAlias(e.target.value)}
              />
            </div>
          </div>

          <div className="bmc__field">
            <div className="bmc__label">
              <label htmlFor={`${uid}-file`}>
                Certificate file
                <b aria-hidden title="Required">
                  *
                </b>
              </label>
            </div>
            <div className="bmc__control">
              {/* Drawn the way a browser draws a file input — a Choose file
                  segment and the file's name — because the live dialog uses
                  the native one. The input is still the control: hidden from
                  view, not from the keyboard, and the box wears its focus. */}
              <div className="bm8__file">
                <input
                  ref={input}
                  id={`${uid}-file`}
                  type="file"
                  accept={CA_FILE_ACCEPT}
                  className="u-sr-only"
                  aria-required
                  aria-invalid={!!fileError}
                  aria-describedby={[fileError && `${uid}-file-err`, file && `${uid}-file-name`].filter(Boolean).join(' ') || undefined}
                  onChange={(e) => read(e.currentTarget)}
                />
                {/* Hidden from the reading order, because the input is the
                    control and says all of this itself; the name is still read
                    out on the input, through `aria-describedby`, which reaches
                    hidden text. */}
                <span className="bm8__filebox" aria-hidden onClick={() => input.current?.click()}>
                  <span className="bm8__filebtn">Choose file</span>
                  <span id={`${uid}-file-name`} className={`bm8__filename ${file ? 'is-set' : ''}`}>
                    {file?.name ?? 'No file chosen'}
                  </span>
                </span>
              </div>
            </div>
            {fileError && (
              <p id={`${uid}-file-err`} className="bmc__error" role="alert">
                {fileError}
              </p>
            )}
          </div>
        </div>

        <Callout tone="info">After successful upload, contact miniOrange support to enable this CA chain for authentication.</Callout>
      </div>
    </Drawer>
  )
}
