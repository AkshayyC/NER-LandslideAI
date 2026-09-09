# Data Sources

## Objective

NER-LandslideAI will use real environmental and
historical landslide data to develop a landslide
risk prediction system for Northeast India.

## Target Region

The system covers:

- Arunachal Pradesh
- Assam
- Manipur
- Meghalaya
- Mizoram
- Nagaland
- Sikkim
- Tripura

## Required Data

### 1. Landslide Inventory

Required fields:

- latitude
- longitude
- event date, where available
- landslide location
- landslide attributes

Purpose:

Identify historical landslide events.

### 2. Rainfall

Required variables:

- rainfall amount
- observation date/time
- latitude
- longitude

Purpose:

Identify rainfall conditions associated with
landslide occurrence.

### 3. Digital Elevation Model

Required variables:

- elevation

Derived variables:

- slope
- aspect
- terrain characteristics

Purpose:

Represent terrain susceptibility.

### 4. Additional Environmental Data

Potential variables:

- land cover
- vegetation
- soil/geology
- drainage
- historical landslide density

These will be added if reliable data is available
and useful for the model.

## Data Quality Requirements

Each dataset will be evaluated for:

- spatial coverage
- temporal coverage
- spatial resolution
- temporal resolution
- missing values
- coordinate reference system
- licensing/usage restrictions