FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/opt/timesfm-cache PORT=8000
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt
RUN useradd --create-home --uid 10001 appuser && mkdir -p /opt/timesfm-cache && chown appuser /opt/timesfm-cache
USER appuser
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('google/timesfm-2.5-200m-pytorch', allow_patterns=['config.json', 'model.safetensors'])"
COPY service.py .
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ['PORT'] + '/health', timeout=4)"
CMD ["sh", "-c", "exec uvicorn service:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --limit-concurrency 8"]
