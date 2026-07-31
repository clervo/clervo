FROM python:3.12.11-slim-bookworm
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN pip install --no-cache-dir crawl4ai==0.9.2 playwright==1.61.0 \
    && python -m playwright install --with-deps chromium \
    && useradd --uid 65532 --no-create-home --shell /usr/sbin/nologin clervo
COPY infra/n4.26/browser-worker.py /opt/clervo/browser-worker.py
USER 65532:65532
ENTRYPOINT ["/usr/bin/prlimit", "--nproc=64:64", "--nofile=256:256", "--fsize=67108864:67108864", "--", "python", "/opt/clervo/browser-worker.py"]
