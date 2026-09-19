# NER-LandslideAI

Landslide hazard, exposure and rainfall-trigger engine for the eight states of
North East India — with a console that shows its own work.

The system answers four separate questions and never blends them into a single
number:

| Question | Module | Data class |
| --- | --- | --- |
| Where can slopes fail at all? | Susceptibility index | model output |
| How much rain does *this* slope need to change class? | Rainfall thresholds | model output |
| What is the rainfall doing now? | Trigger / forward scenario | live feed or climatology |
| Which places and lifelines carry the consequence? | Exposure, districts, corridors | reference data |

**Research prototype. Not an operational early-warning system.**

---

## What it does that a susceptibility raster does not

1. **Exact additive attribution.** The published index is an affine transform of
   a weighted sum, so every factor's contribution is reported in index units and
   the contributions sum to the result. The console shows this per point — it is
   the model rearranged, not a sensitivity approximation.
2. **Rainfall-threshold inversion.** Instead of a regional rainfall table, the
   engine inverts the risk function at each cell: *how many millimetres over 72
   hours* would move this slope into MODERATE, HIGH or CRITICAL. Cells already in
   a band under zero rainfall say so in words.
3. **A stated uncertainty band.** Every point carries σ, a possible-class span
   and a letter grade derived from terrain support, terrain variability and
   evidence density.
4. **Lifelines as first-class objects.** Road and rail corridors are sampled
   every 2 km, scored along their length, and given an isolation risk.
5. **Offline-first by construction.** A provenance-documented reference dataset
   ships with the code and the console draws a vector map with no external tile
   service, so the system is fully functional on a network with no access to
   external APIs — and says when a live feed is *not* reachable instead of
   claiming one.

## Quickstart

```bash
# 1. backend (Python 3.10+)
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt      # numpy, fastapi, uvicorn

# 2. build the hazard grid (about two seconds; cached afterwards)
python -m nerls build

# 3. serve the API
python -m nerls serve --host 0.0.0.0 --port 8000
#    API docs:  http://localhost:8000/docs
#    console:   http://localhost:8000/        (after step 4)

# 4. build the console (Node 18+)
cd frontend && npm install && npm run build && cd ..
#    restart `serve` once so the built interface is mounted; the API and the UI
#    are then served from one origin, which removes every CORS question.
```

Development mode for the console:

```bash
cd frontend && npm run dev     # Vite on :5173, proxies /api to :8000
```

## Command line

| Command | Purpose |
| --- | --- |
| `nerls build [--force]` | Assemble the hazard grid; `--force` ignores the on-disk cache. |
| `nerls point LAT LON [--scenario X]` | Full analysis of one coordinate. |
| `nerls stats` | Regional summary (class counts, evidence, season). |
| `nerls meta` | Model configuration and data provenance. |
| `nerls ingest FILE.csv` | Import a landslide inventory (CSV). |
| `nerls dem PATH.tif \| --clear` | Register a GeoTIFF elevation raster (needs `rasterio`). |
| `nerls serve` | Run the API and the built console on one port. |

The cache is keyed on the model version, grid, weights and the reference files'
timestamps; delete `data/cache/` or pass `--force` after changing any of them.

## API

| Route | Returns |
| --- | --- |
| `GET /api/health` | Engine status, grid size, rainfall mode and why. |
| `GET /api/meta` | Weights, rescale, season, evidence, provenance, grid fields. |
| `GET /api/methodology` | Definitions, formulas, uncertainty basis, limitations. |
| `GET /api/outline` | Generalised region polygons (the map base). |
| `GET /api/stats` | Regional distributions and evidence summary. |
| `GET /api/point?lat=&lon=[&scenario=]` | Full decomposition of one cell. |
| `GET /api/grid?field=` | A grid layer as a row-major array plus statistics. |
| `GET /api/grid/delta` | Risk change between the current and forward layer. |
| `GET /api/districts[?state=]` | District summaries (130 headquarters). |
| `GET /api/districts/{state}/{district}` | District detail incl. HQ point analysis. |
| `GET /api/corridors`, `GET /api/corridors/{id}` | Lifeline scores and along-line profiles. |
| `GET /api/watchlist?limit=&min_risk=` | Cells where rainfall moves risk the most. |
| `GET /api/events[?state=]` | Catalogue of recorded events. |
| `GET /api/briefing?scope=region\|district\|point` | Written situation summary. |

Interactive schema: `/docs` (OpenAPI).

## Configuration

Every variable is optional; the system runs unconfigured on the shipped dataset.
See `.env.example` for the full list.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NERLS_CACHE_DIR` | `data/cache` | Where the built grid is cached. |
| `NERLS_USER_DATA` | `data/user` | Imported inventories and registered DEMs. |
| `NERLS_FRONTEND_DIST` | `frontend/dist` | Built console served by the API. |
| `NERLS_GRID_RES` | `0.04` | Grid resolution in degrees (≈4.4 km). |
| `NERLS_LIVE_RAINFALL` | `auto` | `auto` tries Open-Meteo, `off` never does. |
| `NERLS_RAINFALL_URL` | Open-Meteo forecast endpoint | Override for another provider. |
| `NERLS_NARRATIVE_KEY` | *(unset)* | Enables the optional language-model briefing rewrite. |
| `NERLS_NARRATIVE_MODEL` | `gpt-4o-mini` | Any model id the configured endpoint serves. |
| `NERLS_NARRATIVE_URL` | OpenAI chat completions | Any OpenAI-compatible endpoint. |

The briefing is a deterministic template by default; a language model is used
only when a key is present, it receives a closed set of computed facts, and the
response says which path produced it. Model choice is configuration, not code —
point `NERLS_NARRATIVE_MODEL` and `NERLS_NARRATIVE_URL` at whatever endpoint you
run.

## Data

`nerls/data/` holds eight JSON files, each with a `provenance` block naming its
kind and accuracy. They are compiled published values — a reference dataset to
run the system on, not a substitute for survey data:

| File | Contents |
| --- | --- |
| `states.json` | The eight states with codes, capitals, area and 2011 population. |
| `districts.json` | 130 district headquarters with coordinates and elevation. |
| `terrain_anchors.json` | Control points for the generalised elevation surface. |
| `rainfall_climatology.json` | Six monthly profiles, 32 stations, trigger reference. |
| `geology_belts.json` | Six geological/geomorphological belts with erodibility. |
| `events.json` | Catalogue of recorded landslides, GLOFs and earthquake-triggered slides. |
| `corridors.json` | 14 critical road and rail lifelines with waypoints. |
| `region_outline.json` | Generalised display/statistics outline (not a legal boundary). |

Real inputs replace these without touching the API:

* **Elevation** — `nerls dem register path.tif` (GeoTIFF, any CRS) rebuilds the
  terrain layers from a real DEM.
* **Inventory** — `nerls ingest inventory.csv` merges recorded events into the
  evidence kernel; column names are matched case-insensitively and common
  aliases (`lat`/`latitude`, `lon`/`longitude`, `date`/`event_date`, …) are
  accepted.
* **Rainfall** — a reachable Open-Meteo endpoint switches the trigger to live
  observation and forecast; unreachable, the engine uses the compiled station
  climatology and labels every response with the mode it used.

## Method in one paragraph

Each cell carries four normalised terrain factors (regional steepness, relief,
geological erodibility, monsoon load) and a historical-evidence density. A
weighted sum, multiplied by an elevation-band credibility gate so alluvial ground
cannot inherit mountain scores, is fixed against the 2nd and 99.9th percentiles
of the region and published as a 0.04–0.96 index. Rainfall enters as a ratio
τ = I / I_c(S) to a per-cell threshold intensity; risk is
`R = 1 − (1 − min(S, 0.98))^(1 + 1.2τ)`, and the same function is inverted to
report the 72-hour rainfall each severity band needs. Full definitions, bands and
limitations are served at `/api/methodology` and documented in
[`docs/methodology.md`](docs/methodology.md).

## Repository layout

```
nerls/            engine: grid, hazard maths, service layer, API, CLI
  data/             provenance-documented reference dataset (JSON)
tests/              model and API tests (21 cases)
frontend/           React console (Vite + TypeScript)
docs/               methodology and data-source notes
AUDIT.md            why the previous implementation was rebuilt
```

## Tests

```bash
pip install -e ".[dev]"
pytest -q
```

The suite checks the affine attribution identity, the threshold inversion, band
ordering, the anti-saturation property of the index, the gating of the plains,
and the response contract of every endpoint.

## Limits

* The elevation surface is generalised: slope-derived factors are relative
  indices, not engineering gradients.
* Severity classes are ordinal bands on a relative index, not probabilities, and
  carry no return period.
* The event catalogue is a compilation of major recorded events, not a complete
  inventory.
* District assignment is a Voronoi approximation around headquarters, not an
  administrative boundary.
* With no reachable live feed, the trigger is a climatological planning
  assumption. It is labelled as such everywhere it appears — the interface never
  presents it as an observation.

## Licence

See [LICENSE](LICENSE).
