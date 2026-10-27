import { describe, expect, it } from 'vitest'

import { apps as seed, type App } from '../data'
import { chipKey, fieldKey, listKey, matchRank, pickInto, takeOut, tokenRows, withApp, withoutApp } from './app-tokens'

/* The applications field's behaviour (owner, 24 Oct 2026: one field, the picks as chips with the search after them).
   The suite renders static markup only, so what a key or a press does is held here, on the functions the field calls. */

const pickApps = (...ids: string[]): App[] =>
  ids.map((id) => {
    const a = seed.find((x) => x.id === id)
    if (!a) throw new Error(`No seed application ${id}`)
    return a
  })
/* Catalogue order is this order. */
const apps = pickApps('salesforce', 'workday', 'github', 'm365', 'jira', 'slack', 'zoom', 'servicenow')
const takenBy = (id: string) => (id === 'slack' ? 'Slack access' : id === 'jira' ? 'Developer tools' : undefined)
const names = (xs: readonly App[]) => xs.map((a) => a.name)

describe('the list under the field', () => {
  it('offers what can be added, never what is already a chip, and sets apart what another policy holds', () => {
    const { free, used } = tokenRows(apps, ['workday', 'zoom'], takenBy, '')
    expect(names(free)).toEqual(['Salesforce', 'GitHub Enterprise', 'Microsoft 365', 'ServiceNow'])
    expect(used.map((u) => [u.app.name, u.owner])).toEqual([
      ['Jira', 'Developer tools'],
      ['Slack', 'Slack access'],
    ])
  })

  it('filters by the typed words: a name that starts with them first, then one that holds them', () => {
    const { free, used } = tokenRows(apps, [], takenBy, 's')
    expect(names(free)).toEqual(['Salesforce', 'ServiceNow', 'GitHub Enterprise', 'Microsoft 365'])
    expect(used.map((u) => u.app.name)).toEqual(['Slack'])
  })

  it('reads the words without case or the spaces round them, and a word inside a name counts', () => {
    expect(names(tokenRows(apps, [], takenBy, '  SERV ').free)).toEqual(['ServiceNow'])
    expect(names(tokenRows(apps, [], takenBy, 'ent').free)).toEqual(['GitHub Enterprise'])
    expect(matchRank('GitHub Enterprise', 'git')).toBe(0)
    expect(matchRank('GitHub Enterprise', 'ent')).toBe(1)
    expect(matchRank('GitHub Enterprise', 'hub')).toBe(2)
    expect(matchRank('GitHub Enterprise', 'zoom')).toBe(3)
  })

  it('keeps an application another policy holds off the list of what can be added, whatever is typed', () => {
    const { free, used } = tokenRows(apps, [], takenBy, 'sla')
    expect(free).toEqual([])
    expect(used.map((u) => [u.app.id, u.owner])).toEqual([['slack', 'Slack access']])
  })
})

describe('picking and taking off', () => {
  it('a pick joins the field and empties the search for the next one', () => {
    expect(pickInto(apps, { query: 'zo', picked: ['salesforce'] }, 'zoom')).toEqual({ query: '', picked: ['salesforce', 'zoom'] })
  })

  it('keeps the catalogue order, so the same set picked in another order is not a change', () => {
    expect(withApp(apps, ['servicenow', 'salesforce'], 'zoom')).toEqual(['salesforce', 'zoom', 'servicenow'])
    const readded = withApp(apps, withoutApp(['salesforce', 'zoom'], 'salesforce'), 'salesforce')
    expect(readded).toEqual(['salesforce', 'zoom'])
  })

  it('taking a chip off leaves the typed words where they are', () => {
    expect(takeOut({ query: 'wo', picked: ['salesforce', 'zoom'] }, 'zoom')).toEqual({ query: 'wo', picked: ['salesforce'] })
  })
})

describe('keys in the search', () => {
  it('Backspace in an empty search picks out the last chip, and the second Backspace, on it, takes it off', () => {
    expect(fieldKey('Backspace', { query: '', picked: ['salesforce', 'zoom'] }, undefined)).toEqual({ do: 'focus-chip', index: 1 })
    expect(chipKey('Backspace', 1, 2)).toEqual({ do: 'remove', index: 1, then: 'input' })
  })

  it('leaves Backspace to the input while words are typed, and when there is no chip to pick out', () => {
    expect(fieldKey('Backspace', { query: 'zo', picked: ['zoom'] }, undefined)).toBeNull()
    expect(fieldKey('Backspace', { query: '', picked: [] }, undefined)).toBeNull()
  })

  it('Enter adds the first match that can be added, and only while words are typed', () => {
    const typed = { query: 's', picked: [] }
    const first = tokenRows(apps, typed.picked, takenBy, typed.query).free[0]?.id
    expect(fieldKey('Enter', typed, first)).toEqual({ do: 'add', id: 'salesforce' })
    expect(fieldKey('Enter', { query: '', picked: [] }, 'salesforce')).toBeNull()
    expect(fieldKey('Enter', { query: '   ', picked: [] }, 'salesforce')).toBeNull()
  })

  it('Enter adds nothing when the only match is on another policy', () => {
    const typed = { query: 'slack', picked: [] }
    expect(fieldKey('Enter', typed, tokenRows(apps, [], takenBy, typed.query).free[0]?.id)).toBeNull()
  })

  it('Escape clears typed words (and stops there); with nothing typed it is left to the dialog', () => {
    expect(fieldKey('Escape', { query: 'zo', picked: [] }, 'zoom')).toEqual({ do: 'clear' })
    expect(fieldKey('Escape', { query: '', picked: ['zoom'] }, undefined)).toBeNull()
  })

  it('↓ goes into the list', () => {
    expect(fieldKey('ArrowDown', { query: '', picked: [] }, undefined)).toEqual({ do: 'list' })
    expect(fieldKey('ArrowDown', { query: 'zo', picked: [] }, 'zoom')).toEqual({ do: 'list' })
  })

  it('leaves every other key to the input', () => {
    for (const key of ['a', ' ', 'ArrowLeft', 'ArrowRight', 'Tab', 'Delete']) expect(fieldKey(key, { query: '', picked: ['zoom'] }, undefined)).toBeNull()
  })
})

describe('keys on a chip and in the list', () => {
  it('Delete takes the chip off and stays on the chips; ← and → walk them, and → past the last is the search', () => {
    expect(chipKey('Delete', 0, 3)).toEqual({ do: 'remove', index: 0, then: 'next' })
    expect(chipKey('ArrowLeft', 2, 3)).toEqual({ do: 'focus-chip', index: 1 })
    expect(chipKey('ArrowLeft', 0, 3)).toBeNull()
    expect(chipKey('ArrowRight', 1, 3)).toEqual({ do: 'focus-chip', index: 2 })
    expect(chipKey('ArrowRight', 2, 3)).toEqual({ do: 'focus-input' })
    expect(chipKey('Enter', 0, 3)).toBeNull()
  })

  it('↑ and ↓ move through the rows, ↑ from the first is the search again, Home and End go to the ends', () => {
    expect(listKey('ArrowDown', 0, 4)).toEqual({ do: 'focus-row', index: 1 })
    expect(listKey('ArrowDown', 3, 4)).toEqual({ do: 'focus-row', index: 3 })
    expect(listKey('ArrowUp', 2, 4)).toEqual({ do: 'focus-row', index: 1 })
    expect(listKey('ArrowUp', 0, 4)).toEqual({ do: 'focus-input' })
    expect(listKey('Home', 2, 4)).toEqual({ do: 'focus-row', index: 0 })
    expect(listKey('End', 0, 4)).toEqual({ do: 'focus-row', index: 3 })
    expect(listKey('ArrowDown', 0, 0)).toBeNull()
    expect(listKey('a', 0, 4)).toBeNull()
  })
})
