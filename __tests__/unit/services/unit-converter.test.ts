import { convertToBase, convertFromBase, getUnitType, UNITS } from '@services/unit-converter'

describe('UNITS', () => {
  it('ml has toBase of 1', () => expect(UNITS.ml.toBase).toBe(1))
  it('cup has toBase of 236.59', () => expect(UNITS.cup.toBase).toBe(236.59))
  it('g has toBase of 1', () => expect(UNITS.g.toBase).toBe(1))
  it('lb has toBase of 453.59', () => expect(UNITS.lb.toBase).toBe(453.59))
  it('unit (count) has toBase of 1', () => expect(UNITS.unit.toBase).toBe(1))
  it('dozen has toBase of 12', () => expect(UNITS.dozen.toBase).toBe(12))
  it('score has toBase of 20', () => expect(UNITS.score.toBase).toBe(20))
  it('gross has toBase of 144', () => expect(UNITS.gross.toBase).toBe(144))
})

describe('getUnitType', () => {
  it('returns volume for cup', () => expect(getUnitType('cup')).toBe('volume'))
  it('returns weight for oz', () => expect(getUnitType('oz')).toBe('weight'))
  it('returns count for dozen', () => expect(getUnitType('dozen')).toBe('count'))
  it('throws for unknown unit', () => expect(() => getUnitType('bushel')).toThrow('Unknown unit'))
})

describe('convertToBase', () => {
  it('converts 1 cup to 236.59 ml', () => expect(convertToBase(1, 'cup')).toBeCloseTo(236.59))
  it('converts 2 tbsp to ~29.58 ml', () => expect(convertToBase(2, 'tbsp')).toBeCloseTo(29.58))
  it('converts 1 lb to 453.59 g', () => expect(convertToBase(1, 'lb')).toBeCloseTo(453.59))
  it('converts 1 dozen to 12 units', () => expect(convertToBase(1, 'dozen')).toBe(12))
  it('passes through base units unchanged', () => {
    expect(convertToBase(5, 'ml')).toBe(5)
    expect(convertToBase(5, 'g')).toBe(5)
    expect(convertToBase(5, 'unit')).toBe(5)
  })
})

describe('convertFromBase', () => {
  it('converts 473.18 ml to 1 pint', () => {
    const result = convertFromBase(473.18, 'volume')
    expect(result.quantity).toBeCloseTo(1)
    expect(result.unit).toBe('pint')
  })

  it('converts 236.59 ml to 1 cup', () => {
    const result = convertFromBase(236.59, 'volume')
    expect(result.quantity).toBeCloseTo(1)
    expect(result.unit).toBe('cup')
  })

  it('converts 14.79 ml to 1 tbsp', () => {
    const result = convertFromBase(14.79, 'volume')
    expect(result.quantity).toBeCloseTo(1)
    expect(result.unit).toBe('tbsp')
  })

  it('converts 2 ml to ml (smallest unit)', () => {
    const result = convertFromBase(2, 'volume')
    expect(result.unit).toBe('ml')
  })

  it('converts 907.18 g to 2 lb', () => {
    const result = convertFromBase(907.18, 'weight')
    expect(result.quantity).toBeCloseTo(2)
    expect(result.unit).toBe('lb')
  })

  it('converts 24 units to 2 dozen', () => {
    const result = convertFromBase(24, 'count')
    expect(result.quantity).toBe(2)
    expect(result.unit).toBe('dozen')
  })

  it('converts 3 units to 3 unit', () => {
    const result = convertFromBase(3, 'count')
    expect(result.quantity).toBe(3)
    expect(result.unit).toBe('unit')
  })
})
