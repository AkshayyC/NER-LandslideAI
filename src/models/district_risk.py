from pathlib import Path
import pandas as pd
import numpy as np
import joblib

ROOT = Path(__file__).resolve().parents[2]

INVENTORY = ROOT / "data" / "raw" / "landslides" / "GSI_NER_landslide_inventory_extracted.csv"
MODEL_PATH = ROOT / "models" / "susceptibility_xgboost.joblib"
OUTPUT = ROOT / "data" / "processed" / "district_risk.csv"


def build_features(latitude, longitude):
    lat = latitude
    lon = longitude

    lat_centered = lat - 25.5
    lon_centered = lon - 92.5

    lat_lon = lat * lon

    terrain_wave_1 = (
        np.sin(lat * 0.8) *
        np.cos(lon * 0.8)
    )

    terrain_wave_2 = np.sin(lat * 1.7 + lon * 0.4)

    terrain_wave_3 = np.cos(lon * 1.3 - lat * 0.6)

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


def classify(probability):
    if probability >= 0.80:
        return "CRITICAL"
    elif probability >= 0.60:
        return "HIGH"
    elif probability >= 0.40:
        return "MODERATE"
    return "LOW"


def main():

    print("=" * 60)
    print("NER DISTRICT RISK ENGINE")
    print("=" * 60)

    df = pd.read_csv(INVENTORY)

    df["State"] = df["State"].astype("string").str.strip()
    df["District"] = df["District"].astype("string").str.strip()

    district_map = {
        "Lower dibang valley": "Lower Dibang Valley",
        "TAMENGLONG": "Tamenglong",
        "South Garo hills": "South Garo Hills",
        "West Jaintia hills": "West Jaintia Hills",
        "West Khasi  Hills": "West Khasi Hills",
        "South West Khasi  Hills": "South West Khasi Hills",
        "Siaha": "Saiha",
    }

    df["District_Normalized"] = df["District"].replace(district_map)

    df = df.dropna(
        subset=[
            "District_Normalized",
            "Latitude",
            "Longitude"
        ]
    )

    package = joblib.load(MODEL_PATH)
    model = package["model"]

    probabilities = []

    print("Calculating susceptibility for GSI locations...")

    for lat, lon in zip(df["Latitude"], df["Longitude"]):

        features = build_features(
            float(lat),
            float(lon)
        )

        probability = float(
            model.predict_proba(features)[0][1]
        )

        probabilities.append(probability)

    df["susceptibility_probability"] = probabilities

    district = (
        df.groupby(
            ["State", "District_Normalized"]
        )
        .agg(
            historical_landslides=(
                "Sl_No",
                "count"
            ),
            mean_susceptibility=(
                "susceptibility_probability",
                "mean"
            ),
            max_susceptibility=(
                "susceptibility_probability",
                "max"
            ),
            latitude_mean=(
                "Latitude",
                "mean"
            ),
            longitude_mean=(
                "Longitude",
                "mean"
            )
        )
        .reset_index()
    )

    district["risk_score"] = (
        district["mean_susceptibility"] * 100
    )

    district["risk_category"] = (
        district["mean_susceptibility"]
        .apply(classify)
    )

    district = district.sort_values(
        "risk_score",
        ascending=False
    )

    OUTPUT.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    district.to_csv(
        OUTPUT,
        index=False
    )

    print()
    print(f"States: {district['State'].nunique()}")
    print(f"Districts: {len(district)}")
    print(f"Output: {OUTPUT}")
    print()

    print("Highest-risk districts:")
    print(
        district.head(15)[
            [
                "State",
                "District_Normalized",
                "historical_landslides",
                "mean_susceptibility",
                "risk_category"
            ]
        ].to_string(index=False)
    )

    print("=" * 60)


if __name__ == "__main__":
    main()
