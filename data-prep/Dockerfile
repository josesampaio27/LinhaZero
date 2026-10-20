# Batch image for build_grid.py (compose profile "batch"); the rasterio/geopandas/pyproj wheels bundle GDAL.
FROM python:3.12.12-slim
# libexpat1: GDAL in the rasterio/pyogrio wheels needs it; curl: the Overpass fallback (ADR 0017).
RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 curl && rm -rf /var/lib/apt/lists/*
WORKDIR /work
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# build_grid imports canopy.py and fuel_params.py; build_reference(s).py and export_replay.py share the image.
COPY *.py *.csv ./
ENTRYPOINT ["python", "build_grid.py"]
