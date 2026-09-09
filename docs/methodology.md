# Model Methodology

## Prediction Objective

Estimate the probability that a location is
susceptible to landslide occurrence under given
environmental conditions.

## Target Variable

The primary classification target is:

- 1 = landslide occurrence/event
- 0 = non-landslide/background sample

## Predictor Variables

Initial candidate predictors:

- rainfall
- antecedent rainfall
- elevation
- slope
- aspect
- land cover
- vegetation
- historical landslide information
- geographic location

## Machine Learning

Candidate models:

1. Random Forest
2. XGBoost

The models will be evaluated using appropriate
spatial and/or temporal validation.

## Evaluation Metrics

- Precision
- Recall
- F1 Score
- ROC-AUC
- PR-AUC
- Confusion Matrix

## Risk System

The ML probability will be passed to a separate
risk engine that converts model output and relevant
environmental information into risk categories.

Prototype categories:

- LOW
- MODERATE
- HIGH
- CRITICAL

## Important Limitation

This project is a hackathon/research prototype.
It is not an operational emergency-warning system
and model outputs should not independently determine
evacuation or emergency decisions.