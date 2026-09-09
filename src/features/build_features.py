from pathlib import Path
import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]

INPUT = ROOT / "data" / "raw" / "landslides" / "GSI_NER_landslide_inventory_extracted.csv"
OUTPUT_DIR = ROOT / "data" / "processed"
OUTPUT = OUTPUT_DIR / "gsi_features.csv"


def build_features():

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(INPUT)

    # ---------------------------------------------------------
    # Basic coordinate features
    # ---------------------------------------------------------

    df["Latitude"] = pd.to_numeric(df["Latitude"], errors="coerce")
    df["Longitude"] = pd.to_numeric(df["Longitude"], errors="coerce")

    df = df.dropna(subset=["Latitude", "Longitude"]).copy()

    lat = df["Latitude"]
    lon = df["Longitude"]

    # ---------------------------------------------------------
    # Geographic / terrain proxy features
    #
    # These are intentionally documented as proxy features.
    # A DEM can later replace them with observed terrain
    # derivatives such as slope, curvature and TWI.
    # ---------------------------------------------------------

    # Latitude/longitude interaction
    df["lat_lon_interaction"] = lat * lon

    # Distance-like position from regional center
    center_lat = lat.mean()
    center_lon = lon.mean()

    df["regional_distance"] = np.sqrt(
        (lat - center_lat) ** 2 +
        (lon - center_lon) ** 2
    )

    # Terrain complexity proxy
    df["terrain_position"] = (
        np.sin(np.radians(lat * 5)) *
        np.cos(np.radians(lon * 3))
    )

    # Spatial variability proxy
    df["spatial_wave"] = (
        np.sin(np.radians(lat * 12)) +
        np.cos(np.radians(lon * 12))
    )

    # ---------------------------------------------------------
    # State-level historical landslide density
    # ---------------------------------------------------------

    state_counts = df["State"].value_counts()

    df["state_landslide_count"] = (
        df["State"].map(state_counts).astype(float)
    )

    df["state_landslide_density"] = (
        df["state_landslide_count"] / len(df)
    )

    # ---------------------------------------------------------
    # Material indicators
    # ---------------------------------------------------------

    material = df["Material_Involved"].fillna("").str.lower()

    df["is_debris"] = material.str.contains("debris").astype(int)
    df["is_rock"] = material.str.contains("rock").astype(int)
    df["is_earth"] = material.str.contains("earth").astype(int)
    df["is_soil"] = material.str.contains("soil").astype(int)

    # ---------------------------------------------------------
    # Inventory quality / temporal information
    # ---------------------------------------------------------

    df["history_available"] = (
        df["History"]
        .fillna("")
        .astype(str)
        .str.strip()
        .ne("")
        .astype(int)
    )

    # ---------------------------------------------------------
    # Prototype target
    #
    # IMPORTANT:
    # This is an inventory-derived susceptibility label,
    # not a claim that every point represents a unique
    # future landslide event.
    # ---------------------------------------------------------

    # Historical event density by state is used as a proxy
    # for regional susceptibility in this MVP.

    state_rank = (
        state_counts.rank(pct=True)
    )

    df["susceptibility_proxy"] = (
        df["State"].map(state_rank).astype(float)
    )

    df["susceptibility_class"] = pd.cut(
        df["susceptibility_proxy"],
        bins=[-np.inf, 0.40, 0.70, np.inf],
        labels=["LOW", "MODERATE", "HIGH"]
    )

    df.to_csv(OUTPUT, index=False)

    print("=" * 60)
    print("NER-LandslideAI FEATURE PIPELINE")
    print("=" * 60)
    print(f"Input rows: {len(df):,}")
    print(f"Output: {OUTPUT}")
    print()
    print("Features:")
    print([
        c for c in df.columns
        if c not in [
            "Sl_No",
            "State",
            "District",
            "Slide_Name",
            "NH_SH_Location",
            "Material_Involved",
            "Movement_Type",
            "History",
        ]
    ])
    print()
    print("Susceptibility classes:")
    print(df["susceptibility_class"].value_counts())
    print("=" * 60)


if __name__ == "__main__":
    build_features()