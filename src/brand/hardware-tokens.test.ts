import { describe, expect, it } from 'vitest'

import { tokensAt, usersAt, methodsAt, type Depth } from './fixtures'
import {
  ASSIGNMENT_CSV_HEADER,
  ASSIGNMENT_CSV_SAMPLE,
  CSV_ROW_LIMIT,
  DISPLAY_TOKEN_METHOD_ID,
  TOKEN_CSV_HEADER,
  TOKEN_CSV_SAMPLE,
  TOKEN_TYPES,
  assignTokens,
  assignedCount,
  canSync,
  deleteBlocker,
  deleteTokens,
  emptyDraft,
  formatDay,
  holders,
  matchTokenType,
  normaliseSerial,
  parseAssignmentCsv,
  parseCsv,
  parseTokenCsv,
  serialKey,
  syncErrors,
  syncToken,
  tokenErrors,
  tokenFromDraft,
  tokenType,
  tokensOf,
  unassignTokens,
  unassigned,
  withTokenState,
  type HardwareToken,
  type TokenDraft,
} from './hardware-tokens'

const NOW = '14 Sep 2026'
const HEX_KEY = '3132333435363738393031323334353637383930' // 40 hex chars
const B32_KEY = 'JBSWY3DPEHPK3PXP' // 16 base32 chars

const draft = (over: Partial<TokenDraft> = {}): TokenDraft => ({
  serial: 'FT-C200-000001',
  secret: HEX_KEY,
  type: 'feitian-c200',
  counter: '',
  ...over,
})

const tok = (over: Partial<HardwareToken> = {}): HardwareToken => ({
  serial: 'MO-DT-9001',
  type: 'miniorange',
  userId: null,
  addedAt: '1 Sep 2026',
  ...over,
})

const users = [
  { id: 'priya', name: 'Priya Sharma', email: 'priya@mo.com' },
  { id: 'arun', name: 'Arun Patel', email: 'arun@mo.com' },
]

describe('token types', () => {
  it('offers the four types the console lists, in its order', () => {
    expect(TOKEN_TYPES.map((t) => t.label)).toEqual(['miniOrange', 'Feitian C100', 'Feitian C200', 'TOTP'])
    expect(TOKEN_TYPES.map((t) => t.id)).toEqual(['miniorange', 'feitian-c100', 'feitian-c200', 'totp'])
  })

  it('makes the C100 the only event-based, counter-carrying, syncable type', () => {
    const c100 = tokenType('feitian-c100')
    expect(c100).toMatchObject({ algorithm: 'hotp', counter: true, sync: true })
    for (const t of TOKEN_TYPES.filter((x) => x.id !== 'feitian-c100')) {
      expect(t).toMatchObject({ algorithm: 'totp', counter: false, sync: false })
    }
  })

  it('gives every type a short one-line blurb', () => {
    for (const t of TOKEN_TYPES) {
      expect(t.blurb).toMatch(/^[A-Za-z].*\.$/)
      expect(t.blurb.length).toBeLessThan(60)
    }
    expect(tokenType('feitian-c200').blurb).toBe('New code every 60 seconds.')
    expect(tokenType('feitian-c100').blurb).toBe('Counts button presses.')
  })

  it('throws on an unknown id', () => {
    expect(() => tokenType('rsa' as never)).toThrow()
  })

  it('matches a type from its id or label in any case', () => {
    expect(matchTokenType('Feitian C100')).toBe('feitian-c100')
    expect(matchTokenType('feitian c200')).toBe('feitian-c200')
    expect(matchTokenType('FEITIAN-C100')).toBe('feitian-c100')
    expect(matchTokenType(' miniorange ')).toBe('miniorange')
    expect(matchTokenType('totp')).toBe('totp')
    expect(matchTokenType('Yubikey')).toBeNull()
    expect(matchTokenType('')).toBeNull()
  })
})

describe('serial numbers', () => {
  it('normalises by trimming and collapsing inner whitespace', () => {
    expect(normaliseSerial('  MO-DT-1 ')).toBe('MO-DT-1')
    expect(normaliseSerial('MO \t  DT')).toBe('MO DT')
  })

  it('compares without regard to case or surrounding space', () => {
    expect(serialKey('ft-c100-004512')).toBe(serialKey(' FT-C100-004512 '))
    expect(serialKey('FT-C100-004512')).not.toBe(serialKey('FT-C100-004513'))
  })
})

describe('tokenErrors', () => {
  it('passes a complete draft', () => {
    expect(tokenErrors(draft(), [])).toEqual({})
    expect(tokenErrors(draft({ secret: B32_KEY }), [])).toEqual({})
  })

  it('reports every field of an empty draft', () => {
    expect(tokenErrors(emptyDraft, [])).toEqual({
      serial: 'Enter a serial number.',
      secret: 'Enter the secret key.',
      type: 'Choose a token type.',
    })
  })

  describe('serial', () => {
    it('is required, and whitespace alone does not count', () => {
      expect(tokenErrors(draft({ serial: '   ' }), []).serial).toBe('Enter a serial number.')
    })

    it('allows 64 characters and no more', () => {
      expect(tokenErrors(draft({ serial: 'A'.repeat(64) }), []).serial).toBeUndefined()
      expect(tokenErrors(draft({ serial: 'A'.repeat(65) }), []).serial).toBe('Use 64 characters or fewer.')
    })

    it('accepts letters, numbers, hyphens and underscores after trimming', () => {
      expect(tokenErrors(draft({ serial: '  Ab_9-z  ' }), []).serial).toBeUndefined()
      for (const bad of ['MO DT', 'MO/DT', 'MO.DT', 'MO#1', 'ÄB1']) {
        expect(tokenErrors(draft({ serial: bad }), []).serial).toBe('Use letters, numbers, hyphens or underscores.')
      }
    })

    it('must be unique, case-insensitively', () => {
      const existing = [tok({ serial: 'FT-C200-000001' })]
      expect(tokenErrors(draft(), existing).serial).toBe('This serial number is already added.')
      expect(tokenErrors(draft({ serial: ' ft-c200-000001 ' }), existing).serial).toBe('This serial number is already added.')
      expect(tokenErrors(draft({ serial: 'FT-C200-000002' }), existing).serial).toBeUndefined()
    })
  })

  describe('secret', () => {
    const err = (secret: string) => tokenErrors(draft({ secret }), []).secret
    const BAD = 'Use the hex or base32 key that came with the token.'

    it('is required', () => {
      expect(err('')).toBe('Enter the secret key.')
      expect(err('  \t ')).toBe('Enter the secret key.')
    })

    it('ignores spaces inside the key', () => {
      expect(err('3132 3334 3536 3738 3930 3132 3334 3536 3738 3930')).toBeUndefined()
      expect(err('JBSW Y3DP EHPK 3PXP')).toBeUndefined()
    })

    it('accepts hex of even length from 20 to 128', () => {
      expect(err('ab'.repeat(10))).toBeUndefined()
      expect(err('AB'.repeat(64))).toBeUndefined()
      expect(err('0f'.repeat(9))).toBe(BAD) // 18, and 0 is not base32
      expect(err('ab'.repeat(65))).toBe(BAD) // 130
    })

    it('rejects odd-length hex that is not also valid base32', () => {
      expect(err('0'.repeat(21))).toBe(BAD)
      expect(err('abcdef0189abcdef01891')).toBe(BAD) // 21 chars, has 0/1/8/9 so not base32
    })

    it('accepts base32 from 16 to 128 characters, with or without padding, in either case', () => {
      expect(err('JBSWY3DPEHPK3PXP')).toBeUndefined()
      expect(err('jbswy3dpehpk3pxp')).toBeUndefined()
      expect(err('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PX=')).toBeUndefined()
      expect(err('A'.repeat(128))).toBeUndefined()
      expect(err('JBSWY3DPEHPK3PX')).toBe(BAD) // 15
      expect(err('A'.repeat(129))).toBe(BAD)
    })

    it('rejects anything that is neither', () => {
      expect(err('not-a-key-at-all-really')).toBe(BAD)
      expect(err('JBSWY3DPEHPK3PX1')).toBe(BAD) // 1 is not base32, and not hex
      expect(err('JBSWY3=DPEHPK3PXP')).toBe(BAD) // padding in the middle
    })
  })

  describe('type', () => {
    it('is required and must be a known id', () => {
      expect(tokenErrors(draft({ type: '' }), []).type).toBe('Choose a token type.')
      expect(tokenErrors(draft({ type: 'yubikey' as never }), []).type).toBe('Choose a token type.')
    })
  })

  describe('counter', () => {
    const c100 = (counter: string) => tokenErrors(draft({ type: 'feitian-c100', counter }), []).counter

    it('means 0 when blank', () => {
      expect(c100('')).toBeUndefined()
      expect(c100('  ')).toBeUndefined()
    })

    it('takes whole numbers from 0 to 99,999,999', () => {
      expect(c100('0')).toBeUndefined()
      expect(c100(' 42 ')).toBeUndefined()
      expect(c100('99999999')).toBeUndefined()
      expect(c100('100000000')).toBe('Use 99,999,999 or less.')
    })

    it('rejects negatives, decimals and words', () => {
      for (const bad of ['-1', '1.5', 'ten', '1e3', '1,000']) expect(c100(bad)).toBe('Enter a whole number, 0 or more.')
    })

    it('is ignored for time-based types', () => {
      for (const type of ['miniorange', 'feitian-c200', 'totp'] as const) {
        expect(tokenErrors(draft({ type, counter: 'nonsense' }), [])).toEqual({})
      }
    })
  })
})

describe('tokenFromDraft', () => {
  it('stores the normalised serial, type and date, unassigned, and never the secret', () => {
    const t = tokenFromDraft(draft({ serial: '  FT-C200-000001 ' }), NOW)
    expect(t).toEqual({ serial: 'FT-C200-000001', type: 'feitian-c200', userId: null, addedAt: NOW })
    expect(JSON.stringify(t)).not.toContain(HEX_KEY)
    expect('counter' in t).toBe(false)
  })

  it('sets a counter only on event-based types, blank as 0', () => {
    expect(tokenFromDraft(draft({ type: 'feitian-c100', counter: '' }), NOW).counter).toBe(0)
    expect(tokenFromDraft(draft({ type: 'feitian-c100', counter: ' 17 ' }), NOW).counter).toBe(17)
    expect(tokenFromDraft(draft({ type: 'totp', counter: '17' }), NOW).counter).toBeUndefined()
  })

  it('refuses a draft with no type', () => {
    expect(() => tokenFromDraft(draft({ type: '' }), NOW)).toThrow()
  })
})

describe('formatDay', () => {
  it('writes the console date format', () => {
    expect(formatDay(new Date(2026, 8, 14))).toBe('14 Sep 2026')
    expect(formatDay(new Date(2026, 0, 2))).toBe('2 Jan 2026')
  })
})

describe('parseCsv', () => {
  it('reads plain rows with 1-based line numbers', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['c', 'd'] },
    ])
  })

  it('strips a byte-order mark and handles CRLF', () => {
    expect(parseCsv('﻿a,b\r\nc,d\r\n')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['c', 'd'] },
    ])
  })

  it('keeps commas and escaped quotes inside quoted cells', () => {
    expect(parseCsv('"a,b","say ""hi""",c')[0].cells).toEqual(['a,b', 'say "hi"', 'c'])
  })

  it('trims spaces around cells, including around quoted ones', () => {
    expect(parseCsv('  a  ,  "b"  , c ')[0].cells).toEqual(['a', 'b', 'c'])
  })

  it('skips blank lines without renumbering later rows', () => {
    expect(parseCsv('a\n\n   \r\n,,\nb\n\n')).toEqual([
      { line: 1, cells: ['a'] },
      { line: 5, cells: ['b'] },
    ])
  })

  it('numbers a row by the line it starts on when a quoted cell spans lines', () => {
    const rows = parseCsv('a,"one\r\ntwo"\nb,c')
    expect(rows).toEqual([
      { line: 1, cells: ['a', 'one\ntwo'] },
      { line: 3, cells: ['b', 'c'] },
    ])
  })

  it('keeps empty cells in position', () => {
    expect(parseCsv('a,,c,')[0].cells).toEqual(['a', '', 'c', ''])
  })

  it('returns nothing for an empty or whitespace-only file', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('﻿\r\n \n')).toEqual([])
  })
})

describe('parseTokenCsv', () => {
  const HEADER = TOKEN_CSV_HEADER.join(',')

  it('reads the sample file cleanly', () => {
    expect(TOKEN_CSV_SAMPLE.split('\n')[0]).toBe(HEADER)
    const r = parseTokenCsv(TOKEN_CSV_SAMPLE, [], NOW)
    expect(r.error).toBeNull()
    expect(r.skipped).toEqual([])
    expect(r.ready.map((t) => t.type)).toEqual(['miniorange', 'feitian-c100', 'feitian-c200'])
    expect(r.ready.every((t) => t.userId === null && t.addedAt === NOW)).toBe(true)
  })

  it('errors on an empty file', () => {
    expect(parseTokenCsv('', [], NOW).error).toBe('The file is empty.')
    expect(parseTokenCsv('﻿\r\n', [], NOW).error).toBe('The file is empty.')
  })

  it('errors when a required column is missing', () => {
    const msg = 'The file needs the columns serial_number, secret_key and token_type.'
    expect(parseTokenCsv('serial_number,secret_key\nA1,' + HEX_KEY, [], NOW).error).toBe(msg)
    expect(parseTokenCsv('serial,secret,type\nA1,' + HEX_KEY + ',totp', [], NOW).error).toBe(msg)
  })

  it('does not need the counter column', () => {
    const r = parseTokenCsv(`serial_number,secret_key,token_type\nFT-1,${HEX_KEY},Feitian C100`, [], NOW)
    expect(r.error).toBeNull()
    expect(r.ready[0].counter).toBe(0)
  })

  it('errors on a header with no rows under it', () => {
    expect(parseTokenCsv(HEADER + '\n\n', [], NOW).error).toBe('The file has no rows under the header.')
  })

  it('matches header columns in any order and case', () => {
    const text = `Token_Type,COUNTER,Secret Key,serial_number\nfeitian c100,12,${HEX_KEY},FT-C100-1`
    const r = parseTokenCsv(text, [], NOW)
    expect(r.error).toBeNull()
    expect(r.ready).toEqual([{ serial: 'FT-C100-1', type: 'feitian-c100', counter: 12, userId: null, addedAt: NOW }])
  })

  it('handles a BOM, CRLF and quoted commas together', () => {
    const text = `﻿${HEADER}\r\n"MO-DT-1","${B32_KEY}","miniOrange",""\r\n"BAD,SERIAL",${HEX_KEY},totp,\r\n`
    const r = parseTokenCsv(text, [], NOW)
    expect(r.ready.map((t) => t.serial)).toEqual(['MO-DT-1'])
    expect(r.skipped).toEqual([{ line: 3, serial: 'BAD,SERIAL', reason: 'Use letters, numbers, hyphens or underscores.' }])
  })

  it('accepts a type by id or label in any case', () => {
    const text = [HEADER, `A1,${HEX_KEY},TOTP,`, `A2,${HEX_KEY},feitian-c200,`, `A3,${HEX_KEY},MINIORANGE,`].join('\n')
    expect(parseTokenCsv(text, [], NOW).ready.map((t) => t.type)).toEqual(['totp', 'feitian-c200', 'miniorange'])
  })

  it('says what the type column accepts when it holds something unknown, and asks for one when blank', () => {
    const text = [HEADER, `A1,${HEX_KEY},Yubikey,`, `A2,${HEX_KEY},,`].join('\n')
    expect(parseTokenCsv(text, [], NOW).skipped).toEqual([
      { line: 2, serial: 'A1', reason: 'Use miniOrange, Feitian C100, Feitian C200 or TOTP.' },
      { line: 3, serial: 'A2', reason: 'Choose a token type.' },
    ])
  })

  it('skips serials already in the tenant, case-insensitively', () => {
    const text = [HEADER, `mo-dt-1001,${HEX_KEY},miniOrange,`].join('\n')
    const r = parseTokenCsv(text, [tok({ serial: 'MO-DT-1001' })], NOW)
    expect(r.ready).toEqual([])
    expect(r.skipped).toEqual([{ line: 2, serial: 'mo-dt-1001', reason: 'This serial number is already added.' }])
  })

  it('skips a serial repeated later in the same file, in any case', () => {
    const text = [HEADER, `A1,${HEX_KEY},totp,`, `B1,${HEX_KEY},totp,`, `a1,${B32_KEY},miniOrange,`].join('\n')
    const r = parseTokenCsv(text, [], NOW)
    expect(r.ready.map((t) => t.serial)).toEqual(['A1', 'B1'])
    expect(r.skipped).toEqual([{ line: 4, serial: 'a1', reason: 'Appears twice in this file.' }])
  })

  it('does not call a repeat a duplicate when the first copy was itself skipped', () => {
    const text = [HEADER, `A1,short,totp,`, `A1,${HEX_KEY},totp,`].join('\n')
    const r = parseTokenCsv(text, [], NOW)
    expect(r.ready.map((t) => t.serial)).toEqual(['A1'])
    expect(r.skipped).toEqual([{ line: 2, serial: 'A1', reason: 'Use the hex or base32 key that came with the token.' }])
  })

  it('reports one reason per row, serial first', () => {
    const text = [HEADER, `,,,`, `,x,,`].join('\n')
    expect(parseTokenCsv(text, [], NOW).skipped).toEqual([{ line: 3, serial: '', reason: 'Enter a serial number.' }])
  })

  it('validates the counter only for event-based rows', () => {
    const text = [HEADER, `C1,${HEX_KEY},Feitian C100,-4`, `T1,${HEX_KEY},TOTP,-4`, `C2,${HEX_KEY},Feitian C100,250`].join('\n')
    const r = parseTokenCsv(text, [], NOW)
    expect(r.skipped).toEqual([{ line: 2, serial: 'C1', reason: 'Enter a whole number, 0 or more.' }])
    expect(r.ready).toEqual([
      { serial: 'T1', type: 'totp', userId: null, addedAt: NOW },
      { serial: 'C2', type: 'feitian-c100', counter: 250, userId: null, addedAt: NOW },
    ])
  })

  it('treats missing trailing cells as blank', () => {
    const r = parseTokenCsv(`${HEADER}\nA1,${HEX_KEY}`, [], NOW)
    expect(r.skipped).toEqual([{ line: 2, serial: 'A1', reason: 'Choose a token type.' }])
  })

  it('refuses more than 5,000 rows, and takes exactly 5,000', () => {
    const rows = (n: number) => [HEADER, ...Array.from({ length: n }, (_, i) => `S${i},${HEX_KEY},totp,`)].join('\n')
    expect(CSV_ROW_LIMIT).toBe(5000)
    expect(parseTokenCsv(rows(5000), [], NOW).ready).toHaveLength(5000)
    const over = parseTokenCsv(rows(5001), [], NOW)
    expect(over.error).toBe('Upload 5,000 rows or fewer at a time.')
    expect(over.ready).toEqual([])
  })
})

describe('parseAssignmentCsv', () => {
  const HEADER = ASSIGNMENT_CSV_HEADER.join(',')
  const tokens = [
    tok({ serial: 'MO-DT-1', userId: null }),
    tok({ serial: 'MO-DT-2', userId: 'arun', assignedAt: '1 Sep 2026' }),
    tok({ serial: 'MO-DT-3', userId: 'priya', assignedAt: '1 Sep 2026' }),
    tok({ serial: 'MO-DT-4', userId: null }),
  ]

  it('has a sample whose rows fit the token sample', () => {
    expect(ASSIGNMENT_CSV_SAMPLE.split('\n')[0]).toBe(HEADER)
    const inventory = parseTokenCsv(TOKEN_CSV_SAMPLE, [], NOW).ready
    const r = parseAssignmentCsv(ASSIGNMENT_CSV_SAMPLE, usersAt('medium').people, inventory)
    expect(r.error).toBeNull()
    expect(r.skipped).toEqual([])
    expect(r.ready).toHaveLength(2)
  })

  it('errors on an empty file, missing columns and a bare header', () => {
    expect(parseAssignmentCsv('', users, tokens).error).toBe('The file is empty.')
    expect(parseAssignmentCsv('username\npriya@mo.com', users, tokens).error).toBe('The file needs the columns username and serial_number.')
    expect(parseAssignmentCsv(HEADER + '\r\n', users, tokens).error).toBe('The file has no rows under the header.')
  })

  it('matches username by email in any case, or by exact id, and returns the stored serial', () => {
    const text = `﻿Serial_Number,USERNAME\r\nmo-dt-1,PRIYA@MO.COM\r\n"MO-DT-4",arun\r\n`
    const r = parseAssignmentCsv(text, users, tokens)
    expect(r.error).toBeNull()
    expect(r.ready).toEqual([
      { userId: 'priya', serial: 'MO-DT-1' },
      { userId: 'arun', serial: 'MO-DT-4' },
    ])
  })

  it('does not match an id case-insensitively', () => {
    const r = parseAssignmentCsv(`${HEADER}\nPRIYA,MO-DT-1`, users, tokens)
    expect(r.skipped).toEqual([{ line: 2, serial: 'MO-DT-1', reason: 'No user with this username.' }])
  })

  it('gives each skip reason', () => {
    const text = [
      HEADER,
      'nobody@mo.com,MO-DT-1', // 2
      ',MO-DT-1', // 3
      'priya@mo.com,MO-DT-99', // 4
      'priya@mo.com,', // 5
      'priya@mo.com,MO-DT-2', // 6 — Arun holds it
      'priya@mo.com,MO-DT-3', // 7 — Priya already holds it
      'priya@mo.com,MO-DT-1', // 8 — accepted
      'arun@mo.com,mo-dt-1', // 9 — same token again
    ].join('\n')
    const r = parseAssignmentCsv(text, users, tokens)
    expect(r.ready).toEqual([{ userId: 'priya', serial: 'MO-DT-1' }])
    expect(r.skipped).toEqual([
      { line: 2, serial: 'MO-DT-1', reason: 'No user with this username.' },
      { line: 3, serial: 'MO-DT-1', reason: 'No user with this username.' },
      { line: 4, serial: 'MO-DT-99', reason: 'No token with this serial number.' },
      { line: 5, serial: '', reason: 'No token with this serial number.' },
      { line: 6, serial: 'MO-DT-2', reason: 'Already assigned to Arun Patel.' },
      { line: 7, serial: 'MO-DT-3', reason: 'Already assigned to this user.' },
      { line: 9, serial: 'mo-dt-1', reason: 'Appears twice in this file.' },
    ])
  })

  it('falls back to "another user" when the holder is not in the directory', () => {
    const r = parseAssignmentCsv(`${HEADER}\npriya@mo.com,X1`, users, [tok({ serial: 'X1', userId: 'gone' })])
    expect(r.skipped[0].reason).toBe('Already assigned to another user.')
  })

  it('refuses more than 5,000 rows', () => {
    const text = [HEADER, ...Array.from({ length: 5001 }, () => 'priya@mo.com,MO-DT-1')].join('\n')
    expect(parseAssignmentCsv(text, users, tokens).error).toBe('Upload 5,000 rows or fewer at a time.')
  })
})

describe('assignTokens', () => {
  const tokens = [
    tok({ serial: 'A1' }),
    tok({ serial: 'A2' }),
    tok({ serial: 'B1', userId: 'arun', assignedAt: '1 Sep 2026' }),
    tok({ serial: 'P1', userId: 'priya', assignedAt: '2 Sep 2026' }),
  ]

  it('assigns several tokens to one person and stamps the date', () => {
    const r = assignTokens(tokens, 'priya', ['a1', 'A2'], NOW)
    expect(r.assigned).toEqual(['A1', 'A2'])
    expect(r.skipped).toEqual([])
    expect(tokensOf(r.tokens, 'priya').map((t) => t.serial)).toEqual(['A1', 'A2', 'P1'])
    expect(r.tokens.find((t) => t.serial === 'A1')).toMatchObject({ userId: 'priya', assignedAt: NOW })
    // The input is not mutated.
    expect(tokens[0].userId).toBeNull()
  })

  it('skips unknown serials, tokens someone else holds, and ones this person already holds', () => {
    const r = assignTokens(tokens, 'priya', [' zz ', 'B1', 'P1', 'A1'], NOW)
    expect(r.assigned).toEqual(['A1'])
    expect(r.skipped).toEqual([
      { serial: 'zz', reason: 'No token with this serial number.' },
      { serial: 'B1', reason: 'Already assigned to another user.' },
      { serial: 'P1', reason: 'Already assigned to this user.' },
    ])
    expect(r.tokens.find((t) => t.serial === 'B1')?.userId).toBe('arun')
    expect(r.tokens.find((t) => t.serial === 'P1')?.assignedAt).toBe('2 Sep 2026')
  })

  it('skips a serial listed twice in one call', () => {
    const r = assignTokens(tokens, 'priya', ['A1', 'a1'], NOW)
    expect(r.assigned).toEqual(['A1'])
    expect(r.skipped).toEqual([{ serial: 'A1', reason: 'Already assigned to this user.' }])
  })
})

describe('unassignTokens', () => {
  it('clears the holder and the assignment date, and leaves the rest alone', () => {
    const tokens = [tok({ serial: 'A1', userId: 'priya', assignedAt: NOW }), tok({ serial: 'A2', userId: 'arun', assignedAt: NOW })]
    const next = unassignTokens(tokens, ['a1', 'missing'])
    expect(next[0]).toEqual({ serial: 'A1', type: 'miniorange', userId: null, addedAt: '1 Sep 2026' })
    expect('assignedAt' in next[0]).toBe(false)
    expect(next[1]).toBe(tokens[1])
  })

  it('keeps counter and sync history', () => {
    const t = tok({ serial: 'C1', type: 'feitian-c100', counter: 9, syncedAt: '3 Sep 2026', userId: 'priya', assignedAt: NOW })
    expect(unassignTokens([t], ['C1'])[0]).toMatchObject({ counter: 9, syncedAt: '3 Sep 2026', userId: null })
  })
})

describe('deleting', () => {
  it('blocks an assigned token', () => {
    expect(deleteBlocker(tok({ userId: 'priya' }))).toBe('Unassign it first.')
    expect(deleteBlocker(tok())).toBeNull()
  })

  it('deletes unassigned tokens and reports the assigned ones as blocked', () => {
    const tokens = [tok({ serial: 'A1' }), tok({ serial: 'A2', userId: 'priya' }), tok({ serial: 'A3' })]
    const r = deleteTokens(tokens, ['a1', 'A2', 'nope'])
    expect(r.deleted).toEqual(['A1'])
    expect(r.blocked).toEqual(['A2'])
    expect(r.tokens.map((t) => t.serial)).toEqual(['A2', 'A3'])
  })
})

describe('sync', () => {
  const CODES_MSG = 'Enter the three codes the token shows, one after another.'

  it('needs exactly three six-digit codes', () => {
    expect(syncErrors(['123456', '234567', '345678'])).toBeNull()
    expect(syncErrors([' 123 456', '234567', '345678'])).toBeNull()
    expect(syncErrors(['123456', '234567'])).toBe(CODES_MSG)
    expect(syncErrors(['123456', '234567', '345678', '456789'])).toBe(CODES_MSG)
    expect(syncErrors(['12345', '234567', '345678'])).toBe(CODES_MSG)
    expect(syncErrors(['1234567', '234567', '345678'])).toBe(CODES_MSG)
    expect(syncErrors(['12345a', '234567', '345678'])).toBe(CODES_MSG)
    expect(syncErrors(['', '', ''])).toBe(CODES_MSG)
  })

  it('refuses three identical codes', () => {
    expect(syncErrors(['111111', '111111', '111111'])).toBe('Press the button between codes.')
    expect(syncErrors(['111111', '111111', '222222'])).toBeNull()
  })

  it('syncs an event-based token: stamps the date and resets the counter', () => {
    const tokens = [tok({ serial: 'C1', type: 'feitian-c100', counter: 88 }), tok({ serial: 'T1', type: 'totp' })]
    const r = syncToken(tokens, 'c1', NOW)
    expect(r.error).toBeNull()
    expect(r.tokens[0]).toMatchObject({ counter: 0, syncedAt: NOW })
    expect(r.tokens[1]).toBe(tokens[1])
  })

  it('refuses time-based and unknown tokens without changing anything', () => {
    const tokens = [tok({ serial: 'T1', type: 'totp' }), tok({ serial: 'C2', type: 'feitian-c200' })]
    for (const s of ['T1', 'C2']) {
      const r = syncToken(tokens, s, NOW)
      expect(r.error).toBe('Only event-based tokens can be synced.')
      expect(r.tokens).toEqual(tokens)
    }
    expect(syncToken(tokens, 'none', NOW).error).toBe('No token with this serial number.')
    expect(canSync(tok({ type: 'feitian-c100' }))).toBe(true)
    expect(canSync(tok({ type: 'miniorange' }))).toBe(false)
  })
})

describe('selectors', () => {
  const tokens = [
    tok({ serial: 'A1', userId: 'priya' }),
    tok({ serial: 'A2', userId: 'priya' }),
    tok({ serial: 'A3', userId: 'arun' }),
    tok({ serial: 'A4' }),
  ]

  it('counts assignments, distinct holders and inventory', () => {
    expect(tokensOf(tokens, 'priya').map((t) => t.serial)).toEqual(['A1', 'A2'])
    expect(tokensOf(tokens, 'nobody')).toEqual([])
    expect(assignedCount(tokens)).toBe(3)
    expect(holders(tokens)).toBe(2)
    expect(unassigned(tokens).map((t) => t.serial)).toEqual(['A4'])
    expect(assignedCount([])).toBe(0)
    expect(holders([])).toBe(0)
  })
})

describe('withTokenState', () => {
  const methods = [
    { id: 'otp-email', configured: true, active: true },
    { id: DISPLAY_TOKEN_METHOD_ID, configured: false, active: false },
  ]

  it('configures the method while a token is assigned', () => {
    const next = withTokenState(methods, [tok({ userId: 'priya' })])
    expect(next[1]).toEqual({ id: DISPLAY_TOKEN_METHOD_ID, configured: true, active: false })
    expect(next[0]).toBe(methods[0])
  })

  it('unconfigures and switches it off when the last assignment goes', () => {
    const on = [methods[0], { id: DISPLAY_TOKEN_METHOD_ID, configured: true, active: true }]
    expect(withTokenState(on, [tok()])[1]).toEqual({ id: DISPLAY_TOKEN_METHOD_ID, configured: false, active: false })
  })

  it('leaves an active method on while tokens stay assigned', () => {
    const on = [{ id: DISPLAY_TOKEN_METHOD_ID, configured: true, active: true }]
    expect(withTokenState(on, [tok({ userId: 'arun' })])).toBe(on)
  })

  it('returns the same array when nothing changes', () => {
    expect(withTokenState(methods, [])).toBe(methods)
  })
})

describe('tokensAt', () => {
  const depths: Depth[] = ['none', 'small', 'medium', 'large']

  it('is empty on day one and three tokens, one issued, in a small tenant', () => {
    expect(tokensAt('none')).toEqual([])
    const small = tokensAt('small')
    expect(small).toHaveLength(3)
    expect(assignedCount(small)).toBe(1)
  })

  it('seeds a mixed drawer for growing and enterprise tenants', () => {
    for (const depth of ['medium', 'large'] as const) {
      const ts = tokensAt(depth)
      expect(ts.length).toBeGreaterThanOrEqual(7)
      expect(new Set(ts.map((t) => t.type))).toEqual(new Set(['miniorange', 'feitian-c100', 'feitian-c200', 'totp']))
      const share = assignedCount(ts) / ts.length
      expect(share).toBeGreaterThanOrEqual(0.3)
      expect(share).toBeLessThanOrEqual(0.7)
      // Someone holds more than one token.
      expect(holders(ts)).toBeLessThan(assignedCount(ts))
      // A synced C100 with a counter.
      expect(ts.some((t) => t.type === 'feitian-c100' && typeof t.counter === 'number' && t.syncedAt)).toBe(true)
    }
  })

  it('names only holders the tenant directory lists, at every depth', () => {
    for (const depth of depths) {
      const ids = new Set(usersAt(depth).people.map((u) => u.id))
      for (const t of tokensAt(depth)) {
        if (t.userId) expect(ids.has(t.userId)).toBe(true)
        expect(!!t.userId).toBe(!!t.assignedAt)
      }
    }
  })

  it('seeds tokens the validation rules would accept', () => {
    for (const depth of depths) {
      const ts = tokensAt(depth)
      ts.forEach((t, i) => {
        const others = ts.filter((_, j) => j !== i)
        expect(tokenErrors({ serial: t.serial, secret: HEX_KEY, type: t.type, counter: String(t.counter ?? '') }, others)).toEqual({})
        expect(t.counter !== undefined).toBe(tokenType(t.type).counter)
        if (t.syncedAt) expect(canSync(t)).toBe(true)
      })
    }
  })

  it('leaves the seeded Display Token method configured exactly when a token is assigned', () => {
    for (const depth of depths) {
      const m = withTokenState(methodsAt(depth), tokensAt(depth)).find((x) => x.id === DISPLAY_TOKEN_METHOD_ID)
      expect(m?.configured).toBe(assignedCount(tokensAt(depth)) > 0)
      if (!m?.configured) expect(m?.active).toBe(false)
    }
  })
})
