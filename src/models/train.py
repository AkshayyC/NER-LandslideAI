from pathlib import Path

import joblib
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
)

from xgboost import XGBClassifier


ROOT = Path(__file__).resolve().parents[2]

DATA = ROOT / "data" / "processed" / "training_dataset.csv"
MODEL_DIR = ROOT / "models"

MODEL_PATH = MODEL_DIR / "susceptibility_xgboost.joblib"
METRICS_PATH = MODEL_DIR / "metrics.csv"


def main():

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading training dataset...")

    df = pd.read_csv(DATA)

    # Features that are genuinely available in our current dataset.
    feature_columns = [
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

    X = df[feature_columns]
    y = df["target"]

    print(f"Samples: {len(df):,}")
    print(f"Features: {len(feature_columns)}")

    # Stratified split for the MVP.
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
        stratify=y,
    )

    print("Training XGBoost...")

    model = XGBClassifier(
        n_estimators=300,
        max_depth=6,
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
    predictions = (probabilities >= 0.50).astype(int)

    metrics = {
        "ROC_AUC": roc_auc_score(y_test, probabilities),
        "PR_AUC": average_precision_score(y_test, probabilities),
        "Accuracy": accuracy_score(y_test, predictions),
        "Precision": precision_score(y_test, predictions),
        "Recall": recall_score(y_test, predictions),
        "F1": f1_score(y_test, predictions),
    }

    print()
    print("=" * 60)
    print("NER-LandslideAI MODEL RESULTS")
    print("=" * 60)

    for name, value in metrics.items():
        print(f"{name:12s}: {value:.4f}")

    print()
    print("Confusion Matrix:")
    print(confusion_matrix(y_test, predictions))

    joblib.dump(
        {
            "model": model,
            "features": feature_columns,
            "version": "MVP-1.0",
            "training_samples": len(X_train),
        },
        MODEL_PATH,
    )

    pd.DataFrame(
        [metrics]
    ).to_csv(
        METRICS_PATH,
        index=False,
    )

    print()
    print(f"Model saved:   {MODEL_PATH}")
    print(f"Metrics saved: {METRICS_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()