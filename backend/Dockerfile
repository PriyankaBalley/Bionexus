# BioNexus backend image
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1

# Install bioinformatics tools:
#  - cas-offinder (compiled from source; lightweight C++ binary)
#  - ViennaRNA (provides RNAfold)
#  - bowtie (used by some off-target backends)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake git wget curl ca-certificates \
        libgomp1 zlib1g-dev libbz2-dev liblzma-dev \
        bowtie viennarna \
    && rm -rf /var/lib/apt/lists/*

# Compile cas-offinder (CPU build)
RUN git clone --depth 1 https://github.com/snugel/cas-offinder.git /tmp/casoff \
    && cd /tmp/casoff && cmake -DCMAKE_BUILD_TYPE=Release . \
    && make -j2 \
    && install -m 755 cas-offinder /usr/local/bin/cas-offinder \
    && rm -rf /tmp/casoff || echo "WARN cas-offinder build failed (GPU-only fork); fallback active"

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

RUN mkdir -p /data/jobs /data/genomes /data/logs

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
