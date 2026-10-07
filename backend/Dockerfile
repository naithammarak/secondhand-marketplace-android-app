# 2NDHAND API image for hosted deployment (Render/Azure/etc.).
# Secrets come only from the host's environment settings, never from this image.
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY alembic.ini .
COPY app ./app
COPY migrations ./migrations
COPY scripts ./scripts

RUN useradd --create-home appuser
USER appuser

# Hosts inject PORT; default 8000 for local runs.
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
