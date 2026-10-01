import { useCallback, useSyncExternalStore } from 'react'

import type { CaChain } from './ca-chain'

/* -----------------------------------------------------------------------------
   The tenant's CA chains for this session: five sample chains, then whatever
   the admin uploads, replaces or deletes.

   Kept here rather than in the Authentication methods screen, which unmounts on
   every navigation — an upload that vanished the moment you looked at another
   page would read as a failed upload. It lives for the tab and no longer: the
   files are only ever read in the browser (see ca-chain.ts).

   The samples are dated from today, so one is always about to expire and one
   has always just expired, however long after this was written it is opened.
   -------------------------------------------------------------------------- */

const DAY = 86_400_000
const at = (now: Date, days: number) => new Date(now.getTime() + days * DAY).toISOString()

/* A PEM-shaped placeholder for a sample's Download. Its body decodes to words
   saying it is a sample, so it cannot be mistaken for a real certificate. */
const samplePem = (alias: string, subjects: string[]) =>
  [
    `# Sample CA chain: ${alias}`,
    ...subjects.map((cn) =>
      ['-----BEGIN CERTIFICATE-----', btoa(`Sample certificate, not a real one: ${cn}`), '-----END CERTIFICATE-----'].join('\n'),
    ),
    '',
  ].join('\n')

interface Sample {
  alias: string
  fileName: string
  /** The chain's certificates' CNs, first one first. */
  subjects: string[]
  /** Days from today. */
  validFor: number
  uploadedBy: string
  uploadedDaysAgo: number
  enabled: boolean
}

const SAMPLES: Sample[] = [
  {
    alias: 'Federal PKI root',
    fileName: 'federal-common-policy-ca-g2.pem',
    subjects: ['Federal Common Policy CA G2'],
    validFor: 5118,
    uploadedBy: 'Jaspreet Toor',
    uploadedDaysAgo: 1,
    enabled: false,
  },
  {
    alias: 'DoD PKI root',
    fileName: 'dod-root-ca-6.pem',
    subjects: ['DoD Root CA 6'],
    validFor: 2361,
    uploadedBy: 'Jaspreet Toor',
    uploadedDaysAgo: 49,
    enabled: true,
  },
  {
    alias: 'DoD ID CA-70 chain',
    fileName: 'dod-id-ca-70-chain.pem',
    subjects: ['DOD ID CA-70', 'DoD Interoperability Root CA 2', 'DoD Root CA 6'],
    validFor: 612,
    uploadedBy: 'Anita Rao',
    uploadedDaysAgo: 49,
    enabled: true,
  },
  {
    alias: 'Acme PIV issuing',
    fileName: 'acme-piv-issuing-ca-2.crt',
    subjects: ['Acme PIV Issuing CA 2', 'Acme Root CA'],
    validFor: 16,
    uploadedBy: 'Anita Rao',
    uploadedDaysAgo: 402,
    enabled: true,
  },
  {
    alias: 'Contractor badges',
    fileName: 'northwind-contractor-ca.cer',
    subjects: ['Northwind Contractor CA', 'Northwind Root CA'],
    validFor: -9,
    uploadedBy: 'Marcus Lee',
    uploadedDaysAgo: 731,
    enabled: true,
  },
]

export function sampleCaChains(now: Date): CaChain[] {
  return SAMPLES.map((s, i) => ({
    id: `ca-sample-${i + 1}`,
    alias: s.alias,
    fileName: s.fileName,
    certCount: s.subjects.length,
    subject: s.subjects[0],
    validUntil: at(now, s.validFor),
    uploadedBy: s.uploadedBy,
    uploadedAt: at(now, -s.uploadedDaysAgo),
    enabled: s.enabled,
    pem: samplePem(s.alias, s.subjects),
  }))
}

/* --- The session's list ------------------------------------------------------------ */

let chains: CaChain[] | null = null
const listeners = new Set<() => void>()

const read = (): CaChain[] => (chains ??= sampleCaChains(new Date()))
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export type CaChainsUpdate = CaChain[] | ((was: CaChain[]) => CaChain[])

export function setCaChains(next: CaChainsUpdate) {
  chains = typeof next === 'function' ? next(read()) : next
  for (const fn of listeners) fn()
}

/** The session's CA chains, and the one way to change them. */
export function useCaChains(): [CaChain[], (next: CaChainsUpdate) => void] {
  const list = useSyncExternalStore(subscribe, read, read)
  const set = useCallback((next: CaChainsUpdate) => setCaChains(next), [])
  return [list, set]
}
