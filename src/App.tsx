import { startTransition, useEffect, useState } from 'react'
import { ChartPanel } from './components/ChartPanel'
import { MetricCard } from './components/MetricCard'
import { formatTimestamp } from './lib/format'
import type { DashboardData, DashboardIndicator } from './types/dashboard'

const dataPath = `${import.meta.env.BASE_URL}data/dashboard.json`

function isIndicator(
  indicator: DashboardIndicator | undefined,
): indicator is DashboardIndicator {
  return Boolean(indicator)
}

function App() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadDashboard() {
      try {
        const response = await fetch(dataPath, { signal: controller.signal })

        if (!response.ok) {
          throw new Error(`Unable to load dashboard data (${response.status})`)
        }

        const nextDashboard = (await response.json()) as DashboardData

        startTransition(() => {
          setDashboard(nextDashboard)
          setError(null)
        })
      } catch (loadError) {
        if (controller.signal.aborted) {
          return
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Unable to load dashboard data.',
        )
      }
    }

    void loadDashboard()

    return () => controller.abort()
  }, [])

  if (error) {
    return (
      <main className="app-shell">
        <section className="state-card">
          <p className="eyebrow">Dashboard error</p>
          <h1>Macro Signals could not load.</h1>
          <p>{error}</p>
        </section>
      </main>
    )
  }

  if (!dashboard) {
    return (
      <main className="app-shell">
        <section className="state-card">
          <p className="eyebrow">Loading</p>
          <h1>Building the macro snapshot.</h1>
          <p>Fetching the latest compiled indicator set from the static data bundle.</p>
        </section>
      </main>
    )
  }

  const indicatorMap = new Map(
    dashboard.indicators.map((indicator) => [indicator.id, indicator]),
  )
  const featuredIndicators = dashboard.featuredIds
    .map((id) => indicatorMap.get(id))
    .filter(isIndicator)

  return (
    <main className="app-shell">
      <div className="ambient ambient-left" aria-hidden="true" />
      <div className="ambient ambient-right" aria-hidden="true" />

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">US macro dashboard</p>
          <h1>{dashboard.title}</h1>
          <p className="hero-deck">{dashboard.deck}</p>
          <div className="hero-meta">
            <span>Static site</span>
            <span>Updated {formatTimestamp(dashboard.generatedAt)}</span>
            <span>Cloud-scheduled refresh</span>
          </div>
        </div>

        <div className="hero-panel">
          <h2>What changed most recently</h2>
          <ul className="highlight-list">
            {dashboard.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="pulse-grid" aria-label="Featured indicators">
        {featuredIndicators.map((indicator) => (
          <MetricCard key={indicator.id} indicator={indicator} />
        ))}
      </section>

      {dashboard.sections.map((section) => (
        <section className="section-block" key={section.id}>
          <div className="section-heading">
            <p className="eyebrow">{section.kicker}</p>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
          </div>

          <div className="chart-grid">
            {section.indicatorIds
              .map((id) => indicatorMap.get(id))
              .filter(isIndicator)
              .map((indicator) => (
                <ChartPanel key={indicator.id} indicator={indicator} />
              ))}
          </div>
        </section>
      ))}

      <section className="sources-block">
        <div className="section-heading">
          <p className="eyebrow">Source coverage</p>
          <h2>Pipeline health</h2>
          <p>
            The site compiles build-time data pulls so the browser only loads a
            static JSON bundle. That keeps hosting simple and avoids exposing
            API credentials.
          </p>
        </div>

        <div className="source-grid">
          {dashboard.sourceStatus.map((source) => (
            <article className="source-card" key={source.id}>
              <div className="source-topline">
                <a href={source.link} target="_blank" rel="noreferrer">
                  {source.name}
                </a>
                <span className={`status-pill status-${source.status}`}>
                  {source.status}
                </span>
              </div>
              <p>{source.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="footer">
        <div>
          <h2>Implementation notes</h2>
          <ul className="note-list">
            {dashboard.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </footer>
    </main>
  )
}

export default App
