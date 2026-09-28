import { describe, expect, it } from 'vitest'

import { barTravel, hopMs } from './route-marker'

/* The marker's one clock (final spec, Assumption 39): at most 180 ms a hop and
   1.1 s for the route, whether it is the board's dot or the page's bar. */

describe('a hop', () => {
  it('is 180 ms on a short route and shares 1.1 s on a long one', () => {
    expect(hopMs(1)).toBe(180)
    expect(hopMs(6)).toBe(180)
    expect(hopMs(7)).toBe(157)
    expect(hopMs(20)).toBe(55)
    expect(hopMs(0)).toBe(180)
  })

  it('never lets a whole route run past 1.1 s', () => {
    for (let hops = 1; hops <= 40; hops++) expect(hops * hopMs(hops)).toBeLessThanOrEqual(1100)
  })
})

describe('the bar', () => {
  const stops = [
    { top: 0, height: 40 },
    { top: 48, height: 40 },
    { top: 96, height: 120 },
    { top: 224, height: 40 },
  ]

  it('travels through every stop between, evenly in time', () => {
    expect(barTravel(stops, 0, 3)).toEqual({ top: [0, 48, 96, 224], height: [40, 40, 120, 40], times: [0, 1 / 3, 2 / 3, 1], duration: 0.54 })
  })

  it('steps back as well as forward', () => {
    expect(barTravel(stops, 2, 1)).toMatchObject({ top: [96, 48], height: [120, 40], duration: 0.18 })
  })

  it('jumps, with no time, to where it already is or when there is nothing to travel', () => {
    expect(barTravel(stops, 2, 2)).toEqual({ top: [96], height: [120], times: [0], duration: 0 })
    expect(barTravel([], 0, 3)).toEqual({ top: [0], height: [0], times: [0], duration: 0 })
  })

  it('keeps a stop out of range on the track', () => {
    expect(barTravel(stops, -1, 9).top).toEqual([0, 48, 96, 224])
  })
})
