# Macro Signals

Static US macro dashboard built from official public data sources. The site refreshes data at build time, writes a single `public/data/dashboard.json` bundle, and can be deployed to a static host so your computer does not need to stay on.

## Architecture

- Frontend: Vite + React + Recharts
- Data pipeline: Node script in [scripts/build-data.mjs](scripts/build-data.mjs)
- Hosting target: GitHub Pages via GitHub Actions
- Refresh model: scheduled cloud build, then static deploy

## Sources wired now

- BLS: unemployment, payrolls, CPI
- FRED: GDP growth, fed funds, yield curve spread, housing starts, industrial production
- BIS: private-sector debt service ratio and private credit to GDP
- World Bank: annual GDP growth and central government debt

## Source notes

- FRED uses the official API if `FRED_API_KEY` is set.
- If `FRED_API_KEY` is missing, the build falls back to FRED's public CSV export path.
- IMF is left as an optional extension. The public IMF portal path appeared sign-in gated when this template was built on 2026-04-12, so the dashboard does not block on it.
- Several FRED-carried series still surface their original agency in the UI, including BEA, the Census Bureau, and the Federal Reserve Board.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Refresh the compiled dataset:

   ```bash
   npm run refresh-data
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Build a production bundle:

   ```bash
   npm run build
   ```

## Environment variables

Copy `.env.example` to `.env` if you want local secrets.

- `FRED_API_KEY`
  Optional. Enables the official FRED API instead of the public CSV fallback.
- `REFRESH_LOOKBACK_YEARS`
  Optional. Defaults to `12`.

## Cloud deployment

This repo is configured for GitHub Pages because it is simple, cheap, and does not require an always-on server.

1. Create a GitHub repository and push this project.
2. In GitHub, add a repository secret named `FRED_API_KEY` if you want the official FRED API path.
3. In repository settings, enable GitHub Pages and set the source to `GitHub Actions`.
4. The workflow in `.github/workflows/deploy.yml` will:
   - run on pushes to `main`
   - run manually from the Actions tab
   - refresh and deploy on a daily schedule

## Why static hosting

- No server maintenance
- No personal machine uptime requirement
- No browser-side API key exposure
- Cheap global delivery from a CDN-backed static host

## Next extensions

- Add an IMF adapter once you have a stable export URL or authenticated API path
- Add direct Treasury or Census adapters where you want the transport layer to come from the source agency instead of FRED
- Add indicator filtering, download buttons, or alerting on threshold breaches
