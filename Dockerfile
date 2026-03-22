FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
	PYTHONUNBUFFERED=1 \
	PIP_NO_CACHE_DIR=1 \
	PIP_DISABLE_PIP_VERSION_CHECK=1

COPY requirements.txt /app/requirements.txt
RUN pip install --prefer-binary --no-compile -r /app/requirements.txt

COPY index.html /app/index.html
COPY commands.html /app/commands.html
COPY dashboard.html /app/dashboard.html
COPY terms.html /app/terms.html
COPY privacy.html /app/privacy.html
COPY dashboard /app/dashboard
COPY assets /app/assets
COPY server.py /app/server.py

ENV PORT=8080
EXPOSE 8080

CMD ["python", "server.py"]