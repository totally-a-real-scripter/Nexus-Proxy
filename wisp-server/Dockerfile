# ── Wisp Server — Python WebSocket TCP tunnel ─────────────────────────────────
FROM python:3.12-slim

# Security: run as non-root
RUN addgroup --system wisp && adduser --system --ingroup wisp wisp

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

RUN chown -R wisp:wisp /app
USER wisp

EXPOSE 37292

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD python -c "from websockets.sync.client import connect; connect('ws://127.0.0.1:37292/').close()"

CMD ["python", "-u", "server.py"]
