# System audit — why NER-LandslideAI did not run

Findings from a full read of the repository at commit `c7fb517`.

## 1. The backend could never start

| Finding | Evidence |
| --- | --- |
| **No data directory exists** | `data/` is absent, and `.gitignore` excludes `data/raw/*` and `data/processed/*`. Every endpoint in `api/main.py` calls `pd.read_csv()` on a missing file → `FileNotFoundError` → HTTP 500. |
| **No trained model exists** | `src/models/predict.py` loads `models/susceptibility_xgboost.joblib`. `models/` does not exist and `*.joblib` is gitignored, so `/api/susceptibility/...` and `/api/risk/...` always raise. |
| **The API is not declared as a dependency** | `requirements.txt` lists numpy/pandas/sklearn/matplotlib/jupyter/xgboost/joblib — **no FastAPI, no Uvicorn, no CORS stack**. `import fastapi` fails on a clean machine. |
| **No application entry point** | Nothing runs the ASGI app. No `uvicorn`, no `if __name__ == "__main__"`, no Procfile, no Dockerfile. |
| **No response contract** | Endpoints return ad-hoc dicts; column names come from an inventory CSV that no one can see. |

## 2. Half the repository is 0 bytes

Empty files: `dashboard/app.py`, all five `notebooks/*.ipynb`, `src/data/download.py`,
`src/data/preprocess.py`, `src/features/rainfall.py`, `src/features/terrain.py`,
`src/risk_engine/*.py` (**the risk engine that the whole project is named after**),
`src/models/evaluate.py`, `tests/test_features.py`, `tests/test_risk_engine.py`,
`docs/architecture.md`, `docs/limitations.md`.

The "Rainfall → Trigger → Early Warning" half of the pipeline described in the README
simply does not exist as code. `AlertsPage.tsx` confirms this in the UI: every component
is labelled `PENDING` / `PLANNED`.

## 3. Modelling problems in the code that *does* exist

- **Fabricated predictors.** `terrain_wave_1/2/3` are `sin`/`cos` functions of lat/lon
  with hand-picked frequencies. `src/models/train.py` fits them, `predict.py` re-derives
  them with *different constants* than training (`train.py` uses
  `np.radians(lat*8)`, `predict.py` uses `np.sin(lat*0.8)`), so the shipped inference path
  is inconsistent with training even when a model is present.
- **Leakage.** Random `train_test_split` on spatially autocorrelated points inflates
  scores. `spatial_validation.py` exists but is a separate script — the reported metrics
  come from the leaky split.
- **Pseudo-absence by uniform sampling.** Negatives are drawn uniformly over the bounding
  box, which includes the Brahmaputra floodplain; the model essentially learns "near a
  river = not a landslide".
- **Circular labelling.** `build_features.py` derives `susceptibility_proxy` from a state-level
  rank of the inventory, then trains on it.
- **No calibration, no uncertainty, no threshold inversion.** A probability is printed and
  bucketed at fixed cut-offs (0.40/0.60/0.80) that are not justified anywhere.
- **`district_risk.py` recomputes features inline** with a third copy of the constants.

## 4. The frontend is wired to a contract that never existed

- `services/normalize.ts` (452 lines) tries to guess field names from ten candidate aliases
  per value (`'probability', 'susceptibility', 'p_landslide', 'risk_probability', 'score', 'value'`).
  That is a symptom of an unspecified backend, not a design.
- Default base URL is `http://127.0.0.1:8000`; the app is served from `:5173` with no Vite
  proxy, so the browser needs the backend on a *different* port with `allow_origins=["*"]`
  plus `allow_credentials=True` — a combination browsers reject.
- `index.html` loads fonts from `fonts.googleapis.com`, an external dependency that fails
  on restricted networks.
- Pages render "PENDING", "not connected" and wireframe placeholders — an honest reaction
  to a backend that returns nothing, but not a working system.

## 5. What the rebuild does about it

1. A real Python package (`nerls/`) with a declared, minimal dependency set and a working
   entry point that serves both API and UI from one origin.
2. A reproducible hazard engine (terrain → exposure → trigger → risk) with calibrated,
   documented maths, **exact additive attribution** and **rainfall-threshold inversion**.
3. A committed reference dataset with explicit provenance, plus adapters so a real DEM /
   GSI inventory / live rainfall feed replaces it without touching the API.
4. A typed frontend with no alias-guessing layer, talking to endpoints that exist.
5. Deletion of the empty and duplicated modules, and tests that pin the maths down.
