/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import { arriveFromBoard, sendToBoard, type SentToBoard } from './board-return'
import pageSrc from './ApplicationPage.tsx?raw'

/* The celebration on the way back from the board (review 10 Oct 2026, #13):
   only for the return the New policy or Add a copy press started, and only
   when that policy became the application's first deciding one in it. */

const decidesNow = () => true
const decidesNot = () => false

describe('back from the board', () => {
  it('celebrates the first deciding policy on the return the press started, once', () => {
    const sent: SentToBoard = new Map()
    sendToBoard(sent, 'p1', false)
    expect(arriveFromBoard(sent, 'p1', decidesNow)).toBe(true)
    /* StrictMode's second run, or any later arrival with the same flash. */
    expect(arriveFromBoard(sent, 'p1', decidesNow)).toBe(false)
  })

  it('is quiet when the application already had a deciding policy', () => {
    const sent: SentToBoard = new Map()
    sendToBoard(sent, 'p1', true)
    expect(arriveFromBoard(sent, 'p1', decidesNow)).toBe(false)
  })

  it('is quiet when the policy came back deciding for nobody', () => {
    const sent: SentToBoard = new Map()
    sendToBoard(sent, 'p1', false)
    expect(arriveFromBoard(sent, 'p1', decidesNot)).toBe(false)
  })

  /* New policy, the board left through the rail, the policy turned on
     elsewhere; later Edit policy and Back from the same application. */
  it('forgets a board left some other way: a later Edit policy and Back is quiet', () => {
    const sent: SentToBoard = new Map()
    sendToBoard(sent, 'p1', false)
    expect(arriveFromBoard(sent, undefined, decidesNow)).toBe(false)
    expect(arriveFromBoard(sent, 'p1', decidesNow)).toBe(false)
  })

  it('spends every note on any arrival, at this application or another', () => {
    const sent: SentToBoard = new Map()
    sendToBoard(sent, 'p1', false)
    sendToBoard(sent, 'p2', false)
    expect(arriveFromBoard(sent, 'p2', decidesNow)).toBe(true)
    expect(sent.size).toBe(0)
    expect(arriveFromBoard(sent, 'p1', decidesNow)).toBe(false)
  })

  it('is asked on every arrival at an application page, whatever its tab', () => {
    const page = pageSrc.slice(pageSrc.indexOf('function AppPage('), pageSrc.indexOf('function PoliciesTab('))
    expect(page).toContain("if (arriveFromBoard(sentToBoard, flash, decides)) playCue('celebrate')")
    expect(pageSrc.match(/sendToBoard\(sentToBoard, id, had\)/g)).toHaveLength(2)
    expect(pageSrc).not.toContain('sentToBoard.get(')
  })
})
