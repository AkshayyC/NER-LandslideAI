from pathlib import Path
import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]

INPUT = (
    ROOT
    / "data"
    / "raw"
    / "landslides"
    / "GSI_NER_landslide_inventory_extracted.csv"
)

OUTPUT_DIR = ROOT / "data" / "processed"
OUTPUT = OUTPUT_DIR / "training_dataset.csv"


def make_features(df):
    df = df.copy()

    df["Latitude"] = pd.to_numeric(df["Latitude"], errors="coerce")
    df["Longitude"] = pd.to_numeric(df["Longitude"], errors="coerce")

    df = df.dropna(subset=["Latitude", "Longitude"])

    lat = df["Latitude"].values
    lon = df["Longitude"].values

    df["lat"] = lat
    df["lon"] = lon

    df["lat_lon"] = lat * lon

    df["lat_centered"] = lat - lat.mean()
    df["lon_centered"] = lon - lon.mean()

    df["terrain_wave_1"] = (
        np.sin(np.radians(lat * 8))
        * np.cos(np.radians(lon * 6))
    )

    df["terrain_wave_2"] = (
        np.sin(np.radians(lat * 15))
        + np.cos(np.radians(lon * 15))
    )

    df["terrain_wave_3"] = (
        np.sin(np.radians(lat * 25))
        * np.sin(np.radians(lon * 20))
    )

    df["regional_distance"] = np.sqrt(
        df["lat_centered"] ** 2
        + df["lon_centered"] ** 2
    )

    return df


def main():

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading GSI inventory...")

    gsi = pd.read_csv(INPUT)

    gsi = make_features(gsi)

    # Positive samples = observed GSI landslide locations
    positives = gsi.copy()
    positives["target"] = 1

    # Generate spatial background samples
    rng = np.random.default_rng(42)

    min_lat = gsi["Latitude"].min()
    max_lat = gsi["Latitude"].max()
    min_lon = gsi["Longitude"].min()
    max_lon = gsi["Longitude"].max()

    n_negative = len(positives)

    negative_lat = rng.uniform(
        min_lat,
        max_lat,
        n_negative
    )

    negative_lon = rng.uniform(
        min_lon,
        max_lon,
        n_negative
    )

    negatives = pd.DataFrame({
        "Latitude": negative_lat,
        "Longitude": negative_lon,
        "State": "BACKGROUND",
        "Material_Involved": "",
        "History": "",
        "target": 0
    })

    negatives = make_features(negatives)

    # Combine
    dataset = pd.concat(
        [positives, negatives],
        ignore_index=True
    )

    dataset = dataset.sample(
        frac=1,
        random_state=42
    ).reset_index(drop=True)

    dataset.to_csv(
        OUTPUT,
        index=False
    )

    print()
    print("=" * 60)
    print("TRAINING DATASET CREATED")
    print("=" * 60)
    print(f"Positive samples : {(dataset.target == 1).sum():,}")
    print(f"Negative samples : {(dataset.target == 0).sum():,}")
    print(f"Total samples    : {len(dataset):,}")
    print(f"Output           : {OUTPUT}")
    print("=" * 60)


if __name__ == "__main__":
    main()