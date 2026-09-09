# NER-LandslideAI — Frontend

Command-center UI for **NER-LandslideAI**, a landslide intelligence and
susceptibility platform for Northeast India (8 states of the NER).

React 18 · TypeScript · Vite · react-leaflet (Leaflet + CARTO dark basemap).
Research/hackathon prototype — **not** an operational emergency-warning system.

## Run locally

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Other commands:

```bash
npm run build        # type-check (tsc) + production build into dist/
npm run preview      # serve the production build
npm run typecheck    # tsc --noEmit
```

## Backend connection

The API base URL is read from the `VITE_API_BASE_URL` environment variable
(default `http://127.0.0.1:8000`):

```bash
cp .env.example .env.local   # then edit as needed
```

When the backend is unreachable the UI renders explicit **offline / empty
states**. It never simulates data: no synthetic landslide coordinates, no
invented probabilities, no fake model metrics. Values appear only when the
backend returns them.

## API contract expected by this UI

All endpoints are GET. Responses are normalised defensively
(`src/services/normalize.ts`); any field that cannot be recognised is shown as
“not reported”.

| Endpoint | Used by |
| --- | --- |
| `GET /` | Command Center service banner |
| `GET /api/health` | Global connectivity + model-artifact status |
| `GET /api/states` | State selectors (fallback: built-in NER region list) |
| `GET /api/districts/{state}` | District selectors (no fallback — backend only) |
| `GET /api/historical/{state}/{district}` | Inventory counts, dates, plottable points |
| `GET /api/susceptibility/{latitude}/{longitude}` | Location Analysis / map inspection |
| `GET /api/risk/{latitude}/{longitude}` | Trigger-aware risk panel (integration pending) |
| `GET /api/statistics` | Command Center + Historical Analytics aggregates |
| `GET /api/district-risk` | District Intelligence matrix (all states) |
| `GET /api/district-risk/{state}` | District Intelligence matrix (per state) |

Canonical susceptibility categories: `LOW · MODERATE · HIGH · CRITICAL`
(`docs/methodology.md`). Probabilities are expected in `[0,1]` (values in
`(1,100]` are interpreted as percentages).

Notes for the backend implementer: lists may be returned bare or under common
envelope keys (`data`, `results`, `items`, `records`, `features`); historical
events may be flat objects or GeoJSON Features. The exact TS contract lives in
`src/types/api.ts`.

## Structure

```
src/
├── components/
│   ├── common/      panels, badges, tags, states (loading/empty/error/offline)
│   ├── layout/      shell, sidebar, top bar, mobile nav
│   └── map/         NERMap (Leaflet), legend
├── constants/       region definition, nav, data classes, severity metadata
├── context/         SystemStatusContext (health polling)
├── hooks/           useApiData, useStates, useClock
├── pages/           8 modules (Command Center … Methodology)
├── services/        client (fetch + timeout), api (endpoints), normalize
├── styles/          design tokens + component styles (plain CSS)
├── types/           API contract types
└── utils/           formatting helpers
```

## Design system

- **Data-class tags** — every datum is tagged HISTORICAL / SUSCEPTIBILITY /
  TRIGGER / CURRENT-FORECAST. Historical evidence and model inference are never
  visually conflated with operational warning.
- **Severity palette** — LOW `#3ddc97`, MODERATE `#e8c547`, HIGH `#f59e0b`,
  CRITICAL `#f4574d`; data accent cyan `#4cc2ff`.
- **Honest states** — offline banners, endpoint-specific empty states,
  `NO INVENTORY DATA` badges (absence of inventory is never rendered as low
  risk), and “Rainfall trigger integration pending” notices.

## Map

Basemap © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors,
tiles © [CARTO](https://carto.com/attributions) (dark matter). State reference
markers are approximate state centers used **for navigation only** — they are
not data points. Inventory points render only from real backend records.
