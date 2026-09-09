import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / "data" / "raw" / "landslides" / "GSI_NER_landslide_inventory_extracted.csv"
OUTPUT = ROOT / "data" / "processed" / "NER_district_summary.csv"

df = pd.read_csv(INPUT)

df["State"] = df["State"].astype("string").str.strip()

df["District"] = (
    df["District"]
    .astype("string")
    .str.strip()
)

# Normalize obvious naming/capitalization variants.
district_map = {
    "Lower dibang valley": "Lower Dibang Valley",
    "TAMENGLONG": "Tamenglong",
    "South Garo hills": "South Garo Hills",
    "West Jaintia hills": "West Jaintia Hills",
    "West Jaintia hills": "West Jaintia Hills",
    "West Khasi  Hills": "West Khasi Hills",
    "South West Khasi  Hills": "South West Khasi Hills",
    "Siaha": "Saiha",
}

df["District_Normalized"] = df["District"].replace(district_map)

summary = (
    df.dropna(subset=["District_Normalized"])
      .groupby(["State", "District_Normalized"])
      .agg(
          historical_landslides=("Sl_No", "count"),
          latitude_mean=("Latitude", "mean"),
          longitude_mean=("Longitude", "mean"),
          latitude_min=("Latitude", "min"),
          latitude_max=("Latitude", "max"),
          longitude_min=("Longitude", "min"),
          longitude_max=("Longitude", "max"),
      )
      .reset_index()
      .sort_values(["State", "District_Normalized"])
)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
summary.to_csv(OUTPUT, index=False)

print("=" * 60)
print("NER DISTRICT GEOGRAPHY SUMMARY")
print("=" * 60)
print(f"States:    {summary['State'].nunique()}")
print(f"Districts: {len(summary)}")
print(f"Output:    {OUTPUT}")
print()

print(summary.groupby("State")["District_Normalized"].nunique().to_string())
print()
print("Top 15 districts by historical landslide records:")
print(
    summary.nlargest(15, "historical_landslides")
    [["State", "District_Normalized", "historical_landslides"]]
    .to_string(index=False)
)
print("=" * 60)
