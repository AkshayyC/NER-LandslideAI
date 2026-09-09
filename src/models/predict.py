from pathlib import Path
import joblib
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "models" / "susceptibility_xgboost.joblib"

FEATURES = [
    "Latitude",
    "Longitude",
    "lat",
    "lon",
    "lat_lon",
    "lat_centered",
    "lon_centered",
    "terrain_wave_1",
    "terrain_wave_2",
    "terrain_wave_3",
    "regional_distance",
]

_model = None


def load_model():
    global _model

    if _model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Model not found: {MODEL_PATH}"
            )

        _model = joblib.load(MODEL_PATH)

    return _model


def build_features(latitude: float, longitude: float):
    lat = latitude
    lon = longitude

    lat_centered = lat - 25.5
    lon_centered = lon - 92.5

    lat_lon = lat * lon

    terrain_wave_1 = (
        np.sin(lat * 0.8) *
        np.cos(lon * 0.8)
    )

    terrain_wave_2 = (
        np.sin(lat * 1.7 + lon * 0.4)
    )

    terrain_wave_3 = (
        np.cos(lon * 1.3 - lat * 0.6)
    )

    regional_distance = np.sqrt(
        lat_centered ** 2 +
        lon_centered ** 2
    )

    return [[
        latitude,
        longitude,
        lat,
        lon,
        lat_lon,
        lat_centered,
        lon_centered,
        terrain_wave_1,
        terrain_wave_2,
        terrain_wave_3,
        regional_distance,
    ]]


def predict_susceptibility(latitude: float, longitude: float):
    model = load_model()["model"]

    features = build_features(
        latitude,
        longitude
    )

    probability = float(
        model.predict_proba(features)[0][1]
    )

    if probability >= 0.80:
        category = "CRITICAL"
    elif probability >= 0.60:
        category = "HIGH"
    elif probability >= 0.40:
        category = "MODERATE"
    else:
        category = "LOW"

    return {
        "probability": round(probability, 4),
        "category": category,
        "latitude": latitude,
        "longitude": longitude,
    }


if __name__ == "__main__":
    result = predict_susceptibility(
        26.2,
        91.7
    )

    print(result)
