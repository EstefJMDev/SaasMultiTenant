FROM python:3.12-slim

# Workdir inside container
WORKDIR /app

# Optional system dependencies to keep deploy builds fast by default.
ARG INSTALL_BUILD_TOOLS=0
ARG INSTALL_OCR_TOOLS=0
ARG INSTALL_MEDIA_TOOLS=0
ARG INSTALL_LIBREOFFICE=0

# System packages required by backend runtime.
# WeasyPrint requires libpango, libcairo, libgdk-pixbuf and libffi at runtime to render HTML → PDF.
# Fonts (DejaVu, Liberation) cover most Latin scripts; Liberation Sans is metric-compatible with Arial.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    ca-certificates \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz0b \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libffi8 \
    shared-mime-info \
    fonts-dejavu \
    fonts-liberation \
    && if [ "$INSTALL_BUILD_TOOLS" = "1" ]; then apt-get install -y --no-install-recommends build-essential libpq-dev; fi \
    && if [ "$INSTALL_OCR_TOOLS" = "1" ]; then apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-spa; fi \
    && if [ "$INSTALL_MEDIA_TOOLS" = "1" ]; then apt-get install -y --no-install-recommends ffmpeg espeak; fi \
    && if [ "$INSTALL_LIBREOFFICE" = "1" ]; then apt-get install -y --no-install-recommends libreoffice-writer; fi \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .

# --prefer-binary avoids source builds when wheels exist.
# -v keeps CI output streaming to avoid inactivity timeouts.
RUN pip install --no-cache-dir --prefer-binary -r requirements.txt -v

# Application code
COPY app ./app

# Run API as non-root user in runtime.
RUN useradd -m -u 10001 appuser && chown -R appuser:appuser /app
USER appuser

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
