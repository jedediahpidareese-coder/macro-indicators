import type { UnitKind } from '../types/dashboard'

const timestampFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function formatTimestamp(value: string) {
  return timestampFormatter.format(new Date(value))
}

export function formatAxisValue(value: number, unit: UnitKind) {
  if (!Number.isFinite(value)) {
    return 'n/a'
  }

  switch (unit) {
    case 'percent':
    case 'percentOfGdp':
      return `${value.toFixed(1)}%`
    case 'percentagePoints':
      return `${value.toFixed(1)} pp`
    case 'index':
      return value.toFixed(1)
    case 'thousandsJobs':
      return `${Math.round(value)}k`
    case 'thousandsUnits':
      return value >= 1000 ? `${(value / 1000).toFixed(2)}M` : `${Math.round(value)}k`
    default:
      return value.toFixed(1)
  }
}
