import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatAxisValue } from '../lib/format'
import type { DashboardIndicator } from '../types/dashboard'

interface ChartPanelProps {
  indicator: DashboardIndicator
}

function tooltipFormatter(
  indicator: DashboardIndicator,
  value: ValueType | undefined,
  name: NameType | undefined,
) {
  const numeric =
    typeof value === 'number' ? value : value == null ? Number.NaN : Number(value)
  const label =
    name === 'secondaryValue' ? indicator.secondaryLabel ?? 'Comparison' : indicator.title
  return [formatAxisValue(numeric, indicator.unit), label]
}

export function ChartPanel({ indicator }: ChartPanelProps) {
  const deltaClass =
    indicator.delta?.direction === 'flat' ? 'delta delta-flat' : 'delta'

  return (
    <article className="chart-panel">
      <div className="panel-topline">
        <div className="panel-title">
          <h3>{indicator.title}</h3>
          <p>
            {indicator.origin
              ? `${indicator.source} transport, ${indicator.origin} origin`
              : indicator.source}
          </p>
        </div>

        <a
          className="source-link"
          href={indicator.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {indicator.source}
        </a>
      </div>

      <div className="panel-value">
        <strong>{indicator.latest.formatted}</strong>
        {indicator.delta && <span className={deltaClass}>{indicator.delta.formatted}</span>}
      </div>

      <p className="panel-copy">{indicator.description}</p>

      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          {indicator.visualization === 'bar' ? (
            <BarChart data={indicator.series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(16, 32, 45, 0.08)" vertical={false} />
              <XAxis dataKey="label" minTickGap={24} stroke="#586672" tick={{ fontSize: 12 }} />
              <YAxis
                stroke="#586672"
                tick={{ fontSize: 12 }}
                tickFormatter={(value: number) => formatAxisValue(value, indicator.unit)}
                width={64}
              />
              <Tooltip formatter={(value, name) => tooltipFormatter(indicator, value, name)} />
              {indicator.showZeroLine && <ReferenceLine y={0} stroke="rgba(16, 32, 45, 0.24)" />}
              <Bar dataKey="value" fill="#c4683f" radius={[8, 8, 0, 0]} />
            </BarChart>
          ) : indicator.visualization === 'area' ? (
            <AreaChart data={indicator.series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(16, 32, 45, 0.08)" vertical={false} />
              <XAxis dataKey="label" minTickGap={24} stroke="#586672" tick={{ fontSize: 12 }} />
              <YAxis
                stroke="#586672"
                tick={{ fontSize: 12 }}
                tickFormatter={(value: number) => formatAxisValue(value, indicator.unit)}
                width={64}
              />
              <Tooltip formatter={(value, name) => tooltipFormatter(indicator, value, name)} />
              <Area
                dataKey="value"
                fill="rgba(43, 122, 120, 0.2)"
                stroke="#2b7a78"
                strokeWidth={2.5}
                type="monotone"
              />
            </AreaChart>
          ) : (
            <LineChart data={indicator.series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(16, 32, 45, 0.08)" vertical={false} />
              <XAxis dataKey="label" minTickGap={24} stroke="#586672" tick={{ fontSize: 12 }} />
              <YAxis
                stroke="#586672"
                tick={{ fontSize: 12 }}
                tickFormatter={(value: number) => formatAxisValue(value, indicator.unit)}
                width={64}
              />
              <Tooltip formatter={(value, name) => tooltipFormatter(indicator, value, name)} />
              {indicator.showZeroLine && (
                <ReferenceLine
                  y={0}
                  stroke="rgba(16, 32, 45, 0.24)"
                  strokeDasharray="3 3"
                />
              )}
              <Line
                dataKey="value"
                dot={false}
                stroke="#1f4c5b"
                strokeWidth={2.5}
                type="monotone"
              />
              {indicator.visualization === 'compare' && (
                <Line
                  dataKey="secondaryValue"
                  dot={false}
                  stroke="#c4683f"
                  strokeDasharray="6 4"
                  strokeWidth={2.5}
                  type="monotone"
                />
              )}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="chart-rationale">{indicator.rationale}</div>
    </article>
  )
}
