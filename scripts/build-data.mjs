import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import AdmZip from 'adm-zip'
import Papa from 'papaparse'

const GENERATED_AT = new Date().toISOString()
const BUILD_DATE = GENERATED_AT.slice(0, 10)
const CURRENT_YEAR = new Date().getUTCFullYear()
const LOOKBACK_YEARS = Number(process.env.REFRESH_LOOKBACK_YEARS ?? 12)
const START_YEAR = CURRENT_YEAR - LOOKBACK_YEARS
const OUTPUT_PATH = resolve(process.cwd(), 'public', 'data', 'dashboard.json')

const monthLabelFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
})

const dayLabelFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

function log(message) {
  console.log(`[build-data] ${message}`)
}

async function fetchText(url, options) {
  const response = await fetch(url, options)

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 180)}`)
  }

  return response.text()
}

async function fetchJson(url, options) {
  const response = await fetch(url, options)

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 180)}`)
  }

  return response.json()
}

async function fetchZipCsv(url) {
  const response = await fetch(url)

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 180)}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const zip = new AdmZip(buffer)
  const entry = zip
    .getEntries()
    .find((candidate) => candidate.entryName.toLowerCase().endsWith('.csv'))

  if (!entry) {
    throw new Error(`No CSV entry found in ${url}`)
  }

  return zip.readAsText(entry)
}

function safeNumber(value) {
  if (value == null) {
    return null
  }

  const normalized = String(value).trim()

  if (!normalized || normalized === '.' || normalized === '-') {
    return null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function labelForDate(date, frequency) {
  const utcDate = new Date(`${date}T00:00:00Z`)

  if (frequency === 'monthly') {
    return monthLabelFormatter.format(utcDate)
  }

  if (frequency === 'quarterly') {
    const quarter = Math.floor(utcDate.getUTCMonth() / 3) + 1
    return `Q${quarter} ${String(utcDate.getUTCFullYear()).slice(-2)}`
  }

  if (frequency === 'annual') {
    return String(utcDate.getUTCFullYear())
  }

  return dayLabelFormatter.format(utcDate)
}

function toMonthDate(year, period) {
  return `${year}-${period.slice(1)}-01`
}

function toQuarterDate(periodKey) {
  const [year, quarterCode] = periodKey.split('-Q')
  const quarterMap = {
    '1': ['03', '31'],
    '2': ['06', '30'],
    '3': ['09', '30'],
    '4': ['12', '31'],
  }
  const [month, day] = quarterMap[quarterCode]
  return `${year}-${month}-${day}`
}

function uniquePoints(points) {
  const seen = new Set()
  return points.filter((point) => {
    if (point.value == null || seen.has(point.date)) {
      return false
    }

    seen.add(point.date)
    return true
  })
}

function trimPoints(points, count) {
  return points.filter((point) => point.value != null).slice(-count)
}

function percentChange(points, lag) {
  return points
    .map((point, index) => {
      const base = points[index - lag]

      if (!base || base.value == null || point.value == null || base.value === 0) {
        return null
      }

      return {
        date: point.date,
        label: point.label,
        value: ((point.value - base.value) / base.value) * 100,
      }
    })
    .filter(Boolean)
}

function absoluteChange(points, lag = 1) {
  return points
    .map((point, index) => {
      const base = points[index - lag]

      if (!base || base.value == null || point.value == null) {
        return null
      }

      return {
        date: point.date,
        label: point.label,
        value: point.value - base.value,
      }
    })
    .filter(Boolean)
}

function mergeSecondarySeries(primary, secondary) {
  const secondaryMap = new Map(secondary.map((point) => [point.date, point.value]))

  return primary.map((point) => ({
    ...point,
    secondaryValue: secondaryMap.get(point.date) ?? null,
  }))
}

function formatValue(value, unit) {
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

function formatDelta(value, unit) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatValue(value, unit)}`
}

function deltaDirection(value) {
  if (Math.abs(value) < 0.05) {
    return 'flat'
  }

  return value > 0 ? 'up' : 'down'
}

function buildLatest(point, unit) {
  return {
    label: point.label,
    date: point.date,
    value: point.value,
    formatted: formatValue(point.value, unit),
  }
}

function buildIndicator({
  id,
  title,
  section,
  source,
  sourceUrl,
  origin,
  frequency,
  visualization,
  unit,
  deltaUnit = unit,
  description,
  rationale,
  secondaryLabel,
  showZeroLine = false,
  series,
}) {
  const cleanSeries = uniquePoints(series)
  const latestPoint = cleanSeries.at(-1)
  const previousPoint = cleanSeries.at(-2)

  if (!latestPoint) {
    throw new Error(`Indicator ${id} has no data`)
  }

  const indicator = {
    id,
    title,
    section,
    source,
    sourceUrl,
    origin,
    frequency,
    visualization,
    unit,
    latest: buildLatest(latestPoint, unit),
    description,
    rationale,
    secondaryLabel,
    showZeroLine,
    series: cleanSeries,
  }

  if (previousPoint) {
    const deltaValue = latestPoint.value - previousPoint.value
    indicator.previous = buildLatest(previousPoint, unit)
    indicator.delta = {
      label: `vs ${previousPoint.label}`,
      value: deltaValue,
      formatted: formatDelta(deltaValue, deltaUnit),
      direction: deltaDirection(deltaValue),
    }
  }

  return indicator
}

async function fetchBlsSeriesMap(seriesIds) {
  const payload = {
    seriesid: seriesIds,
    startyear: String(START_YEAR),
    endyear: String(CURRENT_YEAR),
  }

  const json = await fetchJson('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (json.status !== 'REQUEST_SUCCEEDED') {
    throw new Error(`BLS request failed with status ${json.status}`)
  }

  return Object.fromEntries(
    json.Results.series.map((series) => {
      const normalized = series.data
        .filter((item) => /^M\d{2}$/.test(item.period))
        .map((item) => {
          const date = toMonthDate(item.year, item.period)
          return {
            date,
            label: labelForDate(date, 'monthly'),
            value: safeNumber(item.value),
          }
        })
        .filter((item) => item.value != null)
        .sort((left, right) => left.date.localeCompare(right.date))

      return [series.seriesID, normalized]
    }),
  )
}

async function buildBlsIndicators() {
  const blsSeries = await fetchBlsSeriesMap([
    'LNS14000000',
    'CES0000000001',
    'CUUR0000SA0',
    'CUUR0000SA0L1E',
  ])

  const unemployment = trimPoints(blsSeries.LNS14000000, 72)
  const payrollLevels = trimPoints(blsSeries.CES0000000001, 73)
  const payrollChanges = trimPoints(absoluteChange(payrollLevels), 60)
  const headlineInflation = trimPoints(percentChange(blsSeries.CUUR0000SA0, 12), 72)
  const coreInflation = trimPoints(percentChange(blsSeries.CUUR0000SA0L1E, 12), 72)
  const inflationSeries = mergeSecondarySeries(headlineInflation, coreInflation)
  const latestCore = coreInflation.at(-1)

  return {
    indicators: [
      buildIndicator({
        id: 'unemployment-rate',
        title: 'Unemployment rate',
        section: 'labor-inflation',
        source: 'BLS',
        sourceUrl: 'https://www.bls.gov/developers/',
        frequency: 'monthly',
        visualization: 'line',
        unit: 'percent',
        deltaUnit: 'percentagePoints',
        description: `Headline unemployment was ${formatValue(unemployment.at(-1).value, 'percent')} in ${unemployment.at(-1).label}.`,
        rationale: 'A line chart is best for the unemployment rate because turning points and persistence matter more than one-off monthly moves.',
        series: unemployment,
      }),
      buildIndicator({
        id: 'payroll-change',
        title: 'Nonfarm payroll change',
        section: 'labor-inflation',
        source: 'BLS',
        sourceUrl: 'https://www.bls.gov/developers/',
        frequency: 'monthly',
        visualization: 'bar',
        unit: 'thousandsJobs',
        description: `Bars show month-over-month payroll additions or losses, with the latest print at ${formatValue(payrollChanges.at(-1).value, 'thousandsJobs')} in ${payrollChanges.at(-1).label}.`,
        rationale: 'Payroll changes are discrete monthly flows, so bars communicate acceleration and reversals better than a level line.',
        showZeroLine: true,
        series: payrollChanges,
      }),
      buildIndicator({
        id: 'headline-core-cpi',
        title: 'Headline vs. core CPI',
        section: 'labor-inflation',
        source: 'BLS',
        sourceUrl: 'https://www.bls.gov/developers/',
        frequency: 'monthly',
        visualization: 'compare',
        unit: 'percent',
        deltaUnit: 'percentagePoints',
        description: `Headline CPI ran ${formatValue(headlineInflation.at(-1).value, 'percent')} year over year in ${headlineInflation.at(-1).label}; the dashed line tracks core CPI at ${formatValue(latestCore.value, 'percent')}.`,
        rationale: 'Two lines are the clearest way to compare whether broad inflation and underlying inflation are diverging or converging.',
        secondaryLabel: 'Core CPI',
        series: inflationSeries,
      }),
    ],
    sourceStatus: [
      {
        id: 'bls',
        name: 'BLS',
        status: 'live',
        detail: 'Direct public API pull for labor market and CPI series.',
        link: 'https://www.bls.gov/developers/',
      },
    ],
  }
}

async function fetchFredSeries(seriesId) {
  const apiKey = process.env.FRED_API_KEY

  if (apiKey) {
    const url = new URL('https://api.stlouisfed.org/fred/series/observations')
    url.searchParams.set('series_id', seriesId)
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('file_type', 'json')
    url.searchParams.set('observation_start', `${START_YEAR}-01-01`)

    const json = await fetchJson(url.toString())
    return json.observations
      .map((item) => ({
        date: item.date,
        label: labelForDate(item.date, /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? 'daily' : 'monthly'),
        value: safeNumber(item.value),
      }))
      .filter((item) => item.value != null)
  }

  const csvText = await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`)
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true }).data

  return parsed
    .map((row) => {
      const keys = Object.keys(row)
      const date = row[keys[0]]
      const value = safeNumber(row[keys[1]])
      return {
        date,
        label: labelForDate(
          date,
          /^\d{4}-\d{2}-\d{2}$/.test(date) && seriesId === 'T10Y2Y' ? 'daily' : date.endsWith('-01') && seriesId !== 'A191RL1Q225SBEA' ? 'monthly' : 'daily',
        ),
        value,
      }
    })
    .filter((item) => item.value != null && item.date >= `${START_YEAR}-01-01`)
}

async function buildFredIndicators() {
  const [
    gdpGrowthRaw,
    fedFundsRaw,
    yieldSpreadRaw,
    housingStartsRaw,
    industrialProductionRaw,
  ] = await Promise.all([
    fetchFredSeries('A191RL1Q225SBEA'),
    fetchFredSeries('FEDFUNDS'),
    fetchFredSeries('T10Y2Y'),
    fetchFredSeries('HOUST'),
    fetchFredSeries('INDPRO'),
  ])

  const gdpGrowth = trimPoints(
    gdpGrowthRaw.map((point) => ({
      ...point,
      label: labelForDate(point.date, 'quarterly'),
    })),
    28,
  )
  const fedFunds = trimPoints(
    fedFundsRaw.map((point) => ({
      ...point,
      label: labelForDate(point.date, 'monthly'),
    })),
    72,
  )
  const yieldSpread = trimPoints(
    yieldSpreadRaw.map((point) => ({
      ...point,
      label: labelForDate(point.date, 'daily'),
    })),
    365,
  )
  const housingStarts = trimPoints(
    housingStartsRaw.map((point) => ({
      ...point,
      label: labelForDate(point.date, 'monthly'),
    })),
    72,
  )
  const industrialProduction = trimPoints(
    industrialProductionRaw.map((point) => ({
      ...point,
      label: labelForDate(point.date, 'monthly'),
    })),
    72,
  )

  const fredStatus = {
    id: 'fred',
    name: 'FRED',
    status: process.env.FRED_API_KEY ? 'live' : 'fallback',
    detail: process.env.FRED_API_KEY
      ? 'Official FRED API is active.'
      : 'Using the public FRED CSV export path because FRED_API_KEY is unset.',
    link: 'https://fred.stlouisfed.org/docs/api/fred/',
  }

  return {
    indicators: [
      buildIndicator({
        id: 'real-gdp-growth',
        title: 'Real GDP growth',
        section: 'growth-activity',
        source: 'FRED',
        sourceUrl: 'https://fred.stlouisfed.org/series/A191RL1Q225SBEA',
        origin: 'BEA',
        frequency: 'quarterly',
        visualization: 'bar',
        unit: 'percent',
        deltaUnit: 'percentagePoints',
        description: `Quarterly real GDP growth last printed at ${formatValue(gdpGrowth.at(-1).value, 'percent')} in ${gdpGrowth.at(-1).label}.`,
        rationale: 'Quarterly growth prints are discrete observations, so bars make quarter-to-quarter swings easier to compare.',
        showZeroLine: true,
        series: gdpGrowth,
      }),
      buildIndicator({
        id: 'industrial-production',
        title: 'Industrial production',
        section: 'growth-activity',
        source: 'FRED',
        sourceUrl: 'https://fred.stlouisfed.org/series/INDPRO',
        origin: 'Board of Governors',
        frequency: 'monthly',
        visualization: 'line',
        unit: 'index',
        description: `Industrial production stood at ${formatValue(industrialProduction.at(-1).value, 'index')} in ${industrialProduction.at(-1).label}.`,
        rationale: 'The production index is a continuous level series, so a line best shows trend direction and cycle turning points.',
        series: industrialProduction,
      }),
      buildIndicator({
        id: 'housing-starts',
        title: 'Housing starts',
        section: 'growth-activity',
        source: 'FRED',
        sourceUrl: 'https://fred.stlouisfed.org/series/HOUST',
        origin: 'US Census Bureau',
        frequency: 'monthly',
        visualization: 'area',
        unit: 'thousandsUnits',
        description: `Housing starts were running at ${formatValue(housingStarts.at(-1).value, 'thousandsUnits')} annualized units in ${housingStarts.at(-1).label}.`,
        rationale: 'An area chart emphasizes the scale of the housing cycle while still making directional changes easy to read.',
        series: housingStarts,
      }),
      buildIndicator({
        id: 'fed-funds-rate',
        title: 'Effective fed funds rate',
        section: 'rates-financial',
        source: 'FRED',
        sourceUrl: 'https://fred.stlouisfed.org/series/FEDFUNDS',
        origin: 'Board of Governors',
        frequency: 'monthly',
        visualization: 'line',
        unit: 'percent',
        deltaUnit: 'percentagePoints',
        description: `The effective fed funds rate averaged ${formatValue(fedFunds.at(-1).value, 'percent')} in ${fedFunds.at(-1).label}.`,
        rationale: 'Policy rate changes are best tracked as a line because persistence at a given level matters more than any single print.',
        series: fedFunds,
      }),
      buildIndicator({
        id: 'yield-curve-spread',
        title: '10Y minus 2Y Treasury spread',
        section: 'rates-financial',
        source: 'FRED',
        sourceUrl: 'https://fred.stlouisfed.org/series/T10Y2Y',
        origin: 'US Treasury / Board of Governors',
        frequency: 'daily',
        visualization: 'line',
        unit: 'percentagePoints',
        description: `The latest 10Y-2Y spread was ${formatValue(yieldSpread.at(-1).value, 'percentagePoints')} on ${yieldSpread.at(-1).label}.`,
        rationale: 'A line with a zero reference is the clearest way to spot inversions and re-steepening in the yield curve.',
        showZeroLine: true,
        series: yieldSpread,
      }),
    ],
    sourceStatus: [fredStatus],
  }
}

function parseBisColumnRows(csvText) {
  const parsed = Papa.parse(csvText, { skipEmptyLines: true })
  return parsed.data
}

function mapBisRows(rows) {
  const [header, ...dataRows] = rows
  return dataRows.map((row) => ({
    header,
    row,
  }))
}

function bisValue(record, key) {
  return record.row[record.header.indexOf(key)]
}

function bisQuarterSeries(record) {
  const firstQuarterIndex = record.header.findIndex((cell) => /^\d{4}-Q[1-4]$/.test(cell))

  return record.header
    .slice(firstQuarterIndex)
    .map((quarterKey, index) => {
      const date = toQuarterDate(quarterKey)
      return {
        date,
        label: labelForDate(date, 'quarterly'),
        value: safeNumber(record.row[firstQuarterIndex + index]),
      }
    })
    .filter((point) => point.value != null)
}

async function buildBisIndicators() {
  const [debtServiceCsv, creditCsv] = await Promise.all([
    fetchZipCsv('https://data.bis.org/static/bulk/WS_DSR_csv_col.zip'),
    fetchZipCsv('https://data.bis.org/static/bulk/WS_TC_csv_col.zip'),
  ])

  const debtServiceRows = mapBisRows(parseBisColumnRows(debtServiceCsv))
  const creditRows = mapBisRows(parseBisColumnRows(creditCsv))

  const debtServiceRecord = debtServiceRows.find(
    (record) =>
      bisValue(record, 'BORROWERS_CTY') === 'US' &&
      bisValue(record, 'DSR_BORROWERS') === 'P',
  )
  const creditRecord = creditRows.find(
    (record) =>
      bisValue(record, 'BORROWERS_CTY') === 'US' &&
      bisValue(record, 'TC_BORROWERS') === 'P' &&
      String(bisValue(record, 'TITLE_TS')).includes('Percentage of GDP'),
  )

  if (!debtServiceRecord || !creditRecord) {
    throw new Error('Unable to locate BIS rows for US private-sector leverage')
  }

  const debtService = trimPoints(bisQuarterSeries(debtServiceRecord), 28)
  const privateCredit = trimPoints(bisQuarterSeries(creditRecord), 28)

  return {
    indicators: [
      buildIndicator({
        id: 'bis-debt-service-ratio',
        title: 'Private-sector debt service ratio',
        section: 'balance-context',
        source: 'BIS',
        sourceUrl: 'https://data.bis.org/topics/DSR',
        frequency: 'quarterly',
        visualization: 'line',
        unit: 'percent',
        deltaUnit: 'percentagePoints',
        description: `The BIS private-sector debt service ratio stood at ${formatValue(debtService.at(-1).value, 'percent')} in ${debtService.at(-1).label}.`,
        rationale: 'Debt-service pressure is best read as a continuous quarterly line because its persistence matters more than single-quarter noise.',
        series: debtService,
      }),
      buildIndicator({
        id: 'bis-private-credit-gdp',
        title: 'Private credit to GDP',
        section: 'balance-context',
        source: 'BIS',
        sourceUrl: 'https://data.bis.org/topics/TOTAL_CREDIT',
        frequency: 'quarterly',
        visualization: 'area',
        unit: 'percentOfGdp',
        deltaUnit: 'percentagePoints',
        description: `US private non-financial credit was ${formatValue(privateCredit.at(-1).value, 'percentOfGdp')} of GDP in ${privateCredit.at(-1).label}.`,
        rationale: 'An area chart emphasizes the stock-like nature of leverage relative to GDP while keeping the long-run trend readable.',
        series: privateCredit,
      }),
    ],
    sourceStatus: [
      {
        id: 'bis',
        name: 'BIS',
        status: 'live',
        detail: 'Using the BIS bulk-download portal for quarterly leverage datasets.',
        link: 'https://data.bis.org/bulkdownload',
      },
    ],
  }
}

async function fetchWorldBankSeries(indicatorCode) {
  const url = new URL(`https://api.worldbank.org/v2/country/USA/indicator/${indicatorCode}`)
  url.searchParams.set('format', 'json')
  url.searchParams.set('per_page', '100')

  const payload = await fetchJson(url.toString())
  const rows = Array.isArray(payload) ? payload[1] : []

  return rows
    .filter((row) => row?.value != null)
    .map((row) => {
      const date = `${row.date}-12-31`
      return {
        date,
        label: labelForDate(date, 'annual'),
        value: safeNumber(row.value),
      }
    })
    .filter((point) => point.value != null)
    .sort((left, right) => left.date.localeCompare(right.date))
}

async function buildWorldBankIndicators() {
  const [gdpGrowth, publicDebt] = await Promise.all([
    fetchWorldBankSeries('NY.GDP.MKTP.KD.ZG'),
    fetchWorldBankSeries('GC.DOD.TOTL.GD.ZS'),
  ])

  return {
    indicators: [
      buildIndicator({
        id: 'worldbank-gdp-growth',
        title: 'World Bank annual GDP growth',
        section: 'balance-context',
        source: 'World Bank',
        sourceUrl:
          'https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.KD.ZG?format=json',
        frequency: 'annual',
        visualization: 'bar',
        unit: 'percent',
        deltaUnit: 'percentagePoints',
        description: `The latest complete World Bank GDP growth estimate for the US is ${formatValue(gdpGrowth.at(-1).value, 'percent')} in ${gdpGrowth.at(-1).label}.`,
        rationale: 'Annual growth prints are discrete year-by-year observations, so bars are easier to compare than a smoothed line.',
        showZeroLine: true,
        series: trimPoints(gdpGrowth, 15),
      }),
      buildIndicator({
        id: 'worldbank-public-debt',
        title: 'World Bank central government debt',
        section: 'balance-context',
        source: 'World Bank',
        sourceUrl:
          'https://api.worldbank.org/v2/country/USA/indicator/GC.DOD.TOTL.GD.ZS?format=json',
        frequency: 'annual',
        visualization: 'line',
        unit: 'percentOfGdp',
        deltaUnit: 'percentagePoints',
        description: `Central government debt was ${formatValue(publicDebt.at(-1).value, 'percentOfGdp')} of GDP in ${publicDebt.at(-1).label}.`,
        rationale: 'Debt ratios evolve gradually, so a line is the clearest way to show the medium-run trend.',
        series: trimPoints(publicDebt, 15),
      }),
    ],
    sourceStatus: [
      {
        id: 'world-bank',
        name: 'World Bank',
        status: 'live',
        detail: 'Direct World Bank API pull for annual long-run context.',
        link: 'https://datahelpdesk.worldbank.org/knowledgebase/topics/125589',
      },
    ],
  }
}

function buildImfStatus() {
  return {
    id: 'imf',
    name: 'IMF',
    status: 'skipped',
    detail: `The IMF Data portal path was sign-in gated when this template was built on ${BUILD_DATE}; the adapter is left as an optional future extension rather than blocking the rest of the dashboard.`,
    link: 'https://data.imf.org/',
  }
}

function buildDashboard(indicators, sourceStatus) {
  const byId = new Map(indicators.map((indicator) => [indicator.id, indicator]))
  const unemployment = byId.get('unemployment-rate')
  const payrolls = byId.get('payroll-change')
  const inflation = byId.get('headline-core-cpi')
  const gdp = byId.get('real-gdp-growth')
  const fedFunds = byId.get('fed-funds-rate')
  const spread = byId.get('yield-curve-spread')
  const bisCredit = byId.get('bis-private-credit-gdp')

  const highlights = [
    unemployment
      ? `Unemployment was ${unemployment.latest.formatted} in ${unemployment.latest.label}.`
      : 'Unemployment data unavailable in this build.',
    payrolls && inflation
      ? `Payrolls changed by ${payrolls.latest.formatted} in ${payrolls.latest.label}, while headline CPI ran ${inflation.latest.formatted}.`
      : 'Labor and inflation comparison unavailable in this build.',
    gdp && fedFunds
      ? `Real GDP growth last printed at ${gdp.latest.formatted} and fed funds averaged ${fedFunds.latest.formatted}.`
      : 'Growth and policy-rate comparison unavailable in this build.',
    spread && bisCredit
      ? `The 10Y-2Y spread was ${spread.latest.formatted} and BIS private credit was ${bisCredit.latest.formatted} of GDP.`
      : 'Rates and leverage comparison unavailable in this build.',
  ]

  return {
    title: 'Macro Signals',
    deck: 'A static US macro dashboard compiled from official public datasets. The build pipeline refreshes the data first, then ships a simple front-end bundle that can live on GitHub Pages or another static host.',
    generatedAt: GENERATED_AT,
    highlights,
    featuredIds: [
      'unemployment-rate',
      'headline-core-cpi',
      'real-gdp-growth',
      'fed-funds-rate',
      'yield-curve-spread',
      'bis-private-credit-gdp',
    ],
    sections: [
      {
        id: 'labor-inflation',
        kicker: 'Labor and inflation',
        title: 'Monthly pulse',
        description: 'High-frequency labor and inflation series come directly from BLS so the dashboard can highlight current-cycle momentum without scraping webpages.',
        indicatorIds: ['unemployment-rate', 'payroll-change', 'headline-core-cpi'],
      },
      {
        id: 'growth-activity',
        kicker: 'Growth and activity',
        title: 'Real-economy cycle',
        description: 'Growth, production, and housing are shown with chart types that match their release cadence and economic meaning.',
        indicatorIds: ['real-gdp-growth', 'industrial-production', 'housing-starts'],
      },
      {
        id: 'rates-financial',
        kicker: 'Rates and financial conditions',
        title: 'Policy and curve',
        description: 'Rates are shown as lines because the level and the persistence of the regime matter more than single-point changes.',
        indicatorIds: ['fed-funds-rate', 'yield-curve-spread'],
      },
      {
        id: 'balance-context',
        kicker: 'Leverage and context',
        title: 'Balance-sheet backdrop',
        description: 'BIS leverage series and World Bank annual context help separate short-cycle moves from slower structural pressure.',
        indicatorIds: [
          'bis-debt-service-ratio',
          'bis-private-credit-gdp',
          'worldbank-gdp-growth',
          'worldbank-public-debt',
        ],
      },
    ],
    indicators,
    sourceStatus,
    notes: [
      'The site is static: all source calls happen at build time, and the browser only reads a compiled JSON file.',
      'FRED uses the official API when FRED_API_KEY is present and falls back to the public CSV export path when it is not.',
      'FRED-carried series still show their original agency in the UI, including BEA, the Census Bureau, and the Board of Governors.',
      `IMF is marked optional because the public portal path was sign-in gated on ${BUILD_DATE}.`,
    ],
  }
}

async function loadExistingDashboard() {
  try {
    const text = await readFile(OUTPUT_PATH, 'utf8')
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function main() {
  log('refreshing macro dataset')

  const existingDashboard = await loadExistingDashboard()
  const sourceStatus = [buildImfStatus()]
  const indicators = []

  const blocks = [
    ['BLS', buildBlsIndicators],
    ['FRED', buildFredIndicators],
    ['BIS', buildBisIndicators],
    ['World Bank', buildWorldBankIndicators],
  ]

  for (const [name, builder] of blocks) {
    try {
      log(`pulling ${name}`)
      const block = await builder()
      indicators.push(...block.indicators)
      sourceStatus.push(...block.sourceStatus)
    } catch (error) {
      sourceStatus.push({
        id: name.toLowerCase().replaceAll(' ', '-'),
        name,
        status: 'error',
        detail: error instanceof Error ? error.message : `${name} request failed.`,
        link:
          name === 'BLS'
            ? 'https://www.bls.gov/developers/'
            : name === 'FRED'
              ? 'https://fred.stlouisfed.org/docs/api/fred/'
              : name === 'BIS'
                ? 'https://data.bis.org/bulkdownload'
                : 'https://datahelpdesk.worldbank.org/knowledgebase/topics/125589',
      })
      log(`${name} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (indicators.length === 0) {
    if (existingDashboard) {
      await mkdir(resolve(process.cwd(), 'public', 'data'), { recursive: true })
      await writeFile(OUTPUT_PATH, JSON.stringify(existingDashboard, null, 2))
      log('all sources failed; preserved existing dashboard.json')
      return
    }

    throw new Error('No indicators could be built and no fallback dashboard exists.')
  }

  const dashboard = buildDashboard(indicators, sourceStatus)
  await mkdir(resolve(process.cwd(), 'public', 'data'), { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify(dashboard, null, 2)}\n`)
  log(`wrote ${dashboard.indicators.length} indicators to public/data/dashboard.json`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
