import { describe, expect, test } from 'vitest'

import { AUTH_METHODS } from '../methods'
import { caFileIssue, caUploadBlocker, isCaFileName, pemCertCount, takesCaChain } from './ca-chain'

const PEM = (n: number) =>
  Array.from({ length: n }, () => '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----').join('\n')

describe('Upload CA chain', () => {
  test('sits on CAC Card and nothing else', () => {
    expect(AUTH_METHODS.filter(takesCaChain).map((m) => m.id)).toEqual(['cac'])
  })

  test('takes .pem, .crt and .cer, in any case', () => {
    for (const name of ['root.pem', 'chain.PEM', 'issuing.crt', 'ca.cer', ' spaced.pem ']) expect(isCaFileName(name), name).toBe(true)
    for (const name of ['chain.txt', 'root.pem.zip', 'pem', 'cert.der']) expect(isCaFileName(name), name).toBe(false)
  })

  test('counts the certificates in a chain', () => {
    expect(pemCertCount('')).toBe(0)
    expect(pemCertCount(PEM(1))).toBe(1)
    expect(pemCertCount(PEM(3))).toBe(3)
  })

  test('refuses a file that is the wrong type or holds no PEM certificate', () => {
    expect(caFileIssue('chain.txt', PEM(1))).toBe('Choose a .pem, .crt or .cer file.')
    expect(caFileIssue('chain.pem', 'not a certificate')).toBe('No PEM certificate found in this file.')
    expect(caFileIssue('chain.pem', PEM(2))).toBeNull()
  })

  test('Upload waits for both fields, and says which is missing', () => {
    expect(caUploadBlocker('', null)).toBe('Enter an alias and choose a certificate file.')
    expect(caUploadBlocker('   ', 'root.pem')).toBe('Enter an alias.')
    expect(caUploadBlocker('Acme root', null)).toBe('Choose a certificate file.')
    expect(caUploadBlocker('Acme root', 'root.pem')).toBeNull()
  })
})
