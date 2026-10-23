import { describe, expect, it } from 'vitest'

import { BUILDER_VERSIONS, isBuilderUnlocked, sha256Hex, unlockBuilder } from './builder-version'

describe('builder versions', () => {
  it('has five builds in the order they are built', () => {
    expect(BUILDER_VERSIONS.map((v) => v.value)).toEqual(['v0', 'v1', 'v2', 'v3', 'full'])
  })

  it('hashes the way SHA-256 does', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('stays locked on a wrong password', async () => {
    expect(await unlockBuilder('not the password')).toBe(false)
    expect(isBuilderUnlocked()).toBe(false)
  })
})
