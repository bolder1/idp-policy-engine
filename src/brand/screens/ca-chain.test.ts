import { describe, expect, test } from 'vitest'

import { AUTH_METHODS } from '../methods'
import {
  aliasFromName,
  aliasIssue,
  canUpload,
  caFileIssue,
  chainFrom,
  chainStatus,
  chainsSaid,
  daysLeft,
  expiresSoon,
  isCaFileName,
  pemCertCount,
  pendingFiles,
  planUpload,
  readCaFile,
  readPemChain,
  replaceChainFile,
  takesCaChain,
  uniqueAlias,
  uploadedSaid,
  uploadedWhen,
  type CaChain,
} from './ca-chain'
import { sampleCaChains } from './ca-chains'

/* Real certificates, made with openssl for these tests and nothing else: a
   two-certificate chain (Test Issuing CA 1, valid to 15 Jan 2029, under Test
   Root CA, valid to 30 Jun 2030), a root that expired on 1 Jan 2021, and one
   with no CN — only an organisation — whose date is a GeneralizedTime. */
const ISSUING = `-----BEGIN CERTIFICATE-----
MIIBijCCATCgAwIBAgIUDadedSbSivZS4G/ANArMQe0YGwkwCgYIKoZIzj0EAwIw
KjERMA8GA1UECgwIVGVzdCBPcmcxFTATBgNVBAMMDFRlc3QgUm9vdCBDQTAeFw0y
NTAxMDEwMDAwMDBaFw0yOTAxMTUwMDAwMDBaMBwxGjAYBgNVBAMMEVRlc3QgSXNz
dWluZyBDQSAxMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEdUxaZDKFJ5ot78mO
PQyY3YtJHcgbYNhhYSUWM897o1QplvdHvP6d5xWxrIWZh8fsW4xog+uOKldSdASf
mZMY16NCMEAwHQYDVR0OBBYEFHHRciBglLMUXb3JwakJZDgRJiudMB8GA1UdIwQY
MBaAFEuh7olhC9DdyWr2/mJV1EEiGxZ3MAoGCCqGSM49BAMCA0gAMEUCIQDYcVZ+
QArZTXUcx2MprRwjfm2MmBmyGJk679xgjD+wNAIgVwTagg7mgIUv/5zhAX6qBR6z
ZW8D4wm5w1MtiOpOx6M=
-----END CERTIFICATE-----`
const ROOT = `-----BEGIN CERTIFICATE-----
MIIBqTCCAU+gAwIBAgIUMDBccH+0x09NtTtvqMMpJsNZZPswCgYIKoZIzj0EAwIw
KjERMA8GA1UECgwIVGVzdCBPcmcxFTATBgNVBAMMDFRlc3QgUm9vdCBDQTAeFw0y
NTAxMDEwMDAwMDBaFw0zMDA2MzAwMDAwMDBaMCoxETAPBgNVBAoMCFRlc3QgT3Jn
MRUwEwYDVQQDDAxUZXN0IFJvb3QgQ0EwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNC
AASiOtlT19pf2CSJGEM7rytI97PKs4O2q4pKTdRq7mRPE0l8MjKlZOSqf0bQPp8u
PJR+LR3ZFoP068jc/8KIlyJno1MwUTAdBgNVHQ4EFgQUS6HuiWEL0N3Javb+YlXU
QSIbFncwHwYDVR0jBBgwFoAUS6HuiWEL0N3Javb+YlXUQSIbFncwDwYDVR0TAQH/
BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiEA1nAd5II6z1zUatOULqIIyvalLQ8L
gKJfGFTLGbB4/TgCIF7AmWahAUyTzYIYXcld1EasKrxxbNtJijRYH4xKFGcx
-----END CERTIFICATE-----`
const EXPIRED = `-----BEGIN CERTIFICATE-----
MIIBgzCCASmgAwIBAgIUCAn4T+ze0tLLuGKFX2HUNaaQFhYwCgYIKoZIzj0EAwIw
FzEVMBMGA1UEAwwMT2xkIEJhZGdlIENBMB4XDTE5MDEwMTAwMDAwMFoXDTIxMDEw
MTAwMDAwMFowFzEVMBMGA1UEAwwMT2xkIEJhZGdlIENBMFkwEwYHKoZIzj0CAQYI
KoZIzj0DAQcDQgAEVhVdM/0ynaLP89YtTngVxFZOPeDtJVgJLpCurwGb7ljkFYqQ
aSFquBY2JA2sSws0rfVsmCmfaQRoCxIQGPrjGaNTMFEwHQYDVR0OBBYEFN3GeUeX
KqfTIUChfOhZl62gSs7AMB8GA1UdIwQYMBaAFN3GeUeXKqfTIUChfOhZl62gSs7A
MA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIhAOa2H81r73Ye8qFL
QT+Rh2DTfSRGogZNNI0yzB/J5s6VAiBO5Mmi+rMkYXjTSZXuSIspOZCqgSI/oKPD
Q092i9y6Xg==
-----END CERTIFICATE-----`
const ORG_ONLY = `-----BEGIN CERTIFICATE-----
MIIBfTCCASOgAwIBAgIUVLdA0TUZ05BmJsf9SwQHvR29Q2kwCgYIKoZIzj0EAwIw
EzERMA8GA1UECgwIT25seSBPcmcwIBcNMjUwMTAxMDAwMDAwWhgPMjA1NTAxMDEw
MDAwMDBaMBMxETAPBgNVBAoMCE9ubHkgT3JnMFkwEwYHKoZIzj0CAQYIKoZIzj0D
AQcDQgAEojrZU9faX9gkiRhDO68rSPezyrODtquKSk3Uau5kTxNJfDIypWTkqn9G
0D6fLjyUfi0d2RaD9OvI3P/CiJciZ6NTMFEwHQYDVR0OBBYEFEuh7olhC9DdyWr2
/mJV1EEiGxZ3MB8GA1UdIwQYMBaAFEuh7olhC9DdyWr2/mJV1EEiGxZ3MA8GA1Ud
EwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIgVsUCaGG+088sTdejgaYMw28a
6wnvUmk0SgcOJVMdIZkCIQCmIxya/zZQL7qlbDoHeAGmj/TeE7hip1E425NaMHnz
QQ==
-----END CERTIFICATE-----`
const CHAIN = `${ISSUING}\n${ROOT}\n`
const GARBLED = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----'

const NOW = new Date('2026-09-30T09:00:00Z')
const DAY = 86_400_000
const inDays = (d: number) => new Date(NOW.getTime() + d * DAY).toISOString()

let n = 0
const key = () => `k${++n}`

describe('CA chains: where they live', () => {
  test('sit on CAC Card and nothing else', () => {
    expect(AUTH_METHODS.filter(takesCaChain).map((m) => m.id)).toEqual(['cac'])
  })

  test('the row says how many, once', () => {
    expect(chainsSaid(0)).toBe('No CA chains')
    expect(chainsSaid(1)).toBe('1 CA chain')
    expect(chainsSaid(5)).toBe('5 CA chains')
  })
})

describe('reading a chosen file', () => {
  test('takes .pem, .crt and .cer, in any case', () => {
    for (const name of ['root.pem', 'chain.PEM', 'issuing.crt', 'ca.cer', ' spaced.pem ']) expect(isCaFileName(name), name).toBe(true)
    for (const name of ['chain.txt', 'root.pem.zip', 'pem', 'cert.der']) expect(isCaFileName(name), name).toBe(false)
  })

  test('counts the certificates in a chain', () => {
    expect(pemCertCount('')).toBe(0)
    expect(pemCertCount(ROOT)).toBe(1)
    expect(pemCertCount(CHAIN)).toBe(2)
  })

  test('reads each certificate’s subject and end date, first one first', () => {
    expect(readPemChain(CHAIN)).toEqual([
      { subject: 'Test Issuing CA 1', notAfter: '2029-01-15T00:00:00.000Z' },
      { subject: 'Test Root CA', notAfter: '2030-06-30T00:00:00.000Z' },
    ])
  })

  test('falls back to the organisation where there is no CN, and reads a four-digit year', () => {
    expect(readPemChain(ORG_ONLY)).toEqual([{ subject: 'Only Org', notAfter: '2055-01-01T00:00:00.000Z' }])
  })

  test('refuses a file that is the wrong type, holds no certificate, cannot be read or has expired', () => {
    expect(caFileIssue('chain.txt', CHAIN, NOW)).toBe('Choose a .pem, .crt or .cer file.')
    expect(caFileIssue('chain.pem', 'not a certificate', NOW)).toBe('No PEM certificate found in this file.')
    expect(caFileIssue('chain.pem', GARBLED, NOW)).toBe('A certificate in this file could not be read.')
    expect(caFileIssue('old-badge-ca.cer', EXPIRED, NOW)).toBe('A certificate in this chain has expired.')
    expect(caFileIssue('chain.pem', CHAIN, NOW)).toBeNull()
  })

  test('a chain is valid until its earliest certificate is not', () => {
    const read = readCaFile('chain.pem', CHAIN, NOW)
    const pending = { ...read, key: 'a', fileName: 'chain.pem', text: CHAIN, alias: 'Test chain' }
    expect(chainFrom(pending, 'Jaspreet Toor', NOW, 'x').validUntil).toBe('2029-01-15T00:00:00.000Z')
  })
})

describe('aliases', () => {
  test('come from the file name, without its extension, in sentence case', () => {
    expect(aliasFromName('dod-id-ca-70_chain.pem')).toBe('Dod id ca 70 chain')
    expect(aliasFromName('Federal Root.CRT')).toBe('Federal Root')
    expect(aliasFromName('.pem')).toBe('CA chain')
  })

  test('never repeat one already taken, whatever its case', () => {
    expect(uniqueAlias('root', ['Root', 'root 2'])).toBe('root 3')
    expect(aliasFromName('root.pem', ['ROOT'])).toBe('Root 2')
  })

  test('must be filled in and unused', () => {
    expect(aliasIssue('  ', [])).toBe('Enter an alias.')
    expect(aliasIssue('DoD PKI root', ['dod pki root'])).toBe('This alias is already in use.')
    expect(aliasIssue('Acme root', ['DoD PKI root'])).toBeNull()
    expect(aliasIssue('a'.repeat(64), [])).toBeNull()
    expect(aliasIssue('a'.repeat(65), [])).toBe('Use 64 characters or fewer.')
  })
})

describe('the upload page', () => {
  const three = () =>
    pendingFiles(
      [
        { name: 'test-chain.pem', text: CHAIN },
        { name: 'notes.txt', text: 'meeting notes' },
        { name: 'test-chain.crt', text: ROOT },
      ],
      ['DoD PKI root'],
      NOW,
      key,
    )

  test('takes many files at once, each with its own alias and its own error', () => {
    const rows = three()
    expect(rows.map((r) => [r.fileName, r.alias, r.certs.length, r.issue])).toEqual([
      ['test-chain.pem', 'Test chain', 2, null],
      ['notes.txt', '', 0, 'Choose a .pem, .crt or .cer file.'],
      /* The same stem twice is offered two aliases, not one. */
      ['test-chain.crt', 'Test chain 2', 1, null],
    ])
  })

  test('uploads the good files and skips the bad one', () => {
    const plan = planUpload(three(), ['DoD PKI root'])
    expect(plan.ready.map((p) => p.fileName)).toEqual(['test-chain.pem', 'test-chain.crt'])
    expect(plan.skipped).toBe(1)
    expect(canUpload(plan)).toBe(true)
    expect(uploadedSaid(plan.ready.length, plan.skipped)).toBe('2 CA chains uploaded, 1 file skipped')
    expect(uploadedSaid(1, 0)).toBe('CA chain uploaded')
  })

  test('says why nothing can go, under the drop zone, rather than greying Upload', () => {
    expect(planUpload([], []).blocker).toBe('Choose at least one certificate file.')
    const bad = pendingFiles([{ name: 'notes.txt', text: '' }], [], NOW, key)
    expect(planUpload(bad, []).blocker).toBe('None of these files can be uploaded.')
    expect(canUpload(planUpload(bad, []))).toBe(false)
  })

  test('holds the upload on an alias that is empty, taken, or used twice in the batch', () => {
    const [a, , b] = three()
    const plan = planUpload([{ ...a, alias: '' }, { ...b, alias: 'DoD PKI root' }], ['DoD PKI root'])
    expect(plan.aliasErrors).toEqual({ [a.key]: 'Enter an alias.', [b.key]: 'This alias is already in use.' })
    expect(canUpload(plan)).toBe(false)
    const twice = planUpload([a, { ...b, alias: 'Test Chain' }], [])
    expect(twice.aliasErrors).toEqual({ [b.key]: 'This alias is already in use.' })
  })

  test('a new chain waits for support, uploaded by whoever is signed in', () => {
    const [a] = three()
    const c = chainFrom(a, 'Jaspreet Toor', NOW, 'new')
    expect(c).toMatchObject({ alias: 'Test chain', certCount: 2, subject: 'Test Issuing CA 1', uploadedBy: 'Jaspreet Toor', enabled: false })
    expect(chainStatus(c, NOW)).toBe('waiting')
  })
})

describe('the list', () => {
  const chain = (validFor: number, enabled: boolean): Pick<CaChain, 'validUntil' | 'enabled'> => ({ validUntil: inDays(validFor), enabled })

  test('says each status in plain words, and an expired chain is expired whatever support did', () => {
    expect(chainStatus(chain(400, true), NOW)).toBe('enabled')
    expect(chainStatus(chain(400, false), NOW)).toBe('waiting')
    expect(chainStatus(chain(-1, true), NOW)).toBe('expired')
    expect(chainStatus(chain(-1, false), NOW)).toBe('expired')
  })

  test('warns in the last thirty days, and not after it has gone', () => {
    expect(daysLeft(chain(16, true), NOW)).toBe(16)
    expect(expiresSoon(chain(16, true), NOW)).toBe(true)
    expect(expiresSoon(chain(31, true), NOW)).toBe(false)
    expect(expiresSoon(chain(-9, true), NOW)).toBe(false)
  })

  test('says when a chain came, in days where that is shorter', () => {
    expect(uploadedWhen(NOW.toISOString(), NOW)).toBe('today')
    expect(uploadedWhen(inDays(-1), NOW)).toBe('yesterday')
    expect(uploadedWhen('2026-08-12T10:00:00Z', NOW)).toBe('12 Aug 2026')
    /* Not the browser's "Sept". */
    expect(uploadedWhen('2024-09-29T10:00:00Z', NOW)).toBe('29 Sep 2024')
  })

  test('opens on five sample chains: one waiting, one about to expire, one expired', () => {
    const rows = sampleCaChains(NOW)
    expect(rows).toHaveLength(5)
    const status = rows.map((c) => chainStatus(c, NOW))
    expect(status.filter((s) => s === 'waiting')).toHaveLength(1)
    expect(status.filter((s) => s === 'expired')).toHaveLength(1)
    expect(rows.filter((c) => expiresSoon(c, NOW))).toHaveLength(1)
    expect(new Set(rows.map((c) => c.alias.toLowerCase())).size).toBe(5)
    for (const c of rows) expect(pemCertCount(c.pem), c.alias).toBe(c.certCount)
  })

  test('Replace file takes the new file’s facts and waits for support again', () => {
    const [was] = sampleCaChains(NOW)
    const enabled = { ...was, enabled: true }
    const r = replaceChainFile(enabled, { name: 'test-chain.pem', text: CHAIN }, 'Anita Rao', NOW)
    expect(r.issue).toBeNull()
    expect(r.chain).toMatchObject({ id: was.id, alias: was.alias, fileName: 'test-chain.pem', certCount: 2, uploadedBy: 'Anita Rao', enabled: false })
    expect(replaceChainFile(enabled, { name: 'notes.txt', text: '' }, 'Anita Rao', NOW)).toEqual({
      chain: null,
      issue: 'Choose a .pem, .crt or .cer file.',
    })
  })
})
