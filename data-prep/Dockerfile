# Batch image for build_grid.py (compose profile "batch"); the rasterio/geopandas/pyproj wheels bundle GDAL.
FROM python:3.12.12-slim
WORKDIR /work
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY build_grid.py fuel_rates.csv ./
ENTRYPOINT ["python", "build_grid.py"]
