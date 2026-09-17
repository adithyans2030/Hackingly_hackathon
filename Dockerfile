FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr libzbar0 libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN python scripts/download_models.py || echo "face models not downloaded; face checks will be skipped"
ENV DATA_DIR=/data DB_PATH=/data/trustgate.db
VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK CMD curl -fs localhost:8000/v1/health || exit 1
CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
