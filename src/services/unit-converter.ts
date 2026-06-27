import { UnitType } from '../types'

interface UnitDef {
  type: UnitType
  toBase: number
}

export const UNITS: Record<string, UnitDef> = {
  // volume (base: ml)
  ml: { type: 'volume', toBase: 1 },
  tsp: { type: 'volume', toBase: 4.93 },
  tbsp: { type: 'volume', toBase: 14.79 },
  'fl oz': { type: 'volume', toBase: 29.57 },
  cup: { type: 'volume', toBase: 236.59 },
  pint: { type: 'volume', toBase: 473.18 },
  quart: { type: 'volume', toBase: 946.35 },
  gallon: { type: 'volume', toBase: 3785.41 },
  liter: { type: 'volume', toBase: 1000 },
  // weight (base: g)
  mg: { type: 'weight', toBase: 0.001 },
  g: { type: 'weight', toBase: 1 },
  kg: { type: 'weight', toBase: 1000 },
  oz: { type: 'weight', toBase: 28.35 },
  lb: { type: 'weight', toBase: 453.59 },
  // count (base: unit)
  unit: { type: 'count', toBase: 1 },
  dozen: { type: 'count', toBase: 12 },
  score: { type: 'count', toBase: 20 },
  gross: { type: 'count', toBase: 144 },
}

// Ordered largest-first for human-friendly display selection
const VOLUME_ORDER = ['gallon', 'quart', 'pint', 'liter', 'cup', 'fl oz', 'tbsp', 'tsp', 'ml']
const WEIGHT_ORDER = ['kg', 'lb', 'g', 'oz', 'mg']
const COUNT_ORDER = ['gross', 'dozen', 'score', 'unit']

const ORDER: Record<UnitType, string[]> = {
  volume: VOLUME_ORDER,
  weight: WEIGHT_ORDER,
  count: COUNT_ORDER,
}

export const getUnitType = (unit: string): UnitType => {
  const def = UNITS[unit]
  if (!def) throw new Error(`Unknown unit: ${unit}`)
  return def.type
}

export const convertToBase = (quantity: number, unit: string): number => {
  const def = UNITS[unit]
  if (!def) throw new Error(`Unknown unit: ${unit}`)
  return quantity * def.toBase
}

export const convertFromBase = (baseAmount: number, unitType: UnitType): { quantity: number; unit: string } => {
  const order = ORDER[unitType]
  for (const unit of order) {
    const factor = UNITS[unit].toBase
    const quantity = baseAmount / factor
    if (quantity >= 1) {
      return { quantity: Math.round(quantity * 100) / 100, unit }
    }
  }
  // Fall back to smallest unit
  const smallest = order[order.length - 1]
  return { quantity: Math.round((baseAmount / UNITS[smallest].toBase) * 100) / 100, unit: smallest }
}
