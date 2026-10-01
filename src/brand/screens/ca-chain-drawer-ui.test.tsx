import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { BrandProvider } from '../store'
import { CaChainDrawer } from './ca-chain-drawer'
import { sampleCaChains, setCaChains } from './ca-chains'

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
  it('opens on the list, every chain with its facts and its status in words', () => {
    setCaChains(sampleCaChains(new Date()))
    const s = drawer()
    expect((s.match(/class="bm8__carow/g) ?? []).length).toBe(5)
    const t = text(s)
    for (const alias of ['Federal PKI root', 'DoD PKI root', 'DoD ID CA-70 chain', 'Acme PIV issuing', 'Contractor badges']) expect(t).toContain(alias)
    expect(t).toContain('dod-id-ca-70-chain.pem')
    expect(t).toContain('3 certificates')
    expect(t).toContain('Jaspreet Toor, yesterday')
    expect(t.match(/Waiting for support/g)).toHaveLength(1)
    expect(t.match(/Enabled by support/g)).toHaveLength(3)
    expect(t.match(/Expired(?! \d)/g)).toHaveLength(1)
    /* A past date in the past tense, and not in red: the status carries that. */
    expect(t).toMatch(/Expired \d{1,2} [A-Z][a-z]{2} \d{4}/)
    expect(s).not.toContain('is-gone')
    expect(t).toContain('Expires in 16 days')
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
