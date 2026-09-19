# Methodology

This document is the human-readable companion to `GET /api/methodology`. The API
response is generated from the running configuration; this file explains what the
terms mean and why the model is built this way.

## 1. What is modelled, and what is deliberately not

The engine answers two separate questions and keeps them apart:

* **Susceptibility** — where failure is *possible*, from terrain, geology,
  rainfall load and recorded history. Static in time.
* **Risk** — what a location's condition implies *at a given rainfall*, as a
  dynamic value derived from susceptibility and a rainfall ratio.

There is no probability of occurrence, no return period and no time-of-failure
model. Severity bands are ordinal cuts on a relative index. Any statement of the
form "this slope has a 30 % chance of failing" is out of scope by design.

## 2. Factors

Five normalised factors in `[0, 1]`, each converted to a percentile rank over the
modelled region before use:

| Factor | Weight | Source of the rank |
| --- | --- | --- |
| Regional steepness | 0.30 | central difference of the elevation surface, ~18 km baseline |
| Regional relief | 0.20 | elevation range within a 3-cell window (~31 km) |
| Geological erodibility | 0.20 | published erodibility index of the mapped belt |
| Monsoon load | 0.18 | local rainfall climatology relative to the region |
| Historical evidence | 0.12 | weighted Gaussian kernel over the recorded catalogue |

The elevation-band credibility **gate** multiplies the weighted sum; it is not a
sixth summand. It is 1 through the mountain belt and fades to zero above
4,200 m, so alluvial ground cannot inherit a mountain score. This gate is what
keeps the Brahmaputra plain and the Barak valley at the bottom of the index.

```
raw  = gate · Σᵢ (wᵢ · fᵢ)
```

## 3. The published index

The raw score is fixed against the 2nd and 99.9th percentiles of the region and
mapped onto a 0.04–0.96 window:

```
index = clip( constant + scale · raw , 0.04 , 0.96 )
constant = 0.04 − scale · raw(2nd pct)
scale    = (0.96 − 0.04) / ( raw(99.9th pct) − raw(2nd pct) )
```

An affine map has two useful consequences: the index preserves the ordering of
the raw score exactly, and each factor's contribution can be published in index
units. Fitting the top anchor at the 99.9th percentile keeps the most hazardous
cells distinguishable from one another instead of clamping a cohort at the
ceiling; the build asserts that no cell saturates.

## 4. The rainfall trigger

Each cell has a threshold intensity in millimetres — the 72-hour total that
counts as a full trigger:

```
I_c(S) = I_ref · ( 1.35 − 0.85 · S )
```

`I_ref` is three times the mean three-day rainfall of the wettest normal month at
that location, from the station climatology. The 72-hour intensity in force,
`I`, forms the ratio:

```
τ = I / I_c(S)
```

and the dynamic risk follows from susceptibility and τ:

```
R = 1 − ( 1 − min(S, 0.98) ) ^ ( 1 + 1.2 · τ )
```

The `min(S, 0.98)` cap matters: without it a cell at S = 1 would be pinned to
R = 1 for every rainfall total, and the forward scenario would carry no
information exactly where it matters most.

Risk is monotone in both arguments: more susceptibility or more rain can only
raise it, and it stays inside `[0, 1]`.

## 5. Threshold inversion

The same function is inverted to report what rainfall each severity band needs:

```
τ* = ( ln(1 − R*) / ln(1 − S) − 1 ) / 1.2
I* = τ* · I_c(S)
```

With `R*` the band cut (0.40, 0.60, 0.80). Two edge cases are reported in words
rather than as numbers:

* a cell already at or above the band under **zero** rainfall has no meaningful
  threshold — the API returns `reached_without_rain` and the console prints
  "already in band with no rain";
* a threshold far beyond a plausible 72-hour total is reported as a number and
  flagged, because a physically unreachable threshold is still information.

## 6. Scenarios

`intensity_now` is the observed 72-hour rainfall when a live feed is reachable.
When it is not, the engine substitutes the local climatological mean for the
current month and labels the mode as `climatology` in every response. Scenarios
multiply that intensity (×1, ×2, ×3, ×5 by default) to show how the risk surface
responds — a planning view, not a forecast.

## 7. Uncertainty

σ is a heuristic band width, not a statistical interval, built from three
quantities: distance to the nearest terrain control point (support), local
terrain variability (roughness), and distance to the nearest recorded event. The
grade (A–D) and the possible-class span are reported so that a cell sitting in
terrain the surface barely constrains is visibly weaker evidence than one sitting
among survey points.

## 8. Exposure

* **Districts** — mean and maximum susceptibility and risk over the district's
  cells, the share of cells in HIGH or above, records on file, and a screening
  exposure index (population × share of cells in HIGH or above).
* **Lifelines** — corridors sampled every 2 km, scored with the same risk
  function, summarised as kilometres in each band, a worst 8 km window, and an
  isolation risk that combines corridor criticality with the highest risk along
  its length.

## 9. Limitations

Stated once, here and in the API response, so they travel with the numbers:

1. The elevation surface is generalised; slope-derived factors are relative
   indices, not engineering gradients.
2. Bands are ordinal. They are not probabilities and carry no return period.
3. The event catalogue is a reference compilation of major recorded events, not
   a complete inventory; absence of a record is not evidence of absence.
4. District assignment is a Voronoi approximation around headquarters.
5. Without a reachable live feed, the trigger is a climatological planning
   assumption, labelled as such wherever it appears.
