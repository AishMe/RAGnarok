FROM python:3.11-slim

WORKDIR /app

# create non-root user
RUN addgroup --system app && adduser --system --group app

# install deps first (layer cache — only re-runs if pyproject.toml changes)
COPY pyproject.toml .

# regular install, not editable — works without source folders present
RUN pip install --no-cache-dir .

# now copy all source code
COPY . .

RUN chown -R app:app /app
USER app

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]