export type VisualizationKind = 'line' | 'area' | 'bar' | 'compare'
export type UnitKind =
  | 'percent'
  | 'percentOfGdp'
  | 'percentagePoints'
  | 'index'
  | 'thousandsJobs'
  | 'thousandsUnits'

export interface DashboardPoint {
  date: string
  label: string
  value: number | null
  secondaryValue?: number | null
}

export interface DashboardDelta {
  label: string
  value: number
  formatted: string
  direction: 'up' | 'down' | 'flat'
}

export interface DashboardLatestValue {
  label: string
  date: string
  value: number
  formatted: string
}

export interface DashboardIndicator {
  id: string
  title: string
  section: string
  source: string
  sourceUrl: string
  origin?: string
  frequency: 'daily' | 'monthly' | 'quarterly' | 'annual'
  visualization: VisualizationKind
  unit: UnitKind
  latest: DashboardLatestValue
  previous?: DashboardLatestValue
  delta?: DashboardDelta
  description: string
  rationale: string
  secondaryLabel?: string
  showZeroLine?: boolean
  series: DashboardPoint[]
}

export interface DashboardSection {
  id: string
  kicker: string
  title: string
  description: string
  indicatorIds: string[]
}

export interface SourceStatus {
  id: string
  name: string
  status: 'live' | 'fallback' | 'skipped' | 'error'
  detail: string
  link: string
}

export interface DashboardData {
  title: string
  deck: string
  generatedAt: string
  highlights: string[]
  featuredIds: string[]
  sections: DashboardSection[]
  indicators: DashboardIndicator[]
  sourceStatus: SourceStatus[]
  notes: string[]
}
