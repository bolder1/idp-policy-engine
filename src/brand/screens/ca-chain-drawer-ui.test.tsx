import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { BrandProvider } from '../store'
import { CaChainDrawer } from './ca-chain-drawer'
import { sampleCaChains, setCaChains } from './ca-chains'
import drawerSrc from './ca-chain-drawer.tsx?raw'

/* CAC Card's CA chains slider, drawn once without a browser: the list it opens
   on, and the empty state. The browser pass covers the add page, the drop,
   Upload, Replace file and Delete with Undo. */

const noop = () => {}
const html = (node: ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const drawer = () => html(<CaChainDrawer open onClose={noop} by="Jaspreet Toor" />)
const footOf = (s: string) => /<footer class="bx-drawer__foot">([\s\S]*?)<\/footer>/.exec(s)?.[1] ?? ''
const headOf = (s: string) => /<header class="bx-drawer__head">([\s\S]*?)<\/header>/.exec(s)?.[1] ?? ''

afterEach(() => setCaChains(sampleCaChains(new Date())))

describe('the CA chains slider', () => {
  /* Each row is the name and its one date (owner, 1 Oct 2026: "I want just the
     name, the date — remove the chips and other extra things"). */
  it('opens on the list, every chain as its name and its date, nothing else', () => {
    setCaChains(sampleCaChains(new Date()))
    const s = drawer()
    expect((s.match(/class="bm8__carow/g) ?? []).length).toBe(5)
    const t = text(s)
    for (const alias of ['Federal PKI root', 'DoD PKI root', 'DoD ID CA-70 chain', 'Acme PIV issuing', 'Contractor badges']) expect(t).toContain(alias)
    /* The samples are dated from today, so the date is matched by its shape. */
    expect(t).toMatch(/Federal PKI root Valid until \d{1,2} [A-Z][a-z]{2} \d{4}/)
    expect(t).toContain('Expires in 16 days')
    /* A past date in the past tense, and — with no chip to say it — in red. */
    expect(t).toMatch(/Expired \d{1,2} [A-Z][a-z]{2} \d{4}/)
    expect(s).toMatch(/class="bm8__cadate is-expired"[^>]*>Expired /)
    expect(s).toMatch(/class="bm8__cadate is-soon"[^>]*>Expires in 16 days/)
    /* No chips, no file, no subject, no count, no uploader — and each row its
       icon (owner, 1 Oct 2026: "add icons with each list"). */
    expect(s).not.toContain('bx-badge')
    for (const gone of ['Waiting for support', 'Enabled by support', 'dod-id-ca-70-chain.pem', '3 certificates', 'Jaspreet Toor', 'DoD Root CA 6']) expect(t).not.toContain(gone)
    expect(s.match(/class="bm8__carow[^"]*"><span class="bm8__catile" aria-hidden="true"><svg/g)).toHaveLength(5)
    expect(s).not.toContain('is-gone')
    for (const alias of ['Federal PKI root', 'Contractor badges']) expect(s).toContain(`aria-label="Actions for ${alias}"`)
  })

  it('offers Add CA chain in the head, uncounted, and keeps its one orange for Done', () => {
    const s = drawer()
    const head = text(headOf(s))
    expect(head).toContain('CA chains')
    expect(head).toContain('Add CA chain')
    expect(head).not.toMatch(/\d/)
    expect(headOf(s)).not.toContain('bx-btn--brand')
    expect((s.match(/bx-btn--brand/g) ?? []).length).toBe(1)
    expect(text(footOf(s))).toBe('Done')
  })

  it('reads files in the browser only, one or many, of the three kinds', () => {
    const s = drawer()
    const inputs = s.match(/<input[^>]*type="file"[^>]*>/g) ?? []
    expect(inputs).toHaveLength(2)
    for (const i of inputs) expect(i).toContain('accept=".pem,.crt,.cer"')
    expect(inputs.filter((i) => / multiple/.test(i))).toHaveLength(1)
    expect(s).not.toMatch(/<form|action=/)
  })

  it('says so when there are none', () => {
    setCaChains([])
    const s = drawer()
    const t = text(s)
    expect(s).toContain('class="bempty is-compact"')
    expect(t).toContain('No CA chains yet')
    /* Once, in the empty state, not again in the head; and not orange. */
    expect(t.match(/Add CA chain/g)).toHaveLength(1)
    expect(text(headOf(s))).not.toContain('Add CA chain')
    expect((s.match(/bx-btn--brand/g) ?? []).length).toBe(1)
  })
})

/* The add page, as the live dialog sets it (owner, 1 Oct 2026: "fix this, we
   have 2 options"): Alias, then Certificate file, both required, before any
   file is in; the note in the info banner. Read from the source: the add page
   is a second page the static render does not reach. */
describe('Add CA chain', () => {
  it('opens on the live dialog’s two fields, Alias over Certificate file', () => {
    const form = drawerSrc.slice(drawerSrc.indexOf('className="bm8__caform"'))
    const alias = form.indexOf('Alias')
    const file = form.indexOf('Certificate file')
    expect(alias).toBeGreaterThan(-1)
    expect(file).toBeGreaterThan(alias)
    expect(form).toContain('placeholder="Enter an alias for this certificate"')
    expect(form.slice(file)).toContain('<span className="bm8__cafieldbtn">Choose file</span>')
    expect(form.slice(file)).toContain('<span className="bm8__cafieldname">No file chosen</span>')
    /* Both required, said the console's way. */
    expect(form.slice(0, form.indexOf('bm8__cafield'))).toMatch(/Alias[\s\S]*?title="Required"[\s\S]*?Certificate file[\s\S]*?title="Required"/)
  })

  it('gives the first file chosen the alias typed before it, and the support note the info banner', () => {
    expect(drawerSrc).toContain('if (first >= 0) rows[first] = { ...rows[first], alias: typed }')
    expect(drawerSrc).toContain('<Callout tone="info">{supportNote(plan.ready.length > 1)}</Callout>')
    expect(drawerSrc).not.toContain('Choose files or drop them here')
  })
})
