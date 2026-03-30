FROM python:3.11-slim

WORKDIR /app

# create non-root user
RUN addgroup --system app && adduser --system --group app

# install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch first — before everything else.
# The default `torch` package bundles CUDA (~2GB). The CPU-only wheel is ~200MB.
# We pin it explicitly so pip doesn't pull the CUDA version as a dependency.
RUN pip install --no-cache-dir \
    torch==2.2.2+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Now install the rest of the project deps
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Pre-download embedding model into the image at build time
# Must be after pip install so sentence_transformers is available
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2', cache_folder='/tmp/huggingface')"

# Copy source
COPY . .

RUN mkdir -p /tmp/huggingface && \
    chown -R app:app /tmp/huggingface && \
    chown -R app:app /app
USER app

EXPOSE 8000
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]