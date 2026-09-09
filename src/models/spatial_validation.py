from pathlib import Path

import numpy as np
import pandas as pd

from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    precision_score,
    recall_score,
    f1_score,
)

from xgboost import XGBClassifier


ROOT = Path(__file__).resolve().parents[2]

DATA = ROOT / "data" / "processed" / "training_dataset.csv"


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


def main():

    df = pd.read_csv(DATA)

    # Create coarse geographic blocks.
    #
    # A whole block is kept entirely in train or test.
    # This is much harder than a random row split.

    df["lat_block"] = np.floor(df["Latitude"] * 2) / 2
    df["lon_block"] = np.floor(df["Longitude"] * 2) / 2

    df["spatial_block"] = (
        df["lat_block"].astype(str)
        + "_"
        + df["lon_block"].astype(str)
    )

    blocks = df["spatial_block"].unique().to_numpy()

    rng = np.random.default_rng(42)
    rng.shuffle(blocks)

    split = int(len(blocks) * 0.80)

    train_blocks = set(blocks[:split])
    test_blocks = set(blocks[split:])

    train = df[df["spatial_block"].isin(train_blocks)]
    test = df[df["spatial_block"].isin(test_blocks)]

    X_train = train[FEATURES]
    y_train = train["target"]

    X_test = test[FEATURES]
    y_test = test["target"]

    print("=" * 60)
    print("SPATIAL GENERALIZATION TEST")
    print("=" * 60)

    print(f"Spatial blocks: {len(blocks)}")
    print(f"Train blocks:   {len(train_blocks)}")
    print(f"Test blocks:    {len(test_blocks)}")

    print()
    print(f"Train samples: {len(train):,}")
    print(f"Test samples:  {len(test):,}")

    print()
    print("Training model...")

    model = XGBClassifier(
        n_estimators=250,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        objective="binary:logistic",
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
    )

    model.fit(X_train, y_train)

    probabilities = model.predict_proba(X_test)[:, 1]
    predictions = (probabilities >= 0.5).astype(int)

    print()
    print("=" * 60)
    print("UNSEEN SPATIAL BLOCK RESULTS")
    print("=" * 60)

    # ROC-AUC requires both classes in test.
    if y_test.nunique() == 2:

        print(
            f"ROC-AUC : "
            f"{roc_auc_score(y_test, probabilities):.4f}"
        )

        print(
            f"PR-AUC  : "
            f"{average_precision_score(y_test, probabilities):.4f}"
        )

    print(
        f"Precision: "
        f"{precision_score(y_test, predictions, zero_division=0):.4f}"
    )

    print(
        f"Recall   : "
        f"{recall_score(y_test, predictions, zero_division=0):.4f}"
    )

    print(
        f"F1       : "
        f"{f1_score(y_test, predictions, zero_division=0):.4f}"
    )

    print("=" * 60)


if __name__ == "__main__":
    main()