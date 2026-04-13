import { Area, AreaChart, Line, LineChart, ResponsiveContainer } from 'recharts'
import type { DashboardIndicator } from '../types/dashboard'

interface MetricCardProps {
  indicator: DashboardIndicator
}

export function MetricCard({ indicator }: MetricCardProps) {
  const series = indicator.series.slice(-24)
  const deltaClass =
    indicator.delta?.direction === 'flat' ? 'delta delta-flat' : 'delta'

  return (
    <article className="metric-card">
      <div className="metric-topline">
        <div className="metric-title">
          <h3>{indicator.title}</h3>
          <p>{indicator.origin ? `${indicator.source} / ${indicator.origin}` : indicator.source}</p>
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

      <div className="metric-value">
        <strong>{indicator.latest.formatted}</strong>
        {indicator.delta && <span className={deltaClass}>{indicator.delta.formatted}</span>}
      </div>

      <div className="metric-chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          {indicator.visualization === 'bar' ? (
            <AreaChart data={series}>
              <Area
                dataKey="value"
                stroke="#1f4c5b"
                fill="rgba(31, 76, 91, 0.18)"
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          ) : (
            <LineChart data={series}>
              <Line
                dataKey="value"
                dot={false}
                stroke="#1f4c5b"
                strokeWidth={2}
                type="monotone"
              />
              {indicator.visualization === 'compare' && (
                <Line
                  dataKey="secondaryValue"
                  dot={false}
                  stroke="#c4683f"
                  strokeDasharray="5 3"
                  strokeWidth={2}
                  type="monotone"
                />
              )}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      <p className="metric-description">{indicator.description}</p>
    </article>
  )
}
