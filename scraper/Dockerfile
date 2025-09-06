# Dockerfile for TenderFlow Scraper
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    curl \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

# Set Chrome environment variables
ENV CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_PATH=/usr/bin/chromedriver \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Create app directory
WORKDIR /app

# Create non-root user
RUN groupadd -r scraper && useradd -r -g scraper scraper

# Copy requirements first for better caching
COPY requirements.txt requirements-monitoring.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-monitoring.txt

# Copy application code
COPY --chown=scraper:scraper . .

# Create necessary directories
RUN mkdir -p /app/logs /app/data /app/queue && \
    chown -R scraper:scraper /app

# Switch to non-root user
USER scraper

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8080/health').raise_for_status()"

# Expose metrics port
EXPOSE 8080

# Run the scraper
CMD ["python", "main.py", "--enable-monitoring"]