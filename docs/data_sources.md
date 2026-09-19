# Data sources and provenance

Every layer carries a `provenance` block — kind, accuracy caveat and source
notes — and the API returns it with the values it feeds. Nothing in this
repository claims to be a measurement it is not.

## Shipped reference dataset (`nerls/data/`)

| File | Kind | Standing |
| --- | --- | --- |
| `states.json` | compiled public reference | State codes, capitals, Survey of India areas, Census 2011 populations. |
| `districts.json` | compiled public reference | 130 district headquarters with coordinates (~±0.02°) and elevation (±150 m). Populations are Census 2011, except post-2011 districts where the entry is marked `population_apportioned`. |
| `terrain_anchors.json` | compiled public reference | Named summits, passes, valleys and towns with published elevations, used as control points for the generalised surface. Peaks to ±50 m, plateau/foreign context points to ±100 m. |
| `rainfall_climatology.json` | compiled public reference | Six monthly rainfall profiles fitted to 32 station normals; monthly totals of the reference stations are reproduced, everything between them is interpolated. Trigger reference = 3 × the wettest-month mean three-day total. |
| `geology_belts.json` | compiled public reference | Six belts with a relative erodibility index (0.28 alluvium → 0.92 Siwalik). Geometry is axis-aligned envelopes, resolved in a fixed precedence order — schematic, not a geological map. |
| `events.json` | reported catalogue | 13 major recorded events (rainfall, GLOF, earthquake-triggered, cyclone). Confidence is stated per record; coordinates are district reference points, not surveyed slide scars. |
| `corridors.json` | compiled public reference | 14 critical road/rail lifelines with named waypoints and failure consequences; alignments are generalised to ~0.05°. |
| `region_outline.json` | derived | Generalised display/statistics outline, deliberately inflated (~0.15–0.25°). Not a legal boundary, and not used for any spatial query that needs real borders. |

### What the reference dataset is for

It makes the system runnable, testable and demonstrable without shipping a
survey archive. It is not a substitute for survey data, and the engine treats it
accordingly: accuracy caveats live in the data files themselves, the boundaries
are inflated rather than exact, and the reference values are documented as
compiled published figures throughout.

## Replacing the reference data with real inputs

**Elevation.** Any GeoTIFF works:

```bash
nerls dem register path/to/dem.tif --band 1 --notes "Copernicus GLO-90"
nerls build --force
```

The registered raster is sampled through bilinear interpolation, fused with the
control points where it has data, and the terrain source string in `/api/meta`
changes accordingly. `rasterio` is optional and only needed for this path.

**Inventory.** Any CSV with coordinates and a date:

```bash
nerls ingest path/to/inventory.csv
nerls build --force
```

Column matching is case-insensitive and accepts common aliases
(`lat`/`latitude`/`y`, `lon`/`longitude`/`x`, `date`/`event_date`/`year`,
`district`/`block`, `slide_name`/`location`/`place`/`village`,
`weight`/`confidence_weight`). Imported records join the evidence kernel and are
reported separately from the shipped catalogue.

**Live rainfall.** Open-Meteo is the default provider and needs no key. If the
deployment cannot reach it, the engine records the failure, arms a retry backoff
and falls back to station climatology — labelling the mode in `/api/health`,
`/api/stats`, `/api/point` and the console. Another provider can be substituted
by pointing `NERLS_RAINFALL_URL` at an endpoint with the same response shape, or
by replacing the provider class in `nerls/rainfall.py`.

## Honesty rules the code enforces

1. **No fabricated values.** If a number is not computed, the field is `null` and
   the interface says so in words. The frontend has no placeholder data.
2. **Mode labelling.** Every rainfall-dependent response carries
   `rainfall_mode` and a plain-language `field_meaning`.
3. **No un-met provenance claim.** `/api/health` reports the live feed as
   unreachable until a call actually succeeds, rather than trusting
   configuration.
4. **Visible caveats.** Accuracy notes travel with the data through the API and
   appear on the Model and Methodology modules.
