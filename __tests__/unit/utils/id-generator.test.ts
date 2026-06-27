import { generateId } from '@utils/id-generator'

describe('generateId', () => {
  it('returns the value from the provided uuid function', () => {
    const fixed = '00000000-0000-0000-0000-000000000001'
    expect(generateId(() => fixed)).toBe(fixed)
  })

  it('returns a uuid-shaped string when called with default', () => {
    expect(generateId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
