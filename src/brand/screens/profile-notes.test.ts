import { describe, expect, it } from 'vitest'

import {
  APP_BASIC_NOTE,
  CHECKS_NOTE,
  DEVICES_NOTE,
  RISK_SIGNALS_NOTE,
  SIGNALS_NOTE,
  TYPE_NOTE,
  itemsNote,
  type ProfileNote,
} from './profile-notes'

/* Every panel this module exports, the risk one included — it was the panel
   this file was written for and the only one the sweep below did not reach —
   and the application page's Basic panel, which borrows the shape. */
const NOTES: ProfileNote[] = [TYPE_NOTE, DEVICES_NOTE, CHECKS_NOTE, SIGNALS_NOTE, RISK_SIGNALS_NOTE, APP_BASIC_NOTE]

describe('the device profile side panels', () => {
  it('says a step in the words of its own type', () => {
    expect(itemsNote('os')).toBe(CHECKS_NOTE)
    expect(itemsNote('device')).toBe(SIGNALS_NOTE)
  })

  it('is fixed copy: every panel says something, and nothing in it is a value', () => {
    for (const note of NOTES) {
      expect(note.title.length, note.title).toBeGreaterThan(0)
      expect((note.lines?.length ?? 0) + (note.terms?.length ?? 0), note.title).toBeGreaterThan(0)
      const text = [note.title, ...(note.lines ?? []), ...(note.terms ?? []).flatMap((t) => [t.term, t.note]), note.foot ?? '']
      for (const line of text) {
        /* A number in a panel came from the draft — the device cap, a version,
           a count of checks — which is what these panels stopped doing. */
        expect(line, line).not.toMatch(/\d/)
        expect(line, line).not.toMatch(/\$\{|undefined|NaN/)
      }
    }
  })

  it('names both options wherever the reader is choosing between them', () => {
    expect(TYPE_NOTE.terms?.map((t) => t.term)).toEqual(['Device health', 'Trusted device'])
    expect(DEVICES_NOTE.terms?.map((t) => t.term)).toContain('Agentless')
    expect(DEVICES_NOTE.terms?.map((t) => t.term)).toContain('Agent-based')
    expect(SIGNALS_NOTE.terms?.map((t) => t.term)).toEqual(['High priority', 'Medium priority', 'Low priority'])
  })

  /* The application page shows it only beside an App secret, so the secret is
     the one thing it names. */
  it('names the App secret on an application’s Basic panel', () => {
    expect(APP_BASIC_NOTE.terms?.map((t) => t.term)).toEqual(['App secret'])
  })
})
