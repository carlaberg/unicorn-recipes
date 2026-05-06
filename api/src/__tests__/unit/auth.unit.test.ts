import { describe, it, expect } from 'vitest'
import { getUserIdFromRequest } from '../../utils/auth'

describe('getUserIdFromRequest', () => {
  it('returns parsed userId from x-user-id header', () => {
    expect(getUserIdFromRequest({ 'x-user-id': '42' })).toBe(42)
  })

  it('defaults to 1 when header is not present', () => {
    expect(getUserIdFromRequest({})).toBe(1)
  })

  it('handles array header value by taking first element', () => {
    expect(getUserIdFromRequest({ 'x-user-id': ['99', '100'] })).toBe(99)
  })

  it('returns NaN for non-numeric header value (parseInt behavior)', () => {
    const result = getUserIdFromRequest({ 'x-user-id': 'abc' })
    expect(isNaN(result)).toBe(true)
  })
})
