from pathlib import Path
import sys
import pandas as pd
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[1]

# Allow imports from src/
sys.path.insert(0, str(ROOT))

from src.models.predict import predict_susceptibility

app = FastAPI(
    title="NER-LandslideAI API",
    description="Northeast India landslide intelligence API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

INVENTORY_PATH = (
    ROOT
    / "data"
    / "raw"
    / "landslides"
    / "GSI_NER_landslide_inventory_extracted.csv"
)

DISTRICT_RISK_PATH = (
    ROOT
    / "data"
    / "processed"
    / "district_risk.csv"
)


def load_inventory():
    return pd.read_csv(INVENTORY_PATH)


def load_district_risk():
    return pd.read_csv(DISTRICT_RISK_PATH)


@app.get("/")
def root():
    return {
        "name": "NER-LandslideAI",
        "status": "online",
        "description": "Northeast India Landslide Intelligence API",
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "system": "NER-LandslideAI",
    }


@app.get("/api/states")
def states():
    df = load_inventory()

    result = (
        df["State"]
        .dropna()
        .astype(str)
        .str.strip()
        .drop_duplicates()
        .sort_values()
        .tolist()
    )

    return {
        "count": len(result),
        "states": result,
    }


@app.get("/api/districts/{state}")
def districts(state: str):
    df = load_inventory()

    df["State"] = df["State"].astype("string").str.strip()
    df["District"] = df["District"].astype("string").str.strip()

    result = (
        df.loc[
            df["State"].str.lower() == state.lower(),
            "District"
        ]
        .dropna()
        .drop_duplicates()
        .sort_values()
        .tolist()
    )

    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"State not found: {state}"
        )

    return {
        "state": state,
        "count": len(result),
        "districts": result,
    }


@app.get("/api/historical/{state}/{district}")
def historical(state: str, district: str):
    df = load_inventory()

    df["State"] = df["State"].astype("string").str.strip()
    df["District"] = df["District"].astype("string").str.strip()

    subset = df[
        (df["State"].str.lower() == state.lower())
        &
        (df["District"].str.lower() == district.lower())
    ]

    if subset.empty:
        raise HTTPException(
            status_code=404,
            detail="State/district not found"
        )

    return {
        "state": state,
        "district": district,
        "historical_landslides": int(len(subset)),
        "latitude_mean": round(float(subset["Latitude"].mean()), 5),
        "longitude_mean": round(float(subset["Longitude"].mean()), 5),
    }


@app.get("/api/susceptibility/{latitude}/{longitude}")
def susceptibility(latitude: float, longitude: float):

    if not (-90 <= latitude <= 90):
        raise HTTPException(
            status_code=400,
            detail="Invalid latitude"
        )

    if not (-180 <= longitude <= 180):
        raise HTTPException(
            status_code=400,
            detail="Invalid longitude"
        )

    result = predict_susceptibility(
        latitude,
        longitude
    )

    return {
        "type": "historical_inventory_based_susceptibility",
        **result,
    }


@app.get("/api/risk/{latitude}/{longitude}")
def risk(latitude: float, longitude: float):

    result = predict_susceptibility(
        latitude,
        longitude
    )

    return {
        "latitude": latitude,
        "longitude": longitude,
        "susceptibility_probability": result["probability"],
        "risk_category": result["category"],
        "risk_basis": "historical inventory-based susceptibility",
        "rainfall_trigger": "not yet integrated",
    }


@app.get("/api/statistics")
def statistics():

    df = load_inventory()

    states = int(df["State"].nunique())
    districts = int(
        df[["State", "District"]]
        .dropna()
        .drop_duplicates()
        .shape[0]
    )

    return {
        "total_landslides": int(len(df)),
        "states": states,
        "state_names": sorted(
            df["State"]
            .dropna()
            .astype(str)
            .str.strip()
            .unique()
            .tolist()
        ),
        "district_state_pairs": districts,
        "latitude_range": [
            float(df["Latitude"].min()),
            float(df["Latitude"].max()),
        ],
        "longitude_range": [
            float(df["Longitude"].min()),
            float(df["Longitude"].max()),
        ],
    }


@app.get("/api/district-risk")
def district_risk():

    df = load_district_risk()

    return {
        "count": len(df),
        "districts": df.to_dict(
            orient="records"
        ),
    }


@app.get("/api/district-risk/{state}")
def state_risk(state: str):

    df = load_district_risk()

    subset = df[
        df["State"].astype(str).str.lower()
        == state.lower()
    ]

    if subset.empty:
        raise HTTPException(
            status_code=404,
            detail=f"State not found: {state}"
        )

    return {
        "state": state,
        "count": len(subset),
        "districts": subset.to_dict(
            orient="records"
        ),
    }
