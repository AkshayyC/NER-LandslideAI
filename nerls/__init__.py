"""NER-LandslideAI — landslide hazard, exposure and trigger engine for North East India.

The package is organised as a pipeline:

    reference  ->  terrain  ->  rainfall  ->  inventory
                        \\          |           /
                         +-- hazard (susceptibility, dynamic risk,
                                     attribution, threshold inversion)
                                     |
                              service (grid build + cache)
                                     |
                                   api (FastAPI)

Everything the engine reports is derived from committed reference data with
declared provenance, or from an imported dataset (DEM, inventory, live
rainfall) supplied through an adapter. Nothing is fabricated at request time.
"""

__version__ = "2.0.0"

#: Identifier of the hazard model formulation. Changes whenever the model
#: maths changes, so that a stored result can always be traced to a model.
MODEL_ID = "nerls-hazard/2.0"

__all__ = ["__version__", "MODEL_ID"]
